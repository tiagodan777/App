(function (window) {
    'use strict';

    var app = null;
    var HOST_DEEP_LINK = 'go.margot-app.com';
    var URL_LOGIN = 'https://margot-app.com/login';

    function estaNaAplicacaoNativa() {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform() &&
            typeof window.Capacitor.registerPlugin === 'function'
        );
    }

    function obterApp() {
        if (app) {
            return app;
        }

        app = window.Capacitor.registerPlugin('App');

        return app;
    }

    function obterDestino(urlRecebido) {
        if (!urlRecebido) {
            return null;
        }

        try {
            var url = new URL(urlRecebido);

            if (
                url.protocol !== 'https:' ||
                url.hostname !== HOST_DEEP_LINK
            ) {
                return null;
            }

            if (
                url.pathname === '/login' ||
                url.pathname.indexOf('/login/') === 0
            ) {
                return URL_LOGIN;
            }
        } catch (erro) {
            console.error('[Margot Deep Links]', erro);
        }

        return null;
    }

    function abrirDeepLink(urlRecebido) {
        var destino = obterDestino(urlRecebido);

        if (!destino) {
            return;
        }

        try {
            var urlDestino = new URL(destino);

            if (
                window.location.hostname === urlDestino.hostname &&
                (
                    window.location.pathname === urlDestino.pathname ||
                    window.location.pathname === urlDestino.pathname + '/'
                )
            ) {
                return;
            }
        } catch (erro) {
            console.error('[Margot Deep Links]', erro);
        }

        window.location.assign(destino);
    }

    async function iniciar() {
        if (!estaNaAplicacaoNativa()) {
            return;
        }

        try {
            var appPlugin = obterApp();

            await appPlugin.addListener(
                'appUrlOpen',
                function (evento) {
                    if (evento && evento.url) {
                        abrirDeepLink(evento.url);
                    }
                }
            );

            var lancamento = await appPlugin.getLaunchUrl();

            if (lancamento && lancamento.url) {
                abrirDeepLink(lancamento.url);
            }
        } catch (erro) {
            console.error('[Margot Deep Links]', erro);
        }
    }

    iniciar();
}(window));
