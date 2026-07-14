$(function () {
    'use strict';

    var $miniMenu = $('.mini-menu');
    var envioEmCurso = false;

    $(document).on(
        'click',
        '#enviar-hey',
        function () {
            if (envioEmCurso) {
                return;
            }

            var $botao = $(this);

            var destinatarioId = String(
                $miniMenu.attr(
                    'data-destinatario-id'
                ) || ''
            ).trim();

            if (destinatarioId === '') {
                window.mostrarMensagemTemporaria(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (
                !window.AppWebSocket ||
                !window.AppWebSocket.isConnected()
            ) {
                window.mostrarMensagemTemporaria(
                    'A ligação está a ser restabelecida.',
                    'erro'
                );

                if (window.AppWebSocket) {
                    window.AppWebSocket.connect();
                }

                return;
            }

            envioEmCurso = true;

            $botao
                .prop('disabled', true)
                .attr('aria-busy', 'true');

            var enviado = window.AppWebSocket.send({
                type: 'notify',
                destinatario_id:
                    destinatarioId
            });

            if (!enviado) {
                window.mostrarMensagemTemporaria(
                    'Não foi possível enviar o Hey.',
                    'erro'
                );
            }

            window.setTimeout(
                function () {
                    envioEmCurso = false;

                    $botao
                        .prop('disabled', false)
                        .removeAttr('aria-busy');
                },
                1000
            );
        }
    );

    $(document).on(
        'click',
        '#ativar-notificacoes',
        async function () {
            var $botao = $(this);

            if (!window.isSecureContext) {
                window.mostrarMensagemTemporaria(
                    'As notificações nativas exigem HTTPS.',
                    'erro'
                );

                return;
            }

            if (!('Notification' in window)) {
                window.mostrarMensagemTemporaria(
                    'Este browser não suporta notificações.',
                    'erro'
                );

                return;
            }

            if (
                Notification.permission ===
                'granted'
            ) {
                $botao.text(
                    'Notificações ativadas'
                );

                return;
            }

            if (
                Notification.permission ===
                'denied'
            ) {
                window.mostrarMensagemTemporaria(
                    'As notificações estão bloqueadas nas definições do browser.',
                    'erro'
                );

                return;
            }

            try {
                var permissao =
                    await Notification
                        .requestPermission();

                if (permissao === 'granted') {
                    $botao.text(
                        'Notificações ativadas'
                    );

                    window.mostrarMensagemTemporaria(
                        'Notificações ativadas.',
                        'sucesso'
                    );

                    return;
                }

                window.mostrarMensagemTemporaria(
                    'As notificações não foram autorizadas.',
                    'erro'
                );
            } catch (error) {
                console.error(error);

                window.mostrarMensagemTemporaria(
                    'Não foi possível ativar as notificações.',
                    'erro'
                );
            }
        }
    );

    $(document).on(
        'websocket:status',
        function (event, status) {
            var $estado =
                $('#estado-ligacao');

            $estado.attr(
                'data-status',
                status
            );

            switch (status) {
                case 'connected':
                    $estado.text('Ligado');
                    break;

                case 'connecting':
                    $estado.text('A ligar…');
                    break;

                case 'offline':
                    $estado.text(
                        'Sem internet'
                    );
                    break;

                default:
                    $estado.text(
                        'A restabelecer ligação…'
                    );
                    break;
            }
        }
    );

    if (
        window.isSecureContext &&
        'Notification' in window &&
        Notification.permission === 'granted'
    ) {
        $('#ativar-notificacoes').text(
            'Notificações ativadas'
        );
    }
});