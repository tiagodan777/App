<?php

declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');

if (
    strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !==
    'POST'
) {
    header('Allow: POST');
    http_response_code(405);
    exit;
}

$membroId = trim((string) ($session->id ?? ''));

if ($membroId !== '') {
    foreach (
        ['background_location', 'websocket']
        as $purpose
    ) {
        try {
            $cms->getToken()->deleteForMemberAndPurpose(
                $membroId,
                $purpose
            );
        } catch (Throwable $error) {
            error_log(
                '[logout] Falha ao revogar token: ' .
                $error->getMessage()
            );
        }
    }

    try {
        $cms->getLocation()->disable($membroId);
    } catch (Throwable $error) {
        error_log(
            '[logout] Falha ao desativar localização: ' .
            $error->getMessage()
        );
    }
}

try {
    $cookie->delete();
} catch (Throwable $error) {
    error_log(
        '[logout] Falha ao revogar sessão persistente: ' .
        $error->getMessage()
    );
}

$session->delete();

redirect(DOC_ROOT . 'login/', [], 303);