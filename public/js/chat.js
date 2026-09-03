(function (window, document, $) {
    'use strict';

    var $pagina = $('#chat-pagina');
    var $mensagens = $('#chat-mensagens');
    var $conteudo = $('#chat-mensagens-conteudo');
    var $form = $('#chat-form');
    var $texto = $('#chat-texto');
    var $media = $('#chat-media');
    var $preview = $('#chat-media-preview');
    var $erro = $('#chat-erro');
    var $enviar = $('#chat-enviar');

    if (
        !$pagina.length ||
        !$mensagens.length ||
        !$conteudo.length ||
        !$form.length
    ) {
        return;
    }

    if (
        typeof window.desativarChatMargot ===
        'function'
    ) {
        window.desativarChatMargot();
    }

    var NS = '.margotChat';

    var capacitor =
        window.Capacitor ||
        null;

    var teclado =
        capacitor &&
        capacitor.Plugins
            ? capacitor.Plugins.Keyboard
            : null;

    var viewport =
        window.visualViewport ||
        null;

    var tecladoListeners = [];

    var outroId =
        String(
            $pagina.attr(
                'data-outro-id'
            ) ||
            window.chatMembroId ||
            ''
        );

    var ultimoId = 0;
    var previewUrl = null;
    var aEnviar = false;
    var ativo = true;
    var aFixarNoFim = true;

    var LONG_PRESS_REACAO_MS = 2000;
    var DOUBLE_TAP_REACAO_MS = 330;
    var gestoReacao = null;
    var ultimoTapReacao = {
        id: 0,
        instante: 0
    };
    var $menuReacoes = null;

    var observadorForm = null;
    var alturaForm = 0;
    var rafForm = null;
    var rafTexto = null;
    var rafViewport = null;

    var temporizadorFallbackTeclado =
        null;

    var tecladoPluginAberto =
        false;

    var alturaTecladoPlugin =
        0;

    var viewportTecladoAtivo =
        false;

    var alturaViewportBase =
        0;

    var preparacaoInicialConcluida =
        false;

    var temporizadorPreparacaoInicial =
        null;

    var instantePreparacaoInicial =
        0;

    function eIOSNativo() {
        return Boolean(
            capacitor &&
            typeof capacitor
                .isNativePlatform ===
                'function' &&
            capacitor
                .isNativePlatform() &&
            typeof capacitor
                .getPlatform ===
                'function' &&
            capacitor
                .getPlatform() ===
                'ios'
        );
    }

    function baseUrl() {
        return String(
            window.messagesUrl ||
            '/messages'
        ).replace(
            /\/+$/,
            ''
        );
    }

    function conversaUrl() {
        return (
            baseUrl() +
            '/' +
            encodeURIComponent(
                outroId
            )
        );
    }

    function dataLocal(valor) {
        var texto =
            String(
                valor ||
                ''
            );

        var data =
            new Date(
                texto.replace(
                    ' ',
                    'T'
                ) +
                (
                    texto.includes(
                        'Z'
                    )
                        ? ''
                        : 'Z'
                )
            );

        if (
            Number.isNaN(
                data.getTime()
            )
        ) {
            return '';
        }

        return data
            .toLocaleTimeString(
                'pt-PT',
                {
                    hour:
                        '2-digit',

                    minute:
                        '2-digit'
                }
            );
    }

    function minha(
        mensagem
    ) {
        return (
            String(
                mensagem.emissor_id
            ) ===
            String(
                window.membroId
            )
        );
    }

    function websocketLigado() {
        return Boolean(
            window.AppWebSocket &&
            typeof window
                .AppWebSocket
                .isConnected ===
                'function' &&
            window.AppWebSocket
                .isConnected()
        );
    }

    function maximoScroll() {
        var elemento =
            $mensagens[0];

        if (
            !elemento
        ) {
            return 0;
        }

        return Math.max(
            0,
            elemento.scrollHeight -
            elemento.clientHeight
        );
    }

    function distanciaAoFim() {
        var elemento =
            $mensagens[0];

        if (
            !elemento
        ) {
            return 0;
        }

        return Math.max(
            0,
            elemento.scrollHeight -
            elemento.clientHeight -
            elemento.scrollTop
        );
    }

    function irParaFimAgora() {
        if (
            !ativo ||
            !$mensagens[0]
        ) {
            return;
        }

        $mensagens[0].scrollTop =
            maximoScroll();
    }

    function deslocarParaFim(
        forcar
    ) {
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

        window.requestAnimationFrame(
            function () {
                if (
                    !ativo ||
                    !$mensagens[0]
                ) {
                    return;
                }

                irParaFimAgora();
            }
        );
    }

    function fixarNoFimAposMudanca() {
        if (
            !ativo ||
            !$mensagens[0]
        ) {
            return;
        }

        aFixarNoFim =
            true;

        window.requestAnimationFrame(
            function () {
                if (
                    !ativo
                ) {
                    return;
                }

                irParaFimAgora();

                window.requestAnimationFrame(
                    function () {
                        if (
                            !ativo
                        ) {
                            return;
                        }

                        irParaFimAgora();
                    }
                );
            }
        );
    }

    /*
     * TECLADO
     *
     * Não animamos scrollTop nem padding.
     *
     * A própria scroll layer das mensagens
     * e o compositor deslocam-se juntos.
     *
     * Se visualViewport acompanhar o teclado,
     * seguimos a posição real dele frame a frame.
     */

    function definirAlturaTeclado(
        altura
    ) {
        altura =
            Math.max(
                0,
                Math.round(
                    Number(
                        altura
                    ) ||
                    0
                )
            );

        $pagina[0]
            .style
            .setProperty(
                '--margot-keyboard-height',
                altura +
                'px'
            );
    }

    function alturaVisualAtual() {
        if (
            !viewport
        ) {
            return 0;
        }

        var limiteVisivel =
            Number(
                viewport.height ||
                0
            ) +
            Math.max(
                0,
                Number(
                    viewport.offsetTop ||
                    0
                )
            );

        if (
            !alturaViewportBase
        ) {
            alturaViewportBase =
                Math.max(
                    Number(
                        window.innerHeight ||
                        0
                    ),
                    limiteVisivel
                );
        }

        if (
            !tecladoPluginAberto &&
            !viewportTecladoAtivo
        ) {
            alturaViewportBase =
                Math.max(
                    Number(
                        window.innerHeight ||
                        0
                    ),
                    limiteVisivel
                );
        }

        return Math.max(
            0,
            alturaViewportBase -
            limiteVisivel
        );
    }

    function cancelarFallbackTeclado() {
        if (
            temporizadorFallbackTeclado ===
            null
        ) {
            return;
        }

        window.clearTimeout(
            temporizadorFallbackTeclado
        );

        temporizadorFallbackTeclado =
            null;
    }

    function aplicarViewport() {
        rafViewport =
            null;

        if (
            !ativo ||
            !viewport
        ) {
            return;
        }

        var altura =
            alturaVisualAtual();

        if (
            altura >
            24
        ) {
            viewportTecladoAtivo =
                true;

            cancelarFallbackTeclado();

            document.body
                .classList
                .remove(
                    'margot-chat-teclado-fallback'
                );

            definirAlturaTeclado(
                altura
            );

            return;
        }

        if (
            !tecladoPluginAberto
        ) {
            viewportTecladoAtivo =
                false;

            document.body
                .classList
                .remove(
                    'margot-chat-teclado-fallback'
                );

            definirAlturaTeclado(
                0
            );
        }
    }

    function agendarViewport() {
        if (
            rafViewport !==
            null
        ) {
            return;
        }

        rafViewport =
            window
                .requestAnimationFrame(
                    aplicarViewport
                );
    }

    function tecladoVaiAbrir(
        info
    ) {
        if (
            !ativo
        ) {
            return;
        }

        tecladoPluginAberto =
            true;

        alturaTecladoPlugin =
            Math.max(
                0,
                Number(
                    info &&
                    info.keyboardHeight
                ) ||
                0
            );

        cancelarFallbackTeclado();

        /*
         * Damos alguns milissegundos ao
         * visualViewport para começar a mexer.
         *
         * Só usamos a animação artificial
         * se o WebView não reportar o movimento.
         */
        temporizadorFallbackTeclado =
            window.setTimeout(
                function () {
                    temporizadorFallbackTeclado =
                        null;

                    if (
                        !ativo ||
                        !tecladoPluginAberto ||
                        viewportTecladoAtivo
                    ) {
                        return;
                    }

                    document.body
                        .classList
                        .add(
                            'margot-chat-teclado-fallback'
                        );

                    definirAlturaTeclado(
                        alturaTecladoPlugin
                    );
                },
                40
            );

        agendarViewport();
    }

    function tecladoAbriu(
        info
    ) {
        if (
            !ativo
        ) {
            return;
        }

        tecladoPluginAberto =
            true;

        alturaTecladoPlugin =
            Math.max(
                0,
                Number(
                    info &&
                    info.keyboardHeight
                ) ||
                alturaTecladoPlugin
            );

        agendarViewport();

        if (
            !viewportTecladoAtivo &&
            alturaTecladoPlugin >
            0
        ) {
            definirAlturaTeclado(
                alturaTecladoPlugin
            );
        }
    }

    function tecladoVaiFechar() {
        if (
            !ativo
        ) {
            return;
        }

        cancelarFallbackTeclado();

        tecladoPluginAberto =
            false;

        /*
         * Se visualViewport está ativo,
         * deixamo-lo levar a altura até zero.
         */
        if (
            viewportTecladoAtivo
        ) {
            agendarViewport();
            return;
        }

        document.body
            .classList
            .add(
                'margot-chat-teclado-fallback'
            );

        definirAlturaTeclado(
            0
        );
    }

    function tecladoFechou() {
        if (
            !ativo
        ) {
            return;
        }

        cancelarFallbackTeclado();

        tecladoPluginAberto =
            false;

        alturaTecladoPlugin =
            0;

        agendarViewport();

        window.requestAnimationFrame(
            function () {
                if (
                    !ativo
                ) {
                    return;
                }

                if (
                    alturaVisualAtual() <=
                    24
                ) {
                    viewportTecladoAtivo =
                        false;

                    document.body
                        .classList
                        .remove(
                            'margot-chat-teclado-fallback'
                        );

                    definirAlturaTeclado(
                        0
                    );
                }
            }
        );
    }

    async function prepararTecladoNativo() {
        if (
            viewport
        ) {
            alturaViewportBase =
                Math.max(
                    Number(
                        window.innerHeight ||
                        0
                    ),

                    Number(
                        viewport.height ||
                        0
                    ) +
                    Math.max(
                        0,
                        Number(
                            viewport.offsetTop ||
                            0
                        )
                    )
                );

            viewport.addEventListener(
                'resize',
                agendarViewport
            );

            viewport.addEventListener(
                'scroll',
                agendarViewport
            );
        }

        if (
            !teclado
        ) {
            return;
        }

        if (
            eIOSNativo() &&
            typeof teclado
                .setAccessoryBarVisible ===
                'function'
        ) {
            try {
                await teclado
                    .setAccessoryBarVisible({
                        isVisible:
                            false
                    });
            } catch (
                erro
            ) {
                console.warn(
                    'Não foi possível ocultar a barra auxiliar do teclado.',
                    erro
                );
            }
        }

        if (
            typeof teclado
                .addListener !==
                'function'
        ) {
            return;
        }

        try {
            tecladoListeners.push(
                await teclado
                    .addListener(
                        'keyboardWillShow',
                        tecladoVaiAbrir
                    )
            );

            tecladoListeners.push(
                await teclado
                    .addListener(
                        'keyboardDidShow',
                        tecladoAbriu
                    )
            );

            tecladoListeners.push(
                await teclado
                    .addListener(
                        'keyboardWillHide',
                        tecladoVaiFechar
                    )
            );

            tecladoListeners.push(
                await teclado
                    .addListener(
                        'keyboardDidHide',
                        tecladoFechou
                    )
            );
        } catch (
            erro
        ) {
            console.warn(
                'Não foi possível acompanhar o teclado nativo.',
                erro
            );
        }
    }

    async function restaurarTecladoNativo() {
        cancelarFallbackTeclado();

        var listeners =
            tecladoListeners
                .slice();

        tecladoListeners =
            [];

        listeners.forEach(
            function (
                listener
            ) {
                if (
                    listener &&
                    typeof listener
                        .remove ===
                        'function'
                ) {
                    Promise
                        .resolve(
                            listener
                                .remove()
                        )
                        .catch(
                            function () {}
                        );
                }
            }
        );

        if (
            viewport
        ) {
            viewport.removeEventListener(
                'resize',
                agendarViewport
            );

            viewport.removeEventListener(
                'scroll',
                agendarViewport
            );
        }

        if (
            rafViewport !==
            null
        ) {
            window
                .cancelAnimationFrame(
                    rafViewport
                );

            rafViewport =
                null;
        }

        document.body
            .classList
            .remove(
                'margot-chat-teclado-fallback'
            );

        definirAlturaTeclado(
            0
        );

        if (
            teclado &&
            eIOSNativo() &&
            typeof teclado
                .setAccessoryBarVisible ===
                'function'
        ) {
            try {
                await teclado
                    .setAccessoryBarVisible({
                        isVisible:
                            true
                    });
            } catch (
                erro
            ) {}
        }
    }

    /*
     * ALTURA REAL DO FORMULÁRIO
     */

    function aplicarAlturaForm(
        novaAltura
    ) {
        novaAltura =
            Math.max(
                1,
                Math.ceil(
                    Number(
                        novaAltura
                    ) ||
                    0
                )
            );

        if (
            !novaAltura ||
            Math.abs(
                novaAltura -
                alturaForm
            ) <
            1
        ) {
            return;
        }

        alturaForm =
            novaAltura;

        $pagina[0]
            .style
            .setProperty(
                '--chat-form-altura',
                alturaForm +
                'px'
            );

        if (
            !aFixarNoFim
        ) {
            return;
        }

        if (
            rafForm !==
            null
        ) {
            window
                .cancelAnimationFrame(
                    rafForm
                );
        }

        rafForm =
            window
                .requestAnimationFrame(
                    function () {
                        rafForm =
                            null;

                        if (
                            !ativo ||
                            !aFixarNoFim
                        ) {
                            return;
                        }

                        irParaFimAgora();
                    }
                );
    }

    function prepararMedicaoForm() {
        aplicarAlturaForm(
            $form[0]
                .getBoundingClientRect()
                .height
        );

        if (
            typeof ResizeObserver !==
            'function'
        ) {
            return;
        }

        observadorForm =
            new ResizeObserver(
                function (
                    entradas
                ) {
                    if (
                        !ativo ||
                        !entradas.length
                    ) {
                        return;
                    }

                    var entrada =
                        entradas[0];

                    var tamanho =
                        entrada.borderBoxSize;

                    var altura =
                        0;

                    if (
                        tamanho
                    ) {
                        if (
                            Array.isArray(
                                tamanho
                            )
                        ) {
                            altura =
                                tamanho[0]
                                    ? tamanho[0]
                                        .blockSize
                                    : 0;
                        } else {
                            altura =
                                tamanho.blockSize ||
                                0;
                        }
                    }

                    if (
                        !altura
                    ) {
                        altura =
                            $form[0]
                                .getBoundingClientRect()
                                .height;
                    }

                    aplicarAlturaForm(
                        altura
                    );
                }
            );

        observadorForm
            .observe(
                $form[0]
            );
    }

    function acompanharMedia(
        $contexto,
        forcar
    ) {
        $contexto
            .find(
                'img'
            )
            .each(
                function () {
                    var imagem =
                        this;

                    if (
                        imagem.complete
                    ) {
                        deslocarParaFim(
                            forcar
                        );

                        return;
                    }

                    $(imagem).one(
                        'load.margotChatScroll error.margotChatScroll',
                        function () {
                            deslocarParaFim(
                                forcar
                            );
                        }
                    );
                }
            );

        $contexto
            .find(
                'video'
            )
            .each(
                function () {
                    var video =
                        this;

                    if (
                        video.readyState >=
                        1
                    ) {
                        deslocarParaFim(
                            forcar
                        );

                        return;
                    }

                    $(video).one(
                        'loadedmetadata.margotChatScroll error.margotChatScroll',
                        function () {
                            deslocarParaFim(
                                forcar
                            );
                        }
                    );
                }
            );
    }

    function finalizarPreparacaoInicial() {
        if (
            preparacaoInicialConcluida
        ) {
            return;
        }

        preparacaoInicialConcluida =
            true;

        instantePreparacaoInicial =
            window
                .performance
                .now();

        if (
            temporizadorPreparacaoInicial !==
            null
        ) {
            window.clearTimeout(
                temporizadorPreparacaoInicial
            );

            temporizadorPreparacaoInicial =
                null;
        }

        if (
            !$mensagens[0]
        ) {
            return;
        }

        irParaFimAgora();

        window.requestAnimationFrame(
            function () {
                if (
                    !ativo ||
                    !$mensagens[0]
                ) {
                    return;
                }

                irParaFimAgora();

                $mensagens
                    .removeClass(
                        'chat-mensagens-a-preparar'
                    )
                    .attr(
                        'aria-busy',
                        'false'
                    );
            }
        );
    }

    function prepararConteudoInicial() {
        var pendentes =
            0;

        var $recentes =
            $mensagens
                .find(
                    '.chat-mensagem'
                )
                .slice(
                    -14
                );

        $recentes
            .find(
                'img.chat-imagem'
            )
            .attr(
                'loading',
                'eager'
            );

        function terminouMediaInicial() {
            pendentes =
                Math.max(
                    0,
                    pendentes -
                    1
                );

            if (
                preparacaoInicialConcluida
            ) {
                if (
                    aFixarNoFim &&
                    (
                        window
                            .performance
                            .now() -
                        instantePreparacaoInicial
                    ) <
                    800
                ) {
                    deslocarParaFim(
                        false
                    );
                }

                return;
            }

            if (
                pendentes ===
                0
            ) {
                finalizarPreparacaoInicial();
            }
        }

        $mensagens
            .find(
                'img.chat-imagem'
            )
            .each(
                function () {
                    if (
                        this.complete
                    ) {
                        return;
                    }

                    pendentes +=
                        1;

                    $(this).one(
                        'load.margotChatInicial error.margotChatInicial',
                        terminouMediaInicial
                    );
                }
            );

        $mensagens
            .find(
                'video.chat-video'
            )
            .each(
                function () {
                    if (
                        this.readyState >=
                        1
                    ) {
                        return;
                    }

                    pendentes +=
                        1;

                    $(this).one(
                        'loadedmetadata.margotChatInicial error.margotChatInicial',
                        terminouMediaInicial
                    );
                }
            );

        irParaFimAgora();

        if (
            pendentes ===
            0
        ) {
            window
                .requestAnimationFrame(
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

    function normalizarReacoes(reacoes) {
        if (!Array.isArray(reacoes)) {
            return [];
        }

        return reacoes
            .map(function (reacao) {
                return {
                    member_id:
                        String(
                            reacao &&
                            (
                                reacao.member_id ||
                                reacao.membro_id
                            ) ||
                            ''
                        ),

                    emoji:
                        String(
                            reacao &&
                            reacao.emoji ||
                            ''
                        )
                };
            })
            .filter(function (reacao) {
                return Boolean(
                    reacao.member_id &&
                    reacao.emoji
                );
            });
    }

    function renderizarReacoesMensagem(
        $artigo,
        reacoes
    ) {
        if (!$artigo || !$artigo.length) {
            return;
        }

        reacoes = normalizarReacoes(reacoes);

        var $zona =
            $artigo.children(
                '.chat-reacoes'
            );

        if (!$zona.length) {
            $zona = $('<div>', {
                class:
                    'chat-reacoes',

                'aria-label':
                    'Reações à mensagem'
            });

            $artigo.append($zona);
        }

        $zona.empty();

        if (!reacoes.length) {
            $zona.prop('hidden', true);
            return;
        }

        var agrupadas = Object.create(null);

        reacoes.forEach(function (reacao) {
            if (!agrupadas[reacao.emoji]) {
                agrupadas[reacao.emoji] = {
                    emoji: reacao.emoji,
                    count: 0,
                    minha: false
                };
            }

            agrupadas[reacao.emoji].count += 1;

            if (
                reacao.member_id ===
                String(window.membroId || '')
            ) {
                agrupadas[reacao.emoji].minha = true;
            }
        });

        Object.keys(agrupadas).forEach(
            function (emoji) {
                var grupo = agrupadas[emoji];

                var $reacao = $('<span>', {
                    class:
                        'chat-reacao' +
                        (
                            grupo.minha
                                ? ' minha-reacao'
                                : ''
                        ),

                    'data-emoji':
                        grupo.emoji,

                    text:
                        grupo.emoji +
                        (
                            grupo.count > 1
                                ? ' ' + grupo.count
                                : ''
                        )
                });

                $zona.append($reacao);
            }
        );

        $zona.prop('hidden', false);
    }

    function artigoMensagemPorId(mensagemId) {
        return $conteudo.find(
            '.chat-mensagem[data-mensagem-id="' +
            String(Number(mensagemId) || 0) +
            '"]'
        );
    }

    function animarCoracaoMensagem(mensagemId) {
        var $artigo = artigoMensagemPorId(mensagemId);

        if (!$artigo.length) {
            return;
        }

        $artigo
            .find('.chat-coracao-feedback')
            .remove();

        var $coracao = $('<span>', {
            class:
                'chat-coracao-feedback',

            text:
                '❤️',

            'aria-hidden':
                'true'
        });

        $artigo.append($coracao);

        window.requestAnimationFrame(
            function () {
                $coracao.addClass('visivel');
            }
        );

        window.setTimeout(
            function () {
                $coracao.removeClass('visivel');

                window.setTimeout(
                    function () {
                        $coracao.remove();
                    },
                    220
                );
            },
            520
        );
    }

    function obterMinhaReacao($artigo) {
        var $reacao =
            $artigo
                .find(
                    '.chat-reacao.minha-reacao'
                )
                .first();

        return String(
            $reacao.attr('data-emoji') ||
            ''
        );
    }

    async function enviarReacao(
        mensagemId,
        emoji,
        alternar
    ) {
        mensagemId = Number(mensagemId) || 0;
        emoji = String(emoji || '');

        if (!mensagemId || !emoji) {
            return;
        }

        try {
            var corpo = new URLSearchParams();

            corpo.set('action', 'react');
            corpo.set('message_id', String(mensagemId));
            corpo.set('emoji', emoji);
            corpo.set(
                'toggle',
                alternar ? '1' : '0'
            );

            var resposta = await fetch(
                conversaUrl(),
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type':
                            'application/x-www-form-urlencoded;charset=UTF-8'
                    },
                    body: corpo.toString()
                }
            );

            var dados = await resposta.json();

            if (!resposta.ok || !dados.success) {
                throw new Error(
                    dados.message ||
                    'Não foi possível reagir à mensagem.'
                );
            }

            renderizarReacoesMensagem(
                artigoMensagemPorId(mensagemId),
                dados.reactions || []
            );

            var ficouComCoracao = (dados.reactions || []).some(
                function (reacao) {
                    return (
                        String(
                            reacao &&
                            (
                                reacao.member_id ||
                                reacao.membro_id
                            ) ||
                            ''
                        ) === String(window.membroId || '') &&
                        String(reacao && reacao.emoji || '') === '❤️'
                    );
                }
            );

            if (emoji === '❤️' && ficouComCoracao) {
                animarCoracaoMensagem(mensagemId);
            }

            if (
                window.AppWebSocket &&
                typeof window.AppWebSocket.send === 'function'
            ) {
                window.AppWebSocket.send({
                    type: 'chat_reaction',
                    message_id: mensagemId
                });
            }
        } catch (erro) {
            console.error(erro);

            if (
                typeof window.mostrarMensagemTemporaria ===
                'function'
            ) {
                window.mostrarMensagemTemporaria(
                    erro.message ||
                    'Não foi possível reagir à mensagem.',
                    'erro'
                );
            }
        }
    }

    function fecharMenuReacoes() {
        if (!$menuReacoes || !$menuReacoes.length) {
            return;
        }

        $menuReacoes.removeClass('visivel');
        $menuReacoes.attr('aria-hidden', 'true');
        $menuReacoes.removeAttr('data-mensagem-id');
    }

    function garantirMenuReacoes() {
        if (
            $menuReacoes &&
            $menuReacoes.length &&
            $menuReacoes[0].isConnected
        ) {
            return $menuReacoes;
        }

        $menuReacoes = $('<div>', {
            id: 'chat-menu-reacoes',
            class: 'chat-menu-reacoes',
            role: 'menu',
            'aria-label': 'Reagir à mensagem',
            'aria-hidden': 'true'
        });

        ['❤️', '😂', '😮', '😢', '😍', '🔥']
            .forEach(function (emoji) {
                $menuReacoes.append(
                    $('<button>', {
                        type: 'button',
                        class: 'chat-menu-reacao',
                        'data-emoji': emoji,
                        'aria-label': 'Reagir com ' + emoji,
                        text: emoji
                    })
                );
            });

        $('body').append($menuReacoes);

        return $menuReacoes;
    }

    function abrirMenuReacoes($artigo) {
        if (!$artigo || !$artigo.length) {
            return;
        }

        var mensagemId = Number(
            $artigo.attr('data-mensagem-id')
        ) || 0;

        if (!mensagemId) {
            return;
        }

        var $menu = garantirMenuReacoes();
        var rect = $artigo[0].getBoundingClientRect();
        var largura = Math.min(326, window.innerWidth - 24);
        var esquerda = Math.max(
            12,
            Math.min(
                window.innerWidth - largura - 12,
                rect.left + rect.width / 2 - largura / 2
            )
        );

        $menu.css({
            width: largura + 'px',
            left: esquerda + 'px',
            top: '0px'
        });

        $menu.attr(
            'data-mensagem-id',
            String(mensagemId)
        );

        var minhaReacao = obterMinhaReacao($artigo);

        $menu
            .find('.chat-menu-reacao')
            .each(function () {
                $(this).toggleClass(
                    'ativa',
                    String($(this).attr('data-emoji')) ===
                        minhaReacao
                );
            });

        $menu.addClass('medir');

        var altura = $menu.outerHeight() || 58;
        var topo = rect.top - altura - 10;

        if (topo < 12) {
            topo = Math.min(
                window.innerHeight - altura - 12,
                rect.bottom + 10
            );
        }

        $menu.css('top', Math.max(12, topo) + 'px');
        $menu.removeClass('medir');

        window.requestAnimationFrame(function () {
            $menu
                .attr('aria-hidden', 'false')
                .addClass('visivel');
        });
    }

    function cancelarGestoReacao() {
        if (!gestoReacao) {
            return;
        }

        if (gestoReacao.timer) {
            window.clearTimeout(gestoReacao.timer);
        }

        gestoReacao = null;
    }

    function iniciarGestoReacao(evento) {
        var original = evento.originalEvent || evento;

        if (
            original.pointerType === 'mouse' &&
            original.button !== 0
        ) {
            return;
        }

        if (
            $(evento.target).closest(
                'button, a, video, input, textarea'
            ).length
        ) {
            return;
        }

        var $artigo = $(evento.currentTarget).closest(
            '.chat-mensagem'
        );

        var mensagemId = Number(
            $artigo.attr('data-mensagem-id')
        ) || 0;

        if (!mensagemId) {
            return;
        }

        cancelarGestoReacao();

        gestoReacao = {
            pointerId: original.pointerId,
            $alvoPointer: $(evento.currentTarget),
            mensagemId: mensagemId,
            $artigo: $artigo,
            inicioX: Number(original.clientX) || 0,
            inicioY: Number(original.clientY) || 0,
            moveu: false,
            longo: false,
            timer: null
        };

        if (
            original.pointerId !== undefined &&
            evento.currentTarget &&
            typeof evento.currentTarget.setPointerCapture === 'function'
        ) {
            try {
                evento.currentTarget.setPointerCapture(original.pointerId);
            } catch (erro) {
                /* O Safari pode recusar a captura do ponteiro. */
            }
        }

        gestoReacao.timer = window.setTimeout(
            function () {
                if (!gestoReacao || gestoReacao.moveu) {
                    return;
                }

                gestoReacao.longo = true;
                abrirMenuReacoes(gestoReacao.$artigo);

                if (
                    window.MargotHaptics &&
                    typeof window.MargotHaptics.play === 'function'
                ) {
                    window.MargotHaptics.play('messageReceived');
                }
            },
            LONG_PRESS_REACAO_MS
        );
    }

    function moverGestoReacao(evento) {
        if (!gestoReacao) {
            return;
        }

        var original = evento.originalEvent || evento;

        if (
            original.pointerId !== undefined &&
            gestoReacao.pointerId !== undefined &&
            original.pointerId !== gestoReacao.pointerId
        ) {
            return;
        }

        var dx = (Number(original.clientX) || 0) - gestoReacao.inicioX;
        var dy = (Number(original.clientY) || 0) - gestoReacao.inicioY;

        if (Math.hypot(dx, dy) > 28) {
            gestoReacao.moveu = true;

            if (gestoReacao.timer) {
                window.clearTimeout(gestoReacao.timer);
                gestoReacao.timer = null;
            }
        }
    }

    function terminarGestoReacao(evento) {
        if (!gestoReacao) {
            return;
        }

        var original = evento.originalEvent || evento;

        if (
            original.pointerId !== undefined &&
            gestoReacao.pointerId !== undefined &&
            original.pointerId !== gestoReacao.pointerId
        ) {
            return;
        }

        var gesto = gestoReacao;

        if (
            gesto.$alvoPointer &&
            gesto.$alvoPointer.length &&
            original.pointerId !== undefined &&
            typeof gesto.$alvoPointer[0].releasePointerCapture === 'function'
        ) {
            try {
                if (
                    typeof gesto.$alvoPointer[0].hasPointerCapture !== 'function' ||
                    gesto.$alvoPointer[0].hasPointerCapture(original.pointerId)
                ) {
                    gesto.$alvoPointer[0].releasePointerCapture(original.pointerId);
                }
            } catch (erro) {
                /* O ponteiro pode já ter sido libertado. */
            }
        }

        cancelarGestoReacao();

        if (gesto.moveu || gesto.longo) {
            return;
        }

        var agora = Date.now();

        if (
            ultimoTapReacao.id === gesto.mensagemId &&
            agora - ultimoTapReacao.instante <= DOUBLE_TAP_REACAO_MS
        ) {
            ultimoTapReacao.id = 0;
            ultimoTapReacao.instante = 0;

            enviarReacao(
                gesto.mensagemId,
                '❤️',
                true
            );

            return;
        }

        ultimoTapReacao.id = gesto.mensagemId;
        ultimoTapReacao.instante = agora;
    }

    function criarMensagem(
        mensagem
    ) {
        var eMinha =
            minha(
                mensagem
            );

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
                    mensagem
                        .emissor_id
            });

        var $balao =
            $('<div>', {
                class:
                    'chat-balao'
            });

        if (
            mensagem.tipo ===
                'imagem' &&
            mensagem.media_url
        ) {
            $balao.append(
                $('<img>', {
                    class:
                        'chat-imagem',

                    src:
                        mensagem
                            .media_url,

                    alt:
                        'Fotografia enviada por ' +
                        (
                            mensagem
                                .emissor_nome ||
                            'utilizador'
                        ),

                    loading:
                        'eager',

                    draggable:
                        false
                })
            );
        }

        if (
            mensagem.tipo ===
                'video' &&
            mensagem.media_url
        ) {
            var $video =
                $('<video>', {
                    class:
                        'chat-video',

                    controls:
                        true,

                    playsinline:
                        true,

                    preload:
                        'metadata'
                });

            $video.append(
                $('<source>', {
                    src:
                        mensagem
                            .media_url,

                    type:
                        mensagem
                            .ficheiro_mime ||
                        'video/mp4'
                })
            );

            $balao.append(
                $video
            );
        }

        if (
            mensagem.texto
        ) {
            $balao.append(
                $('<p>').text(
                    mensagem.texto
                )
            );
        }

        var $rodape =
            $('<footer>')
                .append(
                    $('<time>', {
                        datetime:
                            mensagem
                                .criada_em
                    }).text(
                        dataLocal(
                            mensagem
                                .criada_em
                        )
                    )
                );

        if (
            eMinha
        ) {
            $rodape.append(
                $('<span>', {
                    class:
                        'chat-lida',

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

        $artigo.append(
            $balao.append(
                $rodape
            )
        );

        renderizarReacoesMensagem(
            $artigo,
            mensagem.reactions || []
        );

        return $artigo;
    }

    function adicionarMensagem(
        mensagem,
        deslocar
    ) {
        var id =
            Number(
                mensagem.id
            ) ||
            0;

        if (
            !id ||
            $mensagens
                .find(
                    '[data-mensagem-id="' +
                    id +
                    '"]'
                )
                .length
        ) {
            return false;
        }

        var $novaMensagem =
            criarMensagem(
                mensagem
            );

        $conteudo.append(
            $novaMensagem
        );

        ultimoId =
            Math.max(
                ultimoId,
                id
            );

        if (
            deslocar !==
            false
        ) {
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
            $texto
                .val()
                .trim() ||
            (
                $media[0] &&
                $media[0].files &&
                $media[0]
                    .files
                    .length
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

        if (
            !aEnviar
        ) {
            $enviar.text(
                'Enviar'
            );
        }
    }

    function limparMedia() {
        if (
            previewUrl
        ) {
            URL.revokeObjectURL(
                previewUrl
            );
        }

        previewUrl =
            null;

        $media.val(
            ''
        );

        $preview
            .empty()
            .prop(
                'hidden',
                true
            );

        atualizarEstadoEnviar();
    }

    function mostrarPreview(
        ficheiro
    ) {
        if (
            previewUrl
        ) {
            URL.revokeObjectURL(
                previewUrl
            );
        }

        previewUrl =
            null;

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
            .text(
                ''
            );

        if (
            !ficheiro
        ) {
            atualizarEstadoEnviar();

            return;
        }

        var eVideo =
            ficheiro
                .type
                .startsWith(
                    'video/'
                );

        var limite =
            eVideo
                ? 100 *
                    1024 *
                    1024
                : 15 *
                    1024 *
                    1024;

        if (
            ficheiro.size >
            limite
        ) {
            $media.val(
                ''
            );

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

        var $previewConteudo =
            eVideo
                ? $('<video>', {
                    src:
                        previewUrl,

                    muted:
                        true,

                    controls:
                        true,

                    playsinline:
                        true
                })
                : $('<img>', {
                    src:
                        previewUrl,

                    alt:
                        'Pré-visualização',

                    draggable:
                        false
                });

        $preview
            .append(
                $previewConteudo,

                $('<button>', {
                    type:
                        'button',

                    class:
                        'chat-media-remover',

                    'aria-label':
                        'Remover ficheiro'
                }).text(
                    '×'
                )
            )
            .prop(
                'hidden',
                false
            );

        atualizarEstadoEnviar();
    }

    function publicarMensagem(
        mensagemId
    ) {
        if (
            !websocketLigado()
        ) {
            return;
        }

        window
            .AppWebSocket
            .send({
                type:
                    'chat_publish',

                message_id:
                    mensagemId
            });
    }

    function prepararDadosEnvio() {
        var dados = new FormData($form[0]);
        var token = '';

        if (
            window.AppWebSocket &&
            typeof window.AppWebSocket.profileAccessToken === 'function'
        ) {
            token = window.AppWebSocket.profileAccessToken(
                window.chatMembroId
            );
        }

        dados.set('profile_access_token', token || '');

        var inputToken = document.getElementById('chat-profile-access-token');
        if (inputToken) inputToken.value = token || '';

        return dados;
    }

    async function enviarMensagem(
        evento
    ) {
        evento.preventDefault();

        if (
            aEnviar ||
            !temConteudoParaEnviar()
        ) {
            return;
        }

        aEnviar =
            true;

        aFixarNoFim =
            true;

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
            .text(
                ''
            );

        try {
            var resposta =
                await fetch(
                    conversaUrl(),
                    {
                        method:
                            'POST',

                        body:
                            prepararDadosEnvio(),

                        credentials:
                            'same-origin'
                    }
                );

            var dados =
                await resposta
                    .json();

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
                .val(
                    ''
                )
                .css(
                    'height',
                    'auto'
                );

            limparMedia();

            fixarNoFimAposMudanca();

            publicarMensagem(
                dados.message.id
            );
        } catch (
            erro
        ) {
            $erro
                .text(
                    erro.message
                )
                .prop(
                    'hidden',
                    false
                );
        } finally {
            aEnviar =
                false;

            atualizarEstadoEnviar();
        }
    }

    async function marcarComoLidas() {
        if (
            document
                .visibilityState ===
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
                    method:
                        'POST',

                    body:
                        corpo,

                    credentials:
                        'same-origin'
                }
            );

            if (
                websocketLigado()
            ) {
                window
                    .AppWebSocket
                    .send({
                        type:
                            'chat_read',

                        with_member_id:
                            outroId
                    });
            }
        } catch (
            erro
        ) {
            console.error(
                erro
            );
        }
    }

    async function procurarNovasMensagens(
        forcar
    ) {
        /*
         * Com WebSocket ligado não fazemos
         * um request de 5 em 5 segundos.
         *
         * O polling serve apenas de fallback.
         */
        if (
            !forcar &&
            websocketLigado()
        ) {
            return;
        }

        try {
            var resposta =
                await fetch(
                    conversaUrl() +
                    '?api=history&after_id=' +
                    ultimoId,
                    {
                        credentials:
                            'same-origin',

                        cache:
                            'no-store'
                    }
                );

            var dados =
                await resposta
                    .json();

            if (
                !resposta.ok ||
                !dados.success
            ) {
                return;
            }

            var recebeu =
                false;

            (
                dados.messages ||
                []
            ).forEach(
                function (
                    mensagem
                ) {
                    if (
                        adicionarMensagem(
                            mensagem
                        ) &&
                        !minha(
                            mensagem
                        )
                    ) {
                        recebeu =
                            true;
                    }
                }
            );

            if (
                recebeu
            ) {
                marcarComoLidas();
            }
        } catch (
            erro
        ) {
            console.error(
                erro
            );
        }
    }

    function atualizarConfirmacoes(
        lidoPor,
        ultimoLido
    ) {
        if (
            String(
                lidoPor
            ) !==
            outroId
        ) {
            return;
        }

        $mensagens
            .find(
                '.chat-mensagem.minha'
            )
            .each(
                function () {
                    if (
                        Number(
                            $(this)
                                .attr(
                                    'data-mensagem-id'
                                )
                        ) <=
                        Number(
                            ultimoLido
                        )
                    ) {
                        $(this)
                            .find(
                                '.chat-lida'
                            )
                            .text(
                                '✓✓'
                            )
                            .attr(
                                'aria-label',
                                'Lida'
                            );
                    }
                }
            );
    }

    /*
     * TEXTAREA
     *
     * O scrollHeight é lido no máximo
     * uma vez por frame.
     */

    function ajustarTextareaAgora() {
        rafTexto =
            null;

        if (
            !ativo ||
            !$texto[0]
        ) {
            return;
        }

        var elemento =
            $texto[0];

        elemento.style.height =
            'auto';

        elemento.style.height =
            Math.min(
                elemento.scrollHeight,
                120
            ) +
            'px';
    }

    function aoAlterarTexto() {
        atualizarEstadoEnviar();

        if (
            rafTexto !==
            null
        ) {
            return;
        }

        rafTexto =
            window
                .requestAnimationFrame(
                    ajustarTextareaAgora
                );
    }

    $mensagens
        .find(
            '.chat-mensagem'
        )
        .each(
            function () {
                ultimoId =
                    Math.max(
                        ultimoId,

                        Number(
                            $(this)
                                .attr(
                                    'data-mensagem-id'
                                )
                        ) ||
                        0
                    );
            }
        );

    $mensagens
        .find(
            'time[data-data-mensagem]'
        )
        .each(
            function () {
                $(this).text(
                    dataLocal(
                        $(this)
                            .attr(
                                'datetime'
                            )
                    )
                );
            }
        );

    prepararMedicaoForm();
    prepararConteudoInicial();

    /*
     * O estado "estou no fundo" depende
     * do scroll real, não de tocar na lista.
     */
    $mensagens.on(
        'scroll' +
        NS,
        function () {
            aFixarNoFim =
                distanciaAoFim() <
                90;
        }
    );

    $mensagens.on(
        'pointerdown' + NS,
        '.chat-balao',
        iniciarGestoReacao
    );

    $mensagens.on(
        'contextmenu' + NS,
        '.chat-balao',
        function (evento) {
            evento.preventDefault();
        }
    );

    $mensagens.on(
        'pointermove' + NS,
        '.chat-balao',
        moverGestoReacao
    );

    $mensagens.on(
        'pointerup' + NS +
        ' pointercancel' + NS,
        '.chat-balao',
        terminarGestoReacao
    );

    $(document).on(
        'pointerdown' + NS,
        function (evento) {
            if (
                $menuReacoes &&
                $menuReacoes.length &&
                !$menuReacoes.is(evento.target) &&
                !$menuReacoes.has(evento.target).length
            ) {
                fecharMenuReacoes();
            }
        }
    );

    $(document).on(
        'click' + NS,
        '.chat-menu-reacao',
        function () {
            var $botao = $(this);
            var mensagemId = Number(
                $menuReacoes &&
                $menuReacoes.attr('data-mensagem-id')
            ) || 0;

            var emoji = String(
                $botao.attr('data-emoji') || ''
            );

            if (!mensagemId || !emoji) {
                return;
            }

            fecharMenuReacoes();
            enviarReacao(mensagemId, emoji, true);
        }
    );

    $form.on(
        'submit' +
        NS,
        enviarMensagem
    );

    $enviar.on(
        'pointerdown' +
        NS,
        function (
            evento
        ) {
            if (
                aEnviar ||
                $enviar.prop(
                    'disabled'
                )
            ) {
                return;
            }

            if (
                evento.pointerType ===
                    'mouse' &&
                evento.button !==
                    0
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
        'click' +
        NS,
        function (
            evento
        ) {
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
        'change' +
        NS,
        function () {
            mostrarPreview(
                this.files[0]
            );
        }
    );

    $preview.on(
        'click' +
        NS,
        '.chat-media-remover',
        limparMedia
    );

    $texto.on(
        'input' +
        NS,
        aoAlterarTexto
    );

    $texto.on(
        'keydown' +
        NS,
        function (
            evento
        ) {
            if (
                evento.key ===
                    'Enter' &&
                !evento.shiftKey
            ) {
                evento.preventDefault();

                $form.trigger(
                    'submit'
                );
            }
        }
    );

    function aoReceberMensagem(
        evento
    ) {
        var mensagem =
            evento.detail
                .message;

        if (
            !mensagem
        ) {
            return;
        }

        var pertence =
            (
                String(
                    mensagem
                        .emissor_id
                ) ===
                    outroId &&
                String(
                    mensagem
                        .destinatario_id
                ) ===
                    String(
                        window
                            .membroId
                    )
            ) ||
            (
                String(
                    mensagem
                        .emissor_id
                ) ===
                    String(
                        window
                            .membroId
                    ) &&
                String(
                    mensagem
                        .destinatario_id
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

    function aoLerMensagens(
        evento
    ) {
        atualizarConfirmacoes(
            evento.detail
                .reader_id,

            evento.detail
                .last_message_id
        );
    }

    function aoReceberReacao(evento) {
        var detalhe = evento.detail || {};
        var mensagemId = Number(
            detalhe.message_id
        ) || 0;

        if (!mensagemId) {
            return;
        }

        renderizarReacoesMensagem(
            artigoMensagemPorId(mensagemId),
            detalhe.reactions || []
        );
    }

    function aoAlterarVisibilidade() {
        if (
            document
                .visibilityState ===
            'visible'
        ) {
            procurarNovasMensagens(
                true
            );

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

    window.addEventListener(
        'app:chat-reaction',
        aoReceberReacao
    );

    document.addEventListener(
        'visibilitychange',
        aoAlterarVisibilidade
    );

    $('#menuPrincipal a')
        .removeClass(
            'active'
        );

    atualizarEstadoEnviar();
    prepararTecladoNativo();
    marcarComoLidas();

    /*
     * Só é fallback se o WebSocket cair.
     */
    var temporizador =
        window.setInterval(
            function () {
                procurarNovasMensagens(
                    false
                );
            },
            12000
        );

    function desativarChat() {
        if (
            !ativo
        ) {
            return;
        }

        ativo =
            false;

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

            temporizadorPreparacaoInicial =
                null;
        }

        if (
            rafForm !==
            null
        ) {
            window
                .cancelAnimationFrame(
                    rafForm
                );

            rafForm =
                null;
        }

        if (
            rafTexto !==
            null
        ) {
            window
                .cancelAnimationFrame(
                    rafTexto
                );

            rafTexto =
                null;
        }

        if (
            observadorForm
        ) {
            observadorForm
                .disconnect();

            observadorForm =
                null;
        }

        $mensagens.off(
            NS
        );

        $(document).off(
            NS
        );

        cancelarGestoReacao();

        if ($menuReacoes && $menuReacoes.length) {
            $menuReacoes.remove();
            $menuReacoes = null;
        }

        $form.off(
            NS
        );

        $texto.off(
            NS
        );

        $media.off(
            NS
        );

        $preview.off(
            NS
        );

        $enviar.off(
            NS
        );

        $mensagens
            .find(
                'img, video'
            )
            .off(
                '.margotChatScroll'
            )
            .off(
                '.margotChatInicial'
            );

        restaurarTecladoNativo();

        $pagina[0]
            .style
            .removeProperty(
                '--margot-keyboard-height'
            );

        $pagina[0]
            .style
            .removeProperty(
                '--chat-form-altura'
            );

        window.removeEventListener(
            'app:chat-message',
            aoReceberMensagem
        );

        window.removeEventListener(
            'app:chat-messages-read',
            aoLerMensagens
        );

        window.removeEventListener(
            'app:chat-reaction',
            aoReceberReacao
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

        if (
            previewUrl
        ) {
            URL.revokeObjectURL(
                previewUrl
            );

            previewUrl =
                null;
        }

        if (
            window
                .desativarChatMargot ===
            desativarChat
        ) {
            delete window
                .desativarChatMargot;
        }

        if (
            String(
                window.chatMembroId ||
                ''
            ) ===
            outroId
        ) {
            delete window
                .chatMembroId;
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