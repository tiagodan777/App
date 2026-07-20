<?php
$data = [];

require_login($session);

$data['membro_id'] = $session->id;

echo $twig->render('settings.html',$data);