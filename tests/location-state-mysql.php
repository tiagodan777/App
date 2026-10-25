<?php
declare(strict_types=1);

// Só usa uma base de testes explicitamente indicada. Nunca carrega config/config.php.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/vendor/autoload.php';
$dsn = getenv('MARGOT_TEST_DSN') ?: '';
if (!str_starts_with($dsn, 'mysql:')) throw new RuntimeException('Define MARGOT_TEST_DSN para MySQL local isolado.');
$db = new App\CMS\Database($dsn, getenv('MARGOT_TEST_USER') ?: '', getenv('MARGOT_TEST_PASSWORD') ?: '');
$database = (string) $db->query('SELECT DATABASE()')->fetchColumn();
if (!preg_match('/^margot_test_[a-z0-9_]+$/D', $database)) {
    throw new RuntimeException('Recusado: a base tem de ter nome margot_test_*.');
}
$db->exec("CREATE TEMPORARY TABLE localizacao_membro (
    membro_id CHAR(36) PRIMARY KEY, latitude DECIMAL(10,7), longitude DECIMAL(10,7),
    precisao_m DECIMAL(10,2), localizacao_ativa TINYINT NOT NULL DEFAULT 0,
    visivel TINYINT NOT NULL DEFAULT 0,
    origem VARCHAR(16) NOT NULL DEFAULT 'foreground', atualizada_em DATETIME(3) NOT NULL,
    capturada_em DATETIME(3), recebida_em DATETIME(3)
) ENGINE=InnoDB");
$db->exec("CREATE TEMPORARY TABLE token (
    id INT AUTO_INCREMENT PRIMARY KEY, token CHAR(64) NOT NULL UNIQUE,
    membro_id CHAR(36) NOT NULL, validade DATETIME NOT NULL, proposito VARCHAR(32) NOT NULL
) ENGINE=InnoDB");
$checks = 0;
$check = static function (bool $condition, string $name) use (&$checks): void {
    if (!$condition) throw new RuntimeException('FAIL: ' . $name);
    $checks++;
    echo 'PASS: ' . $name . PHP_EOL;
};
try {
    // Aplica o ficheiro exato da migração sobre tabelas temporárias anteriores à versão.
    // Não usa schema.sql (snapshot histórico incompleto), configuração ou dados reais.
    $migration = preg_replace('/^\s*--[^\n]*$/m', '',
        file_get_contents(dirname(__DIR__) . '/database/location-state-v2.sql'));
    foreach (explode(';', $migration) as $statement) {
        if (trim($statement) !== '') $db->exec($statement);
    }
    $revisionColumn = $db->query("SHOW COLUMNS FROM localizacao_membro LIKE 'estado_versao'")->fetch();
    $sessionColumn = $db->query("SHOW FULL COLUMNS FROM token LIKE 'sessao_hash'")->fetch();
    $check($revisionColumn && $revisionColumn['Null'] === 'NO' && (string) $revisionColumn['Default'] === '0',
        'migration adds non-null default revision');
    $check($sessionColumn && $sessionColumn['Type'] === 'char(64)' && $sessionColumn['Collation'] === 'ascii_bin',
        'migration adds exact session hash column');
    $member = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    $location = new App\CMS\Location($db);
    $tokens = new App\CMS\Token($db);
    $first = $tokens->create($member, 'background_location');
    $second = $tokens->create($member, 'background_location');
    $sample = ['location_policy_version' => 1, 'latitude' => 38, 'longitude' => -9,
        'accuracy' => 5, 'timestamp' => floor((microtime(true) - 30) * 1000)];
    $check(!$location->saveLocationPush($member, $first, $sample), 'inactive sample rejected');
    $check($location->setState($member, 0, true, true), 'consent without websocket');
    $check($location->saveLocationPush($member, $first, $sample), 'sample accepted');
    $check(!$location->saveLocationPush($member, $first, $sample), 'duplicate not freshened');
    $check($location->setState($member, 1, true, false), 'hide accepted');
    $check($location->setState($member, 2, true, true), 'show accepted');
    $check(!$location->setState($member, 1, true, false), 'late hide rejected');
    $sample['timestamp'] += 1;
    $check($location->saveLocationPush($member, $first, $sample), 'millisecond ordering preserved');
    $location->revokeBackgroundGrant($member, $first);
    $check($tokens->getMemberId($second, 'background_location') === $member, 'other installation survives logout');
    $location->revokeBackgroundGrant($member, $second);
    $check($location->state($member)['active'], 'logout preserves preference');
    $check($db->query('SELECT YEAR(atualizada_em) FROM localizacao_membro')->fetchColumn() == 1970, 'last logout expires presence');
    $check($location->setState($member, 3, false, false), 'explicit off');
    $before = $db->query('SELECT * FROM localizacao_membro')->fetch();
    $check(!$location->saveBackground($member, 40, -20, 10, true, true, null, 'foreground'), 'legacy GPS cannot reactivate');
    $check($before === $db->query('SELECT * FROM localizacao_membro')->fetch(), 'legacy GPS cannot alter disabled row');
    $group = str_repeat('c', 64);
    $old = $tokens->create($member, 'background_location', 86400, $group);
    $rotated = $tokens->create($member, 'background_location', 86400, $group);
    $otherSession = $tokens->create($member, 'background_location', 86400, str_repeat('d', 64));
    $location->revokeBackgroundGrant($member, $old);
    $check($tokens->getMemberId($rotated, 'background_location') === $member, 'old native stop preserves rotated grant');
    $legacy = $tokens->create($member, 'background_location', 86400);
    $tokens->bindBackgroundSession($legacy, $member, $group);
    $location->revokeBackgroundGrant($member, $rotated, $group);
    $check($tokens->getMemberId($legacy, 'background_location') === false, 'session logout revokes all own rotations');
    $check($tokens->getMemberId($otherSession, 'background_location') === $member, 'session logout preserves other group');
    $revision = $location->state($member)['revision'];
    $check($location->setState($member, $revision, true, true), 'prepare mixed-version state');
    $before = $db->query('SELECT * FROM localizacao_membro')->fetch();
    $location->hideFromLegacyClient($member);
    $after = $db->query('SELECT * FROM localizacao_membro')->fetch();
    $check($location->state($member) === ['active' => true, 'visible' => false, 'revision' => $revision + 2],
        'legacy HTTP hide works after migration');
    $check($before['capturada_em'] === $after['capturada_em'] && $before['atualizada_em'] === $after['atualizada_em']
        && $before['recebida_em'] === $after['recebida_em'], 'legacy hide does not freshen sample');
    $location->hideFromLegacyClient($member);
    $check($after === $db->query('SELECT * FROM localizacao_membro')->fetch(), 'legacy hide is idempotent');
    $check(!$location->setState($member, $revision + 1, true, true), 'pending show cannot undo intervening hide');
    $check($location->setState($member, $revision + 2, true, true), 'current explicit show still works');
    $location->setState($member, $revision + 3, false, false);
    $before = $db->query('SELECT * FROM localizacao_membro')->fetch();
    $location->hideFromLegacyClient($member);
    $check($before === $db->query('SELECT * FROM localizacao_membro')->fetch(), 'legacy hide cannot enable collection');
    $db->exec('UPDATE localizacao_membro SET estado_versao=0, localizacao_ativa=1, visivel=1');
    $location->hideFromLegacyClient($member);
    $check($location->state($member)['revision'] === 0 && !$location->state($member)['visible'], 'legacy account stays legacy');
    $location->saveBackground($member, 38, -9, 5, true, true, null, 'foreground');
    $check($location->state($member)['visible'], 'legacy account can show again');
    echo "OK: $checks verificações em MySQL/MariaDB isolado.\n";
} finally {
    $db->exec('DROP TEMPORARY TABLE token');
    $db->exec('DROP TEMPORARY TABLE localizacao_membro');
}
