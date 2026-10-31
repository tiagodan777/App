<?php
declare(strict_types=1);

if (
    PHP_SAPI !== 'cli' ||
    getenv('GITHUB_ACTIONS') !== 'true'
) {
    throw new RuntimeException('Teste exclusivo do CI isolado.');
}

require_once __DIR__ . '/../src/classes/CMS/HalloweenWaves.php';

$dsn = getenv('MARGOT_TEST_DSN') ?: '';

$db = new PDO(
    $dsn,
    getenv('MARGOT_TEST_USER'),
    getenv('MARGOT_TEST_PASSWORD'),
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

if (
    $db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql' ||
    $db->query('SELECT DATABASE()')->fetchColumn() !== 'margot_test_ci'
) {
    throw new RuntimeException('Base não autorizada.');
}

$settings = require __DIR__ . '/../config/halloween.php';

if (($argv[1] ?? '') === '--capture') {
    $job = json_decode(
        $argv[2],
        true,
        32,
        JSON_THROW_ON_ERROR
    );

    $settings = $job['settings'];
    $now = $job['now'];

    $hunt = new App\CMS\HalloweenWaves(
        $db,
        $settings,
        static fn() => $now
    );

    while (microtime(true) < $job['barrier']) {
        usleep(1000);
    }

    try {
        $hunt->capture(
            $job['member'],
            $job['campaign'],
            $job['wave'],
            $job['kind'],
            $job['object']
        );

        exit(0);
    } catch (DomainException $e) {
        if ($e->getCode() === 409) exit(2);
        throw $e;
    }
}

foreach (['primeiro_nome', 'ultimo_nome'] as $column) {
    $q = $db->prepare(
        'SELECT COUNT(*)
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE()
           AND TABLE_NAME=?
           AND COLUMN_NAME=?'
    );

    $q->execute(['membros', $column]);

    if (!(int) $q->fetchColumn()) {
        $db->exec(
            'ALTER TABLE membros ADD COLUMN '
            . $column . ' varchar(60) NULL'
        );
    }
}

foreach ([
    'halloween-hunt.sql',
    'halloween-hunt-extras.sql',
    'halloween-waves.sql',
] as $file) {
    $sql = file_get_contents(__DIR__ . '/../database/' . $file);
    $db->exec($sql);
    $db->exec($sql);
}

$settings['mode'] = 'pilot';
$settings['hunt']['pilot_run'] = 'ci-' . bin2hex(random_bytes(6));

$members = [
    'aaaaaaaa-aaaa-4aaa-8aaa-' . bin2hex(random_bytes(6)),
    'bbbbbbbb-bbbb-4bbb-8bbb-' . bin2hex(random_bytes(6)),
];

$settings['testers'] = $members;

$cal = App\CMS\HalloweenCalendar::build($settings);
$campaign = $cal['campaign_id'];
$wave = $cal['waves'][0];
$obj = $wave['objects'][0];
$now = $obj['opens_at_ms'] + 100;
$workers = [];

try {
    foreach ($members as $id) {
        $db->prepare(
            'INSERT INTO membros(id,primeiro_nome,ultimo_nome)
             VALUES(?,?,?)'
        )->execute([$id, 'CI', 'Halloween']);
    }

    $hunt = new App\CMS\HalloweenWaves(
        $db,
        $settings,
        static fn() => $now
    );

    foreach ($members as $id) {
        $hunt->startRound($id, $campaign);

        $db->prepare(
            'UPDATE halloween_hunt_players
             SET pumpkins=9,bats=10
             WHERE campaign_id=? AND membro_id=?'
        )->execute([$campaign, $id]);
    }

    $barrier = microtime(true) + 1.5;

    foreach ($members as $id) {
        $job = [
            'settings' => $settings,
            'now' => $now,
            'barrier' => $barrier,
            'member' => $id,
            'campaign' => $campaign,
            'wave' => $wave['id'],
            'kind' => $obj['kind'],
            'object' => $obj['id'],
        ];

        $pipes = [];

        $process = proc_open(
            [
                PHP_BINARY,
                __FILE__,
                '--capture',
                json_encode($job, JSON_THROW_ON_ERROR),
            ],
            [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ],
            $pipes
        );

        if (!is_resource($process)) {
            throw new RuntimeException(
                'Falha ao criar cliente concorrente.'
            );
        }

        fclose($pipes[0]);
        $workers[] = [$process, $pipes];
    }

    $codes = [];

    foreach ($workers as [$process, $pipes]) {
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);

        fclose($pipes[1]);
        fclose($pipes[2]);

        $codes[] = proc_close($process);

        if ($err !== '') {
            throw new RuntimeException($err);
        }
    }

    $workers = [];
    sort($codes);

    if ($codes !== [0, 2]) {
        throw new RuntimeException(
            'Corrida inesperada: ' . json_encode($codes)
        );
    }

    $q = $db->prepare(
        'SELECT COUNT(*)
         FROM halloween_hunt_players
         WHERE campaign_id=? AND completed_at IS NOT NULL'
    );
    $q->execute([$campaign]);

    if ((int) $q->fetchColumn() !== 1) {
        throw new RuntimeException('Mais de um vencedor.');
    }

    $q = $db->prepare(
        'SELECT membro_id
         FROM halloween_hunt_awards
         WHERE campaign_id=?'
    );
    $q->execute([$campaign]);
    $winner = $q->fetchColumn();

    if (!in_array($winner, $members, true)) {
        throw new RuntimeException('Vencedor não registado.');
    }

    $s = $hunt->capture(
        $winner,
        $campaign,
        $wave['id'],
        $obj['kind'],
        $obj['id']
    );

    if ($s['counts'] !== ['pumpkin' => 10, 'bat' => 10]) {
        throw new RuntimeException(
            'Captura duplicada alterou contagem.'
        );
    }

    echo "PASS: migrações repetidas, dois clientes concorrentes, "
        . "um vencedor e captura idempotente em MySQL/MariaDB.\n";
} finally {
    foreach ($workers as [$process, $pipes]) {
        if (is_resource($process)) {
            proc_terminate($process);
            proc_close($process);
        }
    }

    $db->prepare(
        'DELETE FROM halloween_hunt_awards WHERE campaign_id=?'
    )->execute([$campaign]);

    foreach ($members as $id) {
        $db->prepare(
            'DELETE FROM membros WHERE id=?'
        )->execute([$id]);
    }
}