(function (window, document, $) {
    'use strict';

    var $pagina = $('#chat-pagina');
    var $mensagens = $('#chat-mensagens');
    var $form = $('#chat-form');
    var $texto = $('#chat-texto');
    var $media = $('#chat-media');
    var $preview = $('#chat-media-preview');
    var $erro = $('#chat-erro');
    var $enviar = $('#chat-enviar');

    var outroId = String(
        $pagina.attr('data-outro-id') ||
        window.chatMembroId ||
        ''
    );

    var ultimoId = 0;
    var previewUrl = null;
    var aEnviar = false;
    var ativo = true;
    var aFixarNoFim = true;
    var temporizadoresScroll = [];

    if (!$pagina.length || !$mensagens.length || !$form.length) return;

    if (typeof window.desativarChatMargot === 'function') {
        window.desativarChatMargot();
    }

    function deslocarParaFim(forcar) {
        if (
            !ativo ||
            !$mensagens[0] ||
            (!forcar && !aFixarNoFim)
        ) {
            return;
        }

        window.requestAnimationFrame(function () {
            if (!ativo || !$mensagens[0]) return;

            $mensagens[0].scrollTop = $mensagens[0].scrollHeight;
        });
    }

    function acompanharMedia($contexto, forcar) {
        $contexto.find('img').each(function () {
            var imagem = this;

            if (imagem.complete) {
                deslocarParaFim(forcar);
                return;
            }

            $(imagem).one(
                'load.margotChatScroll error.margotChatScroll',
                function () {
                    deslocarParaFim(forcar);
                }
            );
        });

        $contexto.find('video').each(function () {
            var video = this;

            if (video.readyState >= 1) {
                deslocarParaFim(forcar);
                return;
            }

            $(video).one(
                'loadedmetadata.margotChatScroll error.margotChatScroll',
                function () {
                    deslocarParaFim(forcar);
                }
            );
        });
    }

    function prepararScrollInicial() {
        acompanharMedia($mensagens, false);

        [0, 60, 180, 420, 900, 1600].forEach(function (atraso) {
            temporizadoresScroll.push(
                window.setTimeout(function () {
                    deslocarParaFim(false);
                }, atraso)
            );
        });
    }

    function baseUrl() {
        return String(window.messagesUrl || '/messages').replace(/\/+$/, '');
    }

    function conversaUrl() {
        return baseUrl() + '/' + encodeURIComponent(outroId);
    }

    function dataLocal(valor) {
        var texto = String(valor || '');
        var data = new Date(texto.replace(' ', 'T') + (texto.includes('Z') ? '' : 'Z'));

        return Number.isNaN(data.getTime())
            ? ''
            : data.toLocaleTimeString('pt-PT', {
                hour: '2-digit',
                minute: '2-digit'
            });
    }

    function minha(mensagem) {
        return String(mensagem.emissor_id) === String(window.membroId);
    }

    function criarMensagem(mensagem) {
        var eMinha = minha(mensagem);

        var $artigo = $('<article>', {
            class: 'chat-mensagem ' + (eMinha ? 'minha' : 'recebida'),
            'data-mensagem-id': mensagem.id,
            'data-emissor-id': mensagem.emissor_id
        });

        var $balao = $('<div>', {
            class: 'chat-balao'
        });

        if (mensagem.tipo === 'imagem' && mensagem.media_url) {
            var $imagem = $('<img>', {
                src: mensagem.media_url,
                alt: 'Fotografia enviada por ' + (
                    mensagem.emissor_nome ||
                    'utilizador'
                ),
                loading: 'lazy'
            });

            $balao.append(
                $('<a>', {
                    href: mensagem.media_url,
                    target: '_blank',
                    rel: 'noopener',
                    class: 'chat-media-link'
                }).append($imagem)
            );
        }

        if (mensagem.tipo === 'video' && mensagem.media_url) {
            var $video = $('<video>', {
                controls: true,
                playsinline: true,
                preload: 'metadata'
            });

            $video.append(
                $('<source>', {
                    src: mensagem.media_url,
                    type: mensagem.ficheiro_mime || 'video/mp4'
                })
            );

            $balao.append(
                $video,
                $('<a>', {
                    href: mensagem.media_url,
                    target: '_blank',
                    rel: 'noopener',
                    class: 'chat-video-abrir'
                }).text('Abrir vídeo')
            );
        }

        if (mensagem.texto) {
            $balao.append(
                $('<p>').text(mensagem.texto)
            );
        }

        var $rodape = $('<footer>').append(
            $('<time>', {
                datetime: mensagem.criada_em
            }).text(dataLocal(mensagem.criada_em))
        );

        if (eMinha) {
            $rodape.append(
                $('<span>', {
                    class: 'chat-lida',
                    'aria-label': mensagem.lida
                        ? 'Lida'
                        : 'Enviada'
                }).text(
                    mensagem.lida
                        ? '✓✓'
                        : '✓'
                )
            );
        }

        return $artigo.append(
            $balao.append($rodape)
        );
    }

    function adicionarMensagem(mensagem, deslocar) {
        var id = Number(mensagem.id) || 0;

        if (!id || $mensagens.find('[data-mensagem-id="' + id + '"]').length) {
            return false;
        }

        var $novaMensagem = criarMensagem(mensagem);

        $mensagens.append($novaMensagem);

        ultimoId = Math.max(ultimoId, id);

        if (deslocar !== false) {
            acompanharMedia($novaMensagem, true);
            deslocarParaFim(true);
        }

        return true;
    }

    function limparMedia() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);

        previewUrl = null;
        $media.val('');
        $preview.empty().prop('hidden', true);
    }

    function mostrarPreview(ficheiro) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);

        previewUrl = null;
        $preview.empty().prop('hidden', true);
        $erro.prop('hidden', true).text('');

        if (!ficheiro) return;

        var eVideo = ficheiro.type.startsWith('video/');
        var limite = eVideo ? 100 * 1024 * 1024 : 15 * 1024 * 1024;

        if (ficheiro.size > limite) {
            $media.val('');
            $erro.text(eVideo ? 'O vídeo pode ter no máximo 100 MB.' : 'A fotografia pode ter no máximo 15 MB.').prop('hidden', false);
            return;
        }

        previewUrl = URL.createObjectURL(ficheiro);

        var $conteudo = eVideo
            ? $('<video>', {src: previewUrl, muted: true, controls: true, playsinline: true})
            : $('<img>', {src: previewUrl, alt: 'Pré-visualização'});

        $preview.append(
            $conteudo,
            $('<button>', {
                type: 'button',
                class: 'chat-media-remover',
                'aria-label': 'Remover ficheiro'
            }).text('×')
        ).prop('hidden', false);
    }

    function publicarMensagem(mensagemId) {
        if (!window.AppWebSocket || !window.AppWebSocket.isConnected()) {
            return;
        }

        window.AppWebSocket.send({
            type: 'chat_publish',
            message_id: mensagemId
        });
    }

    async function enviarMensagem(evento) {
        evento.preventDefault();

        if (
            aEnviar ||
            (
                !$texto.val().trim() &&
                !$media[0].files.length
            )
        ) {
            return;
        }

        aEnviar = true;

        $enviar
            .prop('disabled', true)
            .text('A enviar…');

        $erro.prop('hidden', true).text('');

        try {
            var resposta = await fetch(conversaUrl(), {
                method: 'POST',
                body: new FormData($form[0]),
                credentials: 'same-origin'
            });

            var dados = await resposta.json();

            if (!resposta.ok || !dados.success) {
                throw new Error(
                    dados.message ||
                    'Não foi possível enviar a mensagem.'
                );
            }

            adicionarMensagem(dados.message);

            $texto.val('').css('height', 'auto');

            limparMedia();
            publicarMensagem(dados.message.id);
        } catch (erro) {
            $erro.text(erro.message).prop('hidden', false);
        } finally {
            aEnviar = false;

            $enviar
                .prop('disabled', false)
                .text('Enviar');
        }
    }

    async function marcarComoLidas() {
        if (document.visibilityState === 'hidden') return;

        var corpo = new FormData();

        corpo.set('action', 'mark_read');

        try {
            await fetch(conversaUrl(), {
                method: 'POST',
                body: corpo,
                credentials: 'same-origin'
            });

            if (
                window.AppWebSocket &&
                window.AppWebSocket.isConnected()
            ) {
                window.AppWebSocket.send({
                    type: 'chat_read',
                    with_member_id: outroId
                });
            }
        } catch (erro) {
            console.error(erro);
        }
    }

    async function procurarNovasMensagens() {
        try {
            var resposta = await fetch(
                conversaUrl() +
                '?api=history&after_id=' +
                ultimoId,
                {
                    credentials: 'same-origin',
                    cache: 'no-store'
                }
            );

            var dados = await resposta.json();

            if (!resposta.ok || !dados.success) return;

            var recebeu = false;

            (dados.messages || []).forEach(function (mensagem) {
                if (adicionarMensagem(mensagem) && !minha(mensagem)) {
                    recebeu = true;
                }
            });

            if (recebeu) marcarComoLidas();
        } catch (erro) {
            console.error(erro);
        }
    }

    function atualizarConfirmacoes(lidoPor, ultimoLido) {
        if (String(lidoPor) !== outroId) return;

        $mensagens.find('.chat-mensagem.minha').each(function () {
            if (
                Number($(this).attr('data-mensagem-id')) <=
                Number(ultimoLido)
            ) {
                $(this)
                    .find('.chat-lida')
                    .text('✓✓')
                    .attr('aria-label', 'Lida');
            }
        });
    }

    $mensagens.find('.chat-mensagem').each(function () {
        ultimoId = Math.max(
            ultimoId,
            Number($(this).attr('data-mensagem-id')) || 0
        );
    });

    $mensagens.find('time[data-data-mensagem]').each(function () {
        $(this).text(
            dataLocal($(this).attr('datetime'))
        );
    });

    prepararScrollInicial();

    $mensagens.on(
        'pointerdown.margotChatScroll touchstart.margotChatScroll wheel.margotChatScroll',
        function () {
            aFixarNoFim = false;
        }
    );

    $form.on('submit', enviarMensagem);

    $media.on('change', function () {
        mostrarPreview(this.files[0]);
    });

    $preview.on(
        'click',
        '.chat-media-remover',
        limparMedia
    );

    $texto.on('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    $texto.on('keydown', function (evento) {
        if (evento.key === 'Enter' && !evento.shiftKey) {
            evento.preventDefault();
            $form.trigger('submit');
        }
    });

    function aoReceberMensagem(evento) {
        var mensagem = evento.detail.message;

        if (!mensagem) return;

        var pertence =
            (
                String(mensagem.emissor_id) === outroId &&
                String(mensagem.destinatario_id) === String(window.membroId)
            ) ||
            (
                String(mensagem.emissor_id) === String(window.membroId) &&
                String(mensagem.destinatario_id) === outroId
            );

        if (
            pertence &&
            adicionarMensagem(mensagem) &&
            !minha(mensagem)
        ) {
            marcarComoLidas();
        }
    }

    function aoLerMensagens(evento) {
        atualizarConfirmacoes(
            evento.detail.reader_id,
            evento.detail.last_message_id
        );
    }

    function aoAlterarVisibilidade() {
        if (document.visibilityState === 'visible') {
            procurarNovasMensagens();
            marcarComoLidas();
        }
    }

    window.addEventListener('app:chat-message', aoReceberMensagem);
    window.addEventListener('app:chat-messages-read', aoLerMensagens);
    document.addEventListener('visibilitychange', aoAlterarVisibilidade);

    $('#menuPrincipal a').removeClass('active');
    $('#menuPrincipal a[href*="messages"]').first().addClass('active');

    marcarComoLidas();

    var temporizador = window.setInterval(
        procurarNovasMensagens,
        5000
    );

    function desativarChat() {
        if (!ativo) return;

        ativo = false;
        window.clearInterval(temporizador);

        temporizadoresScroll.forEach(function (temporizadorScroll) {
            window.clearTimeout(temporizadorScroll);
        });

        temporizadoresScroll = [];

        $mensagens.off('.margotChatScroll');
        $mensagens.find('img, video').off('.margotChatScroll');

        window.removeEventListener('app:chat-message', aoReceberMensagem);
        window.removeEventListener('app:chat-messages-read', aoLerMensagens);
        document.removeEventListener('visibilitychange', aoAlterarVisibilidade);
        document.removeEventListener('margot:page-leave', desativarChat);
        window.removeEventListener('pagehide', desativarChat);

        limparMedia();

        if (window.desativarChatMargot === desativarChat) {
            delete window.desativarChatMargot;
        }

        if (String(window.chatMembroId || '') === outroId) {
            delete window.chatMembroId;
        }
    }

    window.desativarChatMargot = desativarChat;

    document.addEventListener('margot:page-leave', desativarChat);
    window.addEventListener('pagehide', desativarChat);
})(window, document, jQuery);