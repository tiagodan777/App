'use strict';

function obterDestinoSeguro(valor) {
    try {
        var url = new URL(
            typeof valor === 'string' && valor.trim() !== ''
                ? valor
                : '/index',
            self.location.origin
        );

        if (url.origin !== self.location.origin) {
            return '/index';
        }

        return url.pathname + url.search + url.hash;
    } catch (erro) {
        return '/index';
    }
}

self.addEventListener(
    'install',
    function (evento) {
        evento.waitUntil(
            self.skipWaiting()
        );
    }
);

self.addEventListener(
    'activate',
    function (evento) {
        evento.waitUntil(
            self.clients.claim()
        );
    }
);

self.addEventListener(
    'notificationclick',
    function (evento) {
        evento.notification.close();

        var destino = obterDestinoSeguro(
            evento.notification.data?.url
        );

        evento.waitUntil(
            self.clients
                .matchAll({
                    type: 'window',
                    includeUncontrolled:
                        true
                })
                .then(
                    function (janelas) {
                        for (
                            var janela
                            of janelas
                        ) {
                            if (
                                'focus'
                                in janela
                            ) {
                                janela.navigate(
                                    destino
                                );

                                return janela
                                    .focus();
                            }
                        }

                        if (
                            self.clients
                                .openWindow
                        ) {
                            return self.clients
                                .openWindow(
                                    destino
                                );
                        }

                        return undefined;
                    }
                )
        );
    }
);
