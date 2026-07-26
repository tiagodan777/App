<?php

declare(strict_types=1);

require_once '../src/bootstrap.php';

$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$path = mb_strtolower(is_string($requestPath) ? $requestPath : '/');
$path = substr($path, strlen(DOC_ROOT));
$path = trim($path, '/');

$parts = $path === '' ? [] : explode('/', $path);

if (($parts[0] ?? '') !== 'admin') {
    $page = $parts[0] ?? 'index';
    $id = $parts[1] ?? null;
} else {
    $page = 'admin/' . ($parts[1] ?? '');
    $id = $parts[2] ?? null;
}

$publicRoutes = [
    'blocked-users',
    'community-guidelines',
    'create-account',
    'create-account-autocompletar',
    'create-account-campos',
    'delete-account',
    'index',
    'legal-acceptance',
    'login',
    'logout',
    'message-media',
    'messages',
    'notifications',
    'preferences',
    'privacy',
    'profile',
    'profile-delete',
    'profile-photo',
    'safety',
    'safety-standards',
    'settings',
    'support',
    'terms',
    'websocket-ticket'
];
$adminRoutes = ['admin/report', 'admin/report-media', 'admin/reports'];
$routesWithOptionalId = [
    'message-media',
    'messages',
    'profile',
    'profile-delete',
    'profile-photo',
    'admin/report',
    'admin/report-media'
];

$isAdminRoute = str_starts_with($page, 'admin/');
$maximumParts = $isAdminRoute
    ? (in_array($page, $routesWithOptionalId, true) ? 3 : 2)
    : (in_array($page, $routesWithOptionalId, true) ? 2 : 1);
$routeFound =
    (
        in_array($page, $publicRoutes, true) ||
        in_array($page, $adminRoutes, true)
    ) &&
    count($parts) <= $maximumParts &&
    (
        $id === null ||
        (
            strlen((string) $id) <= 128 &&
            preg_match('/[\x00-\x1F\x7F\/\\\\]/', (string) $id) !== 1
        )
    );

if (!$routeFound) {
    http_response_code(404);
    $page = 'error-page';
    $id = null;
}

$legalGateAllowed = [
    'legal-acceptance',
    'terms',
    'privacy',
    'community-guidelines',
    'safety-standards',
    'support',
    'logout',
    'delete-account',
    'profile-delete'
];

if (
    $routeFound &&
    trim((string) ($session->id ?? '')) !== '' &&
    (string) $session->id !== '0' &&
    !in_array($page, $legalGateAllowed, true) &&
    !member_has_current_legal_acceptance($db, (string) $session->id)
) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' || request_expects_json()) {
        http_response_code(428);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode([
            'success' => false,
            'message' => 'Tens de confirmar os Termos e a Política de Privacidade.'
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $page = 'legal-acceptance';
    $id = null;
}

$php_page = APP_ROOT . '/src/pages/' . $page . '.php';
if (!is_file($php_page)) {
    http_response_code(404);
    $php_page = APP_ROOT . '/src/pages/error-page.php';
}
include $php_page;
