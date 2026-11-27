<?php
declare(strict_types=1);

use App\CMS\PartnershipCampaign;

require_once dirname(__DIR__, 2) . '/src/classes/CMS/PartnershipCampaign.php';

// Partilhada pela entrada pública e pelos links de campanha.
// O acesso direto continua independente de sessões e do bootstrap da app.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$visitRequest = $method === 'POST'
    && ($_SERVER['HTTP_X_MARGOT_CAMPAIGN_VISIT'] ?? '') === '1'
    && ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin') === 'same-origin';

if (!in_array($method, ['GET', 'HEAD'], true) && !$visitRequest) {
    header('Allow: GET, HEAD, POST');
    http_response_code(405);
    return;
}

$publicEntry = isset($nativeEntryUrl);
$legacy = !$publicEntry && !isset($campaignSlug);
$campaignSlug ??= $legacy ? 'provisorio' : (array_key_exists('src', $_GET) ? 'site-margot' : null);
$campaign = $legacy ? ['slug' => 'provisorio', 'nome' => '', 'localidade' => ''] : null;
$source = PartnershipCampaign::source($_GET['src'] ?? 'direct', $campaignSlug);

if ($visitRequest) {
    try {
        $tracking = new PartnershipCampaign($landingConnection ?? PartnershipCampaign::openLandingConnection());
        $tracking->recordVisit($campaignSlug, $source, $legacy);
        http_response_code(204);
    } catch (Throwable $error) {
        http_response_code(503);
        error_log('[margot-campaign] Visita: ' . get_class($error));
    }
    return;
}

header('Content-Type: text/html; charset=utf-8');

if ($campaignSlug !== null && !$legacy) {
    try {
        $tracking = new PartnershipCampaign($landingConnection ?? PartnershipCampaign::openLandingConnection());
        $campaign = $tracking->activeSpace($campaignSlug);
        if ($campaign === null && !$publicEntry) {
            http_response_code(404);
            if ($method === 'GET') {
                echo 'Espaço não encontrado.';
            }
            return;
        }
    } catch (Throwable $error) {
        // A página de downloads continua acessível durante uma falha de medição.
        error_log('[margot-campaign] Espaço: ' . get_class($error));
    }
}

if ($method === 'HEAD') {
    return;
}

$registerUrl = '/create-account/';
if ($campaign !== null) {
    $registerUrl .= '?' . http_build_query([
        'espaco' => $campaign['slug'],
        'src' => $source,
    ]);
}
$spaceLabel = !$publicEntry && !$legacy && $campaign !== null
    ? implode(' · ', array_filter([$campaign['nome'], $campaign['localidade']]))
    : '';

$pt = preg_match(
    '/^pt(?:-|,|;|$)/i',
    trim($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')
) === 1;

$copy = $pt ? [
    'line1' => 'Vês alguém.',
    'line2' => 'A Margot ajuda-te a dizer olá.',
    'intro' => 'Conhece as pessoas à tua volta. A próxima conversa pode começar aqui.',
    'download' => 'Descarrega a Margot e descobre quem está por perto.',
    'apple' => 'Descarregar na App Store',
    'google' => 'Descarregar no Google Play',
    'web' => 'Na web',
    'register' => 'Criar conta',
    'login' => 'Entrar',
    'about' => 'Sobre a Margot',
] : [
    'line1' => 'See someone?',
    'line2' => 'Margot helps you say hi.',
    'intro' => 'Meet the people around you. Your next conversation could start right here.',
    'download' => 'Get Margot and discover who’s nearby.',
    'apple' => 'Download on the App Store',
    'google' => 'Get it on Google Play',
    'web' => 'On the web',
    'register' => 'Create an account',
    'login' => 'Log in',
    'about' => 'About Margot',
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
    <?php if (isset($nativeEntryUrl)): ?>
    <script>
        // Capacitor injeta a ponte nativa antes dos scripts da página.
        // Só a entrada pública da app reencaminha para o registo/login.
        (() => {
            const cap = window.Capacitor;
            if (!cap?.isNativePlatform?.()) return;
            const platform = cap.getPlatform?.();
            if (platform !== 'ios' && platform !== 'android') return;
            const target = new URL(<?= json_encode($nativeEntryUrl, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>, location.origin);
            target.search = location.search;
            document.documentElement.style.visibility = 'hidden';
            location.replace(target.href);
        })();
    </script>
    <?php endif; ?>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#fbfaf8">
    <meta name="description" content="<?= qrEscape($copy['intro']) ?>">

    <title>Margot — <?= qrEscape($spaceLabel !== '' ? $spaceLabel : $copy['line1'] . ' ' . $copy['line2']) ?></title>

    <link rel="icon" href="/provisorio/logo.png">

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap');

        * {
            box-sizing: border-box;
        }

        html {
            color-scheme: light;
            background: #fbfaf8;
        }

        body {
            margin: 0;
            min-height: 100vh;
            min-height: 100svh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 30px;
            overflow-x: clip;
            position: relative;
            isolation: isolate;
            background: #fbfaf8;
            color: #25222b;
            font-family:
                -apple-system,
                BlinkMacSystemFont,
                'Segoe UI',
                sans-serif;
            padding:
                max(28px, env(safe-area-inset-top))
                22px
                max(32px, env(safe-area-inset-bottom));
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
                #ffe8c8,
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
            flex-direction: column;
            align-items: center;
        }

        .brand img {
            display: block;
            width: 180px;
            height: 180px;
            margin: -18px 0 -28px;
            mix-blend-mode: multiply;
        }

        .brand span {
            color: #e32636;
            font: 400 40px/1.25 'Alfa Slab One', Georgia, serif;
            letter-spacing: -1px;
        }

        main {
            width: min(100%, 720px);
            text-align: center;
        }

        h1 {
            margin: 0;
            font:
                400
                clamp(42px, 8vw, 68px)/1.12
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
            font-size: clamp(25px, 5vw, 36px);
            line-height: 1.25;
            letter-spacing: -1px;
        }

        .meeting {
            width: min(100%, 290px);
            height: 140px;
            margin: 20px auto 12px;
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

        .campaign-space {
            margin: 0 0 12px;
            font-size: .9rem;
            font-weight: 600;
            color: #615b69;
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

        .web-actions {
            position: absolute;
            top: 24px;
            right: max(28px, calc((100vw - 1120px) / 2));
            display: flex;
            align-items: center;
            gap: 24px;
            font-size: 15px;
        }

        .web-actions span {
            color: #65606d;
        }

        .web-actions a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
            color: #25222b;
            font-weight: 600;
            text-decoration: none;
        }

        .web-actions .web-register {
            padding: 0 22px;
            border-radius: 24px;
            color: #fff;
            background: #c51c42;
        }

        .web-actions a:hover {
            text-decoration: underline;
            text-underline-offset: 4px;
        }

        @media (min-width: 601px) {
            body { padding-top: 96px; }
        }

        @media (max-width: 600px) {
            .web-actions {
                position: static;
                justify-content: center;
                flex-wrap: wrap;
                gap: 0 16px;
                margin-top: 18px;
                font-size: 14px;
            }

            .web-actions .web-register {
                padding: 0;
                border-radius: 0;
                background: none;
                color: #25222b;
            }

            .web-actions a {
                text-decoration: underline;
                text-underline-offset: 4px;
            }
        }

        .about-link {
            display: inline-block;
            margin-top: 22px;
            color: #65606d;
            font-size: 14px;
            text-underline-offset: 4px;
        }

        .web-actions a:focus-visible,
        .about-link:focus-visible {
            outline: 3px solid #7251be;
            outline-offset: 5px;
        }

        @media (max-width: 420px) {
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
    <div class="ambient ambient-peach" aria-hidden="true"></div>
    <div class="ambient ambient-lilac" aria-hidden="true"></div>

    <header class="brand">
        <img
            src="/provisorio/logo.png"
            width="180"
            height="180"
            alt=""
            fetchpriority="high"
        >
        <span>Margot</span>
    </header>

    <main>
        <?php if ($spaceLabel !== ''): ?>
        <p class="campaign-space"><?= qrEscape($spaceLabel) ?></p>
        <?php endif; ?>
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

                    <path
                        fill="#fff"
                        transform="translate(9 8) scale(1.75)"
                        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.39 7.59 8.93 7.31c1.35.07 2.29.76 3.08.82 1.18-.24 2.31-.94 3.57-.85 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.41 4.07zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.57-2.33 4.5-3.74 4.25z"
                    />

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
        <nav class="web-actions" aria-label="<?= $pt ? 'Acesso pela web' : 'Web access' ?>">
            <span><?= qrEscape($copy['web']) ?></span>
            <a href="/login"><?= qrEscape($copy['login']) ?></a>
            <a class="web-register" href="<?= qrEscape($registerUrl) ?>"><?= qrEscape($copy['register']) ?></a>
        </nav>
        <a class="about-link" href="/sobre.html"><?= qrEscape($copy['about']) ?></a>
    </main>
    <?php if ($campaign !== null): ?>
    <script src="/js/campanha-visita.js"<?= $publicEntry ? ' data-entrada-publica="1"' : '' ?>></script>
    <?php endif; ?>
</body>
</html>
