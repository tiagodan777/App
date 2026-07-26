<?php

declare(strict_types=1);

date_default_timezone_set('UTC');

/*
 * Este ficheiro pode ficar no Git: não contém segredos.
 * Em produção, define os valores no serviço/systemd, no painel do alojamento
 * ou num config/config.local.php não versionado. O ficheiro local, quando
 * existe, devolve apenas um array de valores de configuração; nunca substitui
 * este ficheiro. As variáveis de ambiente têm precedência sobre esse array.
 */

$localConfig = [];
$localConfigFile = __DIR__ . '/config.local.php';

if (is_link($localConfigFile)) {
    throw new RuntimeException('config.local.php não pode ser uma ligação simbólica.');
}

if (file_exists($localConfigFile) && !is_file($localConfigFile)) {
    throw new RuntimeException('config.local.php tem de ser um ficheiro regular.');
}

if (is_file($localConfigFile)) {
    $loadedLocalConfig = (static function (string $file): mixed {
        return require $file;
    })($localConfigFile);

    if (!is_array($loadedLocalConfig)) {
        throw new RuntimeException(
            'config.local.php tem de devolver um array; consulta docs/DEPLOY_BETA.md.'
        );
    }

    $allowedLocalKeys = [
        'APP_DEBUG',
        'APP_ENV',
        'APP_KEY',
        'APP_URL',
        'BETA_INVITE_CODES',
        'DB_HOST',
        'DB_NAME',
        'DB_PASSWORD',
        'DB_PORT',
        'DB_TYPE',
        'DB_USERNAME',
        'HSTS_INCLUDE_SUBDOMAINS',
        'LEGAL_ADDRESS',
        'LEGAL_CONTACT_EMAIL',
        'LEGAL_OPERATOR_NAME',
        'MAIL_FROM',
        'MODERATOR_MEMBER_IDS',
        'PHP_CLI_BINARY',
        'REGISTRATION_MODE',
        'REPORT_EVIDENCE_DIR',
        'SMTP_HOST',
        'SMTP_PASSWORD',
        'SMTP_PORT',
        'SMTP_SECURITY',
        'SMTP_USERNAME',
        'TRUSTED_PROXY_IPS',
        'WEBSOCKET_ALLOWED_ORIGINS',
        'WEBSOCKET_BIND'
    ];
    $unknownLocalKeys = array_diff(array_keys($loadedLocalConfig), $allowedLocalKeys);

    if ($unknownLocalKeys !== []) {
        throw new RuntimeException(
            'Chave desconhecida em config.local.php: ' .
            implode(', ', array_map('strval', $unknownLocalKeys))
        );
    }

    foreach ($loadedLocalConfig as $key => $value) {
        if ($value !== null && !is_scalar($value)) {
            throw new RuntimeException(
                'O valor local de ' . (string) $key . ' tem de ser escalar ou null.'
            );
        }
    }

    $localConfig = $loadedLocalConfig;
    unset($loadedLocalConfig, $allowedLocalKeys, $unknownLocalKeys);
}

$env = static function (
    string $nome,
    ?string $padrao = null
) use ($localConfig): ?string {
    $valor = getenv($nome);

    if ($valor !== false) {
        return trim((string) $valor);
    }

    if (array_key_exists($nome, $localConfig) && $localConfig[$nome] !== null) {
        return trim((string) $localConfig[$nome]);
    }

    return $padrao;
};

$envBool = static function (string $nome, bool $padrao = false) use ($env): bool {
    $valor = $env($nome);

    if ($valor === null || $valor === '') return $padrao;

    return filter_var($valor, FILTER_VALIDATE_BOOLEAN);
};

$envLista = static function (string $nome, array $padrao = []) use ($env): array {
    $valor = $env($nome);

    if ($valor === null || $valor === '') return $padrao;

    return array_values(array_unique(array_filter(
        array_map('trim', explode(',', $valor)),
        static fn(string $item): bool => $item !== ''
    )));
};

$appEnv = strtolower((string) $env('APP_ENV', 'production'));
$debugRequested = $envBool('APP_DEBUG', false);

if (!in_array($appEnv, ['production', 'staging', 'development', 'test'], true)) {
    throw new RuntimeException('APP_ENV tem um valor desconhecido.');
}

if ($appEnv === 'production' && $debugRequested) {
    throw new RuntimeException('APP_DEBUG não pode estar ativo em produção.');
}

$dev = $appEnv !== 'production' && $debugRequested;
$domain = rtrim((string) $env('APP_URL', 'https://margot-app.com'), '/') . '/';
$appKey = (string) $env('APP_KEY', '');
$registrationMode = strtolower((string) $env(
    'REGISTRATION_MODE',
    $appEnv === 'production' ? 'closed' : 'public'
));
$betaInviteCodes = $envLista('BETA_INVITE_CODES');

if (!in_array($registrationMode, ['closed', 'public'], true)) {
    throw new RuntimeException('REGISTRATION_MODE só pode ser closed ou public.');
}

if ($appKey === '' && $appEnv !== 'production') {
    $appKey = 'development-only-key-change-before-production-2026';
}

if ($appEnv === 'production' && strlen($appKey) < 32) {
    throw new RuntimeException('APP_KEY tem de ter pelo menos 32 caracteres em produção.');
}

define('APP_ENV', $appEnv);
define('DEV', $dev);
define('ROOT_FOLTER', 'public');
define('DOC_ROOT', '/');
define('DOMAIN', $domain);
define('APP_KEY', $appKey);
define('REGISTRATION_MODE', $registrationMode);
define('BETA_INVITE_CODES', $betaInviteCodes);

$type = (string) $env('DB_TYPE', 'mysql');
$server = (string) $env('DB_HOST', '127.0.0.1');
$db = (string) $env('DB_NAME', 'app');
$port = (string) $env('DB_PORT', '3306');
$charset = 'utf8mb4';
$username = (string) $env('DB_USERNAME', '');
$password = (string) $env('DB_PASSWORD', '');

if ($appEnv === 'production' && $username === '') {
    throw new RuntimeException('DB_USERNAME não está configurado.');
}

$dsn = sprintf(
    '%s:host=%s;dbname=%s;port=%s;charset=%s',
    $type,
    $server,
    $db,
    $port,
    $charset
);

$email_config = [
    'server' => (string) $env('SMTP_HOST', 'smtp.sendgrid.net'),
    'port' => (int) $env('SMTP_PORT', '587'),
    'username' => (string) $env('SMTP_USERNAME', 'apikey'),
    'password' => (string) $env('SMTP_PASSWORD', ''),
    'security' => (string) $env('SMTP_SECURITY', 'tls'),
    'admin_email' => (string) $env('MAIL_FROM', ''),
    'debug' => $dev ? 2 : 0,
];

define('LEGAL_OPERATOR_NAME', (string) $env('LEGAL_OPERATOR_NAME', 'Responsável pela Margot'));
define('LEGAL_CONTACT_EMAIL', (string) $env('LEGAL_CONTACT_EMAIL', $email_config['admin_email']));
define('LEGAL_ADDRESS', (string) $env('LEGAL_ADDRESS', ''));
define('PRIVACY_VERSION', '2026-07-26');
define('TERMS_VERSION', '2026-07-26');
define('COMMUNITY_VERSION', '2026-07-26');
define('AGE_DECLARATION_VERSION', '2026-07-26');
define('HSTS_INCLUDE_SUBDOMAINS', $envBool('HSTS_INCLUDE_SUBDOMAINS', false));

$domainHost = (string) parse_url($domain, PHP_URL_HOST);
$origensWebSocket = $envLista(
    'WEBSOCKET_ALLOWED_ORIGINS',
    array_values(array_filter([$domainHost]))
);

define('WEBSOCKET_ALLOWED_ORIGINS', $origensWebSocket);
define('WEBSOCKET_BIND', (string) $env('WEBSOCKET_BIND', '127.0.0.1:8080'));
define('TRUSTED_PROXY_IPS', $envLista('TRUSTED_PROXY_IPS'));
define('MODERATOR_MEMBER_IDS', $envLista('MODERATOR_MEMBER_IDS'));
define('PHP_CLI_BINARY', (string) $env('PHP_CLI_BINARY', ''));

define('MEDIA_TYPES', [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif'
]);
define('FILE_EXTENSIONS', ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic', 'heif']);
define('MAX_SIZE', 15 * 1024 * 1024);
define('MESSAGE_IMAGE_MAX_SIZE', 10 * 1024 * 1024);
define('MESSAGE_MEDIA_DIR', APP_ROOT . '/var/private/message-media');
$reportEvidenceDir = trim((string) $env('REPORT_EVIDENCE_DIR', ''));
define(
    'REPORT_EVIDENCE_DIR',
    $reportEvidenceDir !== ''
        ? $reportEvidenceDir
        : APP_ROOT . '/var/private/report-evidence'
);
define('PROFILE_MEDIA_DIR', APP_ROOT . '/var/private/profile');
define('PROFILE_PHOTO_TEMP_DIR', PROFILE_MEDIA_DIR . '/temp');
define('PROFILE_PHOTO_THUMB_DIR', PROFILE_MEDIA_DIR . '/thumb');
define('PROFILE_PHOTO_ORIGINAL_DIR', PROFILE_MEDIA_DIR . '/original');

unset(
    $appEnv,
    $appKey,
    $betaInviteCodes,
    $debugRequested,
    $dev,
    $domain,
    $domainHost,
    $env,
    $envBool,
    $envLista,
    $key,
    $localConfig,
    $localConfigFile,
    $origensWebSocket,
    $registrationMode,
    $reportEvidenceDir,
    $value
);
