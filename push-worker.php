<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}
require_once __DIR__ . '/src/bootstrap.php';
$provider = $cms->getPushProvider();
$queue = $cms->getPushNotification();
if (!$provider->isEnabled()) {
    fwrite(STDOUT, "[PUSH] Envio desativado por configuração.\n");
    exit(0);
}
$running = true;
if (function_exists('pcntl_async_signals')) {
    pcntl_async_signals(true);
    foreach ([SIGTERM, SIGINT] as $signal) {
        pcntl_signal($signal, static function () use (&$running): void {
            $running = false;
        });
    }
}
$lastMaintenance = 0;
$lastReminders = 0;
$reminders = new App\CMS\ActivityReminders($cms->getDatabase(), $queue);
$daylies = new App\CMS\Daylie($cms->getDatabase());
$queue->recoverStalledJobs();
fwrite(STDOUT, "[PUSH] Worker iniciado.\n");
while ($running) {
    try {
        if (time() - $lastMaintenance >= 3600) {
            $queue->recoverStalledJobs();
            $queue->cleanup();
            $daylies->cleanup();
            $cms->getDatabase()->exec('DELETE FROM lembretes_envios WHERE criado_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 35 DAY)');
            $lastMaintenance = time();
        }
        if (time() - $lastReminders >= 60) {
            $lastReminders = time();
            try {
                $reminders->tick();
            } catch (Throwable $error) {
                error_log('[push-reminders] ' . $error->getMessage());
            }
        }
        $job = $queue->nextJob();
        if ($job === null) {
            usleep(500000);
            continue;
        }
        try {
            if (!$queue->isDeliverable($job)) {
                $queue->markCancelled((int) $job['id'], 'interaction_no_longer_available');
                continue;
            }
            $result = $provider->send($job);
            if (($result['success'] ?? false) === true) {
                $queue->markSent(
                    (int) $job['id'],
                    (int) $job['dispositivo_id'],
                    isset($result['environment']) ? (string) $result['environment'] : null
                );
                continue;
            }
            $queue->markFailed(
                (int) $job['id'],
                (int) $job['dispositivo_id'],
                (string) ($result['error'] ?? 'push_error'),
                ($result['permanent'] ?? false) === true
            );
        } catch (Throwable $error) {
            $queue->markFailed((int) $job['id'], (int) $job['dispositivo_id'], 'worker_' . $error->getMessage(), false);
            error_log('[push-worker] ' . $error->getMessage());
        }
    } catch (Throwable $error) {
        error_log('[push-worker-loop] ' . $error->getMessage());
        usleep(1000000);
    }
}
fwrite(STDOUT, "[PUSH] Worker terminado.\n");