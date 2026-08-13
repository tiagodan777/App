<?php

declare(strict_types=1);

define('APP_ROOT', dirname(__FILE__, 2));

$configFile = APP_ROOT . '/config/config.local.php';

if (!is_file($configFile)) {
    $configFile = APP_ROOT . '/config/config.php';
}

require_once $configFile;
require_once APP_ROOT . '/src/functions.php';
require_once APP_ROOT . '/src/rate-limit.php';
require_once APP_ROOT . '/vendor/autoload.php';

if (DEV === false) {
    set_exception_handler('handle_exception');
    set_error_handler('handle_error');
    register_shutdown_function('handle_shutdown');
}

$envBoolean = static function (string $name, bool $default = false): bool {
    $value = getenv($name);

    if ($value === false || trim($value) === '') {
        return $default;
    }

    return filter_var(
        $value,
        FILTER_VALIDATE_BOOLEAN,
        FILTER_NULL_ON_FAILURE
    ) ?? $default;
};

$pushDefaults = [
    'enabled' => $envBoolean('MARGOT_PUSH_ENABLED'),
    'apns' => [
        'environment' => getenv('MARGOT_APNS_ENVIRONMENT') ?: 'production',
        'team_id' => getenv('MARGOT_APNS_TEAM_ID') ?: '',
        'key_id' => getenv('MARGOT_APNS_KEY_ID') ?: '',
        'private_key_file' => getenv('MARGOT_APNS_PRIVATE_KEY_FILE') ?: '',
        'topic' => getenv('MARGOT_APNS_TOPIC') ?: 'com.margot.app'
    ],
    'fcm' => [
        'service_account_file' => getenv('MARGOT_FCM_SERVICE_ACCOUNT_FILE') ?: '',
        'project_id' => getenv('MARGOT_FCM_PROJECT_ID') ?: ''
    ]
];

$push_config = isset($push_config) && is_array($push_config)
    ? array_replace_recursive($pushDefaults, $push_config)
    : $pushDefaults;

$pushEnvironment = strtolower(trim(
    (string) ($push_config['apns']['environment'] ?? 'production')
));

if (!in_array($pushEnvironment, ['sandbox', 'production'], true)) {
    $pushEnvironment = 'production';
}

$push_config['apns']['environment'] = $pushEnvironment;

$cms = new App\CMS\CMS($dsn, $username, $password, $push_config);
unset($dsn, $username, $password);

$twig_options['debug'] = DEV;
$loader = new Twig\Loader\FilesystemLoader([APP_ROOT . '/templates']);
$twig = new Twig\Environment($loader, $twig_options);
$twig->addGlobal('doc_root', DOC_ROOT);
$twig->addGlobal('push_environment', $pushEnvironment);

$db = $cms->getDatabase();
$session = $cms->getSession();
$cookie = $cms->getCookie();

if ($session->id === '' && $cookie->token !== '') {
    if (!$session->create($cookie->token, 'stay_logged_id')) {
        $cookie->delete();
    }
}

$twig->addGlobal('cookie', $cookie);
$twig->addGlobal('session', $session);
$twig->addGlobal('csrf_token', csrf_token());

if (DEV === true) {
    $twig->addExtension(new Twig\Extension\DebugExtension());
}