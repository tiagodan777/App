<?php
declare(strict_types=1);

namespace App\CMS;

use Twig\Loader\LoaderInterface;
use Twig\Source;

/** Adds presentation scripts to documents before Twig interpolates member data. */
final class LanguageTemplateLoader implements LoaderInterface
{
    private const VERSION = '20261007-reaction-push-1';
    private const CHAT_VERSION = '20261008-gallery-connection-1';
    private const STYLE_VERSION = '20261006-ui-2';
    private const VISUAL_VERSION = '20261008-compact-alerts-2';

    public function __construct(private LoaderInterface $loader)
    {
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

        foreach (['js/chat.js', 'js/websocket-alerts.js', 'js/hey-vibracao.js', 'js/javascript-geral.js'] as $asset) {
            $code = preg_replace(
                '~' . preg_quote($asset, '~') . '(?:\?v=[^"\s<>]*)?~',
                $asset . '?v=' . self::CHAT_VERSION,
                $code
            ) ?? $code;
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
            . self::CHAT_VERSION;
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