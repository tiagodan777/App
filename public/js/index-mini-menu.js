(function (window, document, $) {
    'use strict';

    var $miniMenu = $('.mini-menu');
    var aEnviarHey = false;

    if ($miniMenu.length === 0) {
        return;
    }

    function texto(valor) {
        return String(valor || '').trim();
    }

    function urlFoto(valor) {
        var caminho = texto(valor);

        if (!caminho) {
            caminho = '/imagens/fotos-perfil/default.webp';
        }

        try {
            return new URL(
                caminho,
                window.location.href
            ).href;
        } catch (erro) {
            return '/imagens/fotos-perfil/default.webp';
        }
    }

    function obterMembroId(elemento) {
        return texto(
            elemento.getAttribute('data-membro-id') ||
            elemento.getAttribute('data-id') ||
            elemento.id
        );
    }

    function obterNome(elemento) {
        return texto(
            elemento.getAttribute('data-nome') ||
            elemento.getAttribute('alt')
        );
    }

    function obterFoto(elemento) {
        return urlFoto(
            elemento.currentSrc ||
            elemento.src ||
            elemento.getAttribute('src')
        );
    }

    function prepararMiniMenu(elemento) {
        if (!elemento) {
            return false;
        }

        var membroId = obterMembroId(elemento);
        var nome = obterNome(elemento);
        var foto = obterFoto(elemento);

        if (!membroId) {
            return false;
        }

        $miniMenu.attr(
            'data-destinatario-id',
            membroId
        );

        var imagem = $miniMenu
            .find('header img')
            .get(0);

        if (imagem) {
            imagem.onerror = function () {
                this.onerror = null;
                this.src = urlFoto(
                    '/imagens/fotos-perfil/default.webp'
                );
            };

            imagem.src = foto;
            imagem.alt = nome || 'Fotografia de perfil';
        }

        $miniMenu
            .find('header h1')
            .text(nome || 'Utilizador');

        if (window.messagesUrl) {
            $miniMenu
                .find('form')
                .attr(
                    'action',
                    window.messagesUrl +
                    '?sendTo=' +
                    encodeURIComponent(membroId)
                );
        }

        return true;
    }

    function mostrarMensagem(mensagem, tipo) {
        if (
            typeof window.mostrarMensagemTemporaria ===
            'function'
        ) {
            window.mostrarMensagemTemporaria(
                mensagem,
                tipo
            );
        }
    }

    function libertarBotaoHey() {
        aEnviarHey = false;

        $('#enviar-hey')
            .prop('disabled', false)
            .removeAttr('aria-busy');
    }

    window.prepararMiniMenuDaFoto =
        prepararMiniMenu;

    $(document).on(
        'pointerdown',
        '.foto',
        function () {
            /*
             * No iPhone, o pointerup usado para abrir o menu pode
             * impedir o click seguinte. Guardamos os dados logo no
             * primeiro contacto para o painel nunca abrir vazio.
             */
            prepararMiniMenu(this);
        }
    );

    $(document).on(
        'click',
        '.foto',
        function () {
            prepararMiniMenu(this);
        }
    );

    $(document).on(
        'click',
        '#enviar-hey',
        function (evento) {
            evento.preventDefault();
            evento.stopPropagation();

            if (aEnviarHey) {
                return;
            }

            var $botao = $(this);

            var destinatarioId = texto(
                $miniMenu.attr(
                    'data-destinatario-id'
                )
            );

            if (!destinatarioId) {
                mostrarMensagem(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (
                !window.AppWebSocket ||
                !window.AppWebSocket.isConnected()
            ) {
                mostrarMensagem(
                    'A ligação está a ser restabelecida.',
                    'erro'
                );

                if (window.AppWebSocket) {
                    window.AppWebSocket.connect();
                }

                return;
            }

            aEnviarHey = true;

            $botao
                .prop('disabled', true)
                .attr('aria-busy', 'true');

            var enviado = window.AppWebSocket.send({
                type: 'notify',
                destinatario_id: destinatarioId
            });

            if (!enviado) {
                libertarBotaoHey();

                mostrarMensagem(
                    'Não foi possível enviar o Hey.',
                    'erro'
                );

                return;
            }

            window.setTimeout(
                libertarBotaoHey,
                1200
            );
        }
    );

    window.addEventListener(
        'app:hey-enviado',
        libertarBotaoHey
    );

    window.addEventListener(
        'app:hey-erro',
        libertarBotaoHey
    );
})(window, document, jQuery);