$(function () {
    'use strict';

    var $miniMenu =
        $('.mini-menu');

    var envioEmCurso = false;

    /*
    |--------------------------------------------------------------------------
    | Selecionar pessoa
    |--------------------------------------------------------------------------
    */

    $(document).on(
        'click',
        '.foto',
        function () {
            var $foto = $(this);

            var membroId = String(
                $foto.attr(
                    'data-membro-id'
                ) || ''
            ).trim();

            var nome = String(
                $foto.attr(
                    'data-nome'
                ) || ''
            ).trim();

            var src = String(
                $foto.attr('src') || ''
            ).trim();

            $miniMenu.attr(
                'data-destinatario-id',
                membroId
            );

            $miniMenu
                .find('header img')
                .attr({
                    src:
                        src ||
                        '/imagens/fotos-perfil/default.webp',

                    alt:
                        nome ||
                        'Foto de perfil'
                });

            $miniMenu
                .find('header h1')
                .text(nome);

            if (window.messagesUrl) {
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
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Enviar Hey
    |--------------------------------------------------------------------------
    */

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
                !window.AppWebSocket
                    .isConnected()
            ) {
                window.mostrarMensagemTemporaria(
                    'A ligação está a ser restabelecida.',
                    'erro'
                );

                if (window.AppWebSocket) {
                    window.AppWebSocket
                        .connect();
                }

                return;
            }

            envioEmCurso = true;

            $botao
                .prop('disabled', true)
                .attr(
                    'aria-busy',
                    'true'
                );

            var enviado =
                window.AppWebSocket.send({
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
                        .prop(
                            'disabled',
                            false
                        )
                        .removeAttr(
                            'aria-busy'
                        );
                },
                1000
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Estado da ligação
    |--------------------------------------------------------------------------
    */

    $(document).on(
        'websocket:status',
        function (
            event,
            status
        ) {
            var $estado =
                $('#estado-ligacao');

            $estado.attr(
                'data-status',
                status
            );

            switch (status) {
                case 'connected':
                    $estado.text(
                        'Ligado'
                    );
                    break;

                case 'connecting':
                    $estado.text(
                        'A ligar…'
                    );
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
});