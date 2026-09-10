<?php

declare(strict_types=1);

$data = [];

require_login($session);

$data['membro_id'] = $session->id;

echo $twig->render(
    'index.html',
    $data
);