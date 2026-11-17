<?php
declare(strict_types=1);

// Static resources only: no production connection or user account required.
require dirname(__DIR__) . '/vendor/autoload.php';
$twig = new Twig\Environment(new App\CMS\LanguageTemplateLoader(
    new Twig\Loader\FilesystemLoader(dirname(__DIR__) . '/templates')
));
$context = [
    'doc_root' => '/', 'session' => ['id' => 1], 'membro_id' => 1,
    'outro' => ['id' => 2, 'nome' => 'Pessoa de teste', 'foto_url' => '/avatar.svg', 'perfil_url' => '/profile/2'],
    'mensagens' => [], 'conversas' => [], 'csrf_token' => 'test-only',
];
$chat = $twig->render('chat.html', $context);
$list = $twig->render('messages.html', $context);
if (!preg_match('~<template id="margot-chat-resources">(.*?)</template>~s', $list, $match)) {
    throw new RuntimeException('Missing inert chat preload manifest');
}
$manifest = $match[1];
preg_match_all('~(?:src|href)="([^" ]+\.(?:js|css)[^"]*)"~', $manifest, $matches);
if (count($matches[1]) !== 10) throw new RuntimeException('Expected 8 scripts and 2 page styles');
$activeChat = preg_replace('~<template\b.*?</template>~s', '', $chat);
foreach ($matches[1] as $url) {
    if (!str_contains($activeChat, '"' . $url . '"')) {
        throw new RuntimeException('Preload differs from active chat URL: ' . $url);
    }
    if (!str_contains($url, 'margot_release=')) {
        throw new RuntimeException('Unversioned resource: ' . $url);
    }
}
echo "PASS: 10 preload URLs exactly match the rendered chat, including release versions.\n";
