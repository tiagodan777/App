<?php
declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

$twig = new Twig\Environment(
    new Twig\Loader\FilesystemLoader(
        dirname(__DIR__) . '/templates'
    )
);

$settings = require dirname(__DIR__) . '/config/halloween.php';
$checks = 0;
$fixtureDirectory = getenv('MARGOT_HALLOWEEN_FIXTURES');

foreach (['profile', 'index'] as $page) {
    foreach ([false, true] as $enabled) {
        $html = $twig->render($page . '.html', [
            'doc_root' => '/',
            'session' => (object) [
                'id' => $settings['testers'][0],
            ],
            'halloween_enabled' => $enabled,
            'csrf_token' => 'test-only',
            'membro' => [
                'id' => $settings['testers'][0],
                'nome' => 'Conta de teste',
                'fotos' => [],
                'gostos' => [],
                'descricao' => 'Pré-visualização local',
            ],
            'idade' => 25,
            'perfil_proprio' => true,
            'total_slides' => 1,
        ]);

        foreach (
            ['today-halloween.js', 'today-halloween.css'] as $asset
        ) {
            if (str_contains($html, $asset) !== $enabled) {
                throw new RuntimeException(
                    'Unexpected gating: ' . $page . ' ' . $asset
                );
            }

            $checks++;
        }

        if (!str_contains($html, 'js/today.js')) {
            throw new RuntimeException('Normal wardrobe missing');
        }

        $checks++;

        if (
            $enabled
            && strpos($html, 'js/today-halloween.js')
                > strpos($html, 'js/today.js')
        ) {
            throw new RuntimeException('Wrong renderer order');
        }

        $checks++;

        // Exportação opcional para preparar uma pré-visualização local.
        // A execução normal dos testes não escreve ficheiros.
        if (
            is_string($fixtureDirectory)
            && $fixtureDirectory !== ''
        ) {
            if (!is_dir($fixtureDirectory)) {
                throw new RuntimeException(
                    'Fixture directory does not exist'
                );
            }

            $path = $fixtureDirectory
                . '/'
                . $page
                . ($enabled ? '-pilot' : '-normal')
                . '.fixture.html';

            if (file_put_contents($path, $html) === false) {
                throw new RuntimeException(
                    'Could not export preview fixture'
                );
            }
        }
    }
}

echo "PASS: $checks template checks; HTML fixtures rendered with Twig.\n";