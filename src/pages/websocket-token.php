<?php

declare(strict_types=1);

function responderJsonWebSocketToken(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responderJsonWebSocketToken(['success' => false, 'message' => 'Método não permitido.'], 405);
}

if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
    responderJsonWebSocketToken(['success' => false, 'message' => 'Pedido inválido.'], 403);
}

$membroId = trim((string) ($session->id ?? ''));

if ($membroId === '') {
    responderJsonWebSocketToken(['success' => false, 'message' => 'A sessão terminou.'], 401);
}

try {
    $membroExiste = (bool) $db->runSQL(
        'SELECT 1 FROM membros WHERE id = :id LIMIT 1',
        ['id' => $membroId]
    )->fetchColumn();

    if (!$membroExiste) {
        $session->delete();
        responderJsonWebSocketToken(['success' => false, 'message' => 'A sessão terminou.'], 401);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    $db->runSQL('DELETE FROM token WHERE proposito = :proposito AND validade <= UTC_TIMESTAMP()', ['proposito' => 'websocket']);

    $token = $cms->getToken()->create($membroId, 'websocket');

    responderJsonWebSocketToken([
        'success' => true,
        'token' => $token,
        'expires_in' => 60
    ]);
} catch (Throwable $erro) {
    error_log('[websocket-token] ' . $erro->getMessage());

    responderJsonWebSocketToken([
        'success' => false,
        'message' => 'Não foi possível preparar a ligação.'
    ], 500);
}