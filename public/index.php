<?php
require_once dirname(__DIR__) . '/src/bootstrap.php';
$path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
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
