<?php

declare(strict_types=1);

use App\CMS\WebSocketTicket;
use App\Security\RateLimiter;

function responderWebSocketTicket(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_THROW_ON_ERROR
    );
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    responderWebSocketTicket([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

$membroId = trim((string) ($session->id ?? ''));

if ($membroId === '' || $membroId === '0') {
    responderWebSocketTicket([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

require_csrf();

if (!RateLimiter::allow('websocket_ticket', $membroId, 10, 60)) {
    header('Retry-After: 60');
    responderWebSocketTicket([
        'success' => false,
        'message' => 'Foram pedidos demasiados bilhetes. Tenta novamente dentro de instantes.'
    ], 429);
}

try {
    $ticket = (new WebSocketTicket($db))->issue($membroId);

    responderWebSocketTicket([
        'success' => true,
        'ticket' => $ticket,
        'expires_in' => WebSocketTicket::TTL_SEGUNDOS
    ], 201);
} catch (Throwable $erro) {
    error_log('[websocket-ticket] ' . $erro->getMessage());

    responderWebSocketTicket([
        'success' => false,
        'message' => 'Não foi possível preparar a ligação segura.'
    ], 500);
}
