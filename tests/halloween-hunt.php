<?php
declare(strict_types=1);

// SQLite em memória por omissão. Para testar a migração e o SQL reais:
// MARGOT_TEST_DSN='mysql:unix_socket=...;dbname=margot_test_halloween'
// MARGOT_TEST_USER=... MARGOT_TEST_PASSWORD=... php tests/halloween-hunt.php
// Também aceita MARGOT_HUNT_TEST_*; apenas bases margot_test_* ou margot_hunt_test_*.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/src/classes/CMS/HalloweenHunt.php';

use App\CMS\HalloweenHunt;

$checks = 0;
function huntCheck(bool $condition, string $message): void {
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function huntRejects(callable $call, string $class, int $code, string $message): void {
    try {
        $call();
    } catch (Throwable $error) {
        huntCheck($error instanceof $class && ($code === 0 || $error->getCode() === $code),
            $message . ': ' . get_class($error) . '/' . $error->getCode());
        return;
    }
    throw new RuntimeException($message . ': unexpectedly accepted');
}
function huntCount(PDO $db, string $table): int {
    return (int) $db->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
}

$dsn = getenv('MARGOT_TEST_DSN') ?: getenv('MARGOT_HUNT_TEST_DSN') ?: 'sqlite::memory:';
$db = new PDO($dsn, getenv('MARGOT_TEST_USER') ?: getenv('MARGOT_HUNT_TEST_USER') ?: null,
    getenv('MARGOT_TEST_PASSWORD') ?: getenv('MARGOT_HUNT_TEST_PASSWORD') ?: null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
$mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
if ($mysql) {
    $database = (string) $db->query('SELECT DATABASE()')->fetchColumn();
    if (!preg_match('/^margot_(?:hunt_)?test_[a-z0-9_]+$/D', $database)) {
        throw new RuntimeException('Usa uma base isolada com o prefixo margot_test_ ou margot_hunt_test_.');
    }
    $db->exec('CREATE TABLE IF NOT EXISTS membros (
        id char(36) NOT NULL PRIMARY KEY
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci');
    $migration = file_get_contents(dirname(__DIR__) . '/database/halloween-hunt.sql');
    $db->exec($migration);
    $db->exec($migration);
    huntCheck(true, 'Migration can be applied twice in MariaDB');
} else {
    huntCheck($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite', 'Supported test driver');
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec('CREATE TABLE membros (id TEXT PRIMARY KEY);
        CREATE TABLE halloween_hunt_players (
            campaign_id TEXT NOT NULL, membro_id TEXT NOT NULL,
            pumpkins INTEGER NOT NULL DEFAULT 0 CHECK(pumpkins BETWEEN 0 AND 10),
            bats INTEGER NOT NULL DEFAULT 0 CHECK(bats BETWEEN 0 AND 10),
            last_round_id TEXT, last_round_started_at TEXT, completed_at TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY(campaign_id, membro_id),
            FOREIGN KEY(membro_id) REFERENCES membros(id) ON DELETE CASCADE
        );
        CREATE TABLE halloween_hunt_rounds (
            id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, membro_id TEXT NOT NULL,
            started_at TEXT NOT NULL, pumpkin_issued INTEGER NOT NULL, bat_issued INTEGER NOT NULL,
            pumpkin_captured_at TEXT, bat_captured_at TEXT,
            FOREIGN KEY(campaign_id, membro_id)
                REFERENCES halloween_hunt_players(campaign_id, membro_id) ON DELETE CASCADE
        )');
}

$a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
$outside = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
$members = [$a, $b, $outside];
$delete = $db->prepare('DELETE FROM membros WHERE id = ?');
$insert = $db->prepare('INSERT INTO membros (id) VALUES (?)');
foreach ($members as $member) {
    $delete->execute([$member]);
    $insert->execute([$member]);
}
$settings = require dirname(__DIR__) . '/config/halloween.php';
$settings['mode'] = 'pilot';
$settings['testers'] = [$a, $b];
$settings['hunt']['pilot_interval_seconds'] = 30;
$settings['hunt']['pilot_run'] = 'test-1';
$settings['hunt']['public_interval_seconds'] = 300;
$now = (int) strtotime('2026-10-29 12:00:00 UTC') * 1000;
$clock = static function () use (&$now): int { return $now; };
$hunt = new HalloweenHunt($db, $settings, $clock);

try {
    $state = $hunt->state($a);
    $state = $hunt->state($a);