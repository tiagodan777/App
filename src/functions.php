<?php

declare(strict_types=1);

function redirect(string $location, array $parameters = [], int $response_code = 302): never
{
    $qs = $parameters ? '?' . http_build_query($parameters) : '';
    header('Location: ' . $location . $qs, true, $response_code);
    exit;
}

function create_filename(string $original): string
{
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));

    return bin2hex(random_bytes(16)) . ($ext !== '' ? '.' . $ext : '');
}

function create_seo_name(string $string): string
{
    $text = mb_strtolower(trim($string));

    if (function_exists('transliterator_transliterate')) {
        $text = (string) transliterator_transliterate('Latin-ASCII', $text);
    }

    $text = (string) preg_replace('/\s+/u', '-', $text);
    $text = (string) preg_replace('/[^a-z0-9-]/', '', $text);

    return trim($text, '-');
}

function require_login($session): void
{
    if (trim((string) ($session->id ?? '')) === '' || (string) $session->id === '0') {
        redirect(DOC_ROOT . 'login/');
    }
}

function require_moderator($db, $session): void
{
    require_login($session);

    $memberId = (string) $session->id;
    $role = $db->runSQL(
        "SELECT `role`
         FROM membros
         WHERE id = :id
         AND estado = 'ativo'
         LIMIT 1",
        ['id' => $memberId]
    )->fetchColumn();

    if (
        !in_array((string) $role, ['moderator', 'admin'], true) &&
        !in_array($memberId, MODERATOR_MEMBER_IDS, true)
    ) {
        http_response_code(403);
        echo 'Acesso negado.';
        exit;
    }
}

function calcularIdade(string $dataNascimento): int
{
    $nascimento = new DateTimeImmutable($dataNascimento);

    return $nascimento->diff(new DateTimeImmutable('today'))->y;
}

function request_ip(): string
{
    $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));

    if (
        $ip !== '' &&
        defined('TRUSTED_PROXY_IPS') &&
        in_array($ip, TRUSTED_PROXY_IPS, true)
    ) {
        $encaminhado = explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0] ?? '';
        $encaminhado = trim($encaminhado);

        if (filter_var($encaminhado, FILTER_VALIDATE_IP)) return $encaminhado;
    }

    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : 'unknown';
}

function privacy_hash(string $valor): string
{
    return hash_hmac('sha256', $valor, APP_KEY);
}

function legal_document_hash(string $document): string
{
    $definitions = [
        'termos' => [
            'version' => TERMS_VERSION,
            'related_versions' => ['community' => COMMUNITY_VERSION],
            'sources' => [
                'templates/legal/terms.html',
                'templates/legal/community-guidelines.html',
                'templates/legal/safety-standards.html',
                [
                    'path' => 'templates/create-account-campos.html',
                    'label_for' => 'aceitar-termos'
                ],
                [
                    'path' => 'templates/legal/legal-acceptance.html',
                    'label_for' => 'legal-aceitar-termos'
                ]
            ]
        ],
        'privacidade' => [
            'version' => PRIVACY_VERSION,
            'related_versions' => [],
            'sources' => [
                'templates/legal/privacy.html',
                [
                    'path' => 'templates/create-account-campos.html',
                    'label_for' => 'reconhecer-privacidade'
                ],
                [
                    'path' => 'templates/legal/legal-acceptance.html',
                    'label_for' => 'legal-reconhecer-privacidade'
                ]
            ]
        ],
        'maior_18' => [
            'version' => AGE_DECLARATION_VERSION,
            'related_versions' => [],
            'sources' => [
                [
                    'path' => 'templates/create-account-campos.html',
                    'label_for' => 'confirmar-18'
                ],
                [
                    'path' => 'templates/legal/legal-acceptance.html',
                    'label_for' => 'legal-confirmar-18'
                ]
            ]
        ]
    ];
    $definition = $definitions[$document] ?? null;

    if (!is_array($definition)) {
        throw new InvalidArgumentException('Documento legal desconhecido.');
    }

    $sourceDigests = [];

    foreach ($definition['sources'] as $sourceDefinition) {
        $relativePath = is_array($sourceDefinition)
            ? (string) ($sourceDefinition['path'] ?? '')
            : (string) $sourceDefinition;
        $path = APP_ROOT . '/' . $relativePath;

        if (!is_file($path) || is_link($path)) {
            throw new RuntimeException('Falta uma fonte canónica do documento legal.');
        }

        $content = file_get_contents($path);

        if (!is_string($content)) {
            throw new RuntimeException('Não foi possível ler uma fonte do documento legal.');
        }

        $sourceKey = $relativePath;

        if (is_array($sourceDefinition) && isset($sourceDefinition['label_for'])) {
            $labelFor = (string) $sourceDefinition['label_for'];
            $labelPattern = '/<label\b[^>]*\bfor=["\']' .
                preg_quote($labelFor, '/') .
                '["\'][^>]*>.*?<\/label>/isu';

            if (preg_match($labelPattern, $content, $labelMatch) !== 1) {
                throw new RuntimeException('Falta uma declaração visível numa fonte legal.');
            }

            $content = (string) $labelMatch[0];
            $sourceKey .= '#label-for=' . $labelFor;
        }

        $normalisedContent = str_replace(["\r\n", "\r"], "\n", $content);
        $normalisedContent = (string) preg_replace(
            '/\s+/u',
            ' ',
            trim($normalisedContent)
        );
        $sourceDigests[$sourceKey] = hash('sha256', $normalisedContent);
    }

    $canonicalPayload = [
        'schema' => 'margot-legal-document-v2',
        'document' => $document,
        'version' => (string) $definition['version'],
        'operator' => trim((string) LEGAL_OPERATOR_NAME),
        'address' => trim((string) LEGAL_ADDRESS),
        'contact' => trim((string) LEGAL_CONTACT_EMAIL),
        'related_versions' => $definition['related_versions'],
        'sources' => $sourceDigests
    ];

    return hash(
        'sha256',
        json_encode(
            $canonicalPayload,
            JSON_UNESCAPED_SLASHES |
            JSON_UNESCAPED_UNICODE |
            JSON_THROW_ON_ERROR
        )
    );
}

function member_has_current_legal_acceptance($db, string $memberId): bool
{
    if ($memberId === '') return false;

    $statement = $db->runSQL(
        "SELECT documento, versao, documento_hash
         FROM aceitacoes_legais
         WHERE membro_id = :membro_id
         AND (
             (documento = 'termos' AND versao = :termos)
             OR
             (documento = 'privacidade' AND versao = :privacidade)
             OR
             (documento = 'maior_18' AND versao = :maior_18)
         )",
        [
            'membro_id' => $memberId,
            'termos' => TERMS_VERSION,
            'privacidade' => PRIVACY_VERSION,
            'maior_18' => AGE_DECLARATION_VERSION
        ]
    );

    $documents = [];

    foreach ($statement->fetchAll() as $row) {
        $document = (string) $row['documento'];
        $storedHash = (string) ($row['documento_hash'] ?? '');
        $expectedHash = legal_document_hash($document);

        if (
            $storedHash !== '' &&
            hash_equals($expectedHash, $storedHash)
        ) {
            $documents[$document] = true;
        }
    }

    return isset($documents['termos'], $documents['privacidade'], $documents['maior_18']);
}

function csrf_token(): string
{
    if (
        session_status() === PHP_SESSION_NONE &&
        PHP_SAPI !== 'cli' &&
        !headers_sent()
    ) {
        /*
         * Session::delete() destrói a sessão quando deteta uma conta suspensa.
         * Limpa também o ID antigo antes de abrir a sessão anónima que guarda
         * o CSRF, para não reutilizar a sessão da conta que perdeu acesso.
         */
        session_id('');

        if (!session_start()) {
            throw new RuntimeException('Não foi possível iniciar uma sessão segura.');
        }
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        throw new RuntimeException('A sessão ainda não foi iniciada.');
    }

    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function csrf_is_valid(?string $token = null): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) return false;

    $esperado = $_SESSION['csrf_token'] ?? '';
    $recebido = $token;

    if ($recebido === null || $recebido === '') {
        $recebido = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    }

    if ($recebido === '') {
        $recebido = (string) ($_POST['_csrf'] ?? '');
    }

    return is_string($esperado) &&
        $esperado !== '' &&
        $recebido !== '' &&
        hash_equals($esperado, $recebido);
}

function request_expects_json(): bool
{
    $accept = strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
    $requestedWith = strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));

    return str_contains($accept, 'application/json') ||
        $requestedWith === 'xmlhttprequest';
}

function require_csrf(): void
{
    if (csrf_is_valid()) return;

    http_response_code(403);
    header('Cache-Control: no-store');

    if (request_expects_json()) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode([
            'success' => false,
            'message' => 'A página expirou. Atualiza-a e tenta novamente.'
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        echo 'A página expirou. Atualiza-a e tenta novamente.';
    }

    exit;
}

function apply_security_headers(): void
{
    if (!defined('CSP_NONCE')) {
        define(
            'CSP_NONCE',
            rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=')
        );
    }

    if (headers_sent()) return;

    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=(), usb=()');
    header(
        "Content-Security-Policy: default-src 'self'; " .
        "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " .
        "form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " .
        "font-src 'self'; style-src 'self' 'unsafe-inline'; " .
        "script-src 'self' 'nonce-" . CSP_NONCE . "'; connect-src 'self' ws: wss:; " .
        "worker-src 'self' blob:; manifest-src 'self'"
    );

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';

    if ($https && defined('APP_ENV') && APP_ENV === 'production') {
        header(
            'Strict-Transport-Security: max-age=31536000' .
            (
                defined('HSTS_INCLUDE_SUBDOMAINS') &&
                HSTS_INCLUDE_SUBDOMAINS
                    ? '; includeSubDomains'
                    : ''
            )
        );
    }
}

function prevent_authenticated_caching($session): void
{
    if (trim((string) ($session->id ?? '')) !== '' && (string) $session->id !== '0') {
        header('Cache-Control: no-store, private');
        header('Pragma: no-cache');
    }
}

set_error_handler('handle_error');

function handle_error(int $type, string $message, string $file, int $line): bool
{
    if (!(error_reporting() & $type)) return false;
    if ($type === E_DEPRECATED || $type === E_USER_DEPRECATED) return true;

    throw new ErrorException($message, 0, $type, $file, $line);
}

set_exception_handler('handle_exception');

function handle_exception(Throwable $e): void
{
    $incident = bin2hex(random_bytes(6));
    $detalhe = DEV
        ? sprintf('%s: %s em %s:%d', $e::class, $e->getMessage(), $e->getFile(), $e->getLine())
        : sprintf('%s em %s:%d', $e::class, basename($e->getFile()), $e->getLine());

    error_log(sprintf('[incident:%s] %s', $incident, $detalhe));

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=UTF-8');
        header('Cache-Control: no-store');
    }

    echo '<h1>Desculpa, ocorreu um problema</h1>';
    echo '<p>Referência: ' . htmlspecialchars($incident, ENT_QUOTES, 'UTF-8') . '</p>';
}

function handle_shutdown(): void
{
    $error = error_get_last();

    if (!$error || !in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }

    handle_exception(new ErrorException(
        $error['message'],
        0,
        $error['type'],
        $error['file'],
        $error['line']
    ));
}
