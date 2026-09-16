<?php
declare(strict_types=1);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
}
if (strcasecmp((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''), 'XMLHttpRequest') !== 0) {
    json_response(['success' => false, 'message' => 'Pedido inválido.'], 403);
}
$membroId = trim((string) ($session->id ?? ''));
if ($membroId === '') {
    json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
}
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
$duracao = 2592000;
try {
    $token = $cms->getToken()->create($membroId, 'background_location', $duracao);
    json_response(['success' => true, 'token' => $token, 'expires_in' => $duracao]);
} catch (Throwable $erro) {
    error_log('[background-location-token] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível preparar a localização em segundo plano.'], 500);
}
