'use strict';

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

        var destino =
            evento.notification
                .data?.url ||
            '/index';

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