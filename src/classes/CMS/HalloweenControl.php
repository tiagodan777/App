<?php
declare(strict_types=1);

namespace App\CMS;

require_once __DIR__ . '/HalloweenCalendar.php';

final class HalloweenControl
{
    public const OWNER = 'bcad0cb1-9cec-11f1-9863-42010a840002';

    public function __construct(
        private \PDO $db,
        private array $settings
    ) {
    }

    public static function authorize(string $member): void
    {
        if (!hash_equals(self::OWNER, $member)) {
            throw new \DomainException(
                'Acesso reservado.',
                403
            );
        }
    }

    private function query(
        string $sql,
        array $args = []
    ): \PDOStatement {
        $q = $this->db->prepare($sql);
        $q->execute($args);

        return $q;
    }

    public function overview(string $member): array
    {
        self::authorize($member);

        $c = HalloweenCalendar::build($this->settings);

        if (!$c) {
            return [
                'records' => [],
                'winner' => false,
            ];
        }

        $records = $this->query(
            'SELECT id,
                    kind,
                    payload,
                    starts_at_ms,
                    expires_at_ms
             FROM halloween_hunt_commands
             WHERE campaign_id=?
             ORDER BY created_at_ms DESC
             LIMIT 12',
            [$c['campaign_id']]
        )->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($records as &$record) {
            $record['stats'] = $record['kind'] === 'push'
                ? $this->query(
                    'SELECT status, COUNT(*) AS total
                     FROM halloween_hunt_announcements
                     WHERE campaign_id=? AND event_id=?
                     GROUP BY status',
                    [$c['campaign_id'], $record['id']]
                )->fetchAll(\PDO::FETCH_KEY_PAIR)
                : [];
        }

        unset($record);

        return [
            'records' => $records,

            'winner' => (bool) $this->query(
                'SELECT membro_id
                 FROM halloween_hunt_awards
                 WHERE campaign_id=?',
                [$c['campaign_id']]
            )->fetchColumn(),
        ];
    }

    public function submit(
        string $member,
        array $input,
        ?int $nowMs = null
    ): array {
        self::authorize($member);

        $now = $nowMs
            ?? (int) floor(microtime(true) * 1000);

        $c = HalloweenCalendar::build($this->settings);

        if (
            !$c
            || !($this->settings['hunt']['waves_enabled'] ?? false)
        ) {
            throw new \DomainException(
                'Desafio desativado.',
                409
            );
        }

        if (
            ($input['campaign_id'] ?? '')
            !== $c['campaign_id']
        ) {
            throw new \DomainException(
                'A campanha mudou. Atualiza o painel.',
                409
            );
        }

        $nonce = $input['request_id'] ?? '';

        if (
            !is_string($nonce)
            || !preg_match('/^[a-f0-9]{32}$/D', $nonce)
        ) {
            throw new \DomainException(
                'Pedido inválido.',
                422
            );
        }

        $kind = $input['action'] ?? '';

        if (!in_array($kind, ['wave', 'push'], true)) {
            throw new \DomainException(
                'Ação inválida.',
                422
            );
        }

        if (
            $kind === 'push'
            && !(
                $this->settings['hunt']['announcements_enabled']
                ?? false
            )
        ) {
            throw new \DomainException(
                'Notificações desativadas.',
                409
            );
        }

        $this->db->beginTransaction();

        try {
            $sqlite = $this->db->getAttribute(
                \PDO::ATTR_DRIVER_NAME
            ) === 'sqlite';

            $this->query(
                'INSERT INTO halloween_hunt_awards
                    (campaign_id)
                 VALUES (?)'
                    . (
                        $sqlite
                            ? ' ON CONFLICT DO NOTHING'
                            : ' ON DUPLICATE KEY UPDATE
                                campaign_id=VALUES(campaign_id)'
                    ),
                [$c['campaign_id']]
            );

            $winner = $this->query(
                'SELECT membro_id
                 FROM halloween_hunt_awards
                 WHERE campaign_id=?'
                    . ($sqlite ? '' : ' FOR UPDATE'),
                [$c['campaign_id']]
            )->fetchColumn();

            $old = $this->query(
                'SELECT *
                 FROM halloween_hunt_commands
                 WHERE id=? AND campaign_id=?',
                [$nonce, $c['campaign_id']]
            )->fetch(\PDO::FETCH_ASSOC);

            if ($old) {
                $this->db->commit();

                return [
                    'id' => $nonce,
                    'duplicate' => true,
                    'starts_at_ms' => (int) $old['starts_at_ms'],
                ];
            }

            if (
                $now < $c['starts_at_ms']
                || $now >= $c['ends_at_ms']
            ) {
                throw new \DomainException(
                    'Fora do horário do desafio.',
                    409
                );
            }

            if ($winner && $kind === 'wave') {
                throw new \DomainException(
                    'Já há vencedor/a. Não serão lançados novos alvos.',
                    409
                );
            }

            $last = $this->query(
                'SELECT MAX(created_at_ms)
                 FROM halloween_hunt_commands
                 WHERE campaign_id=? AND kind=?',
                [$c['campaign_id'], $kind]
            )->fetchColumn();

            if (
                $last !== null
                && $last !== false
                && $now - (int) $last < 30000
            ) {
                throw new \DomainException(
                    'Espera 30 segundos entre comandos do mesmo tipo.',
                    429
                );
            }

            $at = $now + 20000;
            $payload = [];

            if ($kind === 'wave') {
                $p = filter_var(
                    $input['pumpkins'] ?? null,
                    FILTER_VALIDATE_INT
                );

                $b = filter_var(
                    $input['bats'] ?? null,
                    FILTER_VALIDATE_INT
                );

                if (
                    $p === false
                    || $b === false
                    || $p < 0
                    || $b < 0
                    || $p + $b < 1
                    || $p + $b > 3
                ) {
                    throw new \DomainException(
                        'Escolhe entre 1 e 3 alvos no total.',
                        422
                    );
                }

                // Usar o primeiro espaço livre entre alvos automáticos.
                foreach ($c['waves'] as $scheduled) {
                    foreach ($scheduled['objects'] as $o) {
                        if (
                            $at < $o['expires_at_ms']
                            && $at + 9500 > $o['opens_at_ms']
                        ) {
                            $at = $o['expires_at_ms'] + 1000;
                        }
                    }
                }

                if ($at + 9500 > $c['ends_at_ms']) {
                    throw new \DomainException(
                        'Já não há tempo para esta vaga.',
                        409
                    );
                }

                $early = $c['mode'] === 'public'
                    && $at < $c['starts_at_ms'] + 5400000;

                $pool = [
                    'pumpkin' => [],
                    'bat' => [],
                ];

                if ($early) {
                    foreach ($c['waves'] as $wave) {
                        foreach ($wave['objects'] as $o) {
                            if ($o['expires_at_ms'] <= $now) {
                                $pool[$o['kind']][] = $o;
                            }
                        }
                    }
                }

                foreach (
                    ['pumpkin' => $p, 'bat' => $b]
                    as $type => $quantity
                ) {
                    if (
                        $early
                        && count($pool[$type]) < $quantity
                    ) {
                        throw new \DomainException(
                            'Antes das 23:30 só podes repetir alvos '
                            . 'já disponibilizados. Ainda não há '
                            . 'suficientes deste tipo.',
                            409
                        );
                    }

                    $selected = $early
                        ? array_slice($pool[$type], -$quantity)
                        : [];

                    for ($i = 0; $i < $quantity; $i++) {
                        $payload[] = [
                            'id' => $early
                                ? $selected[$i]['id']
                                : bin2hex(random_bytes(16)),

                            'kind' => $type,

                            'difficulty' => $p + $b === 3
                                ? 3
                                : 1,

                            'opens_at_ms' => $at,
                            'expires_at_ms' => $at + 9500,
                        ];
                    }
                }

                $payload = [
                    'id' => $nonce,
                    'started_at_ms' => $at,
                    'objects' => $payload,
                ];
            } else {
                $text = trim(
                    (string) ($input['message'] ?? '')
                );

                if ($text === '' || mb_strlen($text) > 180) {
                    throw new \DomainException(
                        'Escreve uma mensagem com 1 a 180 caracteres.',
                        422
                    );
                }

                $payload = ['message' => $text];
                $at = $now;
            }

            $this->query(
                'INSERT INTO halloween_hunt_commands
                    (
                        id,
                        campaign_id,
                        kind,
                        payload,
                        created_at_ms,
                        starts_at_ms,
                        expires_at_ms
                    )
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    $nonce,
                    $c['campaign_id'],
                    $kind,
                    json_encode(
                        $payload,
                        JSON_THROW_ON_ERROR
                    ),
                    $now,
                    $at,

                    $kind === 'wave'
                        ? $at + 9500
                        : min(
                            $now + 300000,
                            $c['ends_at_ms']
                        ),
                ]
            );

            $this->db->commit();

            return [
                'id' => $nonce,
                'duplicate' => false,
                'starts_at_ms' => $at,
                'reuses_targets' => $kind === 'wave' && $early,
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $e;
        }
    }
}