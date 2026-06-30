<?php
require_once '../src/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = mb_strtolower($path);
$path = substr($path, strlen(DOC_ROOT));
$path = trim($path, '/');

$parts = explode('/', $path);

if ($parts[0] != 'admin') {
    $page = $parts[0] ?: 'index';
    $id = $parts[1] ?? null;
} else {
    $page = 'admin/' . ($parts[1] ?? '');
    $id = $parts[2] ?? null;
}
$id = filter_var($id);

$php_page = APP_ROOT . '/src/pages/' . $page . '.php';
if (!file_exists($php_page)) {
    $php_page = APP_ROOT . '/src/pages/error-page.php';
}
include $php_page;