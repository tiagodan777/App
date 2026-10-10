<?php
declare(strict_types=1);

namespace App\CMS;

use Twig\Loader\LoaderInterface;
use Twig\Source;

/** Adds presentation scripts to documents before Twig interpolates member data. */
final class LanguageTemplateLoader implements LoaderInterface
{
    private const LOCATION_NOTICE_VERSION = '20261010-location-notice-5';
    private const PRESENCE_CANVAS_VERSION = '20261010-presence-canvas-1';
    private const MINI_MEDIA_VERSION = '20261009-mini-media-1';
    private const FLUIDITY_VERSION = '20261009-fluidity-haptics-1';
    private const KEYBOARD_VERSION = '20261009-mini-keyboard-3';
    private const STABILITY_VERSION = '20261008-launch-1';
    private const VERSION = '20261007-reaction-push-1';
    private const CHAT_VERSION = '20261008-connection-haptic-2';
    private const STYLE_VERSION = '20261008-hey-name-motion-1';
    private const VISUAL_VERSION = '20261008-compact-alerts-2';

    private string $webRelease = '';

    public function __construct(private LoaderInterface $loader)
    {
        // One snapshot per request keeps rendered HTML and Twig's cache key aligned.
        $manifest = dirname(__DIR__, 3) . '/public/app-version.json';
        try {
            if (is_file($manifest) && is_readable($manifest) && filesize($manifest) <= 2048) {
                $data = json_decode((string) file_get_contents($manifest), true);
                if (is_array($data)
                    && is_string($data['version'] ?? null)
                    && preg_match('/\A[A-Za-z0-9_-]{1,64}\z/', $data['version']) === 1
                    && is_bool($data['enabled'] ?? null)) {
                    $this->webRelease = $data['version'];
                }
            }
        } catch (\Throwable $error) {
            // An unavailable manifest must not prevent the app from rendering.
        }
    }

    public function getSourceContext(string $name): Source
    {
        $source = $this->loader->getSourceContext($name);
        $code = $source->getCode();

        foreach ([
            'location-onboarding',
            'chat-social',
            'chat',
            'push-notifications',
            'invite',
            'websocket-alerts',
            'index-notificacoes',
            'create-account-navegacao'
        ] as $script) {
            $code = preg_replace(
                '~js/' . preg_quote($script, '~') . '\.js(?:\?v=[^"\s<>]*)?~',
                'js/' . $script . '.js?v=' . self::VERSION,
                $code
            ) ?? $code;
        }

        $code = preg_replace(
            '~estilos/app-interactions\.css(?:\?v=[^"\s<>]*)?~',
            'estilos/app-interactions.css?v=' . self::STYLE_VERSION,
            $code
        ) ?? $code;

        // Só invalida a cache dos recursos alterados nesta revisão.
        foreach ([
            'js/hey-vibracao.js',
            'js/index-animacao.js',
            'estilos/theme.css'
        ] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::VISUAL_VERSION,
                $code
            ) ?? $code;
        }

        foreach ([
            'js/chat.js',
            'js/websocket-alerts.js',
            'js/hey-vibracao.js',
            'js/javascript-geral.js'
        ] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::CHAT_VERSION,
                $code
            ) ?? $code;
        }

        foreach ([
            'js/chat-viewport.js',
            'js/index-mini-menu.js',
            'js/today.js',
            'js/account-confirmation.js',
            'js/index-animacao.js',
            'js/push-notifications.js',
            'js/hey-vibracao.js',
            'js/app-interactions.js',
            'js/chat.js',
            'estilos/theme.css'
        ] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::STABILITY_VERSION,
                $code
            ) ?? $code;
        }

        foreach ([
            'js/index-mini-menu.js',
            'js/index-animacao.js',
            'js/websocket-location.js',
            'js/websocket.js'
        ] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\\?v=[^"\\s<>]*)?~',
                $asset . '?v=' . self::KEYBOARD_VERSION,
                $code
            ) ?? $code;
        }

        foreach (['js/javascript-geral.js', 'js/hey-vibracao.js'] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\\?v=[^"\\s<>]*)?~',
                $asset . '?v=' . self::FLUIDITY_VERSION,
                $code
            ) ?? $code;
        }

        foreach ([
            'js/index-tap-foto.js',
            'js/mini-compose.js',
            'js/chat-camera.js'
        ] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::MINI_MEDIA_VERSION,
                $code
            ) ?? $code;
        }

        foreach (['js/index-animacao.js', 'js/websocket-location.js'] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::PRESENCE_CANVAS_VERSION,
                $code
            ) ?? $code;
        }

        // Run after older asset versions so cached clients fetch the notice update.
        foreach (['js/location-onboarding.js', 'estilos/permission-experience.css'] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::LOCATION_NOTICE_VERSION,
                $code
            ) ?? $code;
        }

        if ($name === 'index.html' && !str_contains($code, 'estilos/mini-media.css')) {
            $code = str_replace(
                '{% block styles %}',
                '{% block styles %}<link rel="stylesheet" href="{{ doc_root }}estilos/mini-media.css?v='
                . self::MINI_MEDIA_VERSION . '" data-margot-page-style>',
                $code
            );
        }

        if ($name === 'layout.html'
            && !str_contains($code, 'estilos/fluidez.css')) {
            $code = str_replace(
                '</head>',
                '<link rel="stylesheet" href="{{ doc_root }}estilos/fluidez.css?v='
                . self::FLUIDITY_VERSION . '"></head>',
                $code
            );
        }

        // A página de confirmação usa o documento de login, fora do layout comum.
        if ($name === 'login.html' && !str_contains($code, 'estilos/theme.css')) {
            $code = str_replace(
                '</head>',
                '<link rel="stylesheet" href="{{ doc_root }}'
                . 'estilos/theme.css?v=' . self::STABILITY_VERSION . '"></head>',
                $code
            );
        }

        // Só antecipa o fundo nos documentos que carregam o tema correspondente.
        if (str_contains($code, 'estilos/theme.css')) {
            $code = str_replace(
                '<meta charset="UTF-8">',
                '<meta charset="UTF-8">'
                . '<meta name="color-scheme" content="light dark">'
                . '<style>html,body{background:#fff}@media(prefers-color-scheme:dark){'
                . 'html,body{background:#000;color:#f5f5f7}}</style>',
                $code
            );
        }

        $position = stripos($code, '</head>');

        if ($position !== false) {
            $scripts = '';

            foreach ([
                'i18n-en',
                'i18n-en-2',
                'i18n-en-3',
                'i18n-en-4',
                'i18n-en-5',
                'i18n-en-6',
                'i18n'
            ] as $script) {
                $scripts .= '<script src="{{ doc_root }}js/'
                    . $script
                    . '.js?v='
                    . self::VERSION
                    . '"></script>'
                    . "\n";
            }

            $code = substr_replace($code, $scripts, $position, 0);
        }

        if ($this->webRelease !== '') {
            // Apply to local template assets; preserve existing resource query strings.
            $code = preg_replace_callback(
                '~(\{\{\s*doc_root\s*\}\}(?:js|estilos)/[^"\'\s<>?]+\.(?:js|css))(\?[^"\'\s<>]*)?(?=["\'])~',
                function (array $match): string {
                    $query = $match[2] ?? '';
                    return $match[1] . $query . ($query === '' ? '?' : '&')
                        . 'margot_release=' . $this->webRelease;
                },
                $code
            ) ?? $code;

            if ($name === 'layout.html') {
                $code = str_replace(
                    '</head>',
                    '{% if session.id %}<script defer src="{{ doc_root }}js/app-update.js?v='
                    . $this->webRelease . '" data-release="' . $this->webRelease
                    . '"></script>{% endif %}</head>',
                    $code
                );
            }
        }

        return new Source(
            $code,
            $source->getName(),
            $source->getPath()
        );
    }

    public function getCacheKey(string $name): string
    {
        return $this->loader->getCacheKey($name)
            . ':'
            . self::VERSION
            . ':'
            . self::STYLE_VERSION
            . ':'
            . self::VISUAL_VERSION
            . ':'
            . self::CHAT_VERSION
            . ':'
            . self::STABILITY_VERSION
            . ':'
            . self::KEYBOARD_VERSION
            . ':'
            . self::FLUIDITY_VERSION
            . ':'
            . self::MINI_MEDIA_VERSION
            . ':'
            . self::PRESENCE_CANVAS_VERSION
            . ':'
            . self::LOCATION_NOTICE_VERSION
            . ':web-updater-1:' . $this->webRelease;
    }

    public function isFresh(string $name, int $time): bool
    {
        return $this->loader->isFresh($name, $time);
    }

    public function exists(string $name): bool
    {
        return $this->loader->exists($name);
    }
}