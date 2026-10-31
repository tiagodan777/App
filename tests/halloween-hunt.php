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
unset($settings['hunt']['pilot_starts_at'], $settings['hunt']['pilot_ends_at']);
$settings['hunt']['extras_enabled'] = false;
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

        $repeated = $hunt->capture($a, $campaign, $roundId, 'pumpkin');

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
        'A conclusão anterior deve ficar preservada.'
    );

    echo "PASS: $checks verificações de capturas e progresso ($driver).\n";
} finally {
    foreach ([$a, $b, $outside] as $member) {
        $delete->execute([$member]);
    }
}

require dirname(__DIR__) . '/src/classes/CMS/HalloweenHuntMail.php';

if ($driver === 'mysql') {
    foreach (['primeiro_nome', 'ultimo_nome'] as $column) {
        $exists = $db->query(
            "SHOW COLUMNS FROM membros LIKE '$column'"
        )->fetch();

        if (!$exists) {
            $db->exec(
                "ALTER TABLE membros ADD $column varchar(60) NOT NULL DEFAULT ''"
            );
        }
    }

    $sql = file_get_contents(
        dirname(__DIR__) . '/database/halloween-hunt-extras.sql'
    );

    $db->exec($sql);
    $db->exec($sql);
} else {
    $db->exec(
        "ALTER TABLE membros ADD primeiro_nome TEXT NOT NULL DEFAULT '';
        ALTER TABLE membros ADD ultimo_nome TEXT NOT NULL DEFAULT '';

        CREATE TABLE halloween_hunt_timing (
            round_id TEXT PRIMARY KEY,
            next_round_at TEXT NOT NULL,
            FOREIGN KEY(round_id)
                REFERENCES halloween_hunt_rounds(id) ON DELETE CASCADE
        );

        CREATE TABLE halloween_hunt_awards (
            campaign_id TEXT PRIMARY KEY,
            membro_id TEXT,
            winner_name TEXT,
            completed_at TEXT,
            email_state TEXT NOT NULL DEFAULT 'pending',
            email_recipient TEXT,
            email_attempted_at TEXT,
            email_sent_at TEXT
        )"
    );
}

$settings['mode'] = 'pilot';
$settings['hunt']['pilot_run'] = 'extras-' . bin2hex(random_bytes(5));
$settings['hunt']['extras_enabled'] = true;
$settings['hunt']['pilot_min_seconds'] = 120;
$settings['hunt']['pilot_max_seconds'] = 240;
$settings['testers'] = [$a, $b];
$now = strtotime('2026-10-31 12:00:00 UTC') * 1000;
$hunt = new HalloweenHunt($db, $settings, $clock);
$campaign = $hunt->state($a)['campaign_id'];
$intervals = [];
$before = $checks;

try {
    foreach ([$a, $b] as $member) {
        $insert->execute([$member]);
    }

    $name = $db->prepare(
        'UPDATE membros SET primeiro_nome = ?, ultimo_nome = ? WHERE id = ?'
    );
    $name->execute(['Ana <teste>', 'Silva', $a]);
    $name->execute(['Bruno', 'Silva', $b]);

    for ($i = 1; $i <= 10; $i++) {
        $round = $hunt->startRound($a);
        $id = $round['round']['id'];
        $deadline = $round['next_round_at_ms'];
        $wait = ($deadline - $now) / 1000;
        $intervals[] = $wait;

        huntCheck($wait >= 120 && $wait <= 240, 'Intervalo dentro dos limites.');

        $fresh = new HalloweenHunt($db, $settings, $clock);
        huntCheck(
            $fresh->state($a)['next_round_at_ms'] === $deadline,
            'Prazo persiste entre clientes.'
        );

        $t = $now;
        $now += 1;
        $fresh->capture($a, $campaign, $id, 'pumpkin');
        $now = $t + 14000;
        $fresh->capture($a, $campaign, $id, 'bat');
        $now = $deadline - 1;

        if ($i < 10) {
            huntCheck(
                $fresh->startRound($a)['round']['id'] === $id,
                'Não antecipa a ronda.'
            );
        }

        $now = $deadline;
    }

    huntCheck(count(array_unique($intervals)) > 1, 'As esperas variam.');

    $readAward = $db->prepare(
        'SELECT * FROM halloween_hunt_awards WHERE campaign_id = ?'
    );
    $readAward->execute([$campaign]);
    $winner = $readAward->fetch();

    huntCheck($winner['membro_id'] === $a, 'Primeiro vencedor guardado.');

    for ($i = 0; $i < 10; $i++) {
        $round = $hunt->startRound($b);
        $id = $round['round']['id'];

        huntCheck(
            ($round['next_round_at_ms'] - $now) / 1000 === $intervals[$i],
            'Mesmas esperas para ambas as contas.'
        );

        $t = $now;
        $hunt->capture($b, $campaign, $id, 'pumpkin');
        $now = $t + 14000;
        $hunt->capture($b, $campaign, $id, 'bat');
        $now = $round['next_round_at_ms'];
    }

    $readAward->execute([$campaign]);
    huntCheck(
        $readAward->fetch()['membro_id'] === $a,
        'Segundo finalista não substitui vencedor.'
    );

    $mail = new App\CMS\HalloweenHuntMail($db);
    $sent = 0;

    $fake = function ($to, $subject, $body) use (
        &$sent,
        $mail,
        $campaign
    ): bool {
        $sent++;

        huntCheck(
            str_contains($body, 'Ana &lt;teste&gt;'),
            'Nome escapado no email.'
        );
        huntCheck(str_contains($body, '10 / 10'), 'Inclui contagens.');

        huntCheck(
            $mail->sendOne(
                $campaign,
                'test@example.com',
                fn() => true
            ) === 'idle',
            'Segundo worker durante envio não duplica.'
        );

        return true;
    };

    huntCheck(
        $mail->sendOne($campaign, 'test@example.com', $fake) === 'sent',
        'SMTP simulado aceite.'
    );

    huntCheck(
        $mail->sendOne($campaign, 'test@example.com', $fake) === 'idle'
            && $sent === 1,
        'Reexecução não duplica email.'
    );

    $db->prepare(
        "UPDATE halloween_hunt_awards
        SET email_state = 'pending' WHERE campaign_id = ?"
    )->execute([$campaign]);

    huntCheck(
        $mail->sendOne(
            $campaign,
            'test@example.com',
            fn() => false
        ) === 'review',
        'Falha fica registada.'
    );

    huntCheck(
        $mail->sendOne($campaign, 'test@example.com', $fake) === 'idle',
        'Falha incerta não reenvia cegamente.'
    );

    huntCheck(
        $hunt->state($a)['completed_at'] !== null,
        'Falha de email preserva conclusão.'
    );

    $probe = $settings;
    $probe['hunt']['pilot_run'] .= '-edge';
    $edge = new HalloweenHunt($db, $probe, $clock);
    $r = $edge->startRound($a);
    $edgeCampaign = $r['campaign_id'];
    $rId = $r['round']['id'];
    $t = $now;

    huntRejects(
        fn() => $edge->capture($b, $edgeCampaign, $rId, 'pumpkin'),
        404
    );

    $now = $t + 12000;
    huntRejects(
        fn() => $edge->capture($a, $edgeCampaign, $rId, 'pumpkin'),
        410
    );

    $now = $t + 28000;
    huntRejects(
        fn() => $edge->capture($a, $edgeCampaign, $rId, 'bat'),
        410
    );

    huntCheck(
        $edge->state($a)['counts'] === ['pumpkin' => 0, 'bat' => 0],
        'Recusas não contam pontos.'
    );

    $probe['hunt']['pilot_min_seconds'] = 400;
    $probe['hunt']['pilot_max_seconds'] = 500;
    $newConfig = new HalloweenHunt($db, $probe, $clock);

    huntCheck(
        $newConfig->state($a)['next_round_at_ms'] === $r['next_round_at_ms'],
        'Prazo publicado imutável.'
    );

    $public = $settings;
    $public['mode'] = 'public';
    $public['hunt']['public_starts_at'] = '2026-10-31 22:00:00';
    $public['hunt']['public_ends_at'] = '2026-11-01 03:33:00';
    $public['hunt']['timezone'] = 'Atlantic/Azores';

    $pub = new HalloweenHunt($db, $public, $clock);
    $now = strtotime('2026-10-31 22:59:59 UTC') * 1000;

    huntCheck(
        $pub->state($a)['phase'] === 'scheduled',
        'Não começa antes da hora dos Açores.'
    );

    $now += 1000;

    huntCheck(
        $pub->state($a)['phase'] === 'active',
        'Começa à hora prevista.'
    );

    huntCheck(
        $pub->state($a)['counts'] === ['pumpkin' => 0, 'bat' => 0],
        'Público não herda pontos do piloto.'
    );

    $opportunities = 0;

    while ($pub->state($a)['phase'] === 'active') {
        $round = $pub->startRound($a);

        huntCheck(
            count($round['round']['objects']) === 2,
            'Falhar capturas mantém ambos os tipos disponíveis.'
        );

        $opportunities++;
        $now = $round['next_round_at_ms'];

        if ($opportunities > 170) {
            throw new RuntimeException('Agendamento público inválido.');
        }
    }

    huntCheck(
        $opportunities >= 84 && $opportunities <= 167,
        'Mais de vinte oportunidades por tipo.'
    );

    echo 'Simulação pública sem capturas: '
        . $opportunities
        . ' rondas, 22h–03h33 dos Açores.'
        . PHP_EOL;

    $now = strtotime('2026-11-01 04:33:00 UTC') * 1000;

    huntCheck(
        $pub->state($a)['phase'] === 'ended',
        'Termina à hora prevista.'
    );

    $fast = $settings;
    $fast['hunt']['pilot_run'] = 'fast-' . bin2hex(random_bytes(5));
    $fast['hunt']['pilot_interval_seconds'] = 20;
    $fast['hunt']['pilot_min_seconds'] = 20;
    $fast['hunt']['pilot_max_seconds'] = 20;
    $fast['hunt']['pilot_starts_at'] = '2026-10-31 10:55:00';
    $fast['hunt']['pilot_ends_at'] = '2026-10-31 11:05:00';
    $fast['hunt']['timezone'] = 'Atlantic/Azores';

    $pilot = new HalloweenHunt($db, $fast, $clock);
    $now = strtotime('2026-10-31 11:54:59 UTC') * 1000;

    huntCheck(
        $pilot->state($a)['phase'] === 'scheduled',
        'Piloto aguarda 10:55 Açores.'
    );

    huntCheck(
        $pilot->startRound($a)['round'] === null,
        'Não emite antes da hora.'
    );

    $now += 1000;
    $start = $now;

    huntCheck(
        $pilot->state(
            'ffffffff-ffff-4fff-8fff-ffffffffffff'
        )['phase'] === 'off',
        'Conta externa excluída.'
    );

    $r = $pilot->startRound($a);
    $c = $r['campaign_id'];

    huntCheck(
        $r['next_round_at_ms'] === $start + 20000,
        'Ronda a cada 20 segundos.'
    );

    huntCheck(
        $r['round']['objects'][1]['opens_at_ms'] === $start + 10000,
        'Morcego aos dez segundos.'
    );

    $now = $start + 9000;
    huntRejects(
        fn() => $pilot->capture($a, $c, $r['round']['id'], 'pumpkin'),
        410
    );

    $now = $start + 9999;
    huntRejects(
        fn() => $pilot->capture($a, $c, $r['round']['id'], 'bat'),
        409
    );

    $now = $start + 10000;

    huntCheck(
        $pilot->capture(
            $a,
            $c,
            $r['round']['id'],
            'bat'
        )['counts']['bat'] === 1,
        'Captura rápida reconhecida.'
    );

    $now = $start;
    $opportunities = 0;

    while ($pilot->state($b)['phase'] === 'active') {
        $r = $pilot->startRound($b);
        $opportunities++;
        $now = $r['next_round_at_ms'];

        if ($opportunities > 30) {
            throw new RuntimeException('Piloto ultrapassou dez minutos.');
        }
    }

    huntCheck(
        $opportunities === 30,
        'Trinta oportunidades de cada tipo em dez minutos.'
    );

    huntCheck(
        $pilot->state($b)['phase'] === 'ended',
        'Piloto termina às 11:05.'
    );

    huntCheck(
        $pilot->startRound($b)['round'] === null,
        'Não emite depois do fim.'
    );

    huntRejects(
        fn() => $pilot->capture(
            $b,
            $r['campaign_id'],
            $r['round']['id'],
            'bat'
        ),
        409
    );

    echo 'PASS: '
        . ($checks - $before)
        . ' verificações adicionais; emails simulados, nenhum enviado.'
        . PHP_EOL;

    echo 'Sequência ensaiada: '
        . implode(', ', $intervals)
        . ' segundos.'
        . PHP_EOL;
} finally {
    $db->prepare(
        'DELETE FROM halloween_hunt_awards WHERE campaign_id = ?'
    )->execute([$campaign]);

    foreach ([$a, $b] as $member) {
        $delete->execute([$member]);
    }
}