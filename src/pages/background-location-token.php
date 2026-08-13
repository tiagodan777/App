<?php

declare(strict_types=1);

function responderJsonBackgroundLocationToken(
    array $dados,
    int $status = 200
): never {
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

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');

    responderJsonBackgroundLocationToken([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

if (
    strcasecmp(
        (string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''),
        'XMLHttpRequest'
    ) !== 0
) {
    responderJsonBackgroundLocationToken([
        'success' => false,
        'message' => 'Pedido inválido.'
    ], 403);
}

$membroId = trim((string) ($session->id ?? ''));

if ($membroId === '') {
    responderJsonBackgroundLocationToken([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$duracao = 2592000;

try {
    $token = $cms->getToken()->create(
        $membroId,
        'background_location',
        $duracao
    );

    responderJsonBackgroundLocationToken([
        'success' => true,
        'token' => $token,
        'expires_in' => $duracao
    ]);
} catch (Throwable $erro) {
    error_log(
        '[background-location-token] ' .
        $erro->getMessage()
    );

    responderJsonBackgroundLocationToken([
        'success' => false,
        'message' =>
            'Não foi possível preparar a localização em segundo plano.'
    ], 500);
}