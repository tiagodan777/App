<?php

declare(strict_types=1);

use App\Security\RateLimiter;

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido.']);
    exit;
}

if (!RateLimiter::allow(
    'hobby-search',
    privacy_hash('ip:' . request_ip()),
    60,
    60
)) {
    http_response_code(429);
    header('Retry-After: 60');
    echo json_encode(['success' => false, 'message' => 'Demasiadas pesquisas.']);
    exit;
}

$query = mb_substr(trim((string) ($_GET['gosto'] ?? '')), 0, 64);

echo json_encode(
    $query === '' ? [] : $cms->getHobbie()->get($query),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
