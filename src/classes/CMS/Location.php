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
        // A autenticação WebSocket aplica a preferência antes da primeira posição nativa.
        // Uma linha sem coordenadas nunca é uma presença geográfica válida.
        $statement = $this->db->prepare("INSERT IGNORE INTO localizacao_membro
            (membro_id, localizacao_ativa, visivel, origem, atualizada_em)
            VALUES (:member, 0, 0, 'foreground', '1970-01-01 00:00:00')");
        $statement->execute(['member' => $memberId]);
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
            $statement = $this->db->prepare('UPDATE localizacao_membro SET visivel = 0 WHERE membro_id = :member_id');
            $statement->execute(['member_id' => $memberId]);
            return true;
        }
        if ($latitude === null || $longitude === null || !is_finite($latitude) || !is_finite($longitude)
            || abs($latitude) > 90 || abs($longitude) > 180) {
            throw new InvalidArgumentException('Coordenadas inválidas.');
        }
        if ($accuracy !== null) {
            $accuracy = max(0, min(10000, $accuracy));
        }
        $statement = $this->db->prepare(
            'INSERT INTO localizacao_membro
                (membro_id,latitude,longitude,precisao_m,localizacao_ativa,visivel,origem,atualizada_em,capturada_em,recebida_em)
             VALUES (:member_id,:latitude,:longitude,:accuracy,:active,:visible,:source,
                COALESCE(:fresh_at,UTC_TIMESTAMP(3)),:captured_at,UTC_TIMESTAMP(3))
             ON DUPLICATE KEY UPDATE
                latitude=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(latitude),latitude),
                longitude=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(longitude),longitude),
                precisao_m=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(precisao_m),precisao_m),
                localizacao_ativa=IF(VALUES(origem)=\'background\',localizacao_ativa,IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(localizacao_ativa),localizacao_ativa)),
                visivel=IF(VALUES(origem)=\'background\',visivel,IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(visivel),visivel)),
                origem=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(origem),origem),
                recebida_em=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(recebida_em),recebida_em),
                atualizada_em=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(atualizada_em),atualizada_em),
                capturada_em=IF(VALUES(capturada_em) IS NULL,NULL,IF(VALUES(capturada_em)>=COALESCE(capturada_em,atualizada_em),VALUES(capturada_em),capturada_em))'
        );
        $statement->execute([
            'member_id'=>$memberId,'latitude'=>$latitude,'longitude'=>$longitude,'accuracy'=>$accuracy,
            'active'=>$active?1:0,'visible'=>$source === 'foreground' && $visible?1:0,'source'=>$source === 'foreground'?'foreground':'background',
            'fresh_at'=>$capturedAt,
            'captured_at'=>$capturedAt
        ]);
        return $statement->rowCount()>0;
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

    public function disable(string $memberId): void {
        $memberId = trim($memberId);
        if ($memberId === '') {
            return;
        }
        $statement = $this->db->prepare(
            'UPDATE localizacao_membro
                SET localizacao_ativa = 0, visivel = 0, capturada_em = NULL, atualizada_em = UTC_TIMESTAMP()
                WHERE membro_id = :member_id'
        );
        $statement->execute(['member_id' => $memberId]);
    }
}