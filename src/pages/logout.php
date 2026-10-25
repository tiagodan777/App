<?php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');
if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit();
}
$membroId = trim((string) ($session->id ?? ''));
if ($membroId !== '') {
    $identificadorSessao = session_status() === PHP_SESSION_ACTIVE ? session_id() : '';
    if ($identificadorSessao !== '') {
        try {
            $cms->getPushNotification()->unregisterSession($membroId, hash('sha256', $identificadorSessao));
        } catch (Throwable $error) {
            error_log('[logout] Falha ao desativar push: ' . $error->getMessage());
        }
    }
    try {
        $grant = $_SESSION['margot_background_grant'] ?? null;
        if (is_array($grant) && ($grant['member_id'] ?? '') === $membroId) {
            $cms->getLocation()->revokeBackgroundGrant($membroId, (string) ($grant['token'] ?? ''), $grant['session_hash'] ?? null);
        }
        $socketSession = $_SESSION['margot_websocket_session'] ?? null;
        if (is_array($socketSession) && ($socketSession['member_id'] ?? '') === $membroId) {
            $cms->getToken()->delete((string) ($socketSession['token'] ?? ''));
        }
        foreach ($_SESSION['margot_websocket_grants'] ?? [] as $grant) {
            if (is_array($grant) && ($grant['member_id'] ?? '') === $membroId) {
                $cms->getToken()->delete((string) ($grant['token'] ?? ''));
            }
        }
    } catch (Throwable $error) {
        // Não afirmar que terminou a sessão enquanto a credencial nativa continua válida.
        error_log('[logout] Falha ao revogar a autorização desta sessão: ' . get_class($error));
        json_response(['success' => false, 'message' => 'Não foi possível terminar a sessão. Tenta novamente.'], 503);
    }
}
try {
    $cookie->delete();
} catch (Throwable $error) {
    error_log('[logout] Falha ao revogar sessão persistente: ' . $error->getMessage());
}
$session->delete();
redirect(DOC_ROOT . 'login/', [], 303);