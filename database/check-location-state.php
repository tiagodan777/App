<?php
declare(strict_types=1);

// Preflight de publicação: só lê metadados. Não executa migrações nem bootstrap.
// Pode correr a partir de /tmp, apontando APP_ROOT para a instalação existente.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0');
try {
    $root = realpath(getenv('APP_ROOT') ?: dirname(__DIR__));
    if ($root === false || !is_dir($root . '/config')) throw new RuntimeException('Raiz inválida.');
    $config = is_file($root . '/config/config.local.php')
        ? $root . '/config/config.local.php' : $root . '/config/config.php';
    if (!is_file($config)) throw new RuntimeException('Configuração indisponível.');
    if (!defined('APP_ROOT')) define('APP_ROOT', $root);
    [$dsn, $username, $password] = (static function (string $path): array {
        require $path;
        if (!isset($dsn, $username, $password)) throw new RuntimeException('Configuração incompleta.');
        return [$dsn, $username, $password];
    })($config);
    if (!str_starts_with($dsn, 'mysql:')) throw new RuntimeException('Driver inesperado.');
    $connection = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
    unset($dsn, $username, $password);
    $columns = $connection->query("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE,
            IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH, COLLATION_NAME
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
          AND ((TABLE_NAME = 'localizacao_membro' AND COLUMN_NAME = 'estado_versao')
            OR (TABLE_NAME = 'token' AND COLUMN_NAME = 'sessao_hash'))")->fetchAll();
    $actual = [];
    foreach ($columns as $column) $actual[$column['TABLE_NAME'] . '.' . $column['COLUMN_NAME']] = $column;
    $revision = $actual['localizacao_membro.estado_versao'] ?? [];
    $session = $actual['token.sessao_hash'] ?? [];
    $validRevision = preg_match('/^bigint(?:\(\d+\))? unsigned$/D', $revision['COLUMN_TYPE'] ?? '')
        && ($revision['IS_NULLABLE'] ?? '') === 'NO' && (string) ($revision['COLUMN_DEFAULT'] ?? '') === '0';
    $validSession = ($session['COLUMN_TYPE'] ?? '') === 'char(64)'
        && ($session['IS_NULLABLE'] ?? '') === 'YES' && ($session['COLLATION_NAME'] ?? '') === 'ascii_bin';
    if (!$validRevision || !$validSession) {
        fwrite(STDERR, "PUBLICAÇÃO BLOQUEADA: schema de localização incompleto ou incompatível.\n"
            . "Rever e aplicar database/location-state-v2.sql antes de voltar a publicar.\n");
        exit(1);
    }
    echo "OK: colunas de estado e sessão compatíveis; nenhuma alteração SQL executada.\n";
} catch (Throwable $error) {
    // Não imprimir exceções PDO: podem conter host, utilizador ou outras credenciais.
    fwrite(STDERR, "PUBLICAÇÃO BLOQUEADA: não foi possível verificar o schema de localização.\n");
    exit(1);
}