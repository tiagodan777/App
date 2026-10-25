<?php
declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;

final class Location {
    private \PDO $db;

    public function __construct(\PDO $db) {
        $this->db = $db;
    }

    public function initializePresence(string $memberId): void {
        // O estado explícito é sincronizado antes da primeira posição nativa.
        // Uma linha sem coordenadas nunca é uma presença geográfica válida.
        $statement = $this->db->prepare("INSERT IGNORE INTO localizacao_membro
            (membro_id, localizacao_ativa, visivel, origem, atualizada_em)
            VALUES (:member, 0, 0, 'foreground', '1970-01-01 00:00:00')");
        $statement->execute(['member' => $memberId]);
    }

    public function state(string $memberId): array {
        $statement = $this->db->prepare('SELECT localizacao_ativa, visivel, estado_versao
            FROM localizacao_membro WHERE membro_id = :member');
        $statement->execute(['member' => $memberId]);
        $row = $statement->fetch(\PDO::FETCH_ASSOC);
        return [
            'active' => (bool) ($row['localizacao_ativa'] ?? false),
            'visible' => (bool) ($row['visivel'] ?? false),
            'revision' => (int) ($row['estado_versao'] ?? 0)
        ];
    }

    /** Só uma decisão explícita altera o estado; um ponto GPS nunca o faz. */
    public function setState(string $memberId, int $expectedRevision, bool $active, bool $visible): bool {
        if ($expectedRevision < 0) throw new InvalidArgumentException('Revisão inválida.');
        $this->initializePresence($memberId);
        $statement = $this->db->prepare('UPDATE localizacao_membro
            SET localizacao_ativa = :active, visivel = :visible, estado_versao = estado_versao + 1
            WHERE membro_id = :member AND estado_versao = :revision');
        $statement->execute(['active' => $active ? 1 : 0, 'visible' => $active && $visible ? 1 : 0,
            'member' => $memberId, 'revision' => $expectedRevision]);
        return $statement->rowCount() === 1;
    }

    /** Ponte HTTP para páginas antigas: só restringe a visibilidade, nunca recolha ou datas. */
    public function hideFromLegacyClient(string $memberId): void {
        $memberId = trim($memberId);
        if ($memberId === '') throw new InvalidArgumentException('Membro inválido.');
        // Sem revisão no pedido antigo não é possível ordenar hide e show entre clientes.
        // A escolha conservadora é ocultar e invalidar decisões v2 ainda pendentes.
        // Contas só com clientes antigos continuam na revisão zero até aderirem ao v2.
        $statement = $this->db->prepare('UPDATE localizacao_membro
            SET estado_versao = CASE WHEN estado_versao = 0 THEN 0 ELSE estado_versao + 1 END,
                visivel = 0
            WHERE membro_id = :member AND visivel = 1');
        $statement->execute(['member' => $memberId]);
    }

    /** Sair deste aparelho não revoga as concessões de outros aparelhos. */
    public function revokeBackgroundGrant(string $memberId, string $token, ?string $sessionHash = null): void {
        if ($memberId === '' || $token === '') return;
        if ($sessionHash !== null && !preg_match('/^[a-f0-9]{64}$/D', $sessionHash)) {
            throw new InvalidArgumentException('Sessão inválida.');
        }
        $ownTransaction = !$this->db->inTransaction();
        if ($ownTransaction) $this->db->beginTransaction();
        try {
            $this->initializePresence($memberId);
            $lock = $this->db->prepare('SELECT membro_id FROM localizacao_membro WHERE membro_id = :member FOR UPDATE');
            $lock->execute(['member' => $memberId]);
            $statement = $this->db->prepare("DELETE FROM token WHERE (token = :hash OR sessao_hash = :session_hash)
                AND membro_id = :member AND proposito = 'background_location'");
            $statement->execute(['hash' => Token::hash($token), 'session_hash' => $sessionHash, 'member' => $memberId]);
            if ($statement->rowCount() > 0) {
                $statement = $this->db->prepare("SELECT 1 FROM token WHERE membro_id = :member
                    AND proposito = 'background_location' AND validade > UTC_TIMESTAMP() LIMIT 1");
                $statement->execute(['member' => $memberId]);
                if (!$statement->fetchColumn()) {
                    // Terminar sessão retira a posição, mas não apaga a preferência.
                    // No próximo login, uma nova concessão pode retomar a recolha autorizada.
                    $this->db->prepare("UPDATE localizacao_membro SET capturada_em = NULL,
                        atualizada_em = '1970-01-01 00:00:00' WHERE membro_id = :member")
                        ->execute(['member' => $memberId]);
                }
            }
            if ($ownTransaction) $this->db->commit();
        } catch (\Throwable $error) {
            if ($ownTransaction && $this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    public function saveBackground(
        string $memberId,
        ?float $latitude,
        ?float $longitude,
        ?float $accuracy,
        bool $active,
        bool $visible,
        ?string $capturedAt = null,
        string $source = 'background'
    ): bool {
        $memberId = trim($memberId);
        if ($memberId === '') {
            throw new InvalidArgumentException('Membro inválido.');
        }
        if (!$active) {
            $this->disable($memberId);
            return true;
        }
        // Compatibilidade com versões nativas que enviavam hide sem coordenadas.
        if (!$visible && $latitude === null && $longitude === null) {
            $statement = $this->db->prepare('UPDATE localizacao_membro SET visivel = 0
                WHERE membro_id = :member_id AND estado_versao = 0');
            $statement->execute(['member_id' => $memberId]);
            return true;
        }
        if ($latitude === null || $longitude === null || !is_finite($latitude) || !is_finite($longitude)
            || abs($latitude) > 90 || abs($longitude) > 180) {
            throw new InvalidArgumentException('Coordenadas inválidas.');
        }
        if ($accuracy !== null) {
            if (!is_finite($accuracy)) throw new InvalidArgumentException('Precisão inválida.');
            $accuracy = max(0, min(10000, $accuracy));
        }
        $source = $source === 'foreground' ? 'foreground' : 'background';
        $ownTransaction = !$this->db->inTransaction();
        if ($ownTransaction) $this->db->beginTransaction();
        try {
            $this->initializePresence($memberId);
            $statement = $this->db->prepare('SELECT localizacao_ativa, visivel, estado_versao,
                capturada_em, atualizada_em FROM localizacao_membro WHERE membro_id = :member FOR UPDATE');
            $statement->execute(['member' => $memberId]);
            $previous = $statement->fetch(\PDO::FETCH_ASSOC);
            $managed = (int) $previous['estado_versao'] > 0;
            $previousCapture = $previous['capturada_em'] ?? $previous['atualizada_em'];
            if (($managed && !(bool) $previous['localizacao_ativa'])
                || ($capturedAt !== null && $capturedAt <= $previousCapture)) {
                if ($ownTransaction) $this->db->commit();
                return false;
            }
            // Só clientes antigos ainda sem estado explícito usam presença no socket.
            $legacyForeground = !$managed && $source === 'foreground';
            $statement = $this->db->prepare('UPDATE localizacao_membro SET
                latitude = :latitude, longitude = :longitude, precisao_m = :accuracy,
                origem = :source, capturada_em = :captured,
                atualizada_em = COALESCE(:fresh, UTC_TIMESTAMP(3)), recebida_em = UTC_TIMESTAMP(3),
                localizacao_ativa = :active, visivel = :visible WHERE membro_id = :member');
            $statement->execute([
                'latitude' => $latitude, 'longitude' => $longitude, 'accuracy' => $accuracy,
                'source' => $source, 'captured' => $capturedAt, 'fresh' => $capturedAt,
                'active' => $legacyForeground ? 1 : (int) $previous['localizacao_ativa'],
                'visible' => $legacyForeground ? ($visible ? 1 : 0) : (int) $previous['visivel'],
                'member' => $memberId
            ]);
            if ($ownTransaction) $this->db->commit();
            return true;
        } catch (\Throwable $error) {
            if ($ownTransaction && $this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    /** A extensão só atualiza uma presença já ativa; nunca a torna visível. */
    public function saveLocationPush(string $memberId, string $token, array $payload): bool {
        if (($payload['location_policy_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Versão de localização inválida.');
        }
        $capturedAt = LocationSample::capturedAt($payload);
        $latitude = $payload['latitude'] ?? null;
        $longitude = $payload['longitude'] ?? null;
        if (!is_numeric($latitude) || !is_numeric($longitude)
            || !is_finite((float)$latitude) || !is_finite((float)$longitude)
            || abs((float)$latitude) > 90 || abs((float)$longitude) > 180) {
            throw new InvalidArgumentException('Coordenadas inválidas.');
        }
        // Uma única operação verifica recolha ativa, autorização e ordem da amostra.
        // Um hide concorrente fica sempre oculto, independentemente da ordem.
        $statement = $this->db->prepare(
            "UPDATE localizacao_membro SET
                latitude = :latitude, longitude = :longitude, precisao_m = :accuracy,
                origem = 'background', capturada_em = :captured_at,
                atualizada_em = :fresh_at, recebida_em = UTC_TIMESTAMP(3)
             WHERE membro_id = :member_id AND localizacao_ativa = 1
                AND :newer_at > COALESCE(capturada_em, atualizada_em)
                AND EXISTS (
                    SELECT 1 FROM token
                    WHERE token.membro_id = localizacao_membro.membro_id
                      AND token.token = :token_hash
                      AND token.proposito = 'background_location'
                      AND token.validade > UTC_TIMESTAMP()
                )"
        );
        $statement->execute([
            'latitude' => (float)$latitude, 'longitude' => (float)$longitude,
            'accuracy' => (float)$payload['accuracy'], 'captured_at' => $capturedAt,
            'fresh_at' => $capturedAt, 'newer_at' => $capturedAt,
            'member_id' => $memberId, 'token_hash' => Token::hash($token)
        ]);
        return $statement->rowCount() > 0;
    }

    public function rejectionReason(string $memberId, string $token): string {
        $statement = $this->db->prepare("SELECT 1 FROM token WHERE membro_id = :member
            AND token = :hash AND proposito = 'background_location' AND validade > UTC_TIMESTAMP()");
        $statement->execute(['member' => $memberId, 'hash' => Token::hash($token)]);
        if (!$statement->fetchColumn()) return 'authorization_revoked';
        return $this->state($memberId)['active'] ? 'duplicate_or_older_location' : 'collection_disabled';
    }

    public function disable(string $memberId): void {
        $memberId = trim($memberId);
        if ($memberId === '') {
            return;
        }
        $statement = $this->db->prepare(
            'UPDATE localizacao_membro
                SET localizacao_ativa = 0, visivel = 0, estado_versao = estado_versao + 1
                WHERE membro_id = :member_id'
        );
        $statement->execute(['member_id' => $memberId]);
    }
}