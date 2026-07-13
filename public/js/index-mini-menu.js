$(function () {
    var $miniMenu = $('.mini-menu');

    /*
    |--------------------------------------------------------------------------
    | Abrir o perfil ao clicar numa fotografia
    |--------------------------------------------------------------------------
    */

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
                $img.attr('src') || ''
            ).trim();

            $miniMenu
                .find('img')
                .attr({
                    src:
                        foto ||
                        '/imagens/fotos-perfil/default.webp',

                    alt:
                        nome ||
                        'Foto de perfil'
                });

            $miniMenu
                .find('h1')
                .text(nome);

            /*
             * Guardamos no mini-menu o ID real do membro.
             */
            $miniMenu.attr(
                'data-destinatario-id',
                membroId
            );

            /*
             * window.messagesUrl é definido no Twig.
             */
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

    /*
    |--------------------------------------------------------------------------
    | Enviar Hey
    |--------------------------------------------------------------------------
    */

    $(document).on(
        'click',
        '#enviar-hey',
        function () {
            var $botao = $(this);

            var destinatarioId =
                String(
                    $miniMenu.attr(
                        'data-destinatario-id'
                    ) || ''
                ).trim();

            if (!destinatarioId) {
                console.error(
                    'Não existe um destinatário selecionado.'
                );

                mostrarMensagemTemporaria(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (!window.ws) {
                console.error(
                    'O WebSocket ainda não foi criado.'
                );

                mostrarMensagemTemporaria(
                    'A ligação ainda não está disponível.',
                    'erro'
                );

                return;
            }

            if (
                window.ws.readyState !==
                WebSocket.OPEN
            ) {
                console.error(
                    'O WebSocket não está ligado.'
                );

                mostrarMensagemTemporaria(
                    'A ligação foi interrompida.',
                    'erro'
                );

                return;
            }

            $botao.prop(
                'disabled',
                true
            );

            window.ws.send(
                JSON.stringify({
                    type: 'notify',

                    destinatario_id:
                        destinatarioId
                })
            );

            /*
             * Impede vários cliques quase simultâneos.
             */
            setTimeout(function () {
                $botao.prop(
                    'disabled',
                    false
                );
            }, 1000);
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Pedir autorização para notificações do browser
    |--------------------------------------------------------------------------
    */

    $(document).on(
        'click',
        '#ativar-notificacoes',
        async function () {
            var $botao = $(this);

            if (
                !('Notification' in window)
            ) {
                mostrarMensagemTemporaria(
                    'Este browser não suporta notificações.',
                    'erro'
                );

                return;
            }

            if (
                Notification.permission ===
                'granted'
            ) {
                mostrarMensagemTemporaria(
                    'As notificações já estão ativadas.',
                    'sucesso'
                );

                $botao.text(
                    'Notificações ativadas'
                );

                return;
            }

            if (
                Notification.permission ===
                'denied'
            ) {
                mostrarMensagemTemporaria(
                    'As notificações estão bloqueadas nas definições do browser.',
                    'erro'
                );

                return;
            }

            try {
                var permissao =
                    await Notification
                        .requestPermission();

                if (
                    permissao ===
                    'granted'
                ) {
                    $botao.text(
                        'Notificações ativadas'
                    );

                    mostrarMensagemTemporaria(
                        'Notificações ativadas.',
                        'sucesso'
                    );

                    return;
                }

                mostrarMensagemTemporaria(
                    'As notificações não foram autorizadas.',
                    'erro'
                );
            } catch (erro) {
                console.error(
                    'Erro ao pedir autorização:',
                    erro
                );

                mostrarMensagemTemporaria(
                    'Não foi possível ativar as notificações.',
                    'erro'
                );
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Atualizar texto inicial do botão
    |--------------------------------------------------------------------------
    */

    if (
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