<?php
declare(strict_types=1);

// A entrada pública partilha a página de downloads com os links de campanha.
// Sessões válidas (incluindo as recuperadas por cookie) continuam na aplicação.
if (trim((string) ($session->id ?? '')) === '') {
    $landingConnection = $db;
    require APP_ROOT . '/public/provisorio/index.php';
    return;
}

$data = [];

require_login($session);

$data['membro_id'] = $session->id;

$data['halloween_enabled'] = (
    new App\CMS\HalloweenWardrobe()
)->allowed((string) $session->id);

echo $twig->render('index.html', $data);