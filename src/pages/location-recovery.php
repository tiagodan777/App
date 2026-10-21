<?php
declare(strict_types=1);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false], 405);
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$authenticated = false;
$diagnosticId = 'unavailable';
$diagnosticAction = 'unknown';

$trace = static function (string $outcome) use (
    &$authenticated,
    &$diagnosticId,
    &$diagnosticAction
): void {
    if (!$authenticated) {
        return;
    }

    error_log(
        '[LOCATION RECOVERY HTTP] id=' . $diagnosticId
        . ' action=' . $diagnosticAction
        . ' outcome=' . $outcome
    );
};

try {
    $raw = file_get_contents('php://input', false, null, 0, 8193);

    if ($raw === false || strlen($raw) > 8192) {
        throw new InvalidArgumentException();
    }

    $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);

    if (!is_array($data)) {
        throw new InvalidArgumentException();
    }

    $token = '';

    if (preg_match(
        '/^Bearer\s+([a-f0-9]{64})$/iD',
        authorization_header(),
        $match
    )) {
        $token = strtolower($match[1]);
    } elseif (
        is_string($data['token'] ?? null)
        && preg_match('/^[a-f0-9]{64}$/D', $data['token'])
    ) {
        $token = $data['token'];
    }

    unset($data['token']);

    $member = $token === ''
        ? null
        : $cms->getToken()->getMemberId($token, 'background_location');

    if (!$member) {
        json_response(['success' => false], 401);
    }

    $authenticated = true;

    $requestId = $data['request_id'] ?? null;

    if (
        is_string($requestId)
        && preg_match('/^[a-f0-9]{32}$/iD', $requestId)
    ) {
        $diagnosticId = $requestId;
    }

    $action = $data['action'] ?? '';

    if (
        is_string($action)
        && in_array($action, ['register', 'check', 'upload'], true)
    ) {
        $diagnosticAction = $action;
    }

    $recovery = new App\CMS\LocationRecovery($cms->getDatabase());

    if ($action === 'register') {
        $version = $data['recovery_version'] ?? 1;

        if (!is_int($version) || !in_array($version, [1, 2], true)) {
            throw new InvalidArgumentException();
        }

        $result = $recovery->register(
            (string) $member,
            $token,
            (string) ($data['apns_token'] ?? ''),
            (string) ($data['environment'] ?? ''),
            $version
        );

        $trace('registered');

        json_response(['success' => true] + $result);
    }

    if ($action === 'check') {
        $capture = $recovery->shouldCapture(
            (string) $member,
            $token,
            $data
        );

        $trace($capture ? 'capture_allowed' : 'capture_declined');

        json_response([
            'success' => true,
            'capture' => $capture
        ]);
    }

    if ($action !== 'upload') {
        throw new InvalidArgumentException();
    }

    $nearby = $cms->getNearbyPresenceNotification();
    $before = $nearby->locationSnapshot((string) $member);

    $accepted = $recovery->upload(
        (string) $member,
        $token,
        $data
    );

    $trace($accepted ? 'upload_accepted' : 'upload_declined');

    if ($accepted) {
        try {
            // A extensão não altera foreground/background nem a visibilidade.
            $nearby->processLocationChange(
                (string) $member,
                $before,
                $nearby->locationSnapshot((string) $member)
            );
        } catch (Throwable $error) {
            error_log('[location-recovery-nearby] ' . get_class($error));
        }
    }

    json_response([
        'success' => true,
        'accepted' => $accepted
    ]);
} catch (InvalidArgumentException | JsonException $error) {
    $trace('invalid_request');

    json_response([
        'success' => false,
        'message' => 'Pedido inválido.'
    ], 400);
} catch (Throwable $error) {
    $trace('service_error');
    error_log('[location-recovery] ' . get_class($error));

    json_response(['success' => false], 503);
}