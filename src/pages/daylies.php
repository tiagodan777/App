<?php
declare(strict_types=1);

require_login($session);
$viewer = (string) $session->id;
$target = trim((string) ($id ?: $viewer));
$daylies = new App\CMS\Daylie($cms->getDatabase());
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    if ($method === 'GET') {
        if (!$cms->getProfileAccess()->canViewDaylies($viewer, $target)) {
            json_response(['success' => false, 'message' => 'Perfil indisponível.'], 404);
        }
        json_response(['success' => true, 'daylies' => $daylies->list($target), 'owner' => $target === $viewer]);
    }
    if ($method === 'POST') {
        if ($target !== $viewer) json_response(['success' => false], 403);
        $created = $daylies->publish($viewer, $_FILES['media'] ?? [], trim((string) ($_POST['caption'] ?? '')));
        json_response(['success' => true, 'id' => $created], 201);
    }
    if ($method === 'DELETE') {
        $daylies->delete((int) $id, $viewer);
        json_response(['success' => true]);
    }
} catch (InvalidArgumentException $error) {
    json_response(['success' => false, 'message' => $error->getMessage()], 400);
}
header('Allow: GET, POST, DELETE');
json_response(['success' => false], 405);