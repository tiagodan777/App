<?php
declare(strict_types=1);

namespace App\CMS;

final class HalloweenWardrobe {
    public const VERSION = 'hw26-pilot-1';

    private array $settings;
    private ?array $catalog = null;
    private ?array $items = null;

    public function __construct(?array $settings = null) {
        $this->settings = $settings
            ?? require dirname(__DIR__, 3) . '/config/halloween.php';
    }

    public function allowed(string $memberId): bool {
        $memberId = strtolower(trim($memberId));

        if (
            preg_match(
                '/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D',
                $memberId
            ) !== 1
        ) {
            return false;
        }

        $mode = $this->settings['mode'] ?? 'off';

        return $mode === 'public'
            || (
                $mode === 'pilot'
                && in_array(
                    $memberId,
                    $this->settings['testers'] ?? [],
                    true
                )
            );
    }

    public static function isHalloween(string $type): bool {
        return str_starts_with(strtolower(trim($type)), 'hw26_');
    }

    private function data(): array {
        if ($this->catalog === null) {
            $path = dirname(__DIR__, 3)
                . '/resources/halloween-2026/catalog.json';

            $this->catalog = json_decode(
                (string) file_get_contents($path),
                true,
                32,
                JSON_THROW_ON_ERROR
            );

            $this->items = array_column(
                $this->catalog['items'],
                null,
                'id'
            );
        }

        return $this->catalog;
    }

    public function item(string $type): ?array {
        $this->data();

        return $this->items[$type] ?? null;
    }

    public function clientCatalog(string $memberId, string $base): array {
        if (!$this->allowed($memberId)) {
            throw new \DomainException('Coleção indisponível.');
        }

        $data = $this->data();

        return [
            'version' => self::VERSION,
            'groups' => $data['groups'],
            'items' => array_map(
                static function (array $item) use ($base): array {
                    $item['asset'] = rtrim($base, '/')
                        . '/'
                        . rawurlencode($item['sheet'])
                        . '?v='
                        . self::VERSION;

                    return $item;
                },
                $data['items']
            ),
        ];
    }

    public function assetPath(string $memberId, string $sheet): ?string {
        if (
            !$this->allowed($memberId)
            || preg_match('/^[a-z0-9-]+$/D', $sheet) !== 1
        ) {
            return null;
        }

        if (
            !in_array(
                $sheet,
                array_column($this->data()['groups'], 'id'),
                true
            )
        ) {
            return null;
        }

        $path = dirname(__DIR__, 3)
            . '/resources/halloween-2026/assets/'
            . $sheet
            . '.webp';

        return is_file($path) ? $path : null;
    }

    public function filterStatus(
        ?array $status,
        string $owner,
        string $viewer
    ): ?array {
        if ($status === null) {
            return null;
        }

        $canSee = $this->allowed($viewer) && $this->allowed($owner);

        $status['clothes'] = array_values(
            array_filter(
                $status['clothes'] ?? [],
                function ($item) use ($canSee): bool {
                    $type = is_array($item)
                        && is_string($item['type'] ?? null)
                            ? $item['type']
                            : '';

                    return !self::isHalloween($type)
                        || ($canSee && $this->item($type) !== null);
                }
            )
        );

        return trim((string) ($status['note'] ?? '')) === ''
            && $status['clothes'] === []
                ? null
                : $status;
    }
}