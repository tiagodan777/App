<?php
use Twig\Extra\Intl\IntlExtension;

define('APP_ROOT', dirname(__FILE__, 2));
require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/src/functions.php';
require APP_ROOT . '/vendor/autoload.php';

if (DEV === false) {
    set_exception_handler('handle_exception');
    set_error_handler('handle_error');
    register_shutdown_function('handle_shutdown');
}

$cms = new App\CMS\CMS($dsn, $username, $password);
unset($dsn, $username, $password);

/*if (!DEV) {
    $twig_options['cache'] = APP_ROOT . '/var/cache';
}*/
$twig_options['debug'] = DEV;

$loader = new \Twig\Loader\FilesystemLoader([APP_ROOT . '/templates']);
$twig = new Twig\Environment($loader, $twig_options);
$twig->addGlobal('doc_root', DOC_ROOT);
$twig->addExtension(new IntlExtension());

setlocale(LC_TIME, 'pt_PT.UTF-8', 'pt_PT', 'Portuguese_Portugal');
date_default_timezone_set('Europe/Lisbon');

$cookie = $cms->getCookie();
$session = $cms->getSession();
$db = $cms->getDatabase();

/*if ($cookie->token) {
    $session = $session->create($cookie->token);
}*/

$twig->addGlobal('cookie', $cookie);
$twig->addGlobal('session', $session);

if (DEV === true) {
    $twig->addExtension(new \Twig\Extension\DebugExtension);
}