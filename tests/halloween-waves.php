<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/classes/CMS/HalloweenWaves.php';

use App\CMS\HalloweenCalendar;
use App\CMS\HalloweenWaves;

$n = 0;

function check(bool $yes, string $label): void {
    global $n;
    $n++;
    if (!$yes) throw new RuntimeException($label);
}

function fails(callable $fn, int $code): void {
    try {
        $fn();
    } catch (DomainException $e) {
        check(
            $e->getCode() === $code,
            'wrong rejection ' . $e->getMessage()
        );
        return;
    }

    throw new RuntimeException('request was accepted');
}

$a = 'bcad0cb1-9cec-11f1-9863-42010a840002';
$b = '2eca97ae-a46c-11f1-9863-42010a840002';
$c = '3ccf53b0-a46f-11f1-9863-42010a840002';

$settings = require __DIR__ . '/../config/halloween.php';
$settings['mode'] = 'public';
$settings['hunt']['announcements_enabled'] = true;
$settings['hunt']['automatic_announcements_enabled'] = true;

$cal = HalloweenCalendar::build($settings);
$start = $cal['starts_at_ms'];
$end = $cal['ends_at_ms'];

check(
    $start === strtotime('2026-10-31 23:00:00 UTC') * 1000,
    'Azores start'
);
check(
    $end === strtotime('2026-11-01 04:30:00 UTC') * 1000,
    'Azores end'
);

$before = ['pumpkin' => 0, 'bat' => 0];
$all = $before;
$tiers = [0, 0, 0, 0];
$ids = [];
$triples = 0;
$pairs = 0;
$max = 0;

foreach ($cal['waves'] as $wave) {
    $events = [];

    foreach ($wave['objects'] as $o) {
        check(!isset($ids[$o['id']]), 'unique object');
        $ids[$o['id']] = true;

        check(
            $o['opens_at_ms'] >= $start &&
            $o['expires_at_ms'] <= $end,
            'window in campaign'
        );

        $all[$o['kind']]++;
        $tiers[$o['difficulty']]++;

        if ($o['opens_at_ms'] < $start + 81 * 60000) {
            $before[$o['kind']]++;
        }

        $events[$o['opens_at_ms']] =
            ($events[$o['opens_at_ms']] ?? 0) + 1;
    }

    foreach ($events as $cnt) {
        $max = max($max, $cnt);
        if ($cnt === 3) $triples++;
        if ($cnt === 2) $pairs++;
    }
}

check(
    $before === ['pumpkin' => 10, 'bat' => 9],
    '19 opportunities before 23:21'
);
check(
    $all['pumpkin'] >= 20 && $all['bat'] >= 20,
    'double opportunities'
);
check(
    $triples === 1 && $max === 3 && $pairs > 1,
    'one trio plus occasional pairs'
);
check(min($tiers) > 0, 'four difficulties');

check(count($cal['notices']) === 7, 'seven public reminders');
foreach ($cal['notices'] as $notice) {
    check($notice['wave_at_ms'] - $notice['notify_at_ms'] === 60000, 'one minute warning');
    check(in_array($notice['wave_at_ms'], array_column($cal['waves'], 'started_at_ms'), true), 'notice linked to real wave');
    check($notice['notify_at_ms'] < $start + 180 * 60000, 'all notices before 01:00');
}

echo 'PUBLIC CALENDAR ' . json_encode([
    'waves' => count($cal['waves']),
    'objects' => $all,
    'before_2321' => $before,
    'tiers' => $tiers,
    'trios' => $triples,
    'pairs' => $pairs,
]) . "\n";

check(
    $cal === HalloweenCalendar::build($settings),
    'deterministic calendar'
);

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$db->exec("
PRAGMA foreign_keys=ON;

CREATE TABLE halloween_hunt_commands(
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    kind TEXT,
    payload TEXT,
    created_at_ms INTEGER,
    starts_at_ms INTEGER,
    expires_at_ms INTEGER
);

CREATE TABLE membros(
    id TEXT PRIMARY KEY,
    primeiro_nome TEXT,
    ultimo_nome TEXT
);

CREATE TABLE halloween_hunt_players(
    campaign_id TEXT,
    membro_id TEXT,
    pumpkins INTEGER NOT NULL DEFAULT 0 CHECK(pumpkins<=10),
    bats INTEGER NOT NULL DEFAULT 0 CHECK(bats<=10),
    created_at TEXT,
    updated_at TEXT,
    completed_at TEXT,
    PRIMARY KEY(campaign_id,membro_id)
);

CREATE TABLE halloween_hunt_awards(
    campaign_id TEXT PRIMARY KEY,
    membro_id TEXT,
    winner_name TEXT,
    completed_at TEXT,
    email_state TEXT DEFAULT 'pending'
);

CREATE TABLE halloween_hunt_wave_captures(
    campaign_id TEXT,
    membro_id TEXT,
    wave_id TEXT,
    object_id TEXT,
    issued_at TEXT,
    captured_at TEXT,
    PRIMARY KEY(campaign_id,membro_id,object_id),
    FOREIGN KEY(campaign_id,membro_id)
        REFERENCES halloween_hunt_players(campaign_id,membro_id)
);
");

$q = $db->prepare('INSERT INTO membros VALUES(?,?,?)');

foreach ([$a, $b, $c] as $id) {
    $q->execute([$id, 'Test', 'Member']);
}

$now = $start - 1;
$clock = static function () use (&$now) {
    return $now;
};

$hunt = new HalloweenWaves($db, $settings, $clock);
$campaign = $cal['campaign_id'];

check($hunt->state($a)['phase'] === 'scheduled', 'before start');
check(
    $hunt->startRound($a, $campaign)['round'] === null,
    'no early issue'
);

$now = $start;
$first = $cal['waves'][0];
$o = $first['objects'][0];

fails(
    fn() => $hunt->capture(
        $a, $campaign, $first['id'], $o['kind'], $o['id']
    ),
    403
);

$s = $hunt->startRound($a, $campaign);

check(count($s['round']['objects']) === 3, 'all wave objects issued');

check(
    $s['round'] === $hunt->startRound($b, $campaign)['round'],
    'same schedule for both accounts'
);

check(
    $hunt->startRound($a, $campaign)['round'] === $s['round'],
    'reopening idempotent'
);

$future = $first['objects'][1];

fails(
    fn() => $hunt->capture(
        $a, $campaign, $first['id'], $future['kind'], $future['id']
    ),
    409
);

fails(
    fn() => $hunt->capture(
        $a, 'wrong', $first['id'], $o['kind'], $o['id']
    ),
    409
);

fails(
    fn() => $hunt->capture(
        $a, $campaign, $first['id'], 'ghost', $o['id']
    ),
    422
);

fails(
    fn() => $hunt->capture(
        $c, $campaign, $first['id'], $o['kind'], $o['id']
    ),
    403
);

$s = $hunt->capture(
    $a, $campaign, $first['id'], $o['kind'], $o['id']
);

check($s['counts']['pumpkin'] === 1, 'capture counts');

check(
    $hunt->capture(
        $a, $campaign, $first['id'], $o['kind'], $o['id']
    )['counts'] === $s['counts'],
    'duplicate no extra'
);

check(
    $hunt->state($b)['counts']['pumpkin'] === 0,
    'other account untouched'
);

$winAt = null;

foreach ($cal['waves'] as $wave) {
    $now = $wave['started_at_ms'];
    $hunt->startRound($a, $campaign);
    $hunt->startRound($b, $campaign);

    foreach ($wave['objects'] as $obj) {
        $now = $obj['opens_at_ms'] + 100;

        foreach ([$a, $b] as $member) {
            $s = $hunt->state($member);

            if ($s['counts'][$obj['kind']] >= 10) continue;

            if ($winAt !== null) {
                fails(
                    fn() => $hunt->capture(
                        $member,
                        $campaign,
                        $wave['id'],
                        $obj['kind'],
                        $obj['id']
                    ),
                    409
                );
                break 3;
            }

            $s = $hunt->capture(
                $member,
                $campaign,
                $wave['id'],
                $obj['kind'],
                $obj['id']
            );

            if ($s['winner']) {
                $winAt = $now;
                check($member === $a, 'first wins');
            }
        }
    }
}

check(
    $winAt === $start + 81 * 60000 + 100,
    'first possible win 23:21'
);

check($hunt->state($b)['phase'] === 'ended', 'global end');
check(
    $hunt->state($b)['winner']['is_you'] === false,
    'winner identity'
);

check(
    (int) $db->query(
        'SELECT COUNT(*) FROM halloween_hunt_players
         WHERE completed_at IS NOT NULL'
    )->fetchColumn() === 1,
    'only one completion'
);

check(
    $db->query(
        'SELECT email_state FROM halloween_hunt_awards'
    )->fetchColumn() === 'pending',
    'mail ready'
);

$now = $end;
check($hunt->state($a)['phase'] === 'ended', 'end boundary');

$settings['mode'] = 'pilot';
$settings['testers'] = [$a];
$settings['hunt']['automatic_announcements_enabled'] = false;
$pilot = HalloweenCalendar::build($settings);
$now = $pilot['starts_at_ms'];

$h = new HalloweenWaves($db, $settings, $clock);
$pc = $pilot['campaign_id'];

check(
    $h->state($a)['counts'] === ['pumpkin' => 0, 'bat' => 0],
    'pilot reset'
);
check($h->state($b)['phase'] === 'off', 'pilot allowlist');
check(
    $h->startRound($b, $pc)['phase'] === 'off',
    'unauthorized round'
);

$w = $pilot['waves'][0];
$o = $w['objects'][0];
$h->startRound($a, $pc);
$now = $o['expires_at_ms'];

fails(
    fn() => $h->capture($a, $pc, $w['id'], $o['kind'], $o['id']),
    410
);

$settings['hunt']['pilot_run'] .= '-next';
$fresh = new HalloweenWaves($db, $settings, $clock);

fails(fn() => $fresh->startRound($a, $pc), 409);

check(
    $fresh->state($a)['counts'] === ['pumpkin' => 0, 'bat' => 0],
    'new pilot run resets without deletion'
);

check(
    $hunt->state($a)['counts'] === ['pumpkin' => 10, 'bat' => 10],
    'public remains intact'
);

$settings['mode'] = 'off';

check(
    (new HalloweenWaves($db, $settings, $clock))
        ->state($a)['phase'] === 'off',
    'disabled'
);

check(!$db->inTransaction(), 'all errors rollback');

echo "PASS $n calendar/capture checks "
    . "(SQLite; no real parallel database transactions).\n";

require_once __DIR__ . '/../src/classes/CMS/HalloweenControl.php';
require_once __DIR__ . '/../src/classes/CMS/HalloweenAnnouncements.php';

use App\CMS\HalloweenControl;
use App\CMS\HalloweenAnnouncements;

$settings['mode'] = 'pilot';
$settings['hunt']['pilot_run'] = 'control-test';
$settings['testers'] = [$a];
$settings['hunt']['automatic_announcements_enabled'] = false;

$cal = HalloweenCalendar::build($settings);
$pc = $cal['campaign_id'];
$now = $cal['starts_at_ms'] + 60000;

$control = new HalloweenControl($db, $settings);

$input = [
    'campaign_id' => $pc,
    'request_id' => str_repeat('c', 32),
    'action' => 'wave',
    'pumpkins' => 2,
    'bats' => 1,
];

fails(fn() => $control->submit($b, $input, $now), 403);

fails(
    fn() => $control->submit(
        $a,
        array_replace($input, ['pumpkins' => 3, 'bats' => 1]),
        $now
    ),
    422
);

fails(
    fn() => $control->submit(
        $a,
        array_replace($input, ['request_id' => 'bad']),
        $now
    ),
    422
);

fails(
    fn() => $control->submit(
        $a,
        array_replace($input, ['campaign_id' => 'old']),
        $now
    ),
    409
);

$r = $control->submit($a, $input, $now);

check(
    $r['starts_at_ms'] === $now + 20000,
    'manual shared future time'
);

check(
    $control->submit($a, $input, $now)['duplicate'],
    'double click idempotent'
);

check(
    (int) $db->query(
        'SELECT COUNT(*) FROM halloween_hunt_commands'
    )->fetchColumn() === 1,
    'single command'
);

fails(
    fn() => $control->submit(
        $a,
        array_replace($input, ['request_id' => str_repeat('d', 32)]),
        $now
    ),
    429
);

$now = $r['starts_at_ms'];
$settings['testers'] = [$a, $b];
$h = new HalloweenWaves($db, $settings, $clock);

$sa = $h->startRound($a, $pc);
$sb = $h->startRound($b, $pc);

check(
    $sa['round'] === $sb['round'],
    'manual simultaneous shared wave'
);

check(
    array_column($sa['round']['objects'], 'kind')
        === ['pumpkin', 'pumpkin', 'bat'],
    'manual same kind pair'
);

foreach ($sa['round']['objects'] as $obj) {
    $h->capture(
        $a, $pc, $sa['round']['id'], $obj['kind'], $obj['id']
    );
}

check(
    $h->state($a)['counts'] === ['pumpkin' => 2, 'bat' => 1],
    'three distinct manual captures'
);

$now += 10000;
$h = new HalloweenWaves($db, $settings, $clock);

check(
    $h->capture(
        $a, $pc, $sa['round']['id'], $obj['kind'], $obj['id']
    )['counts'] === ['pumpkin' => 2, 'bat' => 1],
    'expired manual duplicate still idempotent'
);

fails(
    fn() => $h->capture(
        $b, $pc, $sa['round']['id'], $obj['kind'], $obj['id']
    ),
    410
);

$settings['mode'] = 'public';
$settings['hunt']['announcements_enabled'] = true;
$settings['hunt']['automatic_announcements_enabled'] = true;
$control = new HalloweenControl($db, $settings);

$db->exec(
    'DELETE FROM halloween_hunt_awards WHERE campaign_id='
    . $db->quote($campaign)
);

$now = $start + 45 * 60000;

$input = [
    'campaign_id' => $campaign,
    'request_id' => str_repeat('e', 32),
    'action' => 'wave',
    'pumpkins' => 1,
    'bats' => 1,
];

$r = $control->submit($a, $input, $now);

check($r['reuses_targets'], 'public pre-23:30 repeats');

$q = $db->prepare(
    'SELECT payload FROM halloween_hunt_commands WHERE id=?'
);
$q->execute([$input['request_id']]);
$manual = json_decode($q->fetchColumn(), true);

foreach ($manual['objects'] as $obj) {
    check(
        isset($ids[$obj['id']]),
        'no extra public ID before 23:30'
    );
}

$now = $r['starts_at_ms'];
$h = new HalloweenWaves($db, $settings, $clock);
$s = $h->startRound($a, $campaign);

check(
    count(array_filter(
        $s['round']['objects'],
        fn($o) => !$o['captured']
    )) === 0,
    'already caught repeats excluded'
);

$now = $start + 91 * 60000;
$input['request_id'] = str_repeat('f', 32);
$r = $control->submit($a, $input, $now);

check(!$r['reuses_targets'], 'after 23:30 new opportunities');

$now = $end - 20000;
$input['request_id'] = str_repeat('9', 32);

fails(fn() => $control->submit($a, $input, $now), 409);

// Todos os envios seguintes são simulados.
$db->exec("
CREATE TABLE push_dispositivos(
    id INTEGER PRIMARY KEY,
    membro_id TEXT,
    ativo INTEGER,
    token_hash TEXT,
    token TEXT,
    plataforma TEXT,
    ambiente TEXT
);

CREATE TABLE halloween_hunt_announcements(
    campaign_id TEXT,
    event_id TEXT,
    membro_id TEXT,
    status TEXT,
    attempted_at TEXT,
    PRIMARY KEY(campaign_id,event_id,membro_id)
);
");

$q = $db->prepare(
    'INSERT INTO push_dispositivos VALUES(?,?,?,?,?,?,?)'
);

foreach ([
    [1, $a, 1, 'old', 'old', 'ios', 'production'],
    [2, $a, 1, 'new', 'new', 'ios', 'production'],
    [3, $b, 1, 'b', 'b', 'android', 'production'],
    [4, $c, 0, 'off', 'off', 'ios', 'production'],
] as $d) {
    $q->execute($d);
}

$settings['mode'] = 'pilot';
$settings['testers'] = [$a];
$settings['hunt']['automatic_announcements_enabled'] = false;
$cal = HalloweenCalendar::build($settings);
$now = $cal['starts_at_ms'] + 120000;
$control = new HalloweenControl($db, $settings);

$input = [
    'campaign_id' => $pc,
    'request_id' => str_repeat('7', 32),
    'action' => 'push',
    'message' => 'Teste sem envio real',
];

fails(
    fn() => $control->submit(
        $a,
        array_replace($input, ['message' => '']),
        $now
    ),
    422
);

$r = $control->submit($a, $input, $now);

check(
    $control->submit($a, $input, $now)['duplicate'],
    'manual push click deduplicated'
);

$sent = [];

$send = static function ($job) use (&$sent) {
    $sent[] = $job;
    return ['success' => true];
};

$job = new HalloweenAnnouncements($db, $settings);
$stats = $job->run($send, true, $now);

check(
    $stats['eligible'] === 1 && count($sent) === 0,
    'dry run and pilot restriction'
);

check(
    (int) $db->query(
        'SELECT COUNT(*) FROM halloween_hunt_announcements'
    )->fetchColumn() === 0,
    'dry run no writes'
);

$stats = $job->run($send, false, $now);

check(
    $stats['sent'] === 1 && $sent[0]['token'] === 'new',
    'one push latest device'
);

check(
    $job->run($send, false, $now)['sent'] === 0,
    'repeated worker no resend'
);

$now += 31000;
$input['request_id'] = str_repeat('8', 32);
$control->submit($a, $input, $now);

$stats = $job->run(
    static fn($job) =>
        throw new RuntimeException('transport uncertain'),
    false,
    $now
);

check($stats['review'] === 1, 'uncertain send marked review');

check(
    $job->run($send, false, $now)['sent'] === 0,
    'uncertain push never blindly retried'
);

$settings['mode'] = 'public';
$settings['hunt']['announcements_enabled'] = true;
$settings['hunt']['automatic_announcements_enabled'] = true;
$now = $start + 30 * 60000;
$job = new HalloweenAnnouncements($db, $settings);
$control = new HalloweenControl($db, $settings);

$input['campaign_id'] = $campaign;
$input['request_id'] = str_repeat('6', 32);
$control->submit($a, $input, $now);

$quiet = $settings;
$quiet['hunt']['automatic_announcements_enabled'] = false;
$quietJob = new HalloweenAnnouncements($db, $quiet);
check($quietJob->run($send, true, $start)['event'] === null,
    'rehearsal suppresses automatic reminders');
check($quietJob->run($send, true, $now)['eligible'] === 2,
    'rehearsal retains explicit manual pushes');

check(
    $job->run($send, false, $now)['sent'] === 2,
    'public includes all active accounts'
);

$now += 600000;

check(
    $job->run($send, false, $now)['sent'] === 0,
    'expired manual push skipped'
);

$noticeAt = HalloweenCalendar::build($settings)['notices'][0]['notify_at_ms'];
check($job->run($send, true, $noticeAt)['eligible'] === 2, 'public first pre-start warning');
check($job->run($send, false, $noticeAt)['sent'] === 2, 'public warning delivered via mocked transport');
check($job->run($send, false, $noticeAt + 1000)['sent'] === 0, 'warning not repeated');
check($job->run($send, true, $noticeAt + 20000)['event'] === null, 'late warning skipped');

$db->prepare(
    'UPDATE halloween_hunt_awards
     SET membro_id=?,completed_at=?
     WHERE campaign_id=?'
)->execute([$a, '2026-11-01 01:02:00', $campaign]);

check($quietJob->run($send, true, $now)['event'] === null,
    'rehearsal suppresses automatic winner announcement');

check(
    $job->run($send, false, $now)['sent'] === 2,
    'winner announcement to all'
);

check(
    $job->run($send, false, $now)['sent'] === 0,
    'winner announcement once per account'
);

fails(
    fn() => $control->submit($a, [
        'campaign_id' => $campaign,
        'request_id' => str_repeat('5', 32),
        'action' => 'wave',
        'pumpkins' => 1,
        'bats' => 0,
    ], $now),
    409
);

check(!$db->inTransaction(), 'control errors rolled back');

fails(fn() => $control->overview($b), 403);

check(
    count($control->overview($a)['records']) > 0,
    'owner command history'
);

$disabled = $settings;
$disabled['hunt']['announcements_enabled'] = false;

fails(
    fn() => (new HalloweenControl($db, $disabled))->submit(
        $a,
        array_replace($input, ['request_id' => str_repeat('4', 32)]),
        $now
    ),
    409
);

echo "PASS $n total calendar/control/push checks. "
    . "All push sends mocked.\n";