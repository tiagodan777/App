<?php
declare(strict_types=1);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
}
if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
    json_response(['success' => false, 'message' => 'Pedido inválido.'], 403);
}
$membroId = trim((string) ($session->id ?? ''));
if ($membroId === '') {
    json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
}
try {
    $membroExiste = (bool) $cms->getMember()->exists($membroId);
    if (!$membroExiste) {
        $session->delete();
        json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
    }
    $cms->getToken()->deleteExpired('websocket');
    $tokens = $cms->getToken();
    $sessionGrant = $_SESSION['margot_websocket_session'] ?? null;
    $sessionToken = is_array($sessionGrant) ? (string) ($sessionGrant['token'] ?? '') : '';
    if ($sessionToken === '' || ($sessionGrant['member_id'] ?? '') !== $membroId
        || $tokens->getMemberId($sessionToken, 'websocket_session') !== $membroId) {
        $tokens->deleteExpired('websocket_session');
        $sessionToken = $tokens->create($membroId, 'websocket_session');
        $_SESSION['margot_websocket_session'] = ['member_id' => $membroId, 'token' => $sessionToken];
    }
    $token = $tokens->create($membroId, 'websocket', null, \App\CMS\Token::hash($sessionToken));
    $grants = array_values(array_filter($_SESSION['margot_websocket_grants'] ?? [],
        static fn($grant): bool => is_array($grant) && ($grant['expires_at'] ?? 0) > time()));
    $grants[] = ['member_id' => $membroId, 'token' => $token, 'expires_at' => time() + 60];
    $_SESSION['margot_websocket_grants'] = $grants;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    json_response(['success' => true, 'token' => $token, 'expires_in' => 60]);
} catch (Throwable $erro) {
    error_log('[websocket-token] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível preparar a ligação.'], 500);
}