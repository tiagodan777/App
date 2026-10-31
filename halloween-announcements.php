<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/src/bootstrap.php';
require_once __DIR__
    . '/src/classes/CMS/HalloweenAnnouncements.php';

$send = in_array('--send', $argv, true);
$provider = $cms->getPushProvider();

if ($send && !$provider->isEnabled()) {
    fwrite(
        STDERR,
        "Push desativado; nenhum envio.\n"
    );

    exit(1);
}

$job = new App\CMS\HalloweenAnnouncements(
    $cms->getDatabase(),
    require __DIR__ . '/config/halloween.php'
);

try {
    $result = $job->run(
        static fn(array $payload): array =>
            $provider->send($payload),
        !$send
    );

    echo json_encode(
        $result,
        JSON_UNESCAPED_UNICODE
    ), PHP_EOL;

    exit($result['review'] > 0 ? 1 : 0);
} catch (Throwable $e) {
    fwrite(
        STDERR,
        'Halloween: falha '
        . get_class($e)
        . ' código '
        . $e->getCode()
        . PHP_EOL
    );

    exit(1);
}