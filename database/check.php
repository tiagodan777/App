<?php
declare(strict_types=1);

// Confere tabelas e colunas; não cria nem modifica a base de dados.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
require is_file($root . '/config/config.local.php') ? $root . '/config/config.local.php' : $root . '/config/config.php';
$db = new App\CMS\Database($dsn, $username, $password);
unset($dsn, $username, $password);
$columns = $db->runSQL('SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()')->fetchAll();
$actual = [];
foreach ($columns as $column) {
    $actual[$column['TABLE_NAME']][$column['COLUMN_NAME']] = true;
}
$schema = file_get_contents(__DIR__ . '/schema.sql');
preg_match_all('/CREATE TABLE `([^`]+)` \((.*?)\) ENGINE=/s', $schema, $tables, PREG_SET_ORDER);
if ($tables === []) {
    throw new RuntimeException('Não foi possível ler database/schema.sql.');
}
$missing = [];
foreach ($tables as $table) {
    if (!isset($actual[$table[1]])) {
        $missing[] = 'Tabela: ' . $table[1];
        continue;
    }
    preg_match_all('/^\s*`([^`]+)` /m', $table[2], $fields);
    foreach ($fields[1] as $field) {
        if (!isset($actual[$table[1]][$field])) {
            $missing[] = 'Coluna: ' . $table[1] . '.' . $field;
        }
    }
}
if ($missing !== []) {
    fwrite(STDERR, "Estrutura incompleta:\n" . implode("\n", $missing) . "\n");
    exit(1);
}
echo 'OK: ' . count($tables) . " tabelas e respetivas colunas encontradas. Tipos, índices e dados não são verificados.\n";
