<?php

declare(strict_types=1);

$modoEdicao = (($_GET['editar'] ?? '') === '1') && trim((string) ($session->id ?? '')) !== '';

echo $twig->render('create-account-campos.html', [
    'modo_edicao' => $modoEdicao,
    'registration_closed' => !$modoEdicao && REGISTRATION_MODE === 'closed',
    'ano_atual' => (int) date('Y'),
    'ano_maximo' => (int) date('Y') - 18
]);
