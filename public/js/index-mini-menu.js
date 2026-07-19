(function (window, document, $) {
    'use strict';

    var $miniMenu = $('.mini-menu');
    var $anexo = $miniMenu.find('.mini-menu-anexo');
    var aEnviarHey = false;
    var aEnviarMensagem = false;

    if (!$miniMenu.length) return;

    function texto(valor) {
        return String(valor || '').trim();
    }

    function urlFoto(valor) {
        try {
            return new URL(
                texto(valor) ||
                '/imagens/fotos-perfil/default.webp',
                window.location.href
            ).href;
        } catch (erro) {
            return '/imagens/fotos-perfil/default.webp';
        }
    }

    function membroId(elemento) {
        return texto(
            elemento.getAttribute('data-membro-id') ||
            elemento.getAttribute('data-id') ||
            elemento.id
        );
    }

    function nome(elemento) {
        return texto(
            elemento.getAttribute('data-nome') ||
            elemento.getAttribute('alt') ||
            elemento.getAttribute('title')
        ) || 'Utilizador';
    }

    function foto(elemento) {
        return urlFoto(
            elemento.currentSrc ||
            elemento.src ||
            elemento.getAttribute('src')
        );
    }

    function baseUrl(valor, fallback) {
        return texto(valor || fallback).replace(/\/+$/, '');
    }

    function prepararMiniMenu(elemento) {
        if (!elemento) return false;

        var id = membroId(elemento);

        if (!id) return false;

        var membroNome = nome(elemento);
        var souEu = id === texto(window.membroId);
        var imagem = $miniMenu.find('header img').get(0);

        $miniMenu
            .attr('data-destinatario-id', id)
            .toggleClass('perfil-proprio', souEu);

        $miniMenu.find('.mini-menu-perfil').attr(
            'href',
            baseUrl(window.profileUrl, '/profile') +
            '/' +
            encodeURIComponent(id)
        );

        $miniMenu
            .find('header h1')
            .text(membroNome);

        $miniMenu.find('form').attr(
            'action',
            baseUrl(window.messagesUrl, '/messages') +
            '/' +
            encodeURIComponent(id)
        );

        if (imagem) {
            imagem.onerror = function () {
                this.onerror = null;
                this.src = urlFoto(
                    '/imagens/fotos-perfil/default.webp'
                );
            };

            imagem.src = foto(elemento);
            imagem.alt = membroNome;
        }

        return true;
    }

    function aviso(mensagem, tipo) {
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

    function libertarHey() {
        aEnviarHey = false;

        $('#enviar-hey')
            .prop('disabled', false)
            .removeAttr('aria-busy');
    }

    window.prepararMiniMenuDaFoto =
        prepararMiniMenu;

    $(document).on(
        'pointerdown click',
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

            if (aEnviarHey) return;

            var id = texto(
                $miniMenu.attr(
                    'data-destinatario-id'
                )
            );

            if (!id) {
                aviso(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (
                !window.AppWebSocket ||
                !window.AppWebSocket.isConnected()
            ) {
                aviso(
                    'A ligação está a ser restabelecida.',
                    'erro'
                );

                if (window.AppWebSocket) {
                    window.AppWebSocket.connect();
                }

                return;
            }

            aEnviarHey = true;

            $(this)
                .prop('disabled', true)
                .attr('aria-busy', 'true');

            var enviado = window.AppWebSocket.send({
                type: 'notify',
                destinatario_id: id
            });

            if (!enviado) {
                libertarHey();

                aviso(
                    'Não foi possível enviar o Hey.',
                    'erro'
                );

                return;
            }

            window.setTimeout(
                libertarHey,
                1200
            );
        }
    );

    $(document).on(
        'submit',
        '.mini-menu form',
        async function (evento) {
            evento.preventDefault();

            if (aEnviarMensagem) return;

            var id = texto(
                $miniMenu.attr(
                    'data-destinatario-id'
                )
            );

            var $form = $(this);
            var $botao = $form.find(
                '[type="submit"]'
            );

            var dados = new FormData(this);
            var ficheiro = dados.get('media');

            if (!id) {
                aviso(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (
                !texto(dados.get('mensagem')) &&
                !(
                    ficheiro instanceof File &&
                    ficheiro.size
                )
            ) {
                return;
            }

            dados.set('action', 'send');
            aEnviarMensagem = true;

            $botao
                .prop('disabled', true)
                .val('A enviar…');

            try {
                var resposta = await fetch(
                    baseUrl(
                        window.messagesUrl,
                        '/messages'
                    ) +
                    '/' +
                    encodeURIComponent(id),
                    {
                        method: 'POST',
                        body: dados,
                        credentials: 'same-origin'
                    }
                );

                var resultado =
                    await resposta.json();

                if (
                    !resposta.ok ||
                    !resultado.success
                ) {
                    throw new Error(
                        resultado.message ||
                        'Não foi possível enviar a mensagem.'
                    );
                }

                this.reset();

                $anexo
                    .removeClass('selecionado')
                    .text('+')
                    .attr(
                        'aria-label',
                        'Adicionar fotografia ou vídeo'
                    );

                aviso(
                    'Mensagem enviada.',
                    'sucesso'
                );

                if (
                    window.AppWebSocket &&
                    window.AppWebSocket.isConnected()
                ) {
                    window.AppWebSocket.send({
                        type: 'chat_publish',
                        message_id:
                            resultado.message.id
                    });
                }
            } catch (erro) {
                aviso(
                    erro.message,
                    'erro'
                );
            } finally {
                aEnviarMensagem = false;

                $botao
                    .prop('disabled', false)
                    .val('Enviar');
            }
        }
    );

    $(document).on(
        'change',
        '#mini-menu-media',
        function () {
            var ficheiro =
                this.files &&
                this.files[0];

            $anexo
                .toggleClass(
                    'selecionado',
                    Boolean(ficheiro)
                )
                .text(ficheiro ? '✓' : '+')
                .attr(
                    'aria-label',
                    ficheiro
                        ? ficheiro.name
                        : 'Adicionar fotografia ou vídeo'
                );
        }
    );

    window.addEventListener(
        'app:hey-enviado',
        libertarHey
    );

    window.addEventListener(
        'app:hey-erro',
        libertarHey
    );
})(window, document, jQuery);