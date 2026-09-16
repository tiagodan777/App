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
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    $cms->getToken()->deleteExpired('websocket');
    $token = $cms->getToken()->create($membroId, 'websocket');
    json_response(['success' => true, 'token' => $token, 'expires_in' => 60]);
} catch (Throwable $erro) {
    error_log('[websocket-token] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível preparar a ligação.'], 500);
}
