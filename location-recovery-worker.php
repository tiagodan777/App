<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/src/bootstrap.php';
$provider = $cms->getPushProvider();
$recovery = new App\CMS\LocationRecovery($cms->getDatabase());
$running = true;
$lastCleanup = 0;
if (function_exists('pcntl_async_signals')) {
    pcntl_async_signals(true);
    foreach ([SIGTERM, SIGINT] as $signal) {
        pcntl_signal($signal, static function () use (&$running): void { $running = false; });
    }
}
fwrite(STDOUT, "[LOCATION RECOVERY] Serviço iniciado; ativação e lista de membros exigidas.\n");
while ($running) {
    $device = null;
    try {
        if (App\CMS\LocationRecovery::enabled() && $provider->isEnabled()) {
            if (time() - $lastCleanup >= 3600) {
                $recovery->cleanup();
                $lastCleanup = time();
            }
            $device = $recovery->nextRequest();
            if ($device !== null) {
                $result = $provider->sendLocationRecovery($device);
                if (!$result['success']) $recovery->failed($device, $result['permanent'], $result['error']);
                // APNs 200 significa aceite, não localização atualizada. Só o upload limpa as falhas.
                fwrite(STDOUT, '[LOCATION RECOVERY] id=' . $device['request_id']
                    . ' apns=' . ($result['success'] ? 'accepted' : 'failed') . "\n");
            }
        }
    } catch (Throwable $error) {
        // A reserva já limita repetições mesmo se o processo terminar durante o envio.
        error_log('[location-recovery-worker] ' . get_class($error));
    }
    usleep($device === null ? 5000000 : 1000000);
}