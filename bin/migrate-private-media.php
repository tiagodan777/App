<?php

declare(strict_types=1);

use App\CMS\Database;
use App\Security\MediaIntegrity;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

define('APP_ROOT', dirname(__DIR__));

require APP_ROOT . '/config/config.php';
require APP_ROOT . '/vendor/autoload.php';

$deleteSource = in_array('--delete-source', $argv, true);
$totals = [
    'copied' => 0,
    'already_verified' => 0,
    'source_deleted' => 0,
    'skipped' => 0,
    'failed' => 0,
    'records_checked' => 0,
    'integrity_issues' => 0
];

$ensureDirectory = static function (string $directory): void {
    if (is_link($directory)) {
        throw new RuntimeException('Uma pasta privada não pode ser um link simbólico.');
    }

    if (
        !is_dir($directory) &&
        !mkdir($directory, 0750, true) &&
        !is_dir($directory)
    ) {
        throw new RuntimeException('Não foi possível criar uma pasta privada.');
    }

    @chmod($directory, 0750);
};

$filesMatch = static function (string $first, string $second): bool {
    $firstSize = filesize($first);
    $secondSize = filesize($second);

    if (
        $firstSize === false ||
        $secondSize === false ||
        $firstSize !== $secondSize
    ) {
        return false;
    }

    $firstHash = hash_file('sha256', $first);
    $secondHash = hash_file('sha256', $second);

    return is_string($firstHash) &&
        is_string($secondHash) &&
        hash_equals($firstHash, $secondHash);
};

$copyVerified = static function (
    string $source,
    string $destination
) use (
    $ensureDirectory,
    $filesMatch,
    $deleteSource,
    &$totals
): void {
    if (
        !is_file($source) ||
        is_link($source) ||
        str_starts_with(basename($source), '.')
    ) {
        $totals['skipped']++;
        return;
    }

    $ensureDirectory(dirname($destination));

    if (is_link($destination)) {
        $totals['failed']++;
        return;
    }

    if (is_file($destination)) {
        if (!$filesMatch($source, $destination)) {
            $totals['failed']++;
            return;
        }

        @chmod($destination, 0640);
        $totals['already_verified']++;
    } else {
        $temporary = dirname($destination) .
            '/.migrate-' .
            bin2hex(random_bytes(12));

        try {
            if (!copy($source, $temporary)) {
                throw new RuntimeException('A cópia de um ficheiro falhou.');
            }

            @chmod($temporary, 0640);

            if (!$filesMatch($source, $temporary)) {
                throw new RuntimeException('A verificação de uma cópia falhou.');
            }

            if (!rename($temporary, $destination)) {
                throw new RuntimeException('Não foi possível concluir uma cópia.');
            }

            @chmod($destination, 0640);
            $totals['copied']++;
        } catch (Throwable $error) {
            if (is_file($temporary)) @unlink($temporary);
            $totals['failed']++;
            return;
        }
    }

    if ($deleteSource && $filesMatch($source, $destination)) {
        if (@unlink($source)) {
            $totals['source_deleted']++;
        } else {
            $totals['failed']++;
        }
    }
};

$mappings = [
    [
        APP_ROOT . '/public/imagens/fotos-perfil-temp',
        PROFILE_PHOTO_TEMP_DIR
    ],
    [
        APP_ROOT . '/public/imagens/fotos-perfil',
        PROFILE_PHOTO_THUMB_DIR
    ],
    [
        APP_ROOT . '/public/imagens/fotos-perfil-originais',
        PROFILE_PHOTO_ORIGINAL_DIR
    ],
    [
        APP_ROOT . '/public/media/mensagens',
        MESSAGE_MEDIA_DIR
    ]
];

try {
    foreach ($mappings as [$sourceDirectory, $destinationDirectory]) {
        $ensureDirectory($destinationDirectory);

        if (!is_dir($sourceDirectory)) {
            $totals['skipped']++;
            continue;
        }

        if (is_link($sourceDirectory)) {
            $totals['failed']++;
            continue;
        }

        $iterator = new FilesystemIterator(
            $sourceDirectory,
            FilesystemIterator::SKIP_DOTS
        );

        foreach ($iterator as $file) {
            $name = basename($file->getFilename());

            if ($name === 'default.webp') {
                $totals['skipped']++;
                continue;
            }

            $copyVerified(
                $file->getPathname(),
                rtrim($destinationDirectory, '/') . '/' . $name
            );
        }
    }

    $database = new Database($dsn, $username, $password);
    unset($dsn, $username, $password);
    $integrity = MediaIntegrity::audit($database);
    $totals['records_checked'] = (int) $integrity['records_checked'];
    $totals['integrity_issues'] = MediaIntegrity::issueCount($integrity);

    foreach ($integrity as $label => $count) {
        if (
            in_array($label, ['records_checked', 'pending_profile_photos'], true) ||
            (int) $count === 0
        ) {
            continue;
        }

        fwrite(STDOUT, 'integrity_' . $label . ': ' . (int) $count . PHP_EOL);
    }
} catch (Throwable $error) {
    fwrite(STDERR, "A migração de media privada terminou com erro.\n");
    exit(1);
}

foreach ($totals as $label => $count) {
    fwrite(STDOUT, $label . ': ' . (int) $count . PHP_EOL);
}

exit(
    $totals['failed'] > 0 ||
    $totals['integrity_issues'] > 0
        ? 1
        : 0
);
