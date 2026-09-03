<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;

final class NearbyPresenceNotification
{
    private const RADIUS_METRES = 100.0;
    private const LOCATION_MAX_AGE_SECONDS = 180;
    private const MINIMUM_NEARBY_PEOPLE = 3;
    private const NOTIFICATION_COOLDOWN_SECONDS = 3600;

    private PDO $db;
    private PushNotification $push;
    private bool $schemaReady = false;

    public function __construct(PDO $db, PushNotification $push)
    {
        $this->db = $db;
        $this->push = $push;
    }

    public function syncAppState(string $memberId, bool $background): void
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return;
        }

        $this->ensureSchema();

        $statement = $this->db->prepare(
            'INSERT INTO estado_app_membro (
                membro_id,
                em_background,
                alerta_proximidade_ativo,
                total_proximidade,
                atualizado_em
             ) VALUES (
                :member_id,
                :background,
                0,
                0,
                UTC_TIMESTAMP(6)
             )
             ON DUPLICATE KEY UPDATE
                em_background = VALUES(em_background),
                alerta_proximidade_ativo = CASE
                    WHEN VALUES(em_background) = 0 THEN 0
                    ELSE alerta_proximidade_ativo
                END,
                total_proximidade = CASE
                    WHEN VALUES(em_background) = 0 THEN 0
                    ELSE total_proximidade
                END,
                atualizado_em = UTC_TIMESTAMP(6)'
        );

        $statement->execute([
            'member_id' => $memberId,
            'background' => $background ? 1 : 0
        ]);
    }

    /**
     * @return array{latitude: float, longitude: float}|null
     */
    public function locationSnapshot(string $memberId): ?array
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return null;
        }

        $statement = $this->db->prepare(
            'SELECT latitude, longitude
             FROM localizacao_membro
             WHERE membro_id = :member_id
             AND latitude IS NOT NULL
             AND longitude IS NOT NULL
             LIMIT 1'
        );

        $statement->execute([
            'member_id' => $memberId
        ]);

        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        $latitude = filter_var(
            $row['latitude'] ?? null,
            FILTER_VALIDATE_FLOAT
        );

        $longitude = filter_var(
            $row['longitude'] ?? null,
            FILTER_VALIDATE_FLOAT
        );

        if (
            $latitude === false ||
            $longitude === false ||
            $latitude < -90 ||
            $latitude > 90 ||
            $longitude < -180 ||
            $longitude > 180
        ) {
            return null;
        }

        return [
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude
        ];
    }

    public function evaluateMember(string $memberId): void
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return;
        }

        $this->ensureSchema();

        $location = $this->eligibleBackgroundLocation($memberId);

        if ($location === null) {
            $this->resetAlert($memberId, 0);
            return;
        }

        $nearbyCount = $this->nearbyCount(
            $memberId,
            $location['latitude'],
            $location['longitude']
        );

        if ($nearbyCount < self::MINIMUM_NEARBY_PEOPLE) {
            $this->resetAlert($memberId, $nearbyCount);
            return;
        }

        /*
         * Só uma atualização concorrente pode transformar o estado 0 -> 1.
         * Assim, se várias pessoas entrarem no raio praticamente ao mesmo
         * tempo, não enfileiramos várias notificações iguais.
         */
        $claim = $this->db->prepare(
            'UPDATE estado_app_membro
             SET alerta_proximidade_ativo = 1,
                 total_proximidade = :nearby_count,
                 atualizado_em = UTC_TIMESTAMP(6)
             WHERE membro_id = :member_id
             AND em_background = 1
             AND alerta_proximidade_ativo = 0
             AND (
                 ultima_notificacao_proximidade_em IS NULL
                 OR ultima_notificacao_proximidade_em <= DATE_SUB(
                     UTC_TIMESTAMP(6),
                     INTERVAL ' . self::NOTIFICATION_COOLDOWN_SECONDS . ' SECOND
                 )
             )'
        );

        $claim->execute([
            'nearby_count' => $nearbyCount,
            'member_id' => $memberId
        ]);

        if ($claim->rowCount() !== 1) {
            $this->updateNearbyCount($memberId, $nearbyCount);
            return;
        }

        $queued = $this->push->enqueueNearbyPeople(
            $memberId,
            $nearbyCount
        );

        if ($queued > 0) {
            $statement = $this->db->prepare(
                'UPDATE estado_app_membro
                 SET ultima_notificacao_proximidade_em = UTC_TIMESTAMP(6),
                     total_proximidade = :nearby_count,
                     atualizado_em = UTC_TIMESTAMP(6)
                 WHERE membro_id = :member_id'
            );

            $statement->execute([
                'nearby_count' => $nearbyCount,
                'member_id' => $memberId
            ]);

            return;
        }

        /*
         * Sem dispositivo push ativo não "consumimos" esta oportunidade.
         * Se o utilizador voltar a ter push registado enquanto continua em
         * background, uma atualização posterior pode tentar novamente.
         */
        $this->resetAlert($memberId, $nearbyCount);
    }

    /**
     * Reavalia apenas utilizadores em background que possam ter sido
     * afetados pela posição anterior ou nova do membro que acabou de mudar.
     *
     * @param array{latitude: float, longitude: float}|null $oldPosition
     * @param array{latitude: float, longitude: float}|null $newPosition
     */
    public function processLocationChange(
        string $changedMemberId,
        ?array $oldPosition,
        ?array $newPosition
    ): void {
        $changedMemberId = trim($changedMemberId);

        if ($changedMemberId === '') {
            return;
        }

        $this->ensureSchema();

        $candidateIds = [];

        foreach ([$oldPosition, $newPosition] as $position) {
            if (!$this->validPosition($position)) {
                continue;
            }

            foreach ($this->backgroundCandidatesNear($position) as $memberId) {
                $candidateIds[$memberId] = true;
            }
        }

        if ($this->isBackground($changedMemberId)) {
            $candidateIds[$changedMemberId] = true;
        }

        foreach (array_keys($candidateIds) as $candidateId) {
            $this->evaluateMember((string) $candidateId);
        }
    }

    private function ensureSchema(): void
    {
        if ($this->schemaReady) {
            return;
        }

        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS estado_app_membro (
                membro_id CHAR(36) NOT NULL,
                em_background TINYINT(1) NOT NULL DEFAULT 0,
                alerta_proximidade_ativo TINYINT(1) NOT NULL DEFAULT 0,
                total_proximidade INT UNSIGNED NOT NULL DEFAULT 0,
                ultima_notificacao_proximidade_em DATETIME(6) NULL,
                atualizado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (membro_id),
                KEY idx_estado_app_background (em_background, atualizado_em)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $this->schemaReady = true;
    }

    /**
     * @return array{latitude: float, longitude: float}|null
     */
    private function eligibleBackgroundLocation(string $memberId): ?array
    {
        $statement = $this->db->prepare(
            'SELECT lm.latitude, lm.longitude
             FROM estado_app_membro AS ea
             INNER JOIN localizacao_membro AS lm
                ON lm.membro_id COLLATE utf8mb4_unicode_ci = ea.membro_id COLLATE utf8mb4_unicode_ci
             INNER JOIN membros AS m
                ON m.id COLLATE utf8mb4_unicode_ci = ea.membro_id COLLATE utf8mb4_unicode_ci
             WHERE ea.membro_id = :member_id
             AND ea.em_background = 1
             AND lm.localizacao_ativa = 1
             AND lm.visivel = 1
             AND lm.latitude IS NOT NULL
             AND lm.longitude IS NOT NULL
             AND lm.atualizada_em >= DATE_SUB(
                 UTC_TIMESTAMP(),
                 INTERVAL ' . self::LOCATION_MAX_AGE_SECONDS . ' SECOND
             )
             AND m.nascimento IS NOT NULL
             AND m.nascimento >= \'1900-01-01\'
             AND m.nascimento <= DATE_SUB(UTC_DATE(), INTERVAL 18 YEAR)
             LIMIT 1'
        );

        $statement->execute([
            'member_id' => $memberId
        ]);

        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return [
            'latitude' => (float) $row['latitude'],
            'longitude' => (float) $row['longitude']
        ];
    }

    /**
     * @param array{latitude: float, longitude: float} $position
     * @return list<string>
     */
    private function backgroundCandidatesNear(array $position): array
    {
        $latitude = (float) $position['latitude'];
        $longitude = (float) $position['longitude'];
        $latitudeDelta = 0.0018;
        $cosine = max(0.05, abs(cos(deg2rad($latitude))));
        $longitudeDelta = 0.0018 / $cosine;

        $statement = $this->db->prepare(
            'SELECT ea.membro_id
             FROM estado_app_membro AS ea
             INNER JOIN localizacao_membro AS lm
                ON lm.membro_id COLLATE utf8mb4_unicode_ci = ea.membro_id COLLATE utf8mb4_unicode_ci
             INNER JOIN membros AS m
                ON m.id COLLATE utf8mb4_unicode_ci = ea.membro_id COLLATE utf8mb4_unicode_ci
             WHERE ea.em_background = 1
             AND lm.localizacao_ativa = 1
             AND lm.visivel = 1
             AND lm.latitude IS NOT NULL
             AND lm.longitude IS NOT NULL
             AND lm.atualizada_em >= DATE_SUB(
                 UTC_TIMESTAMP(),
                 INTERVAL ' . self::LOCATION_MAX_AGE_SECONDS . ' SECOND
             )
             AND m.nascimento IS NOT NULL
             AND m.nascimento >= \'1900-01-01\'
             AND m.nascimento <= DATE_SUB(UTC_DATE(), INTERVAL 18 YEAR)
             AND lm.latitude BETWEEN :lat_min AND :lat_max
             AND lm.longitude BETWEEN :lon_min AND :lon_max'
        );

        $statement->execute([
            'lat_min' => $latitude - $latitudeDelta,
            'lat_max' => $latitude + $latitudeDelta,
            'lon_min' => $longitude - $longitudeDelta,
            'lon_max' => $longitude + $longitudeDelta
        ]);

        $result = [];

        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $memberId) {
            $memberId = trim((string) $memberId);

            if ($memberId !== '') {
                $result[] = $memberId;
            }
        }

        return $result;
    }

    private function nearbyCount(
        string $memberId,
        float $latitude,
        float $longitude
    ): int {
        $latitudeDelta = 0.0018;
        $cosine = max(0.05, abs(cos(deg2rad($latitude))));
        $longitudeDelta = 0.0018 / $cosine;

        $statement = $this->db->prepare(
            'SELECT lm.membro_id, lm.latitude, lm.longitude
             FROM localizacao_membro AS lm
             INNER JOIN membros AS m
                ON m.id COLLATE utf8mb4_unicode_ci = lm.membro_id COLLATE utf8mb4_unicode_ci
             WHERE lm.membro_id <> :member_id
             AND lm.localizacao_ativa = 1
             AND lm.visivel = 1
             AND lm.latitude IS NOT NULL
             AND lm.longitude IS NOT NULL
             AND lm.atualizada_em >= DATE_SUB(
                 UTC_TIMESTAMP(),
                 INTERVAL ' . self::LOCATION_MAX_AGE_SECONDS . ' SECOND
             )
             AND m.nascimento IS NOT NULL
             AND m.nascimento >= \'1900-01-01\'
             AND m.nascimento <= DATE_SUB(UTC_DATE(), INTERVAL 18 YEAR)
             AND lm.latitude BETWEEN :lat_min AND :lat_max
             AND lm.longitude BETWEEN :lon_min AND :lon_max
             AND NOT EXISTS (
                 SELECT 1
                 FROM bloqueados AS b
                 WHERE (
                     b.pessoa_bloqueou_id = :member_block_1
                     AND b.pessoa_bloqueada_id COLLATE utf8mb4_unicode_ci = lm.membro_id COLLATE utf8mb4_unicode_ci
                 ) OR (
                     b.pessoa_bloqueou_id COLLATE utf8mb4_unicode_ci = lm.membro_id COLLATE utf8mb4_unicode_ci
                     AND b.pessoa_bloqueada_id = :member_block_2
                 )
             )'
        );

        $statement->execute([
            'member_id' => $memberId,
            'lat_min' => $latitude - $latitudeDelta,
            'lat_max' => $latitude + $latitudeDelta,
            'lon_min' => $longitude - $longitudeDelta,
            'lon_max' => $longitude + $longitudeDelta,
            'member_block_1' => $memberId,
            'member_block_2' => $memberId
        ]);

        $count = 0;

        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $otherLatitude = (float) ($row['latitude'] ?? 0);
            $otherLongitude = (float) ($row['longitude'] ?? 0);

            if (
                $this->distanceMetres(
                    $latitude,
                    $longitude,
                    $otherLatitude,
                    $otherLongitude
                ) <= self::RADIUS_METRES
            ) {
                $count += 1;
            }
        }

        return $count;
    }

    private function resetAlert(string $memberId, int $nearbyCount): void
    {
        $statement = $this->db->prepare(
            'UPDATE estado_app_membro
             SET alerta_proximidade_ativo = 0,
                 total_proximidade = :nearby_count,
                 atualizado_em = UTC_TIMESTAMP(6)
             WHERE membro_id = :member_id'
        );

        $statement->execute([
            'nearby_count' => max(0, $nearbyCount),
            'member_id' => $memberId
        ]);
    }

    private function updateNearbyCount(string $memberId, int $nearbyCount): void
    {
        $statement = $this->db->prepare(
            'UPDATE estado_app_membro
             SET total_proximidade = :nearby_count,
                 atualizado_em = UTC_TIMESTAMP(6)
             WHERE membro_id = :member_id'
        );

        $statement->execute([
            'nearby_count' => max(0, $nearbyCount),
            'member_id' => $memberId
        ]);
    }

    private function isBackground(string $memberId): bool
    {
        $statement = $this->db->prepare(
            'SELECT em_background
             FROM estado_app_membro
             WHERE membro_id = :member_id
             LIMIT 1'
        );

        $statement->execute([
            'member_id' => $memberId
        ]);

        return (int) $statement->fetchColumn() === 1;
    }

    private function validPosition(?array $position): bool
    {
        if ($position === null) {
            return false;
        }

        $latitude = $position['latitude'] ?? null;
        $longitude = $position['longitude'] ?? null;

        return is_numeric($latitude) &&
            is_numeric($longitude) &&
            (float) $latitude >= -90 &&
            (float) $latitude <= 90 &&
            (float) $longitude >= -180 &&
            (float) $longitude <= 180;
    }

    private function distanceMetres(
        float $latitude1,
        float $longitude1,
        float $latitude2,
        float $longitude2
    ): float {
        $earthRadius = 6371000.0;
        $lat1 = deg2rad($latitude1);
        $lat2 = deg2rad($latitude2);
        $deltaLat = deg2rad($latitude2 - $latitude1);
        $deltaLon = deg2rad($longitude2 - $longitude1);

        $a = sin($deltaLat / 2) ** 2 +
            cos($lat1) * cos($lat2) *
            sin($deltaLon / 2) ** 2;

        $a = min(1.0, max(0.0, $a));

        return $earthRadius * 2 * atan2(
            sqrt($a),
            sqrt(1 - $a)
        );
    }
}