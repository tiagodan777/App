<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = __DIR__;
$settings = require $root . '/config/halloween.php';
$hunt = $settings['hunt'] ?? [];

if (($hunt['extras_enabled'] ?? false) !== true) {
    echo "Avisos desativados.\n";
    exit;
}

$recipient = (string) ($hunt['winner_email'] ?? '');

if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
    fwrite(
        STDERR,
        "Falta confirmar winner_email em config/halloween.php.\n"
    );
    exit(1);
}

require $root . '/vendor/autoload.php';
require $root . '/src/classes/CMS/HalloweenHuntMail.php';
require $root . '/src/classes/Email/Email.php';

require is_file($root . '/config/config.local.php')
    ? $root . '/config/config.local.php'
    : $root . '/config/config.php';

$email_config['debug'] = 0;
$_COOKIE['margot_language'] = 'pt';

$mail = new App\Email\Email($email_config);

if (($argv[1] ?? '') === '--test-email') {
    $ok = $mail->sendEmail(
        (string) $email_config['admin_email'],
        $recipient,
        'TESTE — aviso Halloween Margot',
        '<p>Teste do envio de avisos de Halloween. '
        . 'Nenhum vencedor foi registado e nenhuma contagem foi alterada.</p>'
    );

    echo $ok
        ? "SMTP aceitou o email de teste. Confirma a receção.\n"
        : "Falha no envio.\n";

    exit($ok ? 0 : 1);
}

if (isset($argv[1])) {
    fwrite(STDERR, "Argumento inválido.\n");
    exit(1);
}

$db = new PDO(
    $dsn,
    $username,
    $password,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

unset($dsn, $username, $password);

$sender = new App\CMS\HalloweenHuntMail($db);

foreach ($hunt['notify_campaigns'] ?? [] as $campaign) {
    $result = $sender->sendOne(
        (string) $campaign,
        $recipient,
        static fn(
            string $to,
            string $subject,
            string $body
        ): bool => $mail->sendEmail(
            (string) $email_config['admin_email'],
            $to,
            $subject,
            $body
        )
    );

    echo '[halloween-mail] ' . $result . "\n";

    if ($result === 'review') {
        exit(1);
    }
}