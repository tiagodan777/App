<?php
use Twig\Extra\Intl\IntlExtension;

define('APP_ROOT', dirname(__FILE__, 2));
require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/src/functions.php';
require APP_ROOT . '/vendor/autoload.php';

apply_security_headers();

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
$twig->addGlobal(
    'json_script_flags',
    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
);
/*$twig->addExtension(new IntlExtension());

setlocale(LC_TIME, 'pt_PT.UTF-8', 'pt_PT', 'Portuguese_Portugal');
date_default_timezone_set('Europe/Lisbon');*/

$session = $cms->getSession();
$db = $cms->getDatabase();
$cookie = $cms->getCookie();

if (trim((string) ($session->id ?? '')) !== '' && (string) $session->id !== '0') {
    $accountSession = $db->runSQL(
        "SELECT estado, auth_version
         FROM membros
         WHERE id = :id
         LIMIT 1",
        ['id' => (string) $session->id]
    )->fetch();
    $active =
        is_array($accountSession) &&
        (string) ($accountSession['estado'] ?? '') === 'ativo' &&
        (int) ($accountSession['auth_version'] ?? 0) ===
            (int) ($session->auth_version ?? 0);

    if (!$active) {
        $cookie->delete();
        $session->delete();
    }
}

prevent_authenticated_caching($session);

$storedPreferences = null;
$authenticatedMemberId = trim((string) ($session->id ?? ''));

if ($authenticatedMemberId !== '' && $authenticatedMemberId !== '0') {
    $preferenceRow = $db->runSQL(
        'SELECT localizacao_ativa, notificacoes_ativas, invisivel
         FROM preferencias_privacidade
         WHERE membro_id = :id
         LIMIT 1',
        ['id' => $authenticatedMemberId]
    )->fetch();

    $storedPreferences = [
        'localizacao' => (bool) ($preferenceRow['localizacao_ativa'] ?? false),
        'notificacoes' => (bool) ($preferenceRow['notificacoes_ativas'] ?? false),
        'invisivel' => (bool) ($preferenceRow['invisivel'] ?? false)
    ];
}

$twig->addGlobal('session', $session);
$twig->addGlobal('csrf_token', csrf_token());
$twig->addGlobal('csp_nonce', CSP_NONCE);
$twig->addGlobal('stored_preferences', $storedPreferences);
$twig->addGlobal('legal_contact_email', LEGAL_CONTACT_EMAIL);
$twig->addGlobal('legal_operator_name', LEGAL_OPERATOR_NAME);
$twig->addGlobal('legal_address', LEGAL_ADDRESS);
$twig->addGlobal('privacy_version', PRIVACY_VERSION);
$twig->addGlobal('terms_version', TERMS_VERSION);
$twig->addGlobal('community_version', COMMUNITY_VERSION);

if (DEV === true) {
    $twig->addExtension(new \Twig\Extension\DebugExtension);
}
