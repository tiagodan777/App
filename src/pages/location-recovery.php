<?php
declare(strict_types=1);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false], 405);
}
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
try {
    $raw = file_get_contents('php://input', false, null, 0, 8193);
    if ($raw === false || strlen($raw) > 8192) throw new InvalidArgumentException();
    $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($data)) throw new InvalidArgumentException();
    $token = '';
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/iD', authorization_header(), $match)) {
        $token = strtolower($match[1]);
    } elseif (is_string($data['token'] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $data['token'])) {
        $token = $data['token'];
    }
    unset($data['token']);
    $member = $token === '' ? null : $cms->getToken()->getMemberId($token, 'background_location');
    if (!$member) json_response(['success' => false], 401);
    $recovery = new App\CMS\LocationRecovery($cms->getDatabase());
    $action = $data['action'] ?? '';
    if ($action === 'register') {
        $result = $recovery->register((string) $member, $token,
            (string) ($data['apns_token'] ?? ''), (string) ($data['environment'] ?? ''));
        json_response(['success' => true] + $result);
    }
    if ($action === 'check') {
        json_response(['success' => true, 'capture' => $recovery->shouldCapture((string) $member, $token, $data)]);
    }
    if ($action !== 'upload') throw new InvalidArgumentException();
    $nearby = $cms->getNearbyPresenceNotification();
    $before = $nearby->locationSnapshot((string) $member);
    $accepted = $recovery->upload((string) $member, $token, $data);
    if ($accepted) {
        try {
            // A extensão não altera o estado foreground/background nem a visibilidade.
            $nearby->processLocationChange((string) $member, $before, $nearby->locationSnapshot((string) $member));
        } catch (Throwable $error) {
            error_log('[location-recovery-nearby] ' . get_class($error));
        }
    }
    json_response(['success' => true, 'accepted' => $accepted]);
} catch (InvalidArgumentException | JsonException $error) {
    json_response(['success' => false, 'message' => 'Pedido inválido.'], 400);
} catch (Throwable $error) {
    error_log('[location-recovery] ' . get_class($error));
    json_response(['success' => false], 503);
}