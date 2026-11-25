<?php
$path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');

if (preg_match('~^/espacos/([a-z0-9-]{1,64})/?$~D', $path, $campaignPath)) {
    $campaignSlug = $campaignPath[1];
    require __DIR__ . '/provisorio/index.php';
    return;
}

// O contador da entrada pública usa um POST sem sessão para o mesmo URL.
if ($path === '/' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    && ($_SERVER['HTTP_X_MARGOT_CAMPAIGN_VISIT'] ?? '') === '1' && array_key_exists('src', $_GET)) {
    $campaignSlug = 'site-margot';
    require __DIR__ . '/provisorio/index.php';
    return;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';
$path = mb_strtolower($path);
$path = substr($path, strlen(DOC_ROOT));
$path = trim($path, '/');
$parts = explode('/', $path);
if (($parts[0] ?? '') !== 'admin') {
    $page = $parts[0] ?: 'index';
    $id = $parts[1] ?? null;
} else {
    $page = 'admin/' . ($parts[1] ?? '');
    $id = $parts[2] ?? null;
}
$id = filter_var($id);
require APP_ROOT . '/src/request-guards.php';
$phpPage = APP_ROOT . '/src/pages/' . $page . '.php';
if (!file_exists($phpPage)) {
    $phpPage = APP_ROOT . '/src/pages/error-page.php';
}
include $phpPage;
