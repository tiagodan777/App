<?php
declare(strict_types=1);

function redirect($location, $parameters = [], $response_code = 302) {
    $qs = $parameters ? '?' . http_build_query($parameters) : '';
    $location = $location . $qs;
    header('Location: ' . $location, true, $response_code);
    exit();
}

function require_login($session): void {
    if (trim((string) ($session->id ?? '')) === '') {
        redirect(DOC_ROOT . 'create-account/');
    }
}

function csrf_token(): string {
    if (PHP_SAPI === 'cli') {
        return '';
    }
    if (session_status() !== PHP_SESSION_ACTIVE) {
        throw new RuntimeException('Não é possível criar o token CSRF sem uma sessão ativa.');
    }
    $token = (string) ($_SESSION['csrf_token'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
    }
    return $token;
}

function csrf_token_recebido(): string {
    $cabecalho = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    if ($cabecalho !== '') {
        return $cabecalho;
    }
    return trim((string) ($_POST['_csrf'] ?? ''));
}

function csrf_token_valido(?string $token = null): bool {
    if (PHP_SAPI === 'cli' || session_status() !== PHP_SESSION_ACTIVE) {
        return false;
    }
    $esperado = (string) ($_SESSION['csrf_token'] ?? '');
    $recebido = $token ?? csrf_token_recebido();
    return $esperado !== '' && $recebido !== '' && hash_equals($esperado, $recebido);
}

function rejeitar_csrf(): never {
    http_response_code(403);
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    if (pedidoEsperaJson()) {
        json_response(
            ['success' => false, 'message' => 'A página expirou. Atualiza a página e tenta novamente.'],
            403
        );
    }
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!DOCTYPE html>';
    echo '<html lang="pt-PT">';
    echo '<head>';
    echo '<meta charset="UTF-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<meta name="robots" content="noindex,nofollow">';
    echo '<title>Página expirada</title>';
    echo '<style>';
    echo 'body{margin:0;min-height:100vh;padding:24px;box-sizing:border-box;background:#fff;color:#111;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center}';
    echo 'main{width:min(100%,480px);text-align:center}';
    echo 'h1{margin:0 0 12px;font-size:clamp(28px,7vw,42px)}';
    echo 'p{margin:0 0 24px;color:#666;font-size:17px;line-height:1.5}';
    echo 'a{display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:700}';
    echo '</style>';
    echo '</head>';
    echo '<body>';
    echo '<main>';
    echo '<h1>A página expirou.</h1>';
    echo '<p>Atualiza a página e tenta novamente.</p>';
    echo '<a href="' .
        htmlspecialchars((string) ($_SERVER['REQUEST_URI'] ?? DOC_ROOT), ENT_QUOTES, 'UTF-8') .
        '">Atualizar</a>';
    echo '</main>';
    echo '</body>';
    echo '</html>';
    exit();
}

function require_csrf_token(): void {
    $metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($metodo, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        return;
    }
    if (!csrf_token_valido()) {
        rejeitar_csrf();
    }
}

function pedidoEsperaJson(): bool {
    $accept = strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
    $requestedWith = strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));
    return str_contains($accept, 'application/json') || $requestedWith === 'xmlhttprequest';
}

function json_response(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit();
}

function authorization_header(): string {
    $autorizacao = trim((string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '')));
    if ($autorizacao !== '') {
        return $autorizacao;
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $nome => $valor) {
            if (strcasecmp((string) $nome, 'Authorization') === 0) {
                return trim((string) $valor);
            }
        }
    }
    return '';
}
