<?php
declare(strict_types=1);

// Protegido pela sessão e pelo CSRF normal de request-guards.php.
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false], 405);
}
$member = trim((string) ($session->id ?? ''));
if ($member === '') json_response(['success' => false], 401);
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
try {
    // Interface antiga ainda em memória: respeitar a escolha de ocultar mesmo após migração.
    // Não se aplica a flags de visibilidade transportadas por amostras GPS nativas.
    $cms->getLocation()->hideFromLegacyClient($member);
    json_response(['success' => true]);
} catch (Throwable $error) {
    error_log('[location-hide] ' . get_class($error));
    json_response(['success' => false], 503);
}