<?php

declare(strict_types=1);

use App\CMS\Database;
use App\Security\MediaIntegrity;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

define('APP_ROOT', dirname(__DIR__));

require APP_ROOT . '/config/config.php';
require APP_ROOT . '/vendor/autoload.php';

$failures = [];
$warnings = [];
$successes = [];

$pass = static function (string $message) use (&$successes): void {
    $successes[] = $message;
};
$fail = static function (string $message) use (&$failures): void {
    $failures[] = $message;
};
$warn = static function (string $message) use (&$warnings): void {
    $warnings[] = $message;
};

$hasPlaceholder = static function (string $value): bool {
    $value = trim($value);

    return $value === '' ||
        preg_match(
            '/(?:__REQUIRED_|\.invalid(?:\z|[\/:])|'
            . '\b(?:change[-_ ]?me|replace[-_ ]?me|placeholder)\b|'
            . '\[(?:POR PREENCHER|REQUIRED|CONFIGURAR)[^\]]*\])/iu',
            $value
        ) === 1;
};

$isPublicHost = static function (string $host): bool {
    $host = strtolower(rtrim(trim($host), '.'));

    if ($host === '' || str_contains($host, '*')) return false;

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return filter_var(
            $host,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }

    if (filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) {
        return false;
    }

    foreach (
        ['localhost', '.localhost', '.invalid', '.local', '.test', '.example']
        as $forbiddenSuffix
    ) {
        if ($host === ltrim($forbiddenSuffix, '.') || str_ends_with($host, $forbiddenSuffix)) {
            return false;
        }
    }

    return !in_array($host, ['example.com', 'example.net', 'example.org'], true);
};

$secretShapeIsStrong = static function (
    string $value,
    int $minimumLength,
    float $minimumBits,
    int $minimumUniqueCharacters
): bool {
    $length = strlen($value);

    if (
        $length < $minimumLength ||
        $length > 256 ||
        preg_match('/[^\x21-\x7E]/', $value) === 1 ||
        count(array_unique(str_split($value))) < $minimumUniqueCharacters
    ) {
        return false;
    }

    if (preg_match('/\A[0-9a-f]+\z/i', $value) === 1) {
        $estimatedBits = $length * 4.0;
    } elseif (preg_match('/\A[A-Za-z0-9_-]+\z/', $value) === 1) {
        $estimatedBits = $length * 6.0;
    } else {
        $frequencies = count_chars($value, 1);
        $estimatedBits = 0.0;

        foreach ($frequencies as $frequency) {
            $probability = $frequency / $length;
            $estimatedBits -= $frequency * log($probability, 2);
        }
    }

    return $estimatedBits >= $minimumBits;
};

$secretLooksPredictable = static function (string $value): bool {
    if (
        preg_match(
            '/(?:0123456789|9876543210|abcdefghijklmnopqrstuvwxyz|'
            . 'zyxwvutsrqponmlkjihgfedcba|qwertyuiop|asdfghjkl)/i',
            $value
        ) === 1
    ) {
        return true;
    }

    $length = strlen($value);

    for ($period = 1; $period <= min(16, intdiv($length, 2)); $period++) {
        if (
            $length % $period === 0 &&
            str_repeat(substr($value, 0, $period), intdiv($length, $period)) === $value
        ) {
            return true;
        }
    }

    return false;
};

$production = defined('APP_ENV') && APP_ENV === 'production';

if ($production && defined('DEV') && DEV === false) {
    $pass('Ambiente de produção sem modo de debug.');
} else {
    $fail('O pré-voo da beta só aprova APP_ENV=production e APP_DEBUG=false.');
}

if (defined('REGISTRATION_MODE') && REGISTRATION_MODE === 'closed') {
    $pass('Registo limitado à beta fechada.');
} else {
    $fail('Mantém REGISTRATION_MODE=closed durante a beta.');
}

$inviteCodes = defined('BETA_INVITE_CODES') && is_array(BETA_INVITE_CODES)
    ? BETA_INVITE_CODES
    : [];
$weakInviteCodes = array_filter(
    $inviteCodes,
    static fn($code): bool =>
        !$secretShapeIsStrong((string) $code, 24, 96.0, 10) ||
        $secretLooksPredictable((string) $code) ||
        preg_match(
            '/(?:change|convite|invite|margot|password|senha|teste|test|demo)/i',
            (string) $code
        ) === 1
);
$inviteCodesAreUnique = count($inviteCodes) === count(array_unique($inviteCodes));

if ($inviteCodes !== [] && $weakInviteCodes === [] && $inviteCodesAreUnique) {
    $pass('Os códigos de convite têm forma compatível com pelo menos 96 bits aleatórios.');
} else {
    $fail(
        'Configura códigos de convite únicos gerados aleatoriamente, com pelo menos 96 bits ' .
        '(por exemplo: openssl rand -hex 24).'
    );
}

unset($inviteCodes, $weakInviteCodes, $inviteCodesAreUnique);

$appKey = defined('APP_KEY') ? (string) APP_KEY : '';
$knownDevelopmentKey =
    $appKey === 'development-only-key-change-before-production-2026' ||
    preg_match(
        '/(?:development|change[-_ ]?before|change[-_ ]?me|password|margot[-_ ]?key|teste|test[-_ ]?key)/i',
        $appKey
    ) === 1;

if (
    !$knownDevelopmentKey &&
    !$secretLooksPredictable($appKey) &&
    $secretShapeIsStrong($appKey, 32, 128.0, 12)
) {
    $pass('APP_KEY tem forma compatível com pelo menos 128 bits aleatórios.');
} else {
    $fail('Substitui APP_KEY por uma chave aleatória (por exemplo: openssl rand -hex 32).');
}
unset($appKey, $knownDevelopmentKey);

$appUrl = defined('DOMAIN') ? (string) DOMAIN : '';
$appUrlParts = parse_url($appUrl);
$appHost = is_array($appUrlParts) ? strtolower((string) ($appUrlParts['host'] ?? '')) : '';
$appUrlIsProductionHttps =
    $production &&
    is_array($appUrlParts) &&
    strtolower((string) ($appUrlParts['scheme'] ?? '')) === 'https' &&
    $isPublicHost($appHost) &&
    !isset($appUrlParts['user']) &&
    !isset($appUrlParts['pass']) &&
    !isset($appUrlParts['query']) &&
    !isset($appUrlParts['fragment']) &&
    (!isset($appUrlParts['port']) || (int) $appUrlParts['port'] === 443) &&
    in_array((string) ($appUrlParts['path'] ?? ''), ['', '/'], true);

if ($appUrlIsProductionHttps) {
    $pass('APP_URL é uma origem HTTPS pública de produção.');
} else {
    $fail('APP_URL tem de ser a origem HTTPS pública de produção, sem credenciais, caminho ou placeholders.');
}

if (
    defined('LEGAL_OPERATOR_NAME') &&
    !$hasPlaceholder((string) LEGAL_OPERATOR_NAME) &&
    (string) LEGAL_OPERATOR_NAME !== 'Responsável pela Margot'
) {
    $pass('Identidade do responsável preenchida.');
} else {
    $fail('Preenche LEGAL_OPERATOR_NAME com o nome legal do responsável.');
}

if (
    defined('LEGAL_CONTACT_EMAIL') &&
    filter_var(LEGAL_CONTACT_EMAIL, FILTER_VALIDATE_EMAIL) &&
    !$hasPlaceholder((string) LEGAL_CONTACT_EMAIL) &&
    $isPublicHost((string) substr(strrchr((string) LEGAL_CONTACT_EMAIL, '@') ?: '', 1))
) {
    $pass('Contacto legal válido.');
} else {
    $fail('Preenche LEGAL_CONTACT_EMAIL com uma caixa de correio funcional.');
}

if (
    defined('LEGAL_ADDRESS') &&
    !$hasPlaceholder((string) LEGAL_ADDRESS) &&
    strlen(trim((string) LEGAL_ADDRESS)) >= 10
) {
    $pass('Morada legal preenchida.');
} else {
    $fail('Preenche LEGAL_ADDRESS antes de disponibilizar o serviço.');
}

$webSocketOrigins = defined('WEBSOCKET_ALLOWED_ORIGINS') && is_array(WEBSOCKET_ALLOWED_ORIGINS)
    ? WEBSOCKET_ALLOWED_ORIGINS
    : [];
$invalidWebSocketOrigins = array_filter(
    $webSocketOrigins,
    static fn($origin): bool =>
        !is_string($origin) ||
        $hasPlaceholder($origin) ||
        !$isPublicHost($origin) ||
        str_contains($origin, '://') ||
        str_contains($origin, '/') ||
        str_contains($origin, ':')
);

if (
    $webSocketOrigins !== [] &&
    $invalidWebSocketOrigins === [] &&
    count($webSocketOrigins) === count(array_unique($webSocketOrigins)) &&
    in_array(
        $appHost,
        array_map(
            static fn($origin): string =>
                is_string($origin) ? strtolower($origin) : '',
            $webSocketOrigins
        ),
        true
    )
) {
    $pass('Origens WebSocket são hosts públicos explícitos e incluem APP_URL.');
} else {
    $fail(
        'WEBSOCKET_ALLOWED_ORIGINS deve conter hosts públicos explícitos, sem esquema, porta, ' .
        'curingas, .invalid ou duplicados, e incluir o host de APP_URL.'
    );
}
unset($webSocketOrigins, $invalidWebSocketOrigins);

$webSocketBind = defined('WEBSOCKET_BIND') ? (string) WEBSOCKET_BIND : '';
$webSocketBindMatches = preg_match(
    '/\A(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})\z/',
    $webSocketBind,
    $webSocketBindParts
) === 1;
$webSocketPort = $webSocketBindMatches ? (int) ($webSocketBindParts[1] ?? 0) : 0;

if ($webSocketBindMatches && $webSocketPort >= 1024 && $webSocketPort <= 65535) {
    $pass('WebSocket limitado à interface local.');
} else {
    $fail(
        'WEBSOCKET_BIND deve usar 127.0.0.1 ou [::1] e uma porta não privilegiada válida, atrás do proxy TLS.'
    );
}
unset($webSocketBind, $webSocketBindMatches, $webSocketBindParts, $webSocketPort);

if (defined('MODERATOR_MEMBER_IDS') && MODERATOR_MEMBER_IDS === []) {
    $pass('Não existe bypass de moderador por configuração.');
} else {
    $fail('Esvazia MODERATOR_MEMBER_IDS; os dois moderadores devem ter funções reais na base de dados.');
}

$databaseConfigValues = [
    (string) ($db ?? ''),
    (string) ($username ?? ''),
    (string) ($password ?? '')
];
$smtpHost = (string) ($email_config['server'] ?? '');
$smtpUser = (string) ($email_config['username'] ?? '');
$smtpPassword = (string) ($email_config['password'] ?? '');
$smtpFrom = (string) ($email_config['admin_email'] ?? '');
$smtpHostValid =
    !$hasPlaceholder($smtpHost) &&
    (
        $isPublicHost($smtpHost) ||
        filter_var($smtpHost, FILTER_VALIDATE_IP) !== false
    );
$smtpFromDomain = (string) substr(strrchr($smtpFrom, '@') ?: '', 1);

if (array_filter($databaseConfigValues, $hasPlaceholder) === []) {
    $pass('Credenciais e nome da base de dados não contêm valores vazios ou placeholders conhecidos.');
} else {
    $fail('Preenche DB_NAME, DB_USERNAME e DB_PASSWORD sem placeholders.');
}

if (
    $smtpHostValid &&
    !$hasPlaceholder($smtpUser) &&
    !$hasPlaceholder($smtpPassword) &&
    filter_var($smtpFrom, FILTER_VALIDATE_EMAIL) &&
    $isPublicHost($smtpFromDomain)
) {
    $pass('Configuração SMTP está preenchida sem placeholders conhecidos.');
} else {
    $warn(
        'SMTP ainda não está operacional. É aceitável no beta fechado sem emails automáticos; ' .
        'bloqueia o lançamento público e a verificação de email.'
    );
}
unset(
    $databaseConfigValues,
    $smtpHost,
    $smtpUser,
    $smtpPassword,
    $smtpFrom,
    $smtpHostValid,
    $smtpFromDomain
);

$requiredExtensions = [
    'fileinfo',
    'json',
    'mbstring',
    'openssl',
    'pdo_mysql'
];

if (PHP_VERSION_ID >= 80100) {
    $pass('PHP 8.1 ou superior está disponível.');
} else {
    $fail('A aplicação exige PHP 8.1 ou superior.');
}

foreach ($requiredExtensions as $extension) {
    if (extension_loaded($extension)) {
        $pass('Extensão PHP disponível: ' . $extension . '.');
    } else {
        $fail('Falta a extensão PHP: ' . $extension . '.');
    }
}

if (class_exists(Imagick::class)) {
    $pass('Imagick está disponível para recodificar fotografias.');

    if (
        \Imagick::queryFormats('HEIC') !== [] ||
        \Imagick::queryFormats('HEIF') !== []
    ) {
        $pass('Imagick consegue descodificar fotografias HEIC/HEIF.');
    } else {
        $warn(
            'Imagick não anuncia suporte HEIC/HEIF; estes uploads serão rejeitados. ' .
            'JPEG, PNG e WebP continuam disponíveis.'
        );
    }
} else {
    $fail('Imagick é obrigatório para remover metadados e recodificar fotografias.');
}

$phpCli = trim((string) (
    defined('PHP_CLI_BINARY') ? PHP_CLI_BINARY : ''
));

if (
    $phpCli !== '' &&
    str_starts_with($phpCli, '/') &&
    is_file($phpCli) &&
    is_executable($phpCli)
) {
    $pass('PHP_CLI_BINARY aponta para um executável absoluto.');
} else {
    $fail('PHP_CLI_BINARY deve apontar para o executável PHP CLI absoluto.');
}

if (function_exists('exec')) {
    $pass('A função exec está disponível para iniciar o worker de fotografias.');

    if ($phpCli !== '' && is_file($phpCli) && is_executable($phpCli)) {
        $workerCheckOutput = [];
        $workerCheckCode = -1;
        exec(
            escapeshellarg($phpCli) .
            ' -r ' .
            escapeshellarg('exit(PHP_VERSION_ID >= 80100 ? 0 : 1);'),
            $workerCheckOutput,
            $workerCheckCode
        );

        if ($workerCheckCode === 0) {
            $pass('O PHP CLI configurado executa código compatível com PHP 8.1+.');
        } else {
            $fail('O PHP CLI configurado não executou o teste de compatibilidade.');
        }
    }
} else {
    $fail('A função exec é necessária para iniciar o worker de fotografias.');
}

$configLocalFile = APP_ROOT . '/config/config.local.php';

if (is_file($configLocalFile)) {
    $configMode = fileperms($configLocalFile);

    if (
        !is_link($configLocalFile) &&
        $configMode !== false &&
        in_array(($configMode & 0777), [0400, 0440, 0600, 0640], true)
    ) {
        $pass('config.local.php não é symlink e só admite leitura do proprietário/grupo.');
    } else {
        $fail('config.local.php deve ser um ficheiro regular com modo 0400, 0440, 0600 ou 0640.');
    }
}

$pathContainsSymlink = static function (string $path, string $stopAt): bool {
    $current = rtrim($path, DIRECTORY_SEPARATOR);
    $stopAt = rtrim($stopAt, DIRECTORY_SEPARATOR);

    while ($current !== '' && strlen($current) >= strlen($stopAt)) {
        if (is_link($current)) return true;
        if ($current === $stopAt) return false;

        $parent = dirname($current);

        if ($parent === $current) break;
        $current = $parent;
    }

    return false;
};

$pathIsInside = static function (string $path, string $parent): bool {
    $normalPath = rtrim(str_replace('\\', '/', $path), '/');
    $normalParent = rtrim(str_replace('\\', '/', $parent), '/');

    return $normalPath === $normalParent ||
        str_starts_with($normalPath . '/', $normalParent . '/');
};

$privateDirectories = array_filter([
    defined('MESSAGE_MEDIA_DIR') ? MESSAGE_MEDIA_DIR : null,
    defined('REPORT_EVIDENCE_DIR') ? REPORT_EVIDENCE_DIR : null,
    defined('PROFILE_PHOTO_TEMP_DIR') ? PROFILE_PHOTO_TEMP_DIR : null,
    defined('PROFILE_PHOTO_THUMB_DIR') ? PROFILE_PHOTO_THUMB_DIR : null,
    defined('PROFILE_PHOTO_ORIGINAL_DIR') ? PROFILE_PHOTO_ORIGINAL_DIR : null,
    APP_ROOT . '/var/log',
    APP_ROOT . '/var/rate-limit'
]);

$realAppRoot = realpath(APP_ROOT);
$realPublicRoot = realpath(APP_ROOT . '/public');
$realPrivateRoot = realpath(APP_ROOT . '/var');

if ($realAppRoot === false || $realPublicRoot === false) {
    $fail('Não foi possível resolver de forma canónica APP_ROOT e public/.');
}

if (
    $realPrivateRoot !== false &&
    $realAppRoot !== false &&
    (
        $pathContainsSymlink(APP_ROOT . '/var', APP_ROOT) ||
        !$pathIsInside($realPrivateRoot, $realAppRoot)
    )
) {
    $fail('var/ não pode ser uma ligação simbólica nem sair de APP_ROOT.');
}

foreach ($privateDirectories as $directory) {
    $directory = rtrim((string) $directory, '/');
    $relativeDirectory = str_replace(APP_ROOT . '/', '', $directory);

    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        $fail('Não foi possível criar a pasta privada ' . $relativeDirectory . '.');
        continue;
    }

    clearstatcache(true, $directory);
    $realDirectory = realpath($directory);
    $directoryMode = fileperms($directory);
    $directoryIsSafe =
        $realDirectory !== false &&
        $realAppRoot !== false &&
        $realPublicRoot !== false &&
        !$pathContainsSymlink($directory, APP_ROOT) &&
        $pathIsInside($realDirectory, $realAppRoot . '/var') &&
        !$pathIsInside($realDirectory, $realPublicRoot) &&
        $directoryMode !== false &&
        (($directoryMode & 0700) === 0700) &&
        (($directoryMode & 0027) === 0);

    if (!$directoryIsSafe) {
        $fail(
            'A pasta privada ' . $relativeDirectory .
            ' tem symlink, caminho fora de var/ ou permissões para “outros”.'
        );
        continue;
    }

    if (!is_writable($directory)) {
        $fail('O processo PHP não consegue escrever em ' . $relativeDirectory . '.');
        continue;
    }

    $privateTreeSafe = true;

    try {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(
                $directory,
                FilesystemIterator::SKIP_DOTS
            ),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            $itemPath = $item->getPathname();
            $itemRealPath = realpath($itemPath);
            $itemMode = fileperms($itemPath);
            $unsafeMode = $itemMode === false ||
                (($itemMode & 0027) !== 0) ||
                (
                    $item->isDir() &&
                    (($itemMode & 0700) !== 0700)
                ) ||
                (
                    $item->isFile() &&
                    (
                        ($itemMode & 0600) !== 0600 ||
                        ($itemMode & 0111) !== 0
                    )
                );

            if (
                $item->isLink() ||
                $itemRealPath === false ||
                !$pathIsInside($itemRealPath, $realDirectory) ||
                $unsafeMode
            ) {
                $privateTreeSafe = false;
                break;
            }
        }
    } catch (UnexpectedValueException $exception) {
        $privateTreeSafe = false;
    }

    if (!$privateTreeSafe) {
        $fail(
            'A árvore ' . $relativeDirectory .
            ' contém symlink, escape de caminho, ficheiro executável ou acesso para “outros”.'
        );
        continue;
    }

    $pass('Pasta privada canónica, gravável e sem acesso para “outros”: ' . $relativeDirectory . '.');
}

$legacyDirectories = [
    APP_ROOT . '/public/imagens/fotos-perfil' => ['default.webp', '.gitkeep', '.htaccess'],
    APP_ROOT . '/public/imagens/fotos-perfil-originais' => ['.gitkeep', '.htaccess'],
    APP_ROOT . '/public/imagens/fotos-perfil-temp' => ['.gitkeep', '.htaccess'],
    APP_ROOT . '/public/media/mensagens' => ['.gitkeep', '.htaccess']
];

foreach ($legacyDirectories as $directory => $allowedFiles) {
    $unexpectedCount = 0;

    if (is_link($directory)) {
        $unexpectedCount++;
    } elseif (is_dir($directory)) {
        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator(
                    $directory,
                    FilesystemIterator::SKIP_DOTS
                ),
                RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($iterator as $item) {
                $relativePath = str_replace(
                    '\\',
                    '/',
                    substr($item->getPathname(), strlen(rtrim($directory, DIRECTORY_SEPARATOR)) + 1)
                );

                if (
                    $item->isLink() ||
                    $item->isDir() ||
                    !in_array($relativePath, $allowedFiles, true)
                ) {
                    $unexpectedCount++;
                }
            }
        } catch (UnexpectedValueException $exception) {
            $unexpectedCount++;
        }
    }

    if ($unexpectedCount === 0) {
        $pass('Inspeção recursiva sem media dinâmica pública: ' . basename($directory) . '.');
    } else {
        $fail(
            'Ainda existem ' . $unexpectedCount .
            ' entrada(s) não permitida(s), aninhadas ou symlinks na pasta pública ' .
            basename($directory) . '; executa bin/migrate-private-media.php.'
        );
    }
}

try {
    $database = new Database($dsn, $username, $password);
    unset($dsn, $username, $password);
    $pass('Ligação à base de dados estabelecida.');

    $requiredTables = [
        'aceitacoes_legais',
        'bloqueados',
        'denuncias',
        'ficheiros_a_apagar',
        'fotos_perfil',
        'membros',
        'membros_gostos',
        'mensagens_chat',
        'moderacao_acoes',
        'notificacao',
        'preferencias_privacidade',
        'preferencias_privacidade_eventos',
        'schema_migrations',
        'token',
        'websocket_tickets'
    ];

    $tableStatement = $database->prepare(
        'SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = :table_name'
    );

    foreach ($requiredTables as $table) {
        $tableStatement->execute(['table_name' => $table]);

        if ((int) $tableStatement->fetchColumn() === 1) {
            $pass('Tabela presente: ' . $table . '.');
        } else {
            $fail('Falta a tabela ' . $table . '; aplica a migração de segurança.');
        }
    }

    $requiredColumns = [
        ['membros', 'estado'],
        ['membros', 'role'],
        ['membros', 'auth_version'],
        ['bloqueados', 'pessoa_bloqueada_id'],
        ['denuncias', 'evidencia_json'],
        ['denuncias', 'evidencia_media_nome'],
        ['denuncias', 'evidencia_media_mime'],
        ['denuncias', 'evidencia_media_tamanho'],
        ['denuncias', 'evidencia_media_sha256'],
        ['denuncias', 'reter_ate'],
        ['preferencias_privacidade', 'invisivel'],
        ['preferencias_privacidade_eventos', 'membro_id'],
        ['preferencias_privacidade_eventos', 'tipo'],
        ['preferencias_privacidade_eventos', 'valor'],
        ['preferencias_privacidade_eventos', 'estado_json'],
        ['preferencias_privacidade_eventos', 'origem'],
        ['preferencias_privacidade_eventos', 'versao_aviso'],
        ['preferencias_privacidade_eventos', 'criado_em']
    ];
    $columnStatement = $database->prepare(
        'SELECT COUNT(*)
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = :table_name
         AND COLUMN_NAME = :column_name'
    );

    foreach ($requiredColumns as [$table, $column]) {
        $columnStatement->execute([
            'table_name' => $table,
            'column_name' => $column
        ]);

        if ((int) $columnStatement->fetchColumn() === 1) {
            $pass('Coluna presente: ' . $table . '.' . $column . '.');
        } else {
            $fail('Falta a coluna ' . $table . '.' . $column . '.');
        }
    }

    /*
     * Uma diferença de collation entre UUIDs torna alguns JOINs imprevisíveis e
     * impede a criação de FKs. As relações abaixo são também a barreira contra
     * escritas órfãs durante uma eliminação concorrente de conta.
     */
    $criticalRelations = [
        ['fotos_perfil', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['membros_gostos', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['token', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['websocket_tickets', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['aceitacoes_legais', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['preferencias_privacidade', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['preferencias_privacidade_eventos', 'membro_id', 'membros', 'id', 'CASCADE'],
        ['mensagens_chat', 'emissor_id', 'membros', 'id', 'CASCADE'],
        ['mensagens_chat', 'destinatario_id', 'membros', 'id', 'CASCADE'],
        ['notificacao', 'emissor_id', 'membros', 'id', 'CASCADE'],
        ['notificacao', 'destinatario_id', 'membros', 'id', 'CASCADE'],
        ['bloqueados', 'pessoa_bloqueou_id', 'membros', 'id', 'CASCADE'],
        ['bloqueados', 'pessoa_bloqueada_id', 'membros', 'id', 'CASCADE'],
        ['denuncias', 'membro_denuncia', 'membros', 'id', 'SET NULL'],
        ['denuncias', 'membro_denunciado', 'membros', 'id', 'SET NULL'],
        ['moderacao_acoes', 'moderador_id', 'membros', 'id', 'SET NULL'],
        ['moderacao_acoes', 'denuncia_id', 'denuncias', 'id', 'CASCADE']
    ];
    $columnMetadataStatement = $database->prepare(
        'SELECT
            DATA_TYPE AS data_type,
            CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
            CHARACTER_SET_NAME AS character_set_name,
            COLLATION_NAME AS collation_name
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = :table_name
         AND COLUMN_NAME = :column_name
         LIMIT 1'
    );
    $foreignKeyStatement = $database->prepare(
        'SELECT rc.DELETE_RULE
         FROM information_schema.KEY_COLUMN_USAGE AS kcu
         INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS AS rc
             ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
             AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
             AND rc.TABLE_NAME = kcu.TABLE_NAME
         WHERE kcu.TABLE_SCHEMA = DATABASE()
         AND kcu.TABLE_NAME = :child_table
         AND kcu.COLUMN_NAME = :child_column
         AND kcu.REFERENCED_TABLE_NAME = :parent_table
         AND kcu.REFERENCED_COLUMN_NAME = :parent_column
         LIMIT 1'
    );
    $criticalRelationFailures = 0;

    foreach (
        $criticalRelations
        as [$childTable, $childColumn, $parentTable, $parentColumn, $deleteRule]
    ) {
        $relationName = $childTable . '.' . $childColumn .
            ' -> ' . $parentTable . '.' . $parentColumn;
        $columnMetadataStatement->execute([
            'table_name' => $childTable,
            'column_name' => $childColumn
        ]);
        $childMetadata = $columnMetadataStatement->fetch();
        $columnMetadataStatement->execute([
            'table_name' => $parentTable,
            'column_name' => $parentColumn
        ]);
        $parentMetadata = $columnMetadataStatement->fetch();

        if (!is_array($childMetadata) || !is_array($parentMetadata)) {
            $fail('Não foi possível validar a relação crítica ' . $relationName . '.');
            $criticalRelationFailures++;
            continue;
        }

        $collationMatches =
            $childMetadata['data_type'] === $parentMetadata['data_type'] &&
            $childMetadata['character_set_name'] !== null &&
            $childMetadata['collation_name'] !== null &&
            $childMetadata['character_set_name'] === $parentMetadata['character_set_name'] &&
            $childMetadata['collation_name'] === $parentMetadata['collation_name'] &&
            (int) $childMetadata['character_maximum_length'] ===
                (int) $parentMetadata['character_maximum_length'];

        if (!$collationMatches) {
            $fail('Charset, collation ou tamanho incompatível na relação ' . $relationName . '.');
            $criticalRelationFailures++;
        }

        $foreignKeyStatement->execute([
            'child_table' => $childTable,
            'child_column' => $childColumn,
            'parent_table' => $parentTable,
            'parent_column' => $parentColumn
        ]);
        $actualDeleteRule = strtoupper((string) $foreignKeyStatement->fetchColumn());

        if ($actualDeleteRule !== $deleteRule) {
            $fail(
                'Falta a FK ' . $relationName . ' com ON DELETE ' . $deleteRule . '.'
            );
            $criticalRelationFailures++;
        }

        try {
            $orphanCount = (int) $database->query(
                sprintf(
                    'SELECT COUNT(*)
                     FROM `%s` AS child_row
                     LEFT JOIN `%s` AS parent_row
                        ON parent_row.`%s` = child_row.`%s`
                     WHERE child_row.`%s` IS NOT NULL
                     AND parent_row.`%s` IS NULL',
                    $childTable,
                    $parentTable,
                    $parentColumn,
                    $childColumn,
                    $childColumn,
                    $parentColumn
                )
            )->fetchColumn();

            if ($orphanCount !== 0) {
                $fail('Existem registos órfãos na relação ' . $relationName . '.');
                $criticalRelationFailures++;
            }
        } catch (Throwable $joinError) {
            $fail('O JOIN crítico falhou na relação ' . $relationName . '.');
            $criticalRelationFailures++;
        }
    }

    if ($criticalRelationFailures === 0) {
        $pass('Collations, FKs, regras de eliminação e JOINs críticos estão coerentes.');
    }

    $migrationApplied = (bool) $database->runSQL(
        "SELECT 1
         FROM schema_migrations
         WHERE versao = '20260726_security_beta'
         LIMIT 1"
    )->fetchColumn();

    if ($migrationApplied) {
        $pass('Migração 20260726_security_beta registada.');
    } else {
        $fail('A migração 20260726_security_beta não está registada.');
    }

    $legacyLocationTable = (int) $database->runSQL(
        "SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'localizacoes'"
    )->fetchColumn();

    if ($legacyLocationTable === 0) {
        $pass('A tabela antiga de localizações não existe.');
    } else {
        $fail('A tabela antiga localizacoes ainda existe.');
    }

    $legacyMessagesTable = (int) $database->runSQL(
        "SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'mensagens'"
    )->fetchColumn();

    if ($legacyMessagesTable === 0) {
        $pass('A tabela experimental antiga de mensagens não existe.');
    } else {
        $fail(
            'A tabela antiga mensagens ainda existe; não a ignores nem a apagues sem confirmar/exportar o conteúdo.'
        );
    }

    $legacyQuarantineTable = (int) $database->runSQL(
        "SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'mensagens_legadas_quarentena'"
    )->fetchColumn();

    if ($legacyQuarantineTable === 1) {
        $legacyQuarantineRows = (int) $database->runSQL(
            'SELECT COUNT(*) FROM mensagens_legadas_quarentena'
        )->fetchColumn();

        if ($legacyQuarantineRows === 0) {
            $pass('A quarentena da tabela experimental de mensagens está vazia.');
        } else {
            $fail(
                'A quarentena contém ' . $legacyQuarantineRows .
                ' mensagem(ns) legada(s); exporta, reconcilia e elimina-as antes do beta.'
            );
        }
    } else {
        $warn(
            'A tabela mensagens_legadas_quarentena não existe; confirma documentalmente que a tabela antiga já tinha sido removida.'
        );
    }

    foreach (
        [
            'fotos_perfil_orfas_quarentena' =>
                'fotografia(s) órfã(s)',
            'mensagens_chat_orfas_quarentena' =>
                'mensagem(ns) de chat órfã(s)'
        ]
        as $quarantineTable => $quarantineLabel
    ) {
        $quarantineExists = (int) $database->runSQL(
            'SELECT COUNT(*)
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = :table_name',
            ['table_name' => $quarantineTable]
        )->fetchColumn();

        if ($quarantineExists !== 1) {
            $fail('Falta a quarentena de migração ' . $quarantineTable . '.');
            continue;
        }

        $quarantineRows = (int) $database->runSQL(
            'SELECT COUNT(*) FROM `' . $quarantineTable . '`'
        )->fetchColumn();

        if ($quarantineRows === 0) {
            $pass('A quarentena ' . $quarantineTable . ' está vazia.');
        } else {
            $fail(
                'A quarentena ' . $quarantineTable . ' contém ' .
                $quarantineRows . ' ' . $quarantineLabel .
                '; exporta, reconcilia e esvazia-a antes do beta.'
            );
        }
    }

    $activeUnderage = (int) $database->runSQL(
        "SELECT COUNT(*)
         FROM membros
         WHERE estado = 'ativo'
         AND (
             nascimento IS NULL
             OR nascimento > DATE_SUB(UTC_DATE(), INTERVAL 18 YEAR)
         )"
    )->fetchColumn();

    if ($activeUnderage === 0) {
        $pass('Não existem contas ativas com idade inferior a 18 anos.');
    } else {
        $fail('Existem contas ativas sem idade 18+ válida.');
    }

    $plainTokens = (int) $database->runSQL(
        "SELECT COUNT(*)
         FROM token
         WHERE token NOT REGEXP '^[0-9a-f]{64}$'"
    )->fetchColumn();

    if ($plainTokens === 0) {
        $pass('Tokens persistentes têm formato de hash.');
    } else {
        $fail('Ainda existem tokens antigos em claro; revoga-os.');
    }

    $activeModerators = (int) $database->runSQL(
        "SELECT COUNT(DISTINCT id)
         FROM membros
         WHERE estado = 'ativo'
         AND `role` IN ('moderator', 'admin')
         AND nascimento IS NOT NULL
         AND nascimento <= DATE_SUB(UTC_DATE(), INTERVAL 18 YEAR)"
    )->fetchColumn();

    if ($activeModerators >= 2) {
        $pass('Existem pelo menos dois moderadores adultos, ativos e distintos.');
    } else {
        $fail(
            'Configura pelo menos dois membros adultos e ativos com role moderator/admin.'
        );
    }

    $mediaIntegrity = MediaIntegrity::audit($database);
    $mediaIssueCount = MediaIntegrity::issueCount($mediaIntegrity);

    if ($mediaIssueCount === 0) {
        $pass(
            'As ' . (int) $mediaIntegrity['records_checked'] .
            ' referências de media têm ficheiros privados íntegros e metadados coerentes.'
        );
    } else {
        $mediaIssueLabels = [
            'unsafe_profile_names' => 'nomes inseguros em fotografias de perfil',
            'missing_pending_profile_sources' => 'fontes em falta para fotografias pendentes',
            'invalid_pending_profile_sources' => 'fontes inválidas para fotografias pendentes',
            'missing_complete_profile_files' => 'ficheiros em falta para fotografias concluídas',
            'invalid_complete_profile_files' => 'ficheiros inválidos para fotografias concluídas',
            'duplicate_profile_names' => 'nomes duplicados em fotografias de perfil',
            'unsafe_message_media_names' => 'nomes inseguros em anexos de mensagens',
            'missing_message_media_files' => 'anexos de mensagens em falta',
            'invalid_message_media_files' => 'anexos de mensagens inválidos',
            'message_media_metadata_mismatches' => 'metadados incoerentes em anexos de mensagens',
            'duplicate_message_media_names' => 'nomes duplicados em anexos de mensagens',
            'unsafe_report_media_names' => 'nomes inseguros em evidência de denúncias',
            'missing_report_media_files' => 'evidência de denúncias em falta',
            'invalid_report_media_files' => 'evidência de denúncias inválida',
            'report_media_metadata_mismatches' => 'metadados incoerentes em evidência de denúncias',
            'report_media_hash_mismatches' => 'hashes incoerentes em evidência de denúncias',
            'duplicate_report_media_names' => 'nomes duplicados em evidência de denúncias',
            'queued_files_still_referenced' => 'ficheiros ainda usados que estão marcados para eliminação'
        ];

        foreach ($mediaIssueLabels as $key => $label) {
            $count = (int) ($mediaIntegrity[$key] ?? 0);

            if ($count > 0) {
                $fail('Media privada: ' . $count . ' ocorrência(s) — ' . $label . '.');
            }
        }
    }

    $pendingPhotos = (int) ($mediaIntegrity['pending_profile_photos'] ?? 0);

    if ($pendingPhotos === 0) {
        $pass('Não existem fotografias de perfil pendentes de processamento.');
    } else {
        $fail(
            'Existem ' . $pendingPhotos .
            ' fotografia(s) pendente(s); termina o processamento ou marca-as como erro antes do beta.'
        );
    }
} catch (Throwable $error) {
    $fail('A validação da base de dados falhou; consulta o log privado do servidor.');
    error_log('[preflight-beta] ' . $error->getMessage());
}

foreach ($successes as $message) {
    fwrite(STDOUT, '[OK] ' . $message . PHP_EOL);
}

foreach ($warnings as $message) {
    fwrite(STDOUT, '[AVISO] ' . $message . PHP_EOL);
}

foreach ($failures as $message) {
    fwrite(STDERR, '[FALHA] ' . $message . PHP_EOL);
}

if ($failures !== []) {
    fwrite(STDERR, PHP_EOL . 'Pré-voo reprovado: não publiques este ambiente.' . PHP_EOL);
    exit(1);
}

fwrite(STDOUT, PHP_EOL . 'Pré-voo aprovado para a beta, com os avisos acima.' . PHP_EOL);
