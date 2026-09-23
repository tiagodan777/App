<?php
declare(strict_types=1);
require_login($session);
$reminders = new App\CMS\ActivityReminders($cms->getDatabase(), $cms->getPushNotification());
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') json_response(['success' => true, 'preferences' => $reminders->preferences((string) $session->id)]);
if ($method === 'POST') {
    try {
        $values = json_decode(file_get_contents('php://input'), true, 16, JSON_THROW_ON_ERROR);
        if (!is_array($values)) throw new InvalidArgumentException('Pedido inválido.');
        $preferences = $reminders->save((string) $session->id, $values);
        json_response(['success' => true, 'preferences' => $preferences]);
    } catch (JsonException | InvalidArgumentException $error) {
        json_response(['success' => false, 'message' => 'Não foi possível guardar as preferências.'], 400);
    }
}
header('Allow: GET, POST');
json_response(['success' => false], 405);