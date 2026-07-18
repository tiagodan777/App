<?php

$data = [];

require_login($session);

$membro = $cms->getMember()->get($id);

var_dump($membro);

$data['membro'] = $membro;

echo $twig->render('profile.html',$data);