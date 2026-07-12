<?php

$data = [];

require_login($session);

$data['membro_id'] = $session->id;

echo '<pre>';
var_dump([
    'session_id' => session_id(),
    'session' => $_SESSION,
]);
echo '</pre>';

echo $twig->render('index.html', $data);