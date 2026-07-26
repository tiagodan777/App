<?php

declare(strict_types=1);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    echo 'Método não permitido.';
    exit;
}

require_csrf();

try {
    $cms->getCookie()->delete();
} catch (Throwable) {
    error_log('[logout] Falhou a revogação do token; o cookie local foi removido.');
}

$cms->getSession()->delete();
redirect(DOC_ROOT . 'login/', [], 303);
