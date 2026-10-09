<?php
declare(strict_types=1);

namespace App\CMS;

final class ProximityConfig
{
    // Raio de proximidade da Margot, em metros.
    public const RADIUS_METRES = 100.0;

    /**
     * Calcula a área de pesquisa correspondente ao raio.
     *
     * @return array{0: float, 1: float}
     */
    public static function boundingBoxDeltas(float $latitude): array
    {
        $metresPerDegreeLatitude = 111320.0;

        $latitudeDelta =
            (self::RADIUS_METRES / $metresPerDegreeLatitude) * 1.02;

        $cosine = max(0.05, abs(cos(deg2rad($latitude))));
        $longitudeDelta = $latitudeDelta / $cosine;

        return [$latitudeDelta, $longitudeDelta];
    }
}