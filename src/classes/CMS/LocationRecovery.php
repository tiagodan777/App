<?php
declare(strict_types=1);

namespace App\CMS;

use PDO;

final class LocationRecovery {
    public const STALE_SECONDS = 480;
    public const MAX_DAILY = 180;

    public function __construct(private PDO $db) {}

    // Ativação explícita no serviço. Vazio = ninguém; '*' = todos os elegíveis.
    public static function enabled(): bool {
        return filter_var(getenv('MARGOT_LOCATION_RECOVERY_ENABLED') ?: '0', FILTER_VALIDATE_BOOLEAN);
    }

    public static function allowed(string $member): bool {
        $members = array_map('trim', explode(',', getenv('MARGOT_LOCATION_RECOVERY_MEMBERS') ?: ''));
        return self::enabled() && (in_array('*', $members, true) || in_array($member, $members, true));
    }

    public function cleanup(): void {
        $this->db->prepare('DELETE FROM location_recovery_devices WHERE expires_at < :cutoff')
            ->execute(['cutoff' => time() - 86400]);
    }

    public function register(string $member, string $token, string $apnsToken, string $environment): array {
        if (!preg_match('/^[a-f0-9]{32,512}$/D', $apnsToken) || strlen($apnsToken) % 2 !== 0
            || !in_array($environment, ['sandbox', 'production'], true)) {
            throw new \InvalidArgumentException('Registo inválido.');
        }
        $hash = Token::hash($token);
        $statement = $this->db->prepare("SELECT validade FROM token WHERE token = :hash
            AND membro_id = :member AND proposito = 'background_location' AND validade > UTC_TIMESTAMP()");
        $statement->execute(['hash' => $hash, 'member' => $member]);
        $expiry = $statement->fetchColumn();
        if (!$expiry) {
            throw new \InvalidArgumentException('Autorização expirada.');
        }
        $expires = (new \DateTimeImmutable($expiry, new \DateTimeZone('UTC')))->getTimestamp();
        $key = hash('sha256', $environment . ':' . $apnsToken);
        $id = bin2hex(random_bytes(16));
        $this->db->beginTransaction();
        try {
            $statement = $this->db->prepare("INSERT INTO location_recovery_devices
                (device_key,registration_id,membro_id,token_hash,apns_token,environment,expires_at,attempts_json)
                VALUES (:key,:id,:member,:hash,:apns,:environment,:expires,'[]')
                ON DUPLICATE KEY UPDATE
                    registration_id=IF(token_hash=VALUES(token_hash),registration_id,VALUES(registration_id)),
                    request_id=IF(token_hash=VALUES(token_hash),request_id,NULL),
                    membro_id=VALUES(membro_id), token_hash=VALUES(token_hash),
                    expires_at=VALUES(expires_at), enabled=1");
            $statement->execute(['key' => $key, 'id' => $id, 'member' => $member, 'hash' => $hash,
                'apns' => $apnsToken, 'environment' => $environment, 'expires' => $expires]);
            $statement = $this->db->prepare('SELECT registration_id FROM location_recovery_devices WHERE device_key = :key');
            $statement->execute(['key' => $key]);
            $id = (string) $statement->fetchColumn();
            $this->db->commit();
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
        return ['registration_id' => $id, 'expires_in' => max(0, min(2592000, $expires - time()))];
    }

    /** A credencial, a recolha ativa e a data real são verificadas também após o push. */
    private function eligible(string $key): ?array {
        $statement = $this->db->prepare("SELECT d.*, lm.capturada_em AS captured
            FROM location_recovery_devices d
            INNER JOIN localizacao_membro lm ON lm.membro_id = d.membro_id
            WHERE d.device_key = :key AND d.enabled = 1 AND d.expires_at > :now
              AND lm.localizacao_ativa = 1 AND lm.latitude IS NOT NULL AND lm.longitude IS NOT NULL
              AND lm.capturada_em < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 480 SECOND)
              AND EXISTS (SELECT 1 FROM token t WHERE t.token = d.token_hash
                AND t.membro_id = d.membro_id AND t.proposito = 'background_location'
                AND t.validade > UTC_TIMESTAMP())");
        $statement->execute(['key' => $key, 'now' => time()]);
        return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function nextBudget(array $history, int $now): array {
        foreach ($history as $value) {
            if (!is_int($value) || $value > $now || $value < 0) {
                throw new \RuntimeException('Relógio ou orçamento inválido.');
            }
        }
        $recent = array_values(array_filter($history, static fn(int $at): bool => $now - $at < 86400));
        sort($recent);
        if (count($recent) >= self::MAX_DAILY || ($recent && $now - end($recent) < self::STALE_SECONDS)) {
            throw new \RuntimeException('Orçamento esgotado.');
        }
        $recent[] = $now;
        return $recent;
    }

    public static function delay(int $previousFailures): int {
        return min(3600, self::STALE_SECONDS * (2 ** min(3, max(0, $previousFailures))));
    }

    public function nextRequest(): ?array {
        if (!self::enabled()) return null;
        $members = array_values(array_filter(array_map('trim',
            explode(',', getenv('MARGOT_LOCATION_RECOVERY_MEMBERS') ?: ''))));
        if (!$members) return null;
        $parameters = ['now' => time(), 'due' => time()];
        $filter = '';
        if (!in_array('*', $members, true)) {
            $keys = [];
            foreach ($members as $index => $member) {
                $keys[] = ':m' . $index;
                $parameters['m' . $index] = $member;
            }
            $filter = ' AND d.membro_id IN (' . implode(',', $keys) . ')';
        }
        $statement = $this->db->prepare('SELECT d.device_key FROM location_recovery_devices d
            INNER JOIN localizacao_membro lm ON lm.membro_id = d.membro_id
            WHERE d.enabled = 1 AND d.expires_at > :now AND (d.next_at <= :due OR lm.capturada_em > d.last_capture)
              AND lm.localizacao_ativa = 1 AND lm.capturada_em < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 480 SECOND)'
            . $filter . ' ORDER BY d.next_at, d.device_key LIMIT 100');
        $statement->execute($parameters);
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $key) {
            $request = $this->claim((string) $key);
            if ($request !== null) return $request;
        }
        return null;
    }

    private function claim(string $key): ?array {
        $this->db->beginTransaction();
        try {
            $statement = $this->db->prepare('SELECT CASE WHEN lm.capturada_em > d.last_capture
                    THEN 0 ELSE d.next_at END
                FROM location_recovery_devices d
                LEFT JOIN localizacao_membro lm ON lm.membro_id = d.membro_id
                WHERE d.device_key = :key FOR UPDATE');
            $statement->execute(['key' => $key]);
            $next = $statement->fetchColumn();
            $now = time();
            if ($next === false || (int) $next > $now) {
                $this->db->commit();
                return null;
            }
            $device = $this->eligible($key);
            if ($device === null) {
                // Evita que dispositivos frescos ocupem sempre o primeiro lote da fila.
                $this->db->prepare('UPDATE location_recovery_devices SET next_at = :next WHERE device_key = :key')
                    ->execute(['next' => $now + 15, 'key' => $key]);
                $this->db->commit();
                return null;
            }
            $failures = $device['last_capture'] !== null && $device['captured'] > $device['last_capture']
                ? 0 : (int) $device['failures'];
            try {
                $history = json_decode($device['attempts_json'], true, 512, JSON_THROW_ON_ERROR);
                if (!is_array($history)) throw new \RuntimeException('Orçamento inválido.');
                $history = self::nextBudget($history, $now);
            } catch (\Throwable) {
                // Dados inválidos mantêm uma pausa conservadora. Um orçamento válido
                // aguarda apenas até existir uma vaga, sem ultrapassar os limites.
                $retryAt = $now + 3600;
                if (is_array($history ?? null) && count(array_filter($history,
                    static fn($at): bool => is_int($at) && $at >= 0 && $at <= $now)) === count($history)) {
                    $recent = array_values(array_filter($history,
                        static fn(int $at): bool => $now - $at < 86400));
                    sort($recent);
                    if ($recent) {
                        $retryAt = max($now + 1, $recent[count($recent) - 1] + self::STALE_SECONDS);
                        if (count($recent) >= self::MAX_DAILY) {
                            $retryAt = max($retryAt, $recent[count($recent) - self::MAX_DAILY] + 86400);
                        }
                    }
                }
                $this->db->prepare('UPDATE location_recovery_devices SET next_at = :next,
                    last_capture = :captured, failures = :failures WHERE device_key = :key')
                    ->execute(['next' => $retryAt, 'captured' => $device['captured'],
                        'failures' => $failures, 'key' => $key]);
                $this->db->commit();
                return null;
            }
            $id = bin2hex(random_bytes(16));
            $statement = $this->db->prepare('UPDATE location_recovery_devices SET request_id = :id,
                request_until = :until, next_at = :next, failures = :failures,
                attempts_json = :attempts, last_capture = :captured, last_error = NULL WHERE device_key = :key');
            $statement->execute(['id' => $id, 'until' => $now + 180, 'next' => $now + self::delay($failures),
                'failures' => min(1000, $failures + 1), 'attempts' => json_encode($history, JSON_THROW_ON_ERROR),
                'captured' => $device['captured'], 'key' => $key]);
            $this->db->commit();
            $device['request_id'] = $id;
            return $device;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    public function failed(array $device, bool $permanent, string $reason): void {
        $statement = $this->db->prepare('UPDATE location_recovery_devices SET enabled = :enabled,
            last_error = :reason, request_id = NULL WHERE device_key = :key AND request_id = :id');
        $statement->execute(['enabled' => $permanent ? 0 : 1, 'reason' => substr($reason, 0, 128),
            'key' => $device['device_key'], 'id' => $device['request_id']]);
    }

    private function request(string $member, string $token, array $payload): ?array {
        $registration = $payload['registration_id'] ?? '';
        $id = $payload['request_id'] ?? '';
        if (!is_string($registration) || !is_string($id)
            || !preg_match('/^[a-f0-9]{32}$/D', $registration) || !preg_match('/^[a-f0-9]{32}$/D', $id)) return null;
        $statement = $this->db->prepare('SELECT device_key FROM location_recovery_devices
            WHERE registration_id = :registration AND request_id = :id AND membro_id = :member
              AND token_hash = :hash AND request_until >= :now AND enabled = 1');
        $statement->execute(['registration' => $registration, 'id' => $id,
            'member' => $member, 'hash' => Token::hash($token), 'now' => time()]);
        $key = $statement->fetchColumn();
        return $key ? $this->eligible((string) $key) : null;
    }

    public function shouldCapture(string $member, string $token, array $payload): bool {
        return $this->request($member, $token, $payload) !== null;
    }

    public function upload(string $member, string $token, array $payload): bool {
        $device = $this->request($member, $token, $payload);
        if ($device === null) return false;
        $this->db->beginTransaction();
        try {
            $statement = $this->db->prepare('SELECT request_id FROM location_recovery_devices
                WHERE device_key = :key FOR UPDATE');
            $statement->execute(['key' => $device['device_key']]);
            if ($statement->fetchColumn() !== $payload['request_id']
                || $this->request($member, $token, $payload) === null) {
                $this->db->commit();
                return false;
            }
            $accepted = (new Location($this->db))->saveLocationPush($member, $token, $payload);
            if ($accepted) {
                $statement = $this->db->prepare('UPDATE location_recovery_devices SET failures = 0, next_at = 0,
                    request_id = NULL, request_until = 0, last_error = NULL, last_capture = :captured
                    WHERE device_key = :key');
                $statement->execute(['captured' => LocationSample::capturedAt($payload), 'key' => $device['device_key']]);
            }
            $this->db->commit();
            return $accepted;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }
}