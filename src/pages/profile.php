<?php

$data = [];

require_login($session);

$membro = $cms->getMember()->get($id);

$idade = calcularIdade($membro['nascimento']);

echo "<pre>";
var_dump($membro);

$data['membro'] = $membro;
$data['idade'] = $idade;

echo $twig->render('profile.html',$data);