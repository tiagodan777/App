<?php
declare(strict_types=1);

$data = [];

require_login($session);

$data['membro_id'] = $session->id;

$data['halloween_enabled'] = (
    new App\CMS\HalloweenWardrobe()
)->allowed((string) $session->id);

echo $twig->render('index.html', $data);