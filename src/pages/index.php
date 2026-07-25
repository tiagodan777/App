<?php

declare(strict_types=1);

$data = [];

require_login($session);

echo password_hash('Rodrigo1234', PASSWORD_DEFAULT);

$data['membro_id'] = $session->id;

echo $twig->render(
    'index.html',
    $data
);