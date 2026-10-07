<?php
declare(strict_types=1);

// Página independente: não carrega sessões, Twig ou o bootstrap da app.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}

header('Content-Type: text/html; charset=utf-8');

if ($method === 'HEAD') {
    exit;
}

$sources = [
    'screen',
    'entrance',
    'bar',
    'table',
    'wc',
    'outside',
    'tiago',
];

$source = $_GET['src'] ?? 'direct';
$source = is_string($source)
    ? strtolower(trim($source))
    : 'other';

if (!in_array($source, [...$sources, 'direct'], true)) {
    $source = 'other';
}

try {
    // Apenas um contador agregado.
    // Não guarda IP, cookies ou dados de contas.
    (static function (string $source): void {
        $root = dirname(__DIR__, 2);

        if (!defined('APP_ROOT')) {
            define('APP_ROOT', $root);
        }

        $config = $root . '/config/config.local.php';

        if (!is_file($config)) {
            $config = $root . '/config/config.php';
        }

        require $config;

        $connection = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 2,
        ]);

        $statement = $connection->prepare(
            'INSERT INTO qr_provisorio_diario (
                dia_utc,
                origem,
                total
            )
            VALUES (
                UTC_DATE(),
                :origem,
                1
            )
            ON DUPLICATE KEY UPDATE total = total + 1'
        );

        $statement->execute([
            'origem' => $source,
        ]);
    })($source);
} catch (Throwable $error) {
    // Continua a mostrar a página se o contador estiver indisponível.
    error_log(
        '[margot-qr] Falha no contador: ' . get_class($error)
    );
}

$pt = preg_match(
    '/^pt(?:-|,|;|$)/i',
    trim($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')
) === 1;

$copy = $pt ? [
    'eyebrow' => 'AS MELHORES CONVERSAS COMEÇAM PERTO.',
    'line1' => 'Vês alguém.',
    'line2' => 'A Margot ajuda-te a dizer olá.',
    'intro' => 'Conhece as pessoas à tua volta. A próxima conversa pode começar aqui.',
    'download' => 'Descarrega a Margot e descobre quem está por perto.',
    'apple' => 'Descarregar na App Store',
    'google' => 'Descarregar no Google Play',
    'footer' => 'Pessoas por perto. Possibilidades por descobrir.',
] : [
    'eyebrow' => 'GREAT CONVERSATIONS START NEARBY.',
    'line1' => 'See someone?',
    'line2' => 'Margot helps you say hi.',
    'intro' => 'Meet the people around you. Your next conversation could start right here.',
    'download' => 'Get Margot and discover who’s nearby.',
    'apple' => 'Download on the App Store',
    'google' => 'Get it on Google Play',
    'footer' => 'People nearby. Possibilities to discover.',
];

function qrEscape(string $text): string
{
    return htmlspecialchars(
        $text,
        ENT_QUOTES | ENT_SUBSTITUTE,
        'UTF-8'
    );
}
?>
<!doctype html>
<html lang="<?= $pt ? 'pt-PT' : 'en' ?>">
<head>
    <meta charset="utf-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1, viewport-fit=cover"
    >

    <meta name="theme-color" content="#faf8f5">

    <meta
        name="description"
        content="<?= qrEscape($copy['intro']) ?>"
    >

    <title>Margot — <?= qrEscape(
        $copy['line1'] . ' ' . $copy['line2']
    ) ?></title>

    <link rel="icon" href="/provisorio/logo.png">

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap');

        * {
            box-sizing: border-box;
        }

        html {
            color-scheme: light;
            background: #faf8f5;
        }

        body {
            margin: 0;
            min-height: 100vh;
            min-height: 100svh;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow-x: clip;
            position: relative;
            isolation: isolate;
            background: #faf8f5;
            color: #25222b;
            font-family:
                -apple-system,
                BlinkMacSystemFont,
                'Segoe UI',
                sans-serif;
            padding:
                max(24px, env(safe-area-inset-top))
                22px
                max(20px, env(safe-area-inset-bottom));
        }

        .ambient {
            position: absolute;
            z-index: -1;
            pointer-events: none;
        }

        .ambient-peach {
            width: min(58vw, 510px);
            height: 330px;
            top: 13%;
            left: 0;
            background: radial-gradient(
                ellipse at left,
                #ffe5c0,
                transparent 72%
            );
        }

        .ambient-lilac {
            width: min(58vw, 510px);
            height: 420px;
            bottom: 5%;
            right: 0;
            background: radial-gradient(
                ellipse at right,
                #e9e0fa,
                transparent 72%
            );
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 9px;
        }

        .brand img {
            width: 52px;
            height: 52px;
            border-radius: 16px;
        }

        .brand span {
            font: 400 28px 'Alfa Slab One', Georgia, serif;
            letter-spacing: -1px;
        }

        main {
            width: min(100%, 720px);
            text-align: center;
            margin: auto 0;
            padding: 40px 0 20px;
        }

        .eyebrow {
            font-size: 10px;
            line-height: 1.7;
            font-weight: 700;
            letter-spacing: 2px;
            margin: 0 0 20px;
        }

        h1 {
            margin: 0;
            font:
                400
                clamp(42px, 8vw, 76px)/1.12
                'Alfa Slab One',
                Georgia,
                serif;
            letter-spacing: -2px;
        }

        .hello {
            display: block;
            max-width: 570px;
            margin: 16px auto 0;
            color: #e82d57;
            font-size: clamp(25px, 5vw, 40px);
            line-height: 1.25;
            letter-spacing: -1px;
        }

        .meeting {
            width: min(100%, 290px);
            height: 140px;
            margin: 16px auto 12px;
            position: relative;
        }

        .person {
            display: grid;
            place-items: center;
            position: absolute;
            width: 92px;
            height: 100px;
            font-size: 40px;
        }

        .person-peach {
            left: 10px;
            top: 18px;
            background: #ffdda9;
            border-radius: 52% 44% 48% 39%;
            transform: rotate(-12deg);
        }

        .person-lilac {
            right: 10px;
            top: 29px;
            background: #d6c4ef;
            border-radius: 43% 52% 39% 50%;
            transform: rotate(12deg);
        }

        .hello-bubble {
            position: absolute;
            z-index: 1;
            left: 50%;
            top: 10px;
            transform: translateX(-50%) rotate(-5deg);
            padding: 12px 18px;
            background: #fff;
            border: 1px solid #eee5e9;
            border-radius: 22px 22px 22px 5px;
            box-shadow: 0 8px 28px #4936510d;
            white-space: nowrap;
            font-size: 17px;
            font-weight: 700;
        }

        .download {
            font-size: 13px;
            line-height: 1.6;
            color: #65606d;
            margin: 8px 0 16px;
        }

        .stores {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .stores a {
            display: block;
            border-radius: 12px;
            transition: transform .15s ease;
        }

        .stores svg {
            width: 180px;
            max-width: 100%;
            height: auto;
            display: block;
        }

        .stores a:focus-visible {
            outline: 3px solid #7251be;
            outline-offset: 5px;
        }

        .stores a:hover {
            transform: translateY(-2px);
        }

        .stores a:active {
            transform: scale(.98);
        }

        footer {
            text-align: center;
            color: #78717e;
            font-size: 11px;
            line-height: 1.6;
            padding-top: 22px;
        }

        footer p {
            margin: 0;
        }

        @media (max-width: 420px) {
            main {
                padding-top: 30px;
            }

            h1 {
                font-size: clamp(38px, 11vw, 46px);
                letter-spacing: -1.5px;
            }

            .stores {
                gap: 10px;
            }

            .stores svg {
                width: 155px;
            }
        }

        @media (max-width: 359px) {
            .stores {
                flex-direction: column;
                align-items: center;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .stores a {
                transition: none;
                transform: none;
            }
        }
    </style>
</head>

<body>
    <div
        class="ambient ambient-peach"
        aria-hidden="true"
    ></div>

    <div
        class="ambient ambient-lilac"
        aria-hidden="true"
    ></div>

    <header class="brand">
        <img
            src="/provisorio/logo.png"
            width="60"
            height="60"
            alt=""
            fetchpriority="high"
        >
        <span>Margot</span>
    </header>

    <main>
        <p class="eyebrow">
            <?= qrEscape($copy['eyebrow']) ?>
        </p>

        <h1>
            <span><?= qrEscape($copy['line1']) ?></span>
            <span class="hello">
                <?= qrEscape($copy['line2']) ?>
            </span>
        </h1>

        <div class="meeting" aria-hidden="true">
            <span class="person person-peach">🙂</span>
            <span class="hello-bubble">
                Hey <span>👋</span>
            </span>
            <span class="person person-lilac">😊</span>
        </div>

        <p class="download">
            <?= qrEscape($copy['download']) ?>
        </p>

        <nav class="stores" aria-label="Downloads">
            <a
                href="https://apps.apple.com/pt/app/margot-pessoas-por-perto/id6803648498"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    role="img"
                    aria-label="<?= qrEscape($copy['apple']) ?>"
                    width="190"
                    height="60"
                    viewBox="0 0 190 60"
                >
                    <rect
                        x=".5"
                        y=".5"
                        width="189"
                        height="59"
                        rx="11"
                        fill="#17151b"
                        stroke="#514c58"
                    />

                    <g
                        fill="none"
                        stroke="#fff"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path
                            d="M29 16v22m-8-8 8 8 8-8M18 44h22"
                        />
                    </g>

                    <g
                        fill="#fff"
                        font-family="Arial,Helvetica,sans-serif"
                    >
                        <text x="53" y="23" font-size="10">
                            <?= $pt
                                ? 'Descarregar na'
                                : 'Download on the' ?>
                        </text>

                        <text x="52" y="44" font-size="24">
                            App Store
                        </text>
                    </g>
                </svg>
            </a>

            <a
                href="https://play.google.com/store/apps/details?id=com.margot.app&amp;hl=pt_PT"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    role="img"
                    aria-label="<?= qrEscape($copy['google']) ?>"
                    width="190"
                    height="60"
                    viewBox="0 0 190 60"
                >
                    <rect
                        x=".5"
                        y=".5"
                        width="189"
                        height="59"
                        rx="11"
                        fill="#17151b"
                        stroke="#514c58"
                    />

                    <path
                        d="M17 14 34 30 17 46Z"
                        fill="#5bc9ef"
                    />

                    <path
                        d="m17 14 23 13-6 3Z"
                        fill="#55c98a"
                    />

                    <path
                        d="m34 30 6-3 6 3-6 3Z"
                        fill="#ffd464"
                    />

                    <path
                        d="m17 46 23-13-6-3Z"
                        fill="#f27989"
                    />

                    <g
                        fill="#fff"
                        font-family="Arial,Helvetica,sans-serif"
                    >
                        <text x="54" y="23" font-size="10">
                            <?= $pt
                                ? 'Disponível no'
                                : 'GET IT ON' ?>
                        </text>

                        <text x="53" y="44" font-size="22">
                            Google Play
                        </text>
                    </g>
                </svg>
            </a>
        </nav>
    </main>

    <footer>
        <p><?= qrEscape($copy['footer']) ?></p>
    </footer>
</body>
</html>