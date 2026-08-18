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

    if (!$pagina.length || !$mensagens.length || !$form.length) return;

    if (typeof window.desativarChatMargot === 'function') {
        window.desativarChatMargot();
    }

    var capacitor = window.Capacitor || null;
    var teclado = capacitor && capacitor.Plugins ? capacitor.Plugins.Keyboard : null;
    var tecladoListeners = [];

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

    var animacaoScrollTeclado = null;
    var aumentoScrollTeclado = 0;
    var ancorarScrollTeclado = false;
    var destinoScrollFecho = null;

    var preparacaoInicialConcluida = false;
    var temporizadorPreparacaoInicial = null;
    var instantePreparacaoInicial = 0;

    var curvaAbrirTeclado = criarCurvaBezier(
        0.303,
        0.886,
        0.436,
        0.976
    );

    var curvaFecharTeclado = criarCurvaBezier(
        0.335,
        0.884,
        0.381,
        0.961
    );

    function eIOSNativo() {
        return Boolean(
            capacitor &&
            typeof capacitor.isNativePlatform === 'function' &&
            capacitor.isNativePlatform() &&
            typeof capacitor.getPlatform === 'function' &&
            capacitor.getPlatform() === 'ios'
        );
    }

    function baseUrl() {
        return String(
            window.messagesUrl ||
            '/messages'
        ).replace(/\/+$/, '');
    }

    function conversaUrl() {
        return (
            baseUrl() +
            '/' +
            encodeURIComponent(outroId)
        );
    }

    function dataLocal(valor) {
        var texto = String(valor || '');

        var data = new Date(
            texto.replace(' ', 'T') +
            (
                texto.includes('Z')
                    ? ''
                    : 'Z'
            )
        );

        if (Number.isNaN(data.getTime())) return '';

        return data.toLocaleTimeString(
            'pt-PT',
            {
                hour: '2-digit',
                minute: '2-digit'
            }
        );
    }

    function minha(mensagem) {
        return (
            String(mensagem.emissor_id) ===
            String(window.membroId)
        );
    }

    function amostraBezier(tempo, ponto1, ponto2) {
        return (
            (
                (
                    1 -
                    3 * ponto2 +
                    3 * ponto1
                ) *
                tempo +
                (
                    3 * ponto2 -
                    6 * ponto1
                )
            ) *
            tempo *
            tempo +
            3 *
            ponto1 *
            tempo
        );
    }

    function derivadaBezier(tempo, ponto1, ponto2) {
        return (
            3 *
            (
                1 -
                3 * ponto2 +
                3 * ponto1
            ) *
            tempo *
            tempo +
            2 *
            (
                3 * ponto2 -
                6 * ponto1
            ) *
            tempo +
            3 *
            ponto1
        );
    }

    function criarCurvaBezier(x1, y1, x2, y2) {
        return function (progresso) {
            var tempo = progresso;

            for (
                var tentativa = 0;
                tentativa < 6;
                tentativa += 1
            ) {
                var diferenca =
                    amostraBezier(
                        tempo,
                        x1,
                        x2
                    ) -
                    progresso;

                var derivada =
                    derivadaBezier(
                        tempo,
                        x1,
                        x2
                    );

                if (Math.abs(derivada) < 0.000001) break;

                tempo =
                    tempo -
                    diferenca /
                    derivada;

                tempo =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            tempo
                        )
                    );
            }

            return amostraBezier(
                tempo,
                y1,
                y2
            );
        };
    }

    function deslocarParaFim(forcar) {
        if (
            !ativo ||
            !$mensagens[0] ||
            (
                !forcar &&
                !aFixarNoFim
            )
        ) {
            return;
        }

        window.requestAnimationFrame(function () {
            if (!ativo || !$mensagens[0]) return;

            $mensagens[0].scrollTop =
                $mensagens[0].scrollHeight;
        });
    }

    function fixarNoFimAposMudanca() {
        if (!ativo || !$mensagens[0]) return;

        aFixarNoFim = true;

        window.requestAnimationFrame(function () {
            if (!ativo || !$mensagens[0]) return;

            $mensagens[0].scrollTop =
                $mensagens[0].scrollHeight;

            window.requestAnimationFrame(function () {
                if (!ativo || !$mensagens[0]) return;

                $mensagens[0].scrollTop =
                    $mensagens[0].scrollHeight;
            });
        });
    }

    function cancelarAnimacaoScrollTeclado() {
        if (animacaoScrollTeclado !== null) {
            window.cancelAnimationFrame(
                animacaoScrollTeclado
            );

            animacaoScrollTeclado = null;
        }
    }

    function animarScrollAte(destino, duracao, curva) {
        cancelarAnimacaoScrollTeclado();

        var elemento = $mensagens[0];

        if (!ativo || !elemento) return;

        var maximo =
            Math.max(
                0,
                elemento.scrollHeight -
                elemento.clientHeight
            );

        destino =
            Math.max(
                0,
                Math.min(
                    destino,
                    maximo
                )
            );

        var origem = elemento.scrollTop;
        var diferenca = destino - origem;

        if (Math.abs(diferenca) < 0.5) {
            elemento.scrollTop = destino;
            return;
        }

        var inicio =
            window.performance.now();

        function animar(agora) {
            if (!ativo || !$mensagens[0]) {
                animacaoScrollTeclado = null;
                return;
            }

            var progresso =
                Math.min(
                    1,
                    (
                        agora -
                        inicio
                    ) /
                    duracao
                );

            elemento.scrollTop =
                origem +
                diferenca *
                curva(progresso);

            if (progresso < 1) {
                animacaoScrollTeclado =
                    window.requestAnimationFrame(
                        animar
                    );

                return;
            }

            elemento.scrollTop = destino;
            animacaoScrollTeclado = null;
        }

        animacaoScrollTeclado =
            window.requestAnimationFrame(
                animar
            );
    }

    function acompanharMedia($contexto, forcar) {
        $contexto
            .find('img')
            .each(function () {
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

        $contexto
            .find('video')
            .each(function () {
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

    function finalizarPreparacaoInicial() {
        if (preparacaoInicialConcluida) return;

        preparacaoInicialConcluida = true;

        instantePreparacaoInicial =
            window.performance.now();

        if (temporizadorPreparacaoInicial !== null) {
            window.clearTimeout(
                temporizadorPreparacaoInicial
            );

            temporizadorPreparacaoInicial = null;
        }

        if (!$mensagens[0]) return;

        var elemento = $mensagens[0];

        elemento.scrollTop =
            elemento.scrollHeight;

        window.requestAnimationFrame(function () {
            if (!ativo || !$mensagens[0]) return;

            elemento.scrollTop =
                elemento.scrollHeight;

            $mensagens
                .removeClass(
                    'chat-mensagens-a-preparar'
                )
                .attr(
                    'aria-busy',
                    'false'
                );
        });
    }

    function prepararConteudoInicial() {
        var elemento = $mensagens[0];

        if (!elemento) return;

        var pendentes = 0;

        var $recentes =
            $mensagens
                .find('.chat-mensagem')
                .slice(-14);

        $recentes
            .find('img.chat-imagem')
            .attr(
                'loading',
                'eager'
            );

        function terminouMediaInicial() {
            pendentes =
                Math.max(
                    0,
                    pendentes - 1
                );

            if (preparacaoInicialConcluida) {
                if (
                    aFixarNoFim &&
                    (
                        window.performance.now() -
                        instantePreparacaoInicial
                    ) <
                    800
                ) {
                    deslocarParaFim(false);
                }

                return;
            }

            if (pendentes === 0) {
                finalizarPreparacaoInicial();
            }
        }

        $mensagens
            .find('img.chat-imagem')
            .each(function () {
                if (this.complete) return;

                pendentes += 1;

                $(this).one(
                    'load.margotChatInicial error.margotChatInicial',
                    terminouMediaInicial
                );
            });

        $mensagens
            .find('video.chat-video')
            .each(function () {
                if (this.readyState >= 1) return;

                pendentes += 1;

                $(this).one(
                    'loadedmetadata.margotChatInicial error.margotChatInicial',
                    terminouMediaInicial
                );
            });

        elemento.scrollTop =
            elemento.scrollHeight;

        if (pendentes === 0) {
            window.requestAnimationFrame(
                finalizarPreparacaoInicial
            );

            return;
        }

        temporizadorPreparacaoInicial =
            window.setTimeout(
                finalizarPreparacaoInicial,
                180
            );
    }

    function tecladoVaiAbrir(info) {
        if (!ativo || !$mensagens[0]) return;

        if (!preparacaoInicialConcluida) {
            finalizarPreparacaoInicial();
        }

        cancelarAnimacaoScrollTeclado();

        var elemento = $mensagens[0];

        var altura =
            Math.max(
                0,
                Number(
                    info &&
                    info.keyboardHeight
                ) ||
                0
            );

        var distanciaAoFim =
            Math.max(
                0,
                elemento.scrollHeight -
                elemento.clientHeight -
                elemento.scrollTop
            );

        ancorarScrollTeclado =
            aFixarNoFim ||
            distanciaAoFim <
            96;

        var alturaScrollAntes =
            elemento.scrollHeight;

        document.documentElement.style.setProperty(
            '--margot-keyboard-height',
            altura + 'px'
        );

        document.body.classList.add(
            'margot-chat-teclado-pronto'
        );

        aumentoScrollTeclado =
            Math.max(
                0,
                elemento.scrollHeight -
                alturaScrollAntes
            );

        destinoScrollFecho = null;

        document.body.classList.add(
            'margot-chat-teclado-aberto'
        );

        if (!ancorarScrollTeclado) return;

        window.requestAnimationFrame(function () {
            if (!ativo || !$mensagens[0]) return;

            animarScrollAte(
                Math.max(
                    0,
                    elemento.scrollHeight -
                    elemento.clientHeight
                ),
                294,
                curvaAbrirTeclado
            );
        });
    }

    function tecladoAbriu(info) {
        if (!ativo || !$mensagens[0]) return;

        var altura =
            Math.max(
                0,
                Number(
                    info &&
                    info.keyboardHeight
                ) ||
                0
            );

        if (altura > 0) {
            document.documentElement.style.setProperty(
                '--margot-keyboard-height',
                altura + 'px'
            );
        }

        if (ancorarScrollTeclado) {
            aFixarNoFim = true;
        }
    }

    function tecladoVaiFechar() {
        if (!ativo || !$mensagens[0]) return;

        cancelarAnimacaoScrollTeclado();

        var elemento = $mensagens[0];

        document.body.classList.remove(
            'margot-chat-teclado-aberto'
        );

        if (!ancorarScrollTeclado) return;

        destinoScrollFecho =
            Math.max(
                0,
                elemento.scrollHeight -
                elemento.clientHeight -
                aumentoScrollTeclado
            );

        animarScrollAte(
            destinoScrollFecho,
            313,
            curvaFecharTeclado
        );
    }

    function tecladoFechou() {
        if (!ativo || !$mensagens[0]) return;

        window.requestAnimationFrame(function () {
            if (!ativo || !$mensagens[0]) return;

            document.body.classList.remove(
                'margot-chat-teclado-aberto'
            );

            document.body.classList.remove(
                'margot-chat-teclado-pronto'
            );

            document.documentElement.style.setProperty(
                '--margot-keyboard-height',
                '0px'
            );

            aumentoScrollTeclado = 0;
            ancorarScrollTeclado = false;
            destinoScrollFecho = null;
        });
    }

    async function prepararTecladoNativo() {
        if (!teclado) return;

        if (
            eIOSNativo() &&
            typeof teclado.setAccessoryBarVisible ===
                'function'
        ) {
            try {
                await teclado.setAccessoryBarVisible({
                    isVisible: false
                });
            } catch (erro) {
                console.warn(
                    'Não foi possível ocultar a barra auxiliar do teclado.',
                    erro
                );
            }
        }

        if (
            typeof teclado.addListener !==
            'function'
        ) {
            return;
        }

        try {
            tecladoListeners.push(
                await teclado.addListener(
                    'keyboardWillShow',
                    tecladoVaiAbrir
                )
            );

            tecladoListeners.push(
                await teclado.addListener(
                    'keyboardDidShow',
                    tecladoAbriu
                )
            );

            tecladoListeners.push(
                await teclado.addListener(
                    'keyboardWillHide',
                    tecladoVaiFechar
                )
            );

            tecladoListeners.push(
                await teclado.addListener(
                    'keyboardDidHide',
                    tecladoFechou
                )
            );
        } catch (erro) {
            console.warn(
                'Não foi possível acompanhar o teclado nativo.',
                erro
            );
        }
    }

    async function restaurarTecladoNativo() {
        var listeners =
            tecladoListeners.slice();

        tecladoListeners = [];

        listeners.forEach(function (listener) {
            if (
                listener &&
                typeof listener.remove ===
                    'function'
            ) {
                Promise.resolve(
                    listener.remove()
                ).catch(
                    function () {}
                );
            }
        });

        cancelarAnimacaoScrollTeclado();

        document.body.classList.remove(
            'margot-chat-teclado-aberto'
        );

        document.body.classList.remove(
            'margot-chat-teclado-pronto'
        );

        document.documentElement.style.setProperty(
            '--margot-keyboard-height',
            '0px'
        );

        if (
            teclado &&
            eIOSNativo() &&
            typeof teclado.setAccessoryBarVisible ===
                'function'
        ) {
            try {
                await teclado.setAccessoryBarVisible({
                    isVisible: true
                });
            } catch (erro) {}
        }
    }

    function criarMensagem(mensagem) {
        var eMinha =
            minha(mensagem);

        var $artigo =
            $('<article>', {
                class:
                    'chat-mensagem ' +
                    (
                        eMinha
                            ? 'minha'
                            : 'recebida'
                    ),

                'data-mensagem-id':
                    mensagem.id,

                'data-emissor-id':
                    mensagem.emissor_id
            });

        var $balao =
            $('<div>', {
                class: 'chat-balao'
            });

        if (
            mensagem.tipo === 'imagem' &&
            mensagem.media_url
        ) {
            $balao.append(
                $('<img>', {
                    class: 'chat-imagem',
                    src: mensagem.media_url,

                    alt:
                        'Fotografia enviada por ' +
                        (
                            mensagem.emissor_nome ||
                            'utilizador'
                        ),

                    loading: 'eager',
                    draggable: false
                })
            );
        }

        if (
            mensagem.tipo === 'video' &&
            mensagem.media_url
        ) {
            var $video =
                $('<video>', {
                    class: 'chat-video',
                    controls: true,
                    playsinline: true,
                    preload: 'metadata'
                });

            $video.append(
                $('<source>', {
                    src:
                        mensagem.media_url,

                    type:
                        mensagem.ficheiro_mime ||
                        'video/mp4'
                })
            );

            $balao.append($video);
        }

        if (mensagem.texto) {
            $balao.append(
                $('<p>').text(
                    mensagem.texto
                )
            );
        }

        var $rodape =
            $('<footer>').append(
                $('<time>', {
                    datetime:
                        mensagem.criada_em
                }).text(
                    dataLocal(
                        mensagem.criada_em
                    )
                )
            );

        if (eMinha) {
            $rodape.append(
                $('<span>', {
                    class: 'chat-lida',

                    'aria-label':
                        mensagem.lida
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
            $balao.append(
                $rodape
            )
        );
    }

    function adicionarMensagem(
        mensagem,
        deslocar
    ) {
        var id =
            Number(mensagem.id) ||
            0;

        if (
            !id ||
            $mensagens.find(
                '[data-mensagem-id="' +
                id +
                '"]'
            ).length
        ) {
            return false;
        }

        var $novaMensagem =
            criarMensagem(
                mensagem
            );

        $mensagens.append(
            $novaMensagem
        );

        ultimoId =
            Math.max(
                ultimoId,
                id
            );

        if (deslocar !== false) {
            acompanharMedia(
                $novaMensagem,
                true
            );

            fixarNoFimAposMudanca();
        }

        return true;
    }

    function temConteudoParaEnviar() {
        return Boolean(
            $texto.val().trim() ||
            (
                $media[0] &&
                $media[0].files &&
                $media[0].files.length
            )
        );
    }

    function atualizarEstadoEnviar() {
        var temConteudo =
            temConteudoParaEnviar();

        $enviar
            .toggleClass(
                'ativo',
                temConteudo
            )
            .prop(
                'disabled',
                aEnviar ||
                !temConteudo
            );

        if (!aEnviar) {
            $enviar.text('Enviar');
        }
    }

    function limparMedia() {
        if (previewUrl) {
            URL.revokeObjectURL(
                previewUrl
            );
        }

        previewUrl = null;

        $media.val('');

        $preview
            .empty()
            .prop(
                'hidden',
                true
            );

        atualizarEstadoEnviar();
    }

    function mostrarPreview(ficheiro) {
        if (previewUrl) {
            URL.revokeObjectURL(
                previewUrl
            );
        }

        previewUrl = null;

        $preview
            .empty()
            .prop(
                'hidden',
                true
            );

        $erro
            .prop(
                'hidden',
                true
            )
            .text('');

        if (!ficheiro) {
            atualizarEstadoEnviar();
            return;
        }

        var eVideo =
            ficheiro.type.startsWith(
                'video/'
            );

        var limite =
            eVideo
                ? 100 * 1024 * 1024
                : 15 * 1024 * 1024;

        if (ficheiro.size > limite) {
            $media.val('');

            $erro
                .text(
                    eVideo
                        ? 'O vídeo pode ter no máximo 100 MB.'
                        : 'A fotografia pode ter no máximo 15 MB.'
                )
                .prop(
                    'hidden',
                    false
                );

            atualizarEstadoEnviar();
            return;
        }

        previewUrl =
            URL.createObjectURL(
                ficheiro
            );

        var $conteudo =
            eVideo
                ? $('<video>', {
                    src: previewUrl,
                    muted: true,
                    controls: true,
                    playsinline: true
                })
                : $('<img>', {
                    src: previewUrl,
                    alt: 'Pré-visualização',
                    draggable: false
                });

        $preview
            .append(
                $conteudo,

                $('<button>', {
                    type: 'button',
                    class: 'chat-media-remover',
                    'aria-label': 'Remover ficheiro'
                }).text('×')
            )
            .prop(
                'hidden',
                false
            );

        atualizarEstadoEnviar();
    }

    function publicarMensagem(mensagemId) {
        if (
            !window.AppWebSocket ||
            !window.AppWebSocket.isConnected()
        ) {
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
            !temConteudoParaEnviar()
        ) {
            return;
        }

        aEnviar = true;
        aFixarNoFim = true;

        $enviar
            .prop(
                'disabled',
                true
            )
            .text(
                'A enviar…'
            );

        $erro
            .prop(
                'hidden',
                true
            )
            .text('');

        try {
            var resposta =
                await fetch(
                    conversaUrl(),
                    {
                        method: 'POST',
                        body:
                            new FormData(
                                $form[0]
                            ),
                        credentials:
                            'same-origin'
                    }
                );

            var dados =
                await resposta.json();

            if (
                !resposta.ok ||
                !dados.success
            ) {
                throw new Error(
                    dados.message ||
                    'Não foi possível enviar a mensagem.'
                );
            }

            adicionarMensagem(
                dados.message
            );

            $texto
                .val('')
                .css(
                    'height',
                    'auto'
                );

            limparMedia();

            fixarNoFimAposMudanca();

            publicarMensagem(
                dados.message.id
            );
        } catch (erro) {
            $erro
                .text(
                    erro.message
                )
                .prop(
                    'hidden',
                    false
                );
        } finally {
            aEnviar = false;
            atualizarEstadoEnviar();
        }
    }

    async function marcarComoLidas() {
        if (
            document.visibilityState ===
            'hidden'
        ) {
            return;
        }

        var corpo =
            new FormData();

        corpo.set(
            'action',
            'mark_read'
        );

        try {
            await fetch(
                conversaUrl(),
                {
                    method: 'POST',
                    body: corpo,
                    credentials: 'same-origin'
                }
            );

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
            var resposta =
                await fetch(
                    conversaUrl() +
                    '?api=history&after_id=' +
                    ultimoId,
                    {
                        credentials: 'same-origin',
                        cache: 'no-store'
                    }
                );

            var dados =
                await resposta.json();

            if (
                !resposta.ok ||
                !dados.success
            ) {
                return;
            }

            var recebeu = false;

            (
                dados.messages ||
                []
            ).forEach(function (mensagem) {
                if (
                    adicionarMensagem(
                        mensagem
                    ) &&
                    !minha(mensagem)
                ) {
                    recebeu = true;
                }
            });

            if (recebeu) {
                marcarComoLidas();
            }
        } catch (erro) {
            console.error(erro);
        }
    }

    function atualizarConfirmacoes(
        lidoPor,
        ultimoLido
    ) {
        if (
            String(lidoPor) !==
            outroId
        ) {
            return;
        }

        $mensagens
            .find('.chat-mensagem.minha')
            .each(function () {
                if (
                    Number(
                        $(this).attr(
                            'data-mensagem-id'
                        )
                    ) <=
                    Number(
                        ultimoLido
                    )
                ) {
                    $(this)
                        .find('.chat-lida')
                        .text('✓✓')
                        .attr(
                            'aria-label',
                            'Lida'
                        );
                }
            });
    }

    $mensagens
        .find('.chat-mensagem')
        .each(function () {
            ultimoId =
                Math.max(
                    ultimoId,
                    Number(
                        $(this).attr(
                            'data-mensagem-id'
                        )
                    ) ||
                    0
                );
        });

    $mensagens
        .find(
            'time[data-data-mensagem]'
        )
        .each(function () {
            $(this).text(
                dataLocal(
                    $(this).attr(
                        'datetime'
                    )
                )
            );
        });

    prepararConteudoInicial();

    $mensagens.on(
        'pointerdown.margotChatScroll touchstart.margotChatScroll wheel.margotChatScroll',
        function () {
            cancelarAnimacaoScrollTeclado();
            ancorarScrollTeclado = false;
            aFixarNoFim = false;
        }
    );

    $form.on(
        'submit',
        enviarMensagem
    );

    $enviar.on(
        'pointerdown.margotChatEnviar',
        function (evento) {
            if (
                aEnviar ||
                $enviar.prop(
                    'disabled'
                )
            ) {
                return;
            }

            if (
                evento.pointerType === 'mouse' &&
                evento.button !== 0
            ) {
                return;
            }

            evento.preventDefault();

            $form.trigger(
                'submit'
            );
        }
    );

    $enviar.on(
        'click.margotChatEnviar',
        function (evento) {
            evento.preventDefault();

            if (
                aEnviar ||
                $enviar.prop(
                    'disabled'
                )
            ) {
                return;
            }

            $form.trigger(
                'submit'
            );
        }
    );

    $media.on(
        'change',
        function () {
            mostrarPreview(
                this.files[0]
            );
        }
    );

    $preview.on(
        'click',
        '.chat-media-remover',
        limparMedia
    );

    $texto.on(
        'input',
        function () {
            this.style.height =
                'auto';

            this.style.height =
                Math.min(
                    this.scrollHeight,
                    120
                ) +
                'px';

            atualizarEstadoEnviar();
        }
    );

    $texto.on(
        'keydown',
        function (evento) {
            if (
                evento.key === 'Enter' &&
                !evento.shiftKey
            ) {
                evento.preventDefault();

                $form.trigger(
                    'submit'
                );
            }
        }
    );

    function aoReceberMensagem(evento) {
        var mensagem =
            evento.detail.message;

        if (!mensagem) return;

        var pertence =
            (
                String(
                    mensagem.emissor_id
                ) ===
                    outroId &&
                String(
                    mensagem.destinatario_id
                ) ===
                    String(
                        window.membroId
                    )
            ) ||
            (
                String(
                    mensagem.emissor_id
                ) ===
                    String(
                        window.membroId
                    ) &&
                String(
                    mensagem.destinatario_id
                ) ===
                    outroId
            );

        if (
            pertence &&
            adicionarMensagem(
                mensagem
            ) &&
            !minha(
                mensagem
            )
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
        if (
            document.visibilityState ===
            'visible'
        ) {
            procurarNovasMensagens();
            marcarComoLidas();
        }
    }

    window.addEventListener(
        'app:chat-message',
        aoReceberMensagem
    );

    window.addEventListener(
        'app:chat-messages-read',
        aoLerMensagens
    );

    document.addEventListener(
        'visibilitychange',
        aoAlterarVisibilidade
    );

    $('#menuPrincipal a')
        .removeClass('active');

    atualizarEstadoEnviar();
    prepararTecladoNativo();
    marcarComoLidas();

    var temporizador =
        window.setInterval(
            procurarNovasMensagens,
            5000
        );

    function desativarChat() {
        if (!ativo) return;

        ativo = false;

        window.clearInterval(
            temporizador
        );

        if (
            temporizadorPreparacaoInicial !==
            null
        ) {
            window.clearTimeout(
                temporizadorPreparacaoInicial
            );

            temporizadorPreparacaoInicial = null;
        }

        cancelarAnimacaoScrollTeclado();

        aumentoScrollTeclado = 0;
        ancorarScrollTeclado = false;
        destinoScrollFecho = null;

        $mensagens.off(
            '.margotChatScroll'
        );

        $mensagens
            .find('img, video')
            .off('.margotChatScroll')
            .off('.margotChatInicial');

        $enviar.off(
            '.margotChatEnviar'
        );

        document.body.classList.remove(
            'margot-chat-teclado-aberto'
        );

        document.body.classList.remove(
            'margot-chat-teclado-pronto'
        );

        document.documentElement.style.setProperty(
            '--margot-keyboard-height',
            '0px'
        );

        restaurarTecladoNativo();

        window.removeEventListener(
            'app:chat-message',
            aoReceberMensagem
        );

        window.removeEventListener(
            'app:chat-messages-read',
            aoLerMensagens
        );

        document.removeEventListener(
            'visibilitychange',
            aoAlterarVisibilidade
        );

        document.removeEventListener(
            'margot:page-leave',
            desativarChat
        );

        window.removeEventListener(
            'pagehide',
            desativarChat
        );

        limparMedia();

        if (
            window.desativarChatMargot ===
            desativarChat
        ) {
            delete window.desativarChatMargot;
        }

        if (
            String(
                window.chatMembroId ||
                ''
            ) ===
            outroId
        ) {
            delete window.chatMembroId;
        }
    }

    window.desativarChatMargot =
        desativarChat;

    document.addEventListener(
        'margot:page-leave',
        desativarChat
    );

    window.addEventListener(
        'pagehide',
        desativarChat
    );
})(
    window,
    document,
    jQuery
);