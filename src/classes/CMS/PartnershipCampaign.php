<?php
declare(strict_types=1);

namespace App\CMS;

use PDO;

final class PartnershipCampaign
{
    private const SOURCES = [
        'direct', 'other', 'screen', 'entrance', 'bar', 'table', 'wc', 'outside',
        'poster', 'flyer', 'instagram', 'tiktok', 'facebook',
    ];

    private const PROVISORIO_SOURCES = [
        'tiago', 'provisorio', 'margot', 'tomas-dias', 'rodrigo-reis', 'tomas-silva',
        'andre-vieira', 'andre-matos', 'sonia-daniel', 'medicina',
    ];

    public function __construct(private PDO $db) {}

    public static function slug(mixed $value): ?string
    {
        if (!is_string($value) || strlen($value) > 64) {
            return null;
        }
        return preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $value) === 1 ? $value : null;
    }

    public static function source(mixed $value, ?string $space): string
    {
        if (!is_string($value)) {
            return 'other';
        }
        $source = strtolower(trim($value));
        if ($source === '') {
            return 'direct';
        }
        if (in_array($source, self::SOURCES, true)
            || ($space === 'provisorio' && in_array($source, self::PROVISORIO_SOURCES, true))) {
            return $source;
        }
        return 'other';
    }

    public static function openLandingConnection(): PDO
    {
        $root = dirname(__DIR__, 3);
        if (!defined('APP_ROOT')) {
            define('APP_ROOT', $root);
        }
        $localConfig = $root . '/config/config.local.php';
        require is_file($localConfig) ? $localConfig : $root . '/config/config.php';

        return new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 2,
        ]);
    }

    public function activeSpace(string $slug): ?array
    {
        $statement = $this->db->prepare(
            'SELECT slug, nome, localidade FROM campanha_espaco WHERE slug = :slug AND ativo = 1'
        );
        $statement->execute(['slug' => $slug]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    public function recordVisit(string $slug, string $source, bool $legacy = false): void
    {
        if ($legacy) {
            $statement = $this->db->prepare(
                'INSERT INTO qr_provisorio_diario (dia_utc, origem, total)
                 VALUES (UTC_DATE(), :source, 1)
                 ON DUPLICATE KEY UPDATE total = total + 1'
            );
            $statement->execute(['source' => $source]);
            return;
        }

        $statement = $this->db->prepare(
            'INSERT INTO campanha_visita_diaria (espaco, dia_utc, origem, total)
             SELECT slug, UTC_DATE(), :source, 1 FROM campanha_espaco WHERE slug = :slug AND ativo = 1
             ON DUPLICATE KEY UPDATE campanha_visita_diaria.total = campanha_visita_diaria.total + 1'
        );
        $statement->execute(['slug' => $slug, 'source' => $source]);
    }

    public function recordRegistration(string $member, string $slug, string $source): void
    {
        $statement = $this->db->prepare(
            'INSERT INTO campanha_registo (membro_id, espaco, origem, criado_em)
             SELECT :member, slug, :source, UTC_TIMESTAMP() FROM campanha_espaco
             WHERE slug = :slug AND ativo = 1
             ON DUPLICATE KEY UPDATE campanha_registo.membro_id = campanha_registo.membro_id'
        );
        $statement->execute(['member' => $member, 'slug' => $slug, 'source' => $source]);
    }
}
