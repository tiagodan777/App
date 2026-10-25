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
$duracao = 2592000;
$margemRenovacao = 86400;
try {
    // O bloqueio da sessão serializa pedidos simultâneos do mesmo cliente.
    // Reutilizar a concessão evita acumular tokens ao repetir o pedido.
    $guardado = $_SESSION['margot_background_grant'] ?? null;
    $token = is_array($guardado) ? (string) ($guardado['token'] ?? '') : '';
    $validade = is_array($guardado) ? (int) ($guardado['expires_at'] ?? 0) : 0;
    $group = is_array($guardado) && ($guardado['member_id'] ?? '') === $membroId
        ? (string) ($guardado['session_hash'] ?? '') : '';
    if (!preg_match('/^[a-f0-9]{64}$/D', $group)) $group = bin2hex(random_bytes(32));
    if ($token !== '' && ($guardado['member_id'] ?? '') === $membroId) {
        $cms->getToken()->bindBackgroundSession($token, $membroId, $group);
    }
    if (
        $token === '' || $validade <= time() + $margemRenovacao
        || ($guardado['member_id'] ?? '') !== $membroId
        || $cms->getToken()->getMemberId($token, 'background_location') !== $membroId
    ) {
        $token = $cms->getToken()->create($membroId, 'background_location', $duracao, $group);
        $validade = time() + $duracao;
    }
    $_SESSION['margot_background_grant'] = [
        'member_id' => $membroId, 'token' => $token, 'expires_at' => $validade, 'session_hash' => $group
    ];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    json_response(['success' => true, 'token' => $token, 'member_id' => $membroId,
        'expires_in' => max(0, $validade - time())]);
} catch (Throwable $erro) {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    error_log('[background-location-token] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível preparar a localização em segundo plano.'], 500);
}