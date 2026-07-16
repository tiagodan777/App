<?php
$data = [];

require_login($session);

$data['membro_id'] = $session->id;

echo $twig->render('messages.html', $data);