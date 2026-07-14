$(function () {
    'use strict';

    var $miniMenu =
        $('.mini-menu');

    var sendingHey = false;

    $(document).on(
        'click',
        '.foto',
        function () {
            var $img = $(this);

            var membroId = String(
                $img.attr(
                    'data-membro-id'
                ) || ''
            ).trim();

            var nome = String(
                $img.attr(
                    'data-nome'
                ) || ''
            ).trim();

            var foto = String(
                $img.attr('src') ||
                ''
            ).trim();

            $miniMenu
                .attr(
                    'data-destinatario-id',
                    membroId
                );

            $miniMenu
                .find('header img')
                .attr({
                    src:
                        foto ||
                        '/imagens/fotos-perfil/default.webp',

                    alt:
                        nome ||
                        'Foto de perfil'
                });

            $miniMenu
                .find('header h1')
                .text(nome);

            $miniMenu
                .find('form')
                .attr(
                    'action',
                    window.messagesUrl +
                    '?sendTo=' +
                    encodeURIComponent(
                        membroId
                    )
                );
        }
    );

    $(document).on(
        'click',
        '#enviar-hey',
        function () {
            var $button = $(this);

            if (sendingHey) {
                return;
            }

            var destinatarioId =
                String(
                    $miniMenu.attr(
                        'data-destinatario-id'
                    ) || ''
                ).trim();

            if (!destinatarioId) {
                window
                    .mostrarMensagemTemporaria(
                        'Seleciona primeiro uma pessoa.',
                        'erro'
                    );

                return;
            }

            if (
                !window.AppWebSocket ||
                !window.AppWebSocket
                    .isConnected()
            ) {
                window
                    .mostrarMensagemTemporaria(
                        'A ligação está a ser restabelecida.',
                        'erro'
                    );

                if (
                    window.AppWebSocket
                ) {
                    window.AppWebSocket
                        .connect();
                }

                return;
            }

            sendingHey = true;

            $button
                .prop('disabled', true)
                .attr(
                    'aria-busy',
                    'true'
                );

            var sent =
                window.AppWebSocket.send({
                    type: 'notify',

                    destinatario_id:
                        destinatarioId
                });

            if (!sent) {
                window
                    .mostrarMensagemTemporaria(
                        'Não foi possível enviar o Hey.',
                        'erro'
                    );
            }

            window.setTimeout(
                function () {
                    sendingHey = false;

                    $button
                        .prop(
                            'disabled',
                            false
                        )
                        .removeAttr(
                            'aria-busy'
                        );
                },
                1200
            );
        }
    );

    $(document).on(
        'click',
        '#ativar-notificacoes',
        async function () {
            var $button =
                $(this);

            if (!window.isSecureContext) {
                window
                    .mostrarMensagemTemporaria(
                        'As notificações nativas exigem HTTPS.',
                        'erro'
                    );

                return;
            }

            if (
                !('Notification' in window)
            ) {
                window
                    .mostrarMensagemTemporaria(
                        'Este browser não suporta notificações.',
                        'erro'
                    );

                return;
            }

            if (
                Notification.permission ===
                'granted'
            ) {
                $button.text(
                    'Notificações ativadas'
                );

                return;
            }

            if (
                Notification.permission ===
                'denied'
            ) {
                window
                    .mostrarMensagemTemporaria(
                        'As notificações estão bloqueadas nas definições do browser.',
                        'erro'
                    );

                return;
            }

            try {
                var permission =
                    await Notification
                        .requestPermission();

                if (
                    permission ===
                    'granted'
                ) {
                    $button.text(
                        'Notificações ativadas'
                    );

                    window
                        .mostrarMensagemTemporaria(
                            'Notificações ativadas.',
                            'sucesso'
                        );

                    return;
                }

                window
                    .mostrarMensagemTemporaria(
                        'As notificações não foram autorizadas.',
                        'erro'
                    );
            } catch (error) {
                console.error(error);

                window
                    .mostrarMensagemTemporaria(
                        'Não foi possível ativar as notificações.',
                        'erro'
                    );
            }
        }
    );

    $(document).on(
        'websocket:status',
        function (
            event,
            status
        ) {
            var $status =
                $('#estado-ligacao');

            $status.attr(
                'data-status',
                status
            );

            switch (status) {
                case 'connected':
                    $status.text(
                        'Ligado'
                    );
                    break;

                case 'connecting':
                    $status.text(
                        'A ligar…'
                    );
                    break;

                case 'offline':
                    $status.text(
                        'Sem internet'
                    );
                    break;

                default:
                    $status.text(
                        'A restabelecer ligação…'
                    );
                    break;
            }
        }
    );

    if (
        window.isSecureContext &&
        'Notification' in window &&
        Notification.permission ===
            'granted'
    ) {
        $('#ativar-notificacoes')
            .text(
                'Notificações ativadas'
            );
    }
});