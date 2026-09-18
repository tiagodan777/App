<?php
// Fixture HTML construída a partir do template real, sem base de dados nem serviços externos.

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';

$loader = new Twig\Loader\ChainLoader([
    new Twig\Loader\ArrayLoader([
        'layout.html' => '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="/estilos/style.css"><link rel="stylesheet" href="/estilos/messaging-integration.css">{% block styles %}{% endblock %}</head><body>{% block content %}{% endblock %}</body></html>'
    ]),
    new Twig\Loader\FilesystemLoader($root . '/templates')
]);

$twig = new Twig\Environment($loader);
$messages = [];

for ($i = 1; $i <= 25; $i++) {
    $messages[] = [
        'id' => $i,
        'emissor_id' => $i % 2 ? 'other' : 'me',
        'minha' => $i % 2 === 0,
        'texto' => 'Mensagem de teste ' . $i,
        'tipo' => 'texto',
        'criada_em' => '2026-09-17 15:00:00',
        'lida' => true,
        'reactions' => [],
        'reply' => null
    ];
}

echo $twig->render('chat.html', [
    'doc_root' => '/',
    'membro_id' => 'me',
    'outro' => [
        'id' => 'other',
        'nome' => 'Pessoa Teste',
        'foto_url' => '/avatar.png',
        'perfil_url' => '/profile/other'
    ],
    'mensagens' => $messages
]);