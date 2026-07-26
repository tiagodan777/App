<?php

declare(strict_types=1);

require_moderator($db, $session);

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}

$reportId = trim((string) ($id ?? ''));

if (
    preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $reportId
    ) !== 1
) {
    http_response_code(404);
    exit;
}

$evidence = $db->runSQL(
    'SELECT evidencia_media_nome, evidencia_media_mime,
            evidencia_media_tamanho, evidencia_media_sha256
     FROM denuncias
     WHERE id = :id
     AND evidencia_media_nome IS NOT NULL
     LIMIT 1',
    ['id' => $reportId]
)->fetch();
$filename = basename(trim((string) ($evidence['evidencia_media_nome'] ?? '')));
$path = rtrim(REPORT_EVIDENCE_DIR, '/') . '/' . $filename;

if (
    !$evidence ||
    $filename === '' ||
    !is_file($path) ||
    is_link($path) ||
    (string) ($evidence['evidencia_media_mime'] ?? '') !== 'image/webp' ||
    (new finfo(FILEINFO_MIME_TYPE))->file($path) !== 'image/webp'
) {
    http_response_code(404);
    exit;
}

$length = filesize($path);
$expectedLength = (int) ($evidence['evidencia_media_tamanho'] ?? 0);
$expectedHash = strtolower(trim((string) (
    $evidence['evidencia_media_sha256'] ?? ''
)));
$actualHash = hash_file('sha256', $path);

if (
    $length === false ||
    $length < 1 ||
    $expectedLength < 1 ||
    $length !== $expectedLength ||
    preg_match('/\A[0-9a-f]{64}\z/D', $expectedHash) !== 1 ||
    !is_string($actualHash) ||
    !hash_equals($expectedHash, $actualHash)
) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/webp');
header('Content-Length: ' . (string) $length);
header('Content-Disposition: inline; filename="margot-evidencia.webp"');
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
