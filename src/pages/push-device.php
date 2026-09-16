<?php
declare(strict_types=1);

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
}
if (strcasecmp((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''), 'XMLHttpRequest') !== 0) {
    json_response(['success' => false, 'message' => 'Pedido inválido.'], 403);
}
$memberId = trim((string) ($session->id ?? ''));
if ($memberId === '') {
    json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
}
$rawBody = file_get_contents('php://input');
try {
    $data = json_decode(is_string($rawBody) ? $rawBody : '', true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    json_response(['success' => false, 'message' => 'Dados inválidos.'], 400);
}
if (!is_array($data)) {
    json_response(['success' => false, 'message' => 'Dados inválidos.'], 400);
}
$action = strtolower(trim((string) ($data['action'] ?? 'register')));
$installationId = trim((string) ($data['installation_id'] ?? ''));
$sessionIdentifier = session_status() === PHP_SESSION_ACTIVE ? session_id() : '';
if ($sessionIdentifier === '') {
    json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
}
$sessionHash = hash('sha256', $sessionIdentifier);
try {
    $push = $cms->getPushNotification();
    if ($action === 'register') {
        $platform = strtolower(trim((string) ($data['platform'] ?? '')));
        $environment =
            $platform === 'ios' ? (string) ($push_config['apns']['environment'] ?? 'production') : 'production';
        $push->registerDevice(
            $memberId,
            $platform,
            (string) ($data['token'] ?? ''),
            $installationId,
            $sessionHash,
            $environment,
            isset($data['app_version']) ? (string) $data['app_version'] : null
        );
        json_response(['success' => true]);
    }
    if ($action === 'unregister') {
        $push->unregisterDevice($memberId, $installationId, isset($data['token']) ? (string) $data['token'] : null);
        json_response(['success' => true]);
    }
    json_response(['success' => false, 'message' => 'Ação inválida.'], 422);
} catch (InvalidArgumentException $error) {
    json_response(['success' => false, 'message' => $error->getMessage()], 422);
} catch (Throwable $error) {
    error_log('[push-device] ' . $error->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível guardar este dispositivo.'], 500);
}
