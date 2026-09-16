<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__FILE__, 2));
$configFile = APP_ROOT . '/config/config.local.php';
if (!is_file($configFile)) {
    $configFile = APP_ROOT . '/config/config.php';
}
require_once $configFile;
require_once APP_ROOT . '/src/functions.php';
require_once APP_ROOT . '/src/http.php';
require_once APP_ROOT . '/src/rate-limit.php';
require_once APP_ROOT . '/vendor/autoload.php';
if (DEV === false) {
    set_exception_handler('handle_exception');
    set_error_handler('handle_error');
    register_shutdown_function('handle_shutdown');
}
require APP_ROOT . '/config/push.php';
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
