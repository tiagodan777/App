<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/classes/CMS/HalloweenHunt.php';

use App\CMS\HalloweenHunt;

$checks = 0;

function huntCheck(bool $condition, string $message): void {
    global $checks;

    if (!$condition) {
        throw new RuntimeException($message);
    }

    $checks++;
}

function huntRejects(callable $action, int $status): void {
    try {
        $action();
    } catch (DomainException $error) {
        huntCheck(
            $error->getCode() === $status,
            'Código de recusa inesperado: ' . $error->getCode()
        );
        return;
    }

    throw new RuntimeException('O pedido devia ter sido recusado.');
}

$dsn = getenv('MARGOT_TEST_DSN')
    ?: getenv('MARGOT_HUNT_TEST_DSN')
    ?: 'sqlite::memory:';

$db = new PDO(
    $dsn,
    getenv('MARGOT_TEST_USER')
        ?: getenv('MARGOT_HUNT_TEST_USER')
        ?: null,
    getenv('MARGOT_TEST_PASSWORD')
        ?: getenv('MARGOT_HUNT_TEST_PASSWORD')
        ?: null,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

$driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);

if ($driver === 'mysql') {
    $database = (string) $db->query('SELECT DATABASE()')->fetchColumn();

    if (!preg_match('/^margot_(?:hunt_)?test_[a-z0-9_]+$/D', $database)) {
        throw new RuntimeException(
            'Este teste exige uma base isolada margot_test_* ou margot_hunt_test_*.'
        );
    }

    $db->exec(
        'CREATE TABLE IF NOT EXISTS membros (
            id char(36) NOT NULL PRIMARY KEY
        ) ENGINE=InnoDB
          DEFAULT CHARSET=utf8mb4
          COLLATE=utf8mb4_general_ci'
    );

    $migration = file_get_contents(
        dirname(__DIR__) . '/database/halloween-hunt.sql'
    );

    if ($migration === false) {
        throw new RuntimeException('Falta a migração de Halloween.');
    }

    $db->exec($migration);
    $db->exec($migration);

    huntCheck(true, 'Migração aplicada duas vezes.');
} elseif ($driver === 'sqlite' && $dsn === 'sqlite::memory:') {
    $db->exec('PRAGMA foreign_keys = ON');

    $db->exec(
        'CREATE TABLE membros (
            id TEXT PRIMARY KEY
        );

        CREATE TABLE halloween_hunt_players (
            campaign_id TEXT NOT NULL,
            membro_id TEXT NOT NULL,
            pumpkins INTEGER NOT NULL DEFAULT 0
                CHECK(pumpkins BETWEEN 0 AND 10),
            bats INTEGER NOT NULL DEFAULT 0
                CHECK(bats BETWEEN 0 AND 10),
            last_round_id TEXT,
            last_round_started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(campaign_id, membro_id),
            FOREIGN KEY(membro_id)
                REFERENCES membros(id) ON DELETE CASCADE
        );

        CREATE TABLE halloween_hunt_rounds (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            membro_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            pumpkin_issued INTEGER NOT NULL,
            bat_issued INTEGER NOT NULL,
            pumpkin_captured_at TEXT,
            bat_captured_at TEXT,
            FOREIGN KEY(campaign_id, membro_id)
                REFERENCES halloween_hunt_players(campaign_id, membro_id)
                ON DELETE CASCADE
        )'
    );
} else {
    throw new RuntimeException('Base de testes não autorizada.');
}

$a = 'aaaaaaaa-aaaa-4aaa-8aaa-' . bin2hex(random_bytes(6));
$b = 'bbbbbbbb-bbbb-4bbb-8bbb-' . bin2hex(random_bytes(6));
$outside = 'cccccccc-cccc-4ccc-8ccc-' . bin2hex(random_bytes(6));

$insert = $db->prepare('INSERT INTO membros (id) VALUES (?)');
$delete = $db->prepare('DELETE FROM membros WHERE id = ?');

$settings = require dirname(__DIR__) . '/config/halloween.php';
$settings['mode'] = 'pilot';
$settings['testers'] = [$a, $b];
$settings['hunt']['pilot_run'] = 'ci-' . bin2hex(random_bytes(6));
$settings['hunt']['pilot_interval_seconds'] = 30;

$now = (int) strtotime('2026-10-29 12:00:00 UTC') * 1000;
$clock = static function () use (&$now): int {
    return $now;
};

try {
    foreach ([$a, $b, $outside] as $member) {
        $insert->execute([$member]);
    }

    $hunt = new HalloweenHunt($db, $settings, $clock);

    $initial = $hunt->state($a);

    huntCheck(
        $initial['counts'] === ['pumpkin' => 0, 'bat' => 0],
        'A conta deve começar a zero.'
    );

    huntCheck(
        (int) $db->query(
            'SELECT COUNT(*) FROM halloween_hunt_players'
        )->fetchColumn() === 0,
        'Consultar o estado não deve criar participantes.'
    );

    huntCheck(
        $hunt->state($outside)['phase'] === 'off',
        'Uma conta fora do piloto não deve participar.'
    );

    for ($i = 1; $i <= 10; $i++) {
        $roundStart = $now;

        $round = $hunt->startRound($a);
        $campaign = $round['campaign_id'];
        $roundId = $round['round']['id'];

        huntCheck(
            $hunt->startRound($a)['round']['id'] === $roundId,
            'Pedidos repetidos não devem criar outra ronda.'
        );

        if ($i === 1) {
            huntRejects(
                fn() => $hunt->capture($b, $campaign, $roundId, 'pumpkin'),
                404
            );

            huntRejects(
                fn() => $hunt->capture($a, $campaign, $roundId, 'bat'),
                409
            );
        }

        $state = $hunt->capture($a, $campaign, $roundId, 'pumpkin');

        huntCheck(
            $state['counts']['pumpkin'] === $i,
            'A abóbora deve ser contada uma única vez.'
        );

        $repeated = $hunt->capture(
            $a,
            $campaign,
            $roundId,
            'pumpkin'
        );

        huntCheck(
            $repeated['counts']['pumpkin'] === $i,
            'Repetir a captura não pode duplicar pontos.'
        );

        $now = $roundStart + 14000;

        $state = $hunt->capture($a, $campaign, $roundId, 'bat');

        huntCheck(
            $state['counts']['bat'] === $i,
            'O morcego deve ser guardado.'
        );

        $now = $roundStart + 30000;
    }

    $reopened = new HalloweenHunt($db, $settings, $clock);
    $saved = $reopened->state($a);

    huntCheck(
        $saved['counts'] === ['pumpkin' => 10, 'bat' => 10],
        'O progresso deve sobreviver à criação de outro cliente.'
    );

    huntCheck(
        $saved['completed_at'] !== null,
        'A conclusão deve ter uma data guardada no servidor.'
    );

    huntCheck(
        $reopened->state($b)['counts'] === ['pumpkin' => 0, 'bat' => 0],
        'Outra conta não pode herdar o progresso.'
    );

    $settings['hunt']['pilot_run'] .= '-next';
    $nextCampaign = new HalloweenHunt($db, $settings, $clock);

    huntCheck(
        $nextCampaign->state($a)['counts'] === ['pumpkin' => 0, 'bat' => 0],
        'Uma campanha nova deve começar a zero.'
    );

    huntCheck(
        $reopened->state($a)['completed_at'] === $saved['completed_at'],
        'A conclusão da campanha anterior deve ficar preservada.'
    );

    echo "PASS: $checks verificações de capturas e progresso ($driver).\n";
} finally {
    foreach ([$a, $b, $outside] as $member) {
        $delete->execute([$member]);
    }
}