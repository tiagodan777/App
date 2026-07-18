<?php

$data = [];

require_login($session);

$membro = $cms->getMember()->get($id);

$idade = calcularIdade($membro['nascimento']);

$data['membro'] = $membro;
$data['idade'] = $idade;
$data['id'] = $id;

echo $twig->render('profile.html',$data);