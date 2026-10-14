<?php
declare(strict_types=1);
namespace App\CMS;

/** Validation shared by native HTTP and foreground WebSocket updates. */
final class LocationSample {
    public static function capturedAt(array $payload, ?float $now = null): ?string {
        // Older installed builds keep their previous protocol until upgraded.
        if (($payload['location_policy_version'] ?? null) !== 1) return null;
        $now ??= microtime(true);
        $raw = $payload['timestamp'] ?? null;
        if (is_int($raw) || is_float($raw)) {
            $seconds = (float)$raw / 1000;
        } elseif (is_string($raw) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/D', $raw)) {
            try {
                $date = new \DateTimeImmutable($raw);
                $errors = \DateTimeImmutable::getLastErrors();
                if (is_array($errors) && ($errors['warning_count'] || $errors['error_count'])) {
                    throw new \InvalidArgumentException('Invalid capture time');
                }
                $seconds = (float)$date->format('U.u');
            } catch (\Exception $e) { throw new \InvalidArgumentException('Invalid capture time',0,$e); }
        } else { throw new \InvalidArgumentException('Missing capture time'); }
        $accuracy = $payload['accuracy'] ?? null;
        if (!is_finite($seconds) || $now-$seconds>120 || $seconds-$now>5
            || !is_numeric($accuracy) || !is_finite((float)$accuracy)
            || (float)$accuracy<=0 || (float)$accuracy>100) {
            throw new \InvalidArgumentException('Stale or imprecise location');
        }
        // Clamp only small clock differences; no future lease on the server.
        $milliseconds = (int)floor(min($seconds,$now)*1000);
        return gmdate('Y-m-d H:i:s',intdiv($milliseconds,1000)) . sprintf('.%03d',$milliseconds%1000);
    }
}