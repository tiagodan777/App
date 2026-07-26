<?php

declare(strict_types=1);

use App\Security\InteractionPolicy;

require_login($session);

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}

$photoId = trim((string) ($id ?? ''));
$validPhotoId = preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    $photoId
) === 1;

if (!$validPhotoId) {
    http_response_code(404);
    exit;
}

$photo = $db->runSQL(
    "SELECT fp.id, fp.membro_id, fp.nome_arquivo
     FROM fotos_perfil fp
     INNER JOIN membros m ON m.id = fp.membro_id
     WHERE fp.id = :id
     AND m.estado = 'ativo'
     AND fp.status = 'completo'
     LIMIT 1",
    ['id' => $photoId]
)->fetch();

if (!$photo) {
    http_response_code(404);
    exit;
}

$viewerId = trim((string) ($session->id ?? ''));
$ownerId = trim((string) ($photo['membro_id'] ?? ''));
$proximityToken = trim((string) ($_GET['proximity_token'] ?? ''));
$isOwner = $viewerId !== '' && $ownerId !== '' && hash_equals($viewerId, $ownerId);

if (!$isOwner) {
    $policy = new InteractionPolicy($db, APP_KEY);

    if (!$policy->canInteract($viewerId, $ownerId, $proximityToken)) {
        http_response_code(404);
        exit;
    }
}

$size = strtolower(trim((string) ($_GET['size'] ?? 'thumb')));

if (!in_array($size, ['thumb', 'original'], true)) {
    http_response_code(404);
    exit;
}

$filename = basename(trim((string) ($photo['nome_arquivo'] ?? '')));
$directory = $size === 'original'
    ? PROFILE_PHOTO_ORIGINAL_DIR
    : PROFILE_PHOTO_THUMB_DIR;
$path = rtrim($directory, '/') . '/' . $filename;

if (
    $filename === '' ||
    $filename === '.' ||
    $filename === '..' ||
    !is_file($path) ||
    is_link($path)
) {
    http_response_code(404);
    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($path);
$allowedMimeTypes = [
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif'
];

if (!is_string($mime) || !in_array($mime, $allowedMimeTypes, true)) {
    http_response_code(415);
    exit;
}

$length = filesize($path);

if ($length === false || $length < 1) {
    http_response_code(404);
    exit;
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . (string) $length);
header('Content-Disposition: inline; filename="margot-profile-' . $photoId . '"');
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
header('Vary: Cookie');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, noimageindex, noarchive');
header('X-Content-Type-Options: nosniff');
header('Cross-Origin-Resource-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; sandbox");

if ($method === 'HEAD') exit;

readfile($path);
exit;
