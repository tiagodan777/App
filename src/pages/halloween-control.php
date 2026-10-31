<?php
declare(strict_types=1);

require_once APP_ROOT . '/src/classes/CMS/HalloweenControl.php';

header('Cache-Control: private, no-store, max-age=0');
header('Vary: Cookie');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: same-origin');

$member = strtolower(trim((string) ($session->id ?? '')));

try {
    App\CMS\HalloweenControl::authorize($member);
} catch (DomainException) {
    http_response_code(403);
    echo 'Esta página está reservada à conta de Tiago Daniel.';
    return;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    return;
}

require_csrf_token();

$settings = require APP_ROOT . '/config/halloween.php';
$db = $cms->getDatabase();
$calendar = App\CMS\HalloweenCalendar::build($settings);
$error = '';

if ($method === 'POST') {
    try {
        $result = (
            new App\CMS\HalloweenControl($db, $settings)
        )->submit($member, $_POST);

        header(
            'Location: /halloween-control/?command='
                . rawurlencode($result['id']),
            true,
            303
        );
        return;
    } catch (DomainException $e) {
        $error = $e->getMessage();
        http_response_code($e->getCode());
    } catch (Throwable $e) {
        error_log('[halloween-control] ' . get_class($e));

        $error = 'Não foi possível confirmar o comando. '
            . 'Atualiza o painel e consulta o histórico antes de repetir.';

        http_response_code(503);
    }
}

$e = static fn($v) => htmlspecialchars(
    (string) $v,
    ENT_QUOTES | ENT_SUBSTITUTE,
    'UTF-8'
);

$zone = new DateTimeZone(
    $settings['hunt']['timezone'] ?? 'Atlantic/Azores'
);

$time = static fn($ms) => (
    new DateTimeImmutable('@' . intdiv((int) $ms, 1000))
)->setTimezone($zone)->format('d/m H:i:s');

$now = (int) floor(microtime(true) * 1000);
$records = [];
$winner = false;
$ready = false;

try {
    if ($calendar) {
        $overview = (
            new App\CMS\HalloweenControl($db, $settings)
        )->overview($member);

        $records = $overview['records'];
        $winner = $overview['winner'];

        $ready = (
            $settings['hunt']['waves_enabled'] ?? false
        ) && $now >= $calendar['starts_at_ms']
            && $now < $calendar['ends_at_ms'];
    }
} catch (Throwable $ex) {
    $error = 'As tabelas do painel ainda não estão disponíveis. '
        . 'Executa primeiro o SQL desta versão.';
}

$token = csrf_token();

$audience = ($calendar['mode'] ?? 'off') === 'public'
    ? 'Todas as contas elegíveis'
    : 'Só as contas de teste';

$command = isset($_GET['command'])
    && preg_match(
        '/^[a-f0-9]{32}$/D',
        (string) $_GET['command']
    )
        ? (string) $_GET['command']
        : '';
?>
<!doctype html>
<html lang="pt">
<head>
    <meta charset="utf-8">
    <meta
        name="viewport"
        content="width=device-width,initial-scale=1"
    >
    <title>Halloween · Controlo Margot</title>

    <style>
        :root {
            color-scheme: dark;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            background: #111016;
            color: #f7f4fa;
            font: 16px/1.5 system-ui;
            padding: 24px 18px 60px;
        }

        main {
            max-width: 720px;
            margin: auto;
        }

        h1 {
            font-size: 28px;
        }

        h2 {
            font-size: 21px;
        }

        section {
            background: #211d29;
            border: 1px solid #41364d;
            padding: 20px;
            border-radius: 22px;
            margin: 16px 0;
        }

        p {
            color: #d1c8d9;
        }

        .status {
            color: #ffc277;
        }

        label {
            display: block;
            margin: 12px 0;
        }

        input,
        textarea,
        select,
        button {
            font: inherit;
            border-radius: 12px;
            padding: 12px;
            border: 1px solid #65556e;
            background: #17131e;
            color: inherit;
        }

        textarea {
            display: block;
            width: 100%;
            min-height: 100px;
        }

        button {
            background: #fc8c30;
            color: #1c1005;
            border: 0;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            margin-top: 14px;
        }

        button:disabled {
            opacity: .4;
            cursor: default;
        }

        .push {
            background: #bba2fa;
        }

        .error {
            background: #50212b;
            padding: 15px;
            border-radius: 15px;
            color: #fff;
        }

        small {
            display: block;
            color: #b7acbf;
        }

        .row {
            display: flex;
            gap: 25px;
        }

        a {
            color: #ceb7ff;
        }

        li {
            padding: 12px 0;
            border-bottom: 1px solid #41364d;
            overflow-wrap: anywhere;
        }

        code {
            font-size: 12px;
        }
    </style>
</head>

<body>
<main>
    <h1>🎃 Controlo de Halloween</h1>

    <p>
        Sessão: Tiago Daniel ·
        <strong><?= $e($audience) ?></strong>
    </p>

    <p class="status">
        <?= $winner
            ? 'Já há vencedor/a.'
            : ($ready
                ? 'Desafio ativo.'
                : 'Fora do horário ou desativado.') ?>
    </p>

    <?php if ($calendar): ?>
        <small>
            <?= $e($time($calendar['starts_at_ms'])) ?>
            →
            <?= $e($time($calendar['ends_at_ms'])) ?>
            · <?= $e($zone->getName()) ?>
            <br>
            <?= $e($calendar['campaign_id']) ?>
        </small>
    <?php endif ?>

    <?php if ($error): ?>
        <p class="error"><?= $e($error) ?></p>
    <?php endif ?>

    <?php
    if ($command):
        foreach ($records as $record):
            if ($record['id'] === $command):
    ?>
        <section>
            ✓ Comando registado para
            <?= $e($time($record['starts_at_ms'])) ?>.
            Consulta o histórico abaixo.
        </section>
    <?php
            endif;
        endforeach;
    endif;
    ?>

    <section>
        <h2>Lançar alvos</h2>

        <p>
            Aparecem numa hora comum, pelo menos 20 segundos
            após o clique, sem sobrepor vagas automáticas,
            nas apps abertas e ligadas à Internet.
            No máximo três alvos.
        </p>

        <form method="post">
            <input
                type="hidden"
                name="_csrf"
                value="<?= $e($token) ?>"
            >
            <input
                type="hidden"
                name="campaign_id"
                value="<?= $e($calendar['campaign_id'] ?? '') ?>"
            >
            <input
                type="hidden"
                name="request_id"
                value="<?= bin2hex(random_bytes(16)) ?>"
            >
            <input type="hidden" name="action" value="wave">

            <div class="row">
                <label>
                    🎃 Abóboras
                    <select name="pumpkins">
                        <?php foreach (range(0, 3) as $n): ?>
                            <option <?= $n === 1 ? 'selected' : '' ?>>
                                <?= $n ?>
                            </option>
                        <?php endforeach ?>
                    </select>
                </label>

                <label>
                    🦇 Morcegos
                    <select name="bats">
                        <?php foreach (range(0, 3) as $n): ?>
                            <option <?= $n === 1 ? 'selected' : '' ?>>
                                <?= $n ?>
                            </option>
                        <?php endforeach ?>
                    </select>
                </label>
            </div>

            <small>
                Antes das 23:30, no público, repete oportunidades
                anteriores: quem já apanhou esse alvo não volta
                a pontuar. Depois das 23:30 cria oportunidades
                novas. Nos testes cria sempre novas.
            </small>

            <button <?= !$ready || $winner ? 'disabled' : '' ?>>
                Lançar para
                <?= $calendar && $calendar['mode'] === 'public'
                    ? 'todos'
                    : 'as contas de teste' ?>
            </button>
        </form>
    </section>

    <section>
        <h2>Enviar uma notificação push</h2>

        <p>
            O envio é independente da vaga. Chega também com
            a app fechada, se o sistema permitir notificações.
        </p>

        <form method="post">
            <input
                type="hidden"
                name="_csrf"
                value="<?= $e($token) ?>"
            >
            <input
                type="hidden"
                name="campaign_id"
                value="<?= $e($calendar['campaign_id'] ?? '') ?>"
            >
            <input
                type="hidden"
                name="request_id"
                value="<?= bin2hex(random_bytes(16)) ?>"
            >
            <input type="hidden" name="action" value="push">

            <label>
                Mensagem
                <textarea
                    name="message"
                    maxlength="180"
                    required
                >🎃🦇 O desafio de Halloween está na Margot! Apanha 10 abóboras e 10 morcegos e conhece quem está por perto.</textarea>
            </label>

            <small>
                Um aviso por conta, para o dispositivo ativo
                mais recente. O serviço de Halloween tem de
                estar instalado. “Aceite” significa aceite por
                APNs/FCM, não leitura confirmada.
            </small>

            <button
                class="push"
                <?= !$ready
                    || !(
                        $settings['hunt']['announcements_enabled']
                        ?? false
                    )
                        ? 'disabled'
                        : '' ?>
            >
                Enviar push · <?= $e($audience) ?>
            </button>
        </form>
    </section>

    <section>
        <h2>Últimos comandos</h2>

        <a href="/halloween-control/">Atualizar estado</a>

        <ul>
            <?php foreach ($records as $record): ?>
                <li>
                    <strong>
                        <?= $record['kind'] === 'push'
                            ? 'Push'
                            : 'Vaga' ?>
                    </strong>

                    · <?= $e($time($record['starts_at_ms'])) ?>
                    <br>

                    <?php
                    if ($record['kind'] === 'push'):
                        $stats = $record['stats'];

                        echo $e(
                            'Aceites: ' . ($stats['sent'] ?? 0)
                            . ' · Por rever: '
                            . ($stats['review'] ?? 0)
                            . ' · Cancelados: '
                            . ($stats['cancelled'] ?? 0)
                        );

                        if (!$stats):
                            echo $record['expires_at_ms'] > $now
                                ? ' · A aguardar o serviço.'
                                : ' · Expirou sem envios registados.';
                        endif;
                    else:
                        $body = json_decode(
                            $record['payload'],
                            true
                        );

                        echo $e(
                            count($body['objects'] ?? [])
                            . ' alvos'
                        );
                    endif;
                    ?>

                    <small>
                        <code><?= $e($record['id']) ?></code>
                    </small>
                </li>
            <?php endforeach ?>
        </ul>
    </section>
</main>
</body>
</html>