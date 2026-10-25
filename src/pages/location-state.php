<?php
declare(strict_types=1);

// A sessão e o CSRF são validados antes deste ficheiro por request-guards.php.
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false], 405);
}
$member = trim((string) ($session->id ?? ''));
if ($member === '') json_response(['success' => false, 'reason' => 'session_expired'], 401);
try {
    $data = json_decode((string) file_get_contents('php://input'), true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    json_response(['success' => false, 'reason' => 'invalid_request'], 400);
}
if (!is_array($data) || !in_array($data['action'] ?? '', ['read', 'set'], true)) {
    json_response(['success' => false, 'reason' => 'invalid_request'], 400);
}
if (!is_string($data['member_id'] ?? null) || $data['member_id'] !== $member) {
    json_response(['success' => false, 'reason' => 'identity_changed'], 409);
}
$write = $data['action'] === 'set';
if ($write && (!is_bool($data['active'] ?? null) || !is_bool($data['visible'] ?? null)
    || !is_int($data['expected_revision'] ?? null) || $data['expected_revision'] < 0
    || $data['expected_revision'] >= 9007199254740991)) {
    json_response(['success' => false, 'reason' => 'invalid_state'], 400);
}
try {
    $location = $cms->getLocation();
    if (!$write) {
        json_response(['success' => true, 'member_id' => $member, 'state' => $location->state($member)]);
    }
    $nearby = $cms->getNearbyPresenceNotification();
    $before = null;
    try { $before = $nearby->locationSnapshot($member); }
    catch (Throwable $error) { error_log('[location-state-snapshot] ' . get_class($error)); }
    $accepted = $location->setState($member, $data['expected_revision'], $data['active'], $data['visible']);
    $state = $location->state($member);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    if (!$accepted) {
        json_response(['success' => false, 'reason' => 'state_conflict', 'member_id' => $member,
            'state' => $state], 409);
    }
    try { $nearby->processLocationChange($member, $before, $nearby->locationSnapshot($member)); }
    catch (Throwable $error) { error_log('[location-state-nearby] ' . get_class($error)); }
    json_response(['success' => true, 'member_id' => $member, 'state' => $state]);
} catch (Throwable $error) {
    error_log('[location-state] ' . get_class($error));
    json_response(['success' => false, 'reason' => 'state_unavailable'], 503);
}