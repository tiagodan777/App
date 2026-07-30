<?php

declare(strict_types=1);

function redirect($location, $parameters = [], $response_code = 302)
{
    $qs = $parameters ? '?' . http_build_query($parameters) : '';
    $location = $location . $qs;
    header('Location: ' . $location, true, $response_code);
    exit;
}

function create_filename($original)
{
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $unique = bin2hex(random_bytes(16));

    return $unique . '.' . $ext;
}

function create_seo_name($string)
{
    $text = mb_strtolower($string);
    $text = trim($text);

    if (function_exists('transliterator_transliterate')) {
        $text = transliterator_transliterate('Latin-ASCII', $text);
    }

    $text = preg_replace('/ /', '-', $text);
    $text = preg_replace('/[^A-z0-9]/', '', $text);

    return $text;
}

function require_login($session): void
{
    if (trim((string) ($session->id ?? '')) === '') {
        redirect(DOC_ROOT . 'login/');
    }
}

function csrf_token(): string
{
    if (PHP_SAPI === 'cli') {
        return '';
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        throw new RuntimeException(
            'Não é possível criar o token CSRF sem uma sessão ativa.'
        );
    }

    $token = (string) ($_SESSION['csrf_token'] ?? '');

    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
    }

    return $token;
}

function csrf_token_recebido(): string
{
    $cabecalho = trim(
        (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')
    );

    if ($cabecalho !== '') {
        return $cabecalho;
    }

    return trim((string) ($_POST['_csrf'] ?? ''));
}

function csrf_token_valido(?string $token = null): bool
{
    if (
        PHP_SAPI === 'cli' ||
        session_status() !== PHP_SESSION_ACTIVE
    ) {
        return false;
    }

    $esperado = (string) ($_SESSION['csrf_token'] ?? '');
    $recebido = $token ?? csrf_token_recebido();

    return $esperado !== '' &&
        $recebido !== '' &&
        hash_equals($esperado, $recebido);
}

function rejeitar_csrf(): never
{
    http_response_code(419);
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');

    if (pedidoEsperaJson()) {
        header('Content-Type: application/json; charset=UTF-8');

        echo json_encode([
            'success' => false,
            'message' => 'A página expirou. Atualiza a página e tenta novamente.'
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        exit;
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
    echo '<a href="' . htmlspecialchars(
        (string) ($_SERVER['REQUEST_URI'] ?? DOC_ROOT),
        ENT_QUOTES,
        'UTF-8'
    ) . '">Atualizar</a>';
    echo '</main>';
    echo '</body>';
    echo '</html>';
    exit;
}

function require_csrf_token(): void
{
    $metodo = strtoupper(
        (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')
    );

    if (!in_array($metodo, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        return;
    }

    if (!csrf_token_valido()) {
        rejeitar_csrf();
    }
}

function calcularIdade(string $dataNascimento): int
{
    $nascimento = new DateTimeImmutable($dataNascimento);

    return $nascimento->diff(new DateTimeImmutable('today'))->y;
}

function handle_error(int $type, string $message, string $file, int $line): bool
{
    if (!(error_reporting() & $type)) {
        return false;
    }

    if ($type === E_DEPRECATED || $type === E_USER_DEPRECATED) {
        error_log(sprintf('[deprecated] %s em %s:%d', $message, $file, $line));

        return true;
    }

    throw new ErrorException($message, 0, $type, $file, $line);
}

function pedidoEsperaJson(): bool
{
    $accept = strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
    $requestedWith = strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));

    return str_contains($accept, 'application/json') || $requestedWith === 'xmlhttprequest';
}

function handle_exception(Throwable $erro): void
{
    error_log(sprintf(
        "[uncaught:%s] %s em %s:%d\n%s",
        $erro::class,
        $erro->getMessage(),
        $erro->getFile(),
        $erro->getLine(),
        $erro->getTraceAsString()
    ));

    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, "Erro interno da aplicação.\n");

        return;
    }

    if (!headers_sent()) {
        http_response_code(500);
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Content-Type-Options: nosniff');
    }

    if (pedidoEsperaJson()) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=UTF-8');
        }

        echo json_encode([
            'success' => false,
            'message' => 'Ocorreu um erro interno. Tenta novamente.'
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return;
    }

    if (!headers_sent()) {
        header('Content-Type: text/html; charset=UTF-8');
    }

    echo '<!DOCTYPE html>';
    echo '<html lang="pt-PT">';
    echo '<head>';
    echo '<meta charset="UTF-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<meta name="robots" content="noindex,nofollow">';
    echo '<title>Ocorreu um problema</title>';
    echo '<style>';
    echo 'body{margin:0;min-height:100vh;padding:24px;box-sizing:border-box;background:#fff;color:#111;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center}';
    echo 'main{width:min(100%,480px);text-align:center}';
    echo 'h1{margin:0 0 12px;font-size:clamp(28px,7vw,42px)}';
    echo 'p{margin:0;color:#666;font-size:17px;line-height:1.5}';
    echo '</style>';
    echo '</head>';
    echo '<body>';
    echo '<main>';
    echo '<h1>Desculpa, ocorreu um problema.</h1>';
    echo '<p>Tenta novamente dentro de alguns instantes.</p>';
    echo '</main>';
    echo '</body>';
    echo '</html>';
}

function handle_shutdown(): void
{
    $erro = error_get_last();

    $tiposFatais = [
        E_ERROR,
        E_PARSE,
        E_CORE_ERROR,
        E_COMPILE_ERROR,
        E_USER_ERROR,
        E_RECOVERABLE_ERROR
    ];

    if ($erro === null || !in_array($erro['type'], $tiposFatais, true)) {
        return;
    }

    handle_exception(new ErrorException(
        $erro['message'],
        0,
        $erro['type'],
        $erro['file'],
        $erro['line']
    ));
}