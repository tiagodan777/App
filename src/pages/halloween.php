<?php
declare(strict_types=1);

header('Cache-Control: private, no-store, max-age=0');
header('Vary: Cookie');
header('X-Content-Type-Options: nosniff');

$viewerId = trim((string) ($session->id ?? ''));
$wardrobe = new App\CMS\HalloweenWardrobe();

if (!$wardrobe->allowed($viewerId)) {
    json_response(
        ['success' => false, 'message' => 'Coleção indisponível.'],
        404
    );
}

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    header('Allow: GET');

    json_response(
        ['success' => false, 'message' => 'Método não permitido.'],
        405
    );
}

$asset = trim((string) ($id ?? 'catalog'));

if ($asset === 'catalog') {
    json_response([
        'success' => true,
        'catalog' => $wardrobe->clientCatalog(
            $viewerId,
            DOC_ROOT . 'halloween/'
        ),
    ]);
}

$path = $wardrobe->assetPath($viewerId, $asset);

if ($path === null) {
    json_response(
        ['success' => false, 'message' => 'Imagem indisponível.'],
        404
    );
}

// Liberta a sessão antes de enviar a imagem.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

header('Content-Type: image/webp');
header('Content-Length: ' . filesize($path));

readfile($path);
exit;