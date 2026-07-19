<?php

$data = [];

require_login($session);

$membro = $cms->getMember()->get($id);

$idade = calcularIdade($membro['nascimento']);

var_dump($membro['gostos']);

$data['membro'] = $membro;
$data['primerio_gosto'] = $membro['gostos'][0];
$data['idade'] = $idade;
$data['id'] = $id;

echo $twig->render('profile.html',$data);