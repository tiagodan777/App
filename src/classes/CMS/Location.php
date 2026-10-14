<?php
declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;

final class Location {
    private \PDO $db;

    public function __construct(\PDO $db) {
        $this->db = $db;
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
        if (!$active || !$visible) {
            $capturedAt = (new \DateTimeImmutable('now',new \DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
            $latitude = null;
            $longitude = null;
            $accuracy = null;
        } elseif (
            $latitude === null ||
            $longitude === null ||
            $latitude < -90 ||
            $latitude > 90 ||
            $longitude < -180 ||
            $longitude > 180
        ) {
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
                localizacao_ativa=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(localizacao_ativa),localizacao_ativa),
                visivel=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(visivel),visivel),
                origem=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(origem),origem),
                recebida_em=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(recebida_em),recebida_em),
                atualizada_em=IF(VALUES(capturada_em) IS NULL OR VALUES(capturada_em)>COALESCE(capturada_em,atualizada_em),VALUES(atualizada_em),atualizada_em),
                capturada_em=IF(VALUES(capturada_em) IS NULL,NULL,IF(VALUES(capturada_em)>=COALESCE(capturada_em,atualizada_em),VALUES(capturada_em),capturada_em))'
        );
        $statement->execute([
            'member_id'=>$memberId,'latitude'=>$latitude,'longitude'=>$longitude,'accuracy'=>$accuracy,
            'active'=>$active?1:0,'visible'=>$visible?1:0,'source'=>$source === 'foreground'?'foreground':'background',
            'fresh_at'=>$active && $visible ? $capturedAt : null,
            'captured_at'=>$capturedAt
        ]);
        return $statement->rowCount()>0;
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