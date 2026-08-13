<?php

declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;

final class Location
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public function saveBackground(
        string $memberId,
        ?float $latitude,
        ?float $longitude,
        ?float $accuracy,
        bool $active,
        bool $visible
    ): void {
        $memberId = trim($memberId);

        if ($memberId === '') {
            throw new InvalidArgumentException('Membro inválido.');
        }

        if (!$active || !$visible) {
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

        $this->db->runSQL(
            'INSERT INTO localizacao_membro (
                membro_id,
                latitude,
                longitude,
                precisao_m,
                localizacao_ativa,
                visivel,
                origem,
                atualizada_em
             ) VALUES (
                :member_id,
                :latitude,
                :longitude,
                :accuracy,
                :active,
                :visible,
                :source,
                UTC_TIMESTAMP()
             )
             ON DUPLICATE KEY UPDATE
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                precisao_m = VALUES(precisao_m),
                localizacao_ativa = VALUES(localizacao_ativa),
                visivel = VALUES(visivel),
                origem = VALUES(origem),
                atualizada_em = UTC_TIMESTAMP()',
            [
                'member_id' => $memberId,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'accuracy' => $accuracy,
                'active' => $active ? 1 : 0,
                'visible' => $visible ? 1 : 0,
                'source' => 'background'
            ]
        );
    }

    public function disable(string $memberId): void
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return;
        }

        $this->db->runSQL(
            'UPDATE localizacao_membro
             SET localizacao_ativa = 0,
                 visivel = 0,
                 atualizada_em = UTC_TIMESTAMP()
             WHERE membro_id = :member_id',
            ['member_id' => $memberId]
        );
    }
}