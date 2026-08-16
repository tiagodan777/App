<?php

declare(strict_types=1);

use App\CMS\Member;
use App\Validate\Validate;

$modoEdicao = (($_GET['editar'] ?? '') === '1') && trim((string) ($session->id ?? '')) !== '';

echo $twig->render('create-account-campos.html', [
    'modo_edicao' => $modoEdicao,
    'ano_atual' => (int) date('Y'),
    'idade_minima' =>
        Validate::MINIMUM_AGE,
    'versao_termos' =>
        Member::TERMS_VERSION,
    'versao_privacidade' =>
        Member::PRIVACY_VERSION
]);