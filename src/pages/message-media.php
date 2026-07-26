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

$messageId = filter_var($id, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1]
]);

if ($messageId === false) {
    http_response_code(404);
    exit;
}

$message = $db->runSQL(
    "SELECT msg.id, msg.emissor_id, msg.destinatario_id,
            msg.ficheiro_nome, msg.ficheiro_mime, msg.ficheiro_tamanho
     FROM mensagens_chat msg
     INNER JOIN membros emissor
        ON emissor.id = msg.emissor_id
        AND emissor.estado = 'ativo'
     INNER JOIN membros destinatario
        ON destinatario.id = msg.destinatario_id
        AND destinatario.estado = 'ativo'
     WHERE msg.id = :id
     LIMIT 1",
    ['id' => $messageId]
)->fetch();

$memberId = (string) $session->id;

if (
    !$message ||
    (
        !hash_equals($memberId, (string) $message['emissor_id']) &&
        !hash_equals($memberId, (string) $message['destinatario_id'])
    )
) {
    http_response_code(404);
    exit;
}

$otherId = hash_equals($memberId, (string) $message['emissor_id'])
    ? (string) $message['destinatario_id']
    : (string) $message['emissor_id'];
$policy = new InteractionPolicy($db, APP_KEY);

if ($policy->areBlocked($memberId, $otherId)) {
    http_response_code(404);
    exit;
}

$filename = basename((string) ($message['ficheiro_nome'] ?? ''));
$path = rtrim(MESSAGE_MEDIA_DIR, '/') . '/' . $filename;

if ($filename === '' || !is_file($path) || is_link($path)) {
    http_response_code(404);
    exit;
}

$mime = (string) ($message['ficheiro_mime'] ?? 'application/octet-stream');
$finfo = new finfo(FILEINFO_MIME_TYPE);
$detectedMime = $finfo->file($path);

if ($mime !== 'image/webp' || $detectedMime !== 'image/webp') {
    http_response_code(415);
    exit;
}

$length = filesize($path);

if ($length === false || $length < 1) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/webp');
header('Content-Length: ' . (string) $length);
header('Content-Disposition: inline; filename="margot-' . (int) $messageId . '.webp"');
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
