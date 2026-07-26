<?php

declare(strict_types=1);

namespace App\Security;

final class RateLimiter
{
    public static function allow(
        string $bucket,
        string $key,
        int $limit,
        int $windowSeconds
    ): bool {
        if ($limit < 1 || $windowSeconds < 1) return false;

        $directory = APP_ROOT . '/var/rate-limit';

        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            error_log('[rate-limit] Não foi possível criar a pasta.');
            return false;
        }

        @chmod($directory, 0750);
        clearstatcache(true, $directory);
        $directoryMode = fileperms($directory);

        if ($directoryMode === false || ($directoryMode & 0027) !== 0) {
            error_log('[rate-limit] A pasta não tem permissões privadas.');
            return false;
        }

        $safeBucket = preg_replace('/[^a-z0-9_-]/i', '-', $bucket) ?: 'default';
        $filename = $directory . '/' . $safeBucket . '-' . hash('sha256', $key) . '.json';
        $handle = fopen($filename, 'c+');

        if ($handle === false) return false;

        try {
            @chmod($filename, 0640);
            clearstatcache(true, $filename);
            $fileMode = fileperms($filename);

            if ($fileMode === false || ($fileMode & 0027) !== 0) {
                error_log('[rate-limit] Um ficheiro não tem permissões privadas.');
                return false;
            }

            if (!flock($handle, LOCK_EX)) return false;

            $now = time();
            $raw = stream_get_contents($handle);
            $attempts = json_decode(is_string($raw) ? $raw : '[]', true);

            if (!is_array($attempts)) $attempts = [];

            $attempts = array_values(array_filter(
                $attempts,
                static fn($timestamp): bool =>
                    is_int($timestamp) && $timestamp > ($now - $windowSeconds)
            ));

            $allowed = count($attempts) < $limit;

            if ($allowed) $attempts[] = $now;

            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, (string) json_encode($attempts, JSON_THROW_ON_ERROR));
            fflush($handle);
            flock($handle, LOCK_UN);

            if (random_int(1, 100) === 1) self::cleanup($directory, max(86400, $windowSeconds * 2));

            return $allowed;
        } catch (\Throwable $error) {
            error_log('[rate-limit] ' . $error->getMessage());
            return false;
        } finally {
            fclose($handle);
        }
    }

    public static function clear(string $bucket, string $key): void
    {
        $safeBucket = preg_replace('/[^a-z0-9_-]/i', '-', $bucket) ?: 'default';
        $filename = APP_ROOT . '/var/rate-limit/' .
            $safeBucket . '-' . hash('sha256', $key) . '.json';

        if (is_file($filename)) @unlink($filename);
    }

    private static function cleanup(string $directory, int $maxAge): void
    {
        $cutoff = time() - $maxAge;

        foreach (glob($directory . '/*.json') ?: [] as $file) {
            if (is_file($file) && (int) filemtime($file) < $cutoff) @unlink($file);
        }
    }
}
