<?php

declare(strict_types=1);

namespace App\CMS;

final class ProximityConfig
{
    /*
     * RAIO ÚNICO DA MARGOT.
     *
     * TESTES:
     * 40000.0 = 40 km
     *
     * PRODUÇÃO:
     * 100.0 = 100 metros
     * 150.0 = 150 metros
     */
    public const RADIUS_METRES = 100;

    /**
     * Calcula automaticamente o bounding box necessário
     * para o raio configurado acima.
     *
     * @return array{0: float, 1: float}
     */
    public static function boundingBoxDeltas(float $latitude): array
    {
        $metresPerDegreeLatitude = 111320.0;

        $latitudeDelta =
            (self::RADIUS_METRES / $metresPerDegreeLatitude) * 1.02;

        $cosine = max(
            0.05,
            abs(cos(deg2rad($latitude)))
        );

        $longitudeDelta = $latitudeDelta / $cosine;

        return [
            $latitudeDelta,
            $longitudeDelta
        ];
    }
}
