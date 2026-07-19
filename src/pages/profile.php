<?php

$data = [];

require_login($session);

$membro = $cms->getMember()->get($id);

$idade = calcularIdade($membro['nascimento']);



$data['membro'] = $membro;
$data['primerio_gosto'] = $membro['gostos'][0];
$data['idade'] = $idade;
$data['id'] = $id;

echo $twig->render('profile.html',$data);