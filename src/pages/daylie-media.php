<?php
declare(strict_types=1);

require_login($session);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
$row = (new App\CMS\Daylie($cms->getDatabase()))->find((int) $id);
if (!$row || !$cms->getProfileAccess()->canViewDaylies((string) $session->id, $row['membro_id'])) {
    http_response_code(404);
    exit;
}
$path = App\CMS\Daylie::folder() . basename($row['ficheiro']);
if (!is_file($path)) {
    http_response_code(404);
    exit;
}
// A autorização e a validade são verificadas em cada pedido, incluindo os segmentos de vídeo.
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
$size = filesize($path);
$start = 0;
$end = $size - 1;
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: ' . $row['mime']);
header('Accept-Ranges: bytes');
$range = $_SERVER['HTTP_RANGE'] ?? '';
if ($range !== '') {
    if (!preg_match('/^bytes=(\d*)-(\d*)$/D', $range, $parts) || ($parts[1] === '' && $parts[2] === '')) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    if ($parts[1] === '') {
        $start = max(0, $size - (int) $parts[2]);
    } else {
        $start = (int) $parts[1];
        $end = $parts[2] === '' ? $end : min($end, (int) $parts[2]);
    }
    if ($start > $end || $start >= $size) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
}
header('Content-Length: ' . ($end - $start + 1));
if ($method === 'HEAD') exit;
$handle = fopen($path, 'rb');
fseek($handle, $start);
$remaining = $end - $start + 1;
while ($remaining > 0 && !feof($handle) && !connection_aborted()) {
    $chunk = fread($handle, min(65536, $remaining));
    if ($chunk === false || $chunk === '') break;
    echo $chunk;
    $remaining -= strlen($chunk);
}
fclose($handle);
exit;