(function (window, document, $) {
    'use strict';

    if (
        typeof window.desativarIndexMiniMenuMargot ===
        'function'
    ) {
        window.desativarIndexMiniMenuMargot();
    }

    var NS =
        '.margotMiniMenu';

    $(document).off(
        NS
    );

    var $miniMenu =
        $('.mini-menu');

    if (
        !$miniMenu.length
    ) {
        return;
    }

    var $anexo =
        $miniMenu.find(
            '.mini-menu-anexo'
        );

    var $botaoHey =
        $miniMenu.find(
            '#enviar-hey'
        );

    var $formMensagem =
        $miniMenu.find(
            '.mini-menu-mensagem'
        );

    var $inputMensagem =
        $miniMenu.find(
            '#mensagem'
        );

    var $media =
        $miniMenu.find(
            '#mini-menu-media'
        );

    var $perfil =
        $miniMenu.find(
            '.mini-menu-perfil'
        );

    var $maisOpcoes =
        $('#abrir-acoes-perfil');

    var $acoes =
        $('#acoes-perfil');

    var $acoesPrincipal =
        $('#acoes-perfil-principal');

    var $formDenuncia =
        $('#form-denuncia');

    var $abrirDenuncia =
        $('#abrir-denuncia');

    var $voltarDenuncia =
        $('#voltar-denuncia');

    var $bloquearMembro =
        $('#bloquear-membro');

    var capacitor =
        window.Capacitor ||
        null;

    var teclado =
        capacitor &&
        capacitor.Plugins
            ? capacitor
                .Plugins
                .Keyboard
            : null;

    var tecladoListeners =
        [];

    var aEnviarHey =
        false;

    var aEnviarMensagem =
        false;

    var aProcessarSeguranca =
        false;

    var paginaAtiva =
        true;

    var temporizadorHey =
        null;

    var temporizadorRestauracao =
        null;

    var campoMensagemFocado =
        false;

    var tecladoAberto =
        false;

    var alturaTeclado =
        0;

    var baseMenuY =
        null;

    var deslocamentoMenu =
        0;

    function texto(
        valor
    ) {
        return String(
            valor ||
            ''
        ).trim();
    }

    function urlFoto(
        valor
    ) {
        try {
            return new URL(
                texto(
                    valor
                ) ||
                '/imagens/fotos-perfil/default.webp',

                window.location.href
            ).href;
        } catch (
            erro
        ) {
            return '/imagens/fotos-perfil/default.webp';
        }
    }

    function membroId(
        elemento
    ) {
        return texto(
            elemento.getAttribute(
                'data-membro-id'
            ) ||
            elemento.getAttribute(
                'data-id'
            ) ||
            elemento.id
        );
    }

    function nome(
        elemento
    ) {
        return (
            texto(
                elemento.getAttribute(
                    'data-nome'
                ) ||
                elemento.getAttribute(
                    'alt'
                ) ||
                elemento.getAttribute(
                    'title'
                )
            ) ||
            'Utilizador'
        );
    }

    function foto(
        elemento
    ) {
        return urlFoto(
            elemento.currentSrc ||
            elemento.src ||
            elemento.getAttribute(
                'src'
            )
        );
    }

    function baseUrl(
        valor,
        fallback
    ) {
        return texto(
            valor ||
            fallback
        ).replace(
            /\/+$/,
            ''
        );
    }

    function idSelecionado() {
        return texto(
            $miniMenu.attr(
                'data-destinatario-id'
            )
        );
    }

    function nomeSelecionado() {
        return (
            texto(
                $miniMenu
                    .find(
                        'header h1'
                    )
                    .text()
            ) ||
            'esta pessoa'
        );
    }

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

    function ajustarAlturaMiniMenu(
        acoesAbertas
    ) {
        if (
            typeof window
                .definirMiniMenuAcoes ===
            'function'
        ) {
            window
                .definirMiniMenuAcoes(
                    acoesAbertas
                );
        }
    }

    function fecharAcoes() {
        $acoes
            .removeClass(
                'aberta'
            )
            .attr(
                'aria-hidden',
                'true'
            )
            .prop(
                'hidden',
                true
            );

        $maisOpcoes.attr(
            'aria-expanded',
            'false'
        );

        $acoesPrincipal.prop(
            'hidden',
            false
        );

        $formDenuncia.prop(
            'hidden',
            true
        );

        ajustarAlturaMiniMenu(
            false
        );
    }

    function abrirAcoes() {
        if (
            $miniMenu.hasClass(
                'perfil-proprio'
            ) ||
            !idSelecionado()
        ) {
            return;
        }

        ajustarAlturaMiniMenu(
            true
        );

        $acoes
            .prop(
                'hidden',
                false
            )
            .attr(
                'aria-hidden',
                'false'
            )
            .addClass(
                'aberta'
            );

        $maisOpcoes.attr(
            'aria-expanded',
            'true'
        );

        $acoesPrincipal.prop(
            'hidden',
            false
        );

        $formDenuncia.prop(
            'hidden',
            true
        );

        $acoes
            .find(
                '.acoes-perfil-caixa'
            )
            .trigger(
                'focus'
            );
    }

    function abrirFormularioDenuncia() {
        $acoesPrincipal.prop(
            'hidden',
            true
        );

        $formDenuncia.prop(
            'hidden',
            false
        );

        $('#denuncia-motivo')
            .trigger(
                'focus'
            );
    }

    function prepararMiniMenu(
        elemento
    ) {
        if (
            !paginaAtiva ||
            !elemento
        ) {
            return false;
        }

        var id =
            membroId(
                elemento
            );

        if (
            !id
        ) {
            return false;
        }

        var membroNome =
            nome(
                elemento
            );

        var souEu =
            id ===
            texto(
                window.membroId
            );

        var imagem =
            $miniMenu
                .find(
                    'header img'
                )
                .get(
                    0
                );

        fecharAcoes();

        $miniMenu
            .attr(
                'data-destinatario-id',
                id
            )
            .toggleClass(
                'perfil-proprio',
                souEu
            );

        $perfil.attr(
            'href',
            baseUrl(
                window.profileUrl,
                '/profile'
            ) +
            '/' +
            encodeURIComponent(
                id
            )
        );

        $miniMenu
            .find(
                'header h1'
            )
            .text(
                membroNome
            );

        $formMensagem.attr(
            'action',
            baseUrl(
                window.messagesUrl,
                '/messages'
            ) +
            '/' +
            encodeURIComponent(
                id
            )
        );

        if (
            imagem
        ) {
            imagem.onerror =
                function () {
                    this.onerror =
                        null;

                    this.src =
                        urlFoto(
                            '/imagens/fotos-perfil/default.webp'
                        );
                };

            imagem.src =
                foto(
                    elemento
                );

            imagem.alt =
                membroNome;
        }

        return true;
    }

    function aviso(
        mensagem,
        tipo
    ) {
        if (
            typeof window
                .mostrarMensagemTemporaria ===
            'function'
        ) {
            window
                .mostrarMensagemTemporaria(
                    mensagem,
                    tipo
                );
        }
    }

    function cancelarRestauracao() {
        if (
            temporizadorRestauracao ===
            null
        ) {
            return;
        }

        window.clearTimeout(
            temporizadorRestauracao
        );

        temporizadorRestauracao =
            null;
    }

    function viewportAltura() {
        return (
            window.innerHeight ||
            document
                .documentElement
                .clientHeight ||
            0
        );
    }

    function obterTranslateY(
        elemento
    ) {
        if (
            !elemento
        ) {
            return 0;
        }

        var transformacao =
            window
                .getComputedStyle(
                    elemento
                )
                .transform;

        if (
            !transformacao ||
            transformacao ===
                'none'
        ) {
            return 0;
        }

        try {
            var matriz =
                new DOMMatrixReadOnly(
                    transformacao
                );

            return Number(
                matriz.m42
            ) || 0;
        } catch (
            erro
        ) {
            var valores =
                transformacao.match(
                    /matrix(?:3d)?\(([^)]+)\)/
                );

            if (
                !valores
            ) {
                return 0;
            }

            var partes =
                valores[1]
                    .split(',')
                    .map(
                        function (
                            valor
                        ) {
                            return Number(
                                valor.trim()
                            );
                        }
                    );

            if (
                transformacao.indexOf(
                    'matrix3d'
                ) ===
                0
            ) {
                return partes[13] || 0;
            }

            return partes[5] || 0;
        }
    }

    function guardarPosicaoNormalMiniMenu() {
        if (
            baseMenuY !==
            null ||
            !$miniMenu[0]
        ) {
            return;
        }

        baseMenuY =
            obterTranslateY(
                $miniMenu[0]
            );
    }

    function calcularDeslocamentoMenu(
        novaAlturaTeclado
    ) {
        if (
            !$formMensagem[0]
        ) {
            return 0;
        }

        novaAlturaTeclado =
            Math.max(
                0,
                Number(
                    novaAlturaTeclado
                ) ||
                0
            );

        if (
            novaAlturaTeclado <
            80
        ) {
            return 0;
        }

        var rect =
            $formMensagem[0]
                .getBoundingClientRect();

        var fundoNormal =
            rect.bottom +
            deslocamentoMenu;

        var topoTeclado =
            viewportAltura() -
            novaAlturaTeclado;

        var limite =
            topoTeclado -
            12;

        return Math.max(
            0,
            Math.ceil(
                fundoNormal -
                limite
            )
        );
    }

    function expandirMiniMenuParaTeclado(
        novaAlturaTeclado,
        animar
    ) {
        if (
            !paginaAtiva ||
            !campoMensagemFocado ||
            !$miniMenu[0]
        ) {
            return;
        }

        novaAlturaTeclado =
            Math.max(
                0,
                Number(
                    novaAlturaTeclado
                ) ||
                0
            );

        if (
            novaAlturaTeclado <
            80
        ) {
            return;
        }

        cancelarRestauracao();

        guardarPosicaoNormalMiniMenu();

        alturaTeclado =
            novaAlturaTeclado;

        tecladoAberto =
            true;

        var novoDeslocamento =
            calcularDeslocamentoMenu(
                novaAlturaTeclado
            );

        deslocamentoMenu =
            novoDeslocamento;

        var destinoY =
            (
                baseMenuY ||
                0
            ) -
            novoDeslocamento;

        $miniMenu.css({
            transition:
                animar
                    ? 'transform 294ms cubic-bezier(.303,.886,.436,.976)'
                    : 'none',

            transform:
                'translate3d(0,' +
                destinoY +
                'px,0)'
        });

        document.body
            .classList
            .add(
                'margot-mini-menu-teclado'
            );
    }

    function restaurarMiniMenuDepoisDoTeclado(
        animar
    ) {
        if (
            !$miniMenu[0]
        ) {
            return;
        }

        cancelarRestauracao();

        tecladoAberto =
            false;

        alturaTeclado =
            0;

        var destinoY =
            baseMenuY;

        if (
            destinoY ===
            null
        ) {
            destinoY =
                $miniMenu[0]
                    .getBoundingClientRect()
                    .height *
                0.15;
        }

        $miniMenu.css({
            transition:
                animar
                    ? 'transform 313ms cubic-bezier(.335,.884,.381,.961)'
                    : 'none',

            transform:
                'translate3d(0,' +
                destinoY +
                'px,0)'
        });

        document.body
            .classList
            .remove(
                'margot-mini-menu-teclado'
            );

        deslocamentoMenu =
            0;

        temporizadorRestauracao =
            window.setTimeout(
                function () {
                    temporizadorRestauracao =
                        null;

                    if (
                        !paginaAtiva ||
                        tecladoAberto
                    ) {
                        return;
                    }

                    if (
                        typeof window
                            .definirMiniMenuAcoes ===
                        'function'
                    ) {
                        window
                            .definirMiniMenuAcoes(
                                false
                            );
                    }

                    baseMenuY =
                        null;
                },
                animar
                    ? 330
                    : 0
            );
    }

    function esconderTecladoMiniMenu() {
        if (
            !campoMensagemFocado &&
            !tecladoAberto
        ) {
            return;
        }

        campoMensagemFocado =
            false;

        if (
            $inputMensagem[0] &&
            document.activeElement ===
                $inputMensagem[0]
        ) {
            $inputMensagem[0]
                .blur();
        }

        restaurarMiniMenuDepoisDoTeclado(
            true
        );

        if (
            teclado &&
            typeof teclado.hide ===
                'function'
        ) {
            Promise.resolve(
                teclado.hide()
            ).catch(
                function () {}
            );
        }
    }

    function tecladoVaiAbrir(
        info
    ) {
        if (
            !campoMensagemFocado
        ) {
            return;
        }

        expandirMiniMenuParaTeclado(
            info &&
            info.keyboardHeight,
            true
        );
    }

    function tecladoAbriu(
        info
    ) {
        if (
            !campoMensagemFocado
        ) {
            return;
        }

        window.requestAnimationFrame(
            function () {
                expandirMiniMenuParaTeclado(
                    info &&
                    info.keyboardHeight,
                    false
                );
            }
        );
    }

    function tecladoVaiFechar() {
        if (
            !tecladoAberto
        ) {
            return;
        }

        restaurarMiniMenuDepoisDoTeclado(
            true
        );
    }

    function tecladoFechou() {
        tecladoAberto =
            false;

        alturaTeclado =
            0;

        campoMensagemFocado =
            false;

        deslocamentoMenu =
            0;

        document.body
            .classList
            .remove(
                'margot-mini-menu-teclado'
            );

        if (
            eIOSNativo() &&
            teclado &&
            typeof teclado
                .setAccessoryBarVisible ===
                'function'
        ) {
            Promise.resolve(
                teclado
                    .setAccessoryBarVisible({
                        isVisible:
                            true
                    })
            ).catch(
                function () {}
            );
        }
    }

    function alturaTecladoVisualViewport() {
        if (
            !window.visualViewport
        ) {
            return 0;
        }

        return Math.max(
            0,
            viewportAltura() -
            (
                window
                    .visualViewport
                    .height +
                window
                    .visualViewport
                    .offsetTop
            )
        );
    }

    function aoAlterarVisualViewport() {
        if (
            teclado ||
            !campoMensagemFocado
        ) {
            return;
        }

        var altura =
            alturaTecladoVisualViewport();

        if (
            altura >=
            80
        ) {
            expandirMiniMenuParaTeclado(
                altura,
                true
            );
        } else if (
            tecladoAberto
        ) {
            restaurarMiniMenuDepoisDoTeclado(
                true
            );
        }
    }

    async function prepararTecladoNativo() {
        if (
            !teclado ||
            typeof teclado
                .addListener !==
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
        } catch (
            erro
        ) {
            console.warn(
                'Não foi possível acompanhar o teclado no mini-menu.',
                erro
            );
        }
    }

    function removerListenersTeclado() {
        var listeners =
            tecladoListeners.slice();

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
    }

    function interceptarToqueForaDoInput(
        evento
    ) {
        if (
            !paginaAtiva ||
            (
                !tecladoAberto &&
                !campoMensagemFocado
            )
        ) {
            return;
        }

        if (
            $formMensagem[0] &&
            $formMensagem[0]
                .contains(
                    evento.target
                )
        ) {
            return;
        }

        evento.preventDefault();
        evento.stopPropagation();

        if (
            typeof evento
                .stopImmediatePropagation ===
                'function'
        ) {
            evento
                .stopImmediatePropagation();
        }

        esconderTecladoMiniMenu();
    }

    document.addEventListener(
        'pointerdown',
        interceptarToqueForaDoInput,
        true
    );

    $inputMensagem.on(
        'focus' + NS,
        function () {
            campoMensagemFocado =
                true;

            guardarPosicaoNormalMiniMenu();

            if (
                eIOSNativo() &&
                teclado &&
                typeof teclado
                    .setAccessoryBarVisible ===
                    'function'
            ) {
                Promise.resolve(
                    teclado
                        .setAccessoryBarVisible({
                            isVisible:
                                false
                        })
                ).catch(
                    function () {}
                );
            }

            if (
                !teclado &&
                window.visualViewport
            ) {
                window.requestAnimationFrame(
                    aoAlterarVisualViewport
                );
            }
        }
    );

    $inputMensagem.on(
        'blur' + NS,
        function () {
            campoMensagemFocado =
                false;

            if (
                !teclado &&
                !window.visualViewport
            ) {
                restaurarMiniMenuDepoisDoTeclado(
                    true
                );
            }
        }
    );

    function libertarHey() {
        if (
            !paginaAtiva
        ) {
            return;
        }

        aEnviarHey =
            false;

        if (
            temporizadorHey !==
            null
        ) {
            window.clearTimeout(
                temporizadorHey
            );

            temporizadorHey =
                null;
        }

        $botaoHey
            .prop(
                'disabled',
                false
            )
            .removeAttr(
                'aria-busy'
            );
    }

    async function pedidoSeguranca(
        acao,
        campos
    ) {
        var dados =
            new FormData();

        dados.set(
            'action',
            acao
        );

        dados.set(
            'target_id',
            idSelecionado()
        );

        Object.keys(
            campos ||
            {}
        ).forEach(
            function (
                chave
            ) {
                dados.set(
                    chave,
                    campos[chave]
                );
            }
        );

        var resposta =
            await fetch(
                baseUrl(
                    window.safetyUrl,
                    '/safety'
                ),
                {
                    method:
                        'POST',

                    body:
                        dados,

                    credentials:
                        'same-origin',

                    headers: {
                        'Accept':
                            'application/json',

                        'X-Requested-With':
                            'XMLHttpRequest'
                    }
                }
            );

        var conteudo =
            await resposta.text();

        var resultado;

        try {
            resultado =
                JSON.parse(
                    conteudo
                );
        } catch (
            erro
        ) {
            throw new Error(
                'O servidor devolveu uma resposta inválida.'
            );
        }

        if (
            !resposta.ok ||
            !resultado.success
        ) {
            throw new Error(
                resultado.message ||
                'Não foi possível concluir o pedido.'
            );
        }

        return resultado;
    }

    function removerPessoaDoMapa(
        id
    ) {
        $('.foto')
            .filter(
                function () {
                    return (
                        membroId(
                            this
                        ) ===
                        id
                    );
                }
            )
            .remove();
    }

    function definirSegurancaOcupada(
        ocupada
    ) {
        aProcessarSeguranca =
            ocupada;

        $acoes
            .find(
                'button, select, textarea'
            )
            .prop(
                'disabled',
                ocupada
            );
    }

    window.prepararMiniMenuDaFoto =
        prepararMiniMenu;

    $(document).on(
        'pointerdown' + NS +
        ' click' + NS,
        '.foto',
        function () {
            prepararMiniMenu(
                this
            );
        }
    );

    $perfil.on(
        'click' + NS,
        function (
            evento
        ) {
            evento.stopImmediatePropagation();

            if (
                evento.defaultPrevented ||
                (
                    evento.button !==
                        undefined &&
                    evento.button !==
                        0
                ) ||
                evento.metaKey ||
                evento.ctrlKey ||
                evento.shiftKey ||
                evento.altKey
            ) {
                return;
            }

            var href =
                this.getAttribute(
                    'href'
                );

            if (
                !href
            ) {
                return;
            }

            var url =
                new URL(
                    href,
                    window.location.href
                );

            if (
                url.origin !==
                window.location.origin
            ) {
                return;
            }

            if (
                !window.MargotNavigation ||
                typeof window
                    .MargotNavigation
                    .navigate !==
                    'function'
            ) {
                return;
            }

            evento.preventDefault();

            window
                .MargotNavigation
                .navigate(
                    url.href,
                    {
                        historico:
                            'push',

                        direcao:
                            1
                    }
                );
        }
    );

    $botaoHey.on(
        'click' + NS,
        function (
            evento
        ) {
            evento.preventDefault();
            evento.stopImmediatePropagation();

            if (
                !paginaAtiva ||
                aEnviarHey
            ) {
                return;
            }

            var id =
                idSelecionado();

            if (
                !id
            ) {
                aviso(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (
                !window.AppWebSocket ||
                !window
                    .AppWebSocket
                    .isConnected()
            ) {
                aviso(
                    'A ligação está a ser restabelecida.',
                    'erro'
                );

                if (
                    window.AppWebSocket
                ) {
                    window
                        .AppWebSocket
                        .connect();
                }

                return;
            }

            aEnviarHey =
                true;

            $botaoHey
                .prop(
                    'disabled',
                    true
                )
                .attr(
                    'aria-busy',
                    'true'
                );

            var enviado =
                window
                    .AppWebSocket
                    .send({
                        type:
                            'notify',

                        destinatario_id:
                            id
                    });

            if (
                !enviado
            ) {
                libertarHey();

                aviso(
                    'Não foi possível enviar o Hey.',
                    'erro'
                );

                return;
            }

            temporizadorHey =
                window.setTimeout(
                    libertarHey,
                    1200
                );
        }
    );

    $formMensagem.on(
        'submit' + NS,
        async function (
            evento
        ) {
            evento.preventDefault();
            evento.stopImmediatePropagation();

            if (
                !paginaAtiva ||
                aEnviarMensagem
            ) {
                return;
            }

            var id =
                idSelecionado();

            var $form =
                $(this);

            var $botao =
                $form.find(
                    '[type="submit"]'
                );

            var dados =
                new FormData(
                    this
                );

            var ficheiro =
                dados.get(
                    'media'
                );

            if (
                !id
            ) {
                aviso(
                    'Seleciona primeiro uma pessoa.',
                    'erro'
                );

                return;
            }

            if (
                !texto(
                    dados.get(
                        'mensagem'
                    )
                ) &&
                !(
                    ficheiro instanceof
                        File &&
                    ficheiro.size
                )
            ) {
                return;
            }

            dados.set(
                'action',
                'send'
            );

            aEnviarMensagem =
                true;

            $botao
                .prop(
                    'disabled',
                    true
                )
                .val(
                    'A enviar…'
                );

            try {
                var resposta =
                    await fetch(
                        baseUrl(
                            window.messagesUrl,
                            '/messages'
                        ) +
                        '/' +
                        encodeURIComponent(
                            id
                        ),
                        {
                            method:
                                'POST',

                            body:
                                dados,

                            credentials:
                                'same-origin'
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
                    .removeClass(
                        'selecionado'
                    )
                    .text(
                        '+'
                    )
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
                    window
                        .AppWebSocket
                        .isConnected()
                ) {
                    window
                        .AppWebSocket
                        .send({
                            type:
                                'chat_publish',

                            message_id:
                                resultado
                                    .message
                                    .id
                        });
                }
            } catch (
                erro
            ) {
                aviso(
                    erro.message,
                    'erro'
                );
            } finally {
                aEnviarMensagem =
                    false;

                if (
                    paginaAtiva
                ) {
                    $botao
                        .prop(
                            'disabled',
                            false
                        )
                        .val(
                            'Enviar'
                        );
                }
            }
        }
    );

    $media.on(
        'change' + NS,
        function (
            evento
        ) {
            evento.stopImmediatePropagation();

            var ficheiro =
                this.files &&
                this.files[0];

            $anexo
                .toggleClass(
                    'selecionado',
                    Boolean(
                        ficheiro
                    )
                )
                .text(
                    ficheiro
                        ? '✓'
                        : '+'
                )
                .attr(
                    'aria-label',
                    ficheiro
                        ? ficheiro.name
                        : 'Adicionar fotografia ou vídeo'
                );
        }
    );

    $maisOpcoes.on(
        'pointerdown' + NS +
        ' pointerup' + NS,
        function (
            evento
        ) {
            evento.stopPropagation();
        }
    );

    $maisOpcoes.on(
        'click' + NS,
        function (
            evento
        ) {
            evento.preventDefault();
            evento.stopPropagation();

            abrirAcoes();
        }
    );

    $acoes.on(
        'pointerdown' + NS +
        ' pointermove' + NS +
        ' pointerup' + NS +
        ' pointercancel' + NS,
        function (
            evento
        ) {
            evento.stopPropagation();
        }
    );

    $acoes.on(
        'click' + NS,
        '[data-fechar-acoes]',
        function (
            evento
        ) {
            evento.preventDefault();

            fecharAcoes();
        }
    );

    $abrirDenuncia.on(
        'click' + NS,
        abrirFormularioDenuncia
    );

    $voltarDenuncia.on(
        'click' + NS,
        function () {
            $formDenuncia.prop(
                'hidden',
                true
            );

            $acoesPrincipal.prop(
                'hidden',
                false
            );
        }
    );

    $bloquearMembro.on(
        'click' + NS,
        async function () {
            if (
                aProcessarSeguranca
            ) {
                return;
            }

            var id =
                idSelecionado();

            var membroNome =
                nomeSelecionado();

            if (
                !id ||
                !window.confirm(
                    'Bloquear ' +
                    membroNome +
                    '? Deixam imediatamente de aparecer um ao outro entre as pessoas por perto.'
                )
            ) {
                return;
            }

            definirSegurancaOcupada(
                true
            );

            try {
                await pedidoSeguranca(
                    'block'
                );

                removerPessoaDoMapa(
                    id
                );

                if (
                    window.AppWebSocket &&
                    window
                        .AppWebSocket
                        .isConnected()
                ) {
                    window
                        .AppWebSocket
                        .send({
                            type:
                                'block_refresh',

                            target_id:
                                id
                        });
                }

                fecharAcoes();

                if (
                    typeof window
                        .fecharMiniMenu ===
                    'function'
                ) {
                    window
                        .fecharMiniMenu();
                }

                aviso(
                    membroNome +
                    ' foi bloqueado.',
                    'sucesso'
                );
            } catch (
                erro
            ) {
                aviso(
                    erro.message,
                    'erro'
                );
            } finally {
                definirSegurancaOcupada(
                    false
                );
            }
        }
    );

    $formDenuncia.on(
        'submit' + NS,
        async function (
            evento
        ) {
            evento.preventDefault();

            if (
                aProcessarSeguranca
            ) {
                return;
            }

            var motivo =
                texto(
                    $('#denuncia-motivo')
                        .val()
                );

            var mensagem =
                texto(
                    $('#denuncia-mensagem')
                        .val()
                );

            if (
                !motivo
            ) {
                aviso(
                    'Escolhe o motivo da denúncia.',
                    'erro'
                );

                return;
            }

            definirSegurancaOcupada(
                true
            );

            try {
                await pedidoSeguranca(
                    'report',
                    {
                        motivo:
                            motivo,

                        mensagem:
                            mensagem
                    }
                );

                this.reset();

                fecharAcoes();

                aviso(
                    'Denúncia enviada. Obrigado por nos avisares.',
                    'sucesso'
                );
            } catch (
                erro
            ) {
                aviso(
                    erro.message,
                    'erro'
                );
            } finally {
                definirSegurancaOcupada(
                    false
                );
            }
        }
    );

    $(document).on(
        'keydown' + NS,
        function (
            evento
        ) {
            if (
                evento.key ===
                    'Escape' &&
                !$acoes.prop(
                    'hidden'
                )
            ) {
                fecharAcoes();
            }
        }
    );

    function aoHeyEnviado() {
        libertarHey();
    }

    function aoHeyErro() {
        libertarHey();
    }

    window.addEventListener(
        'app:hey-enviado',
        aoHeyEnviado
    );

    window.addEventListener(
        'app:hey-erro',
        aoHeyErro
    );

    if (
        window.visualViewport
    ) {
        window
            .visualViewport
            .addEventListener(
                'resize',
                aoAlterarVisualViewport,
                {
                    passive:
                        true
                }
            );

        window
            .visualViewport
            .addEventListener(
                'scroll',
                aoAlterarVisualViewport,
                {
                    passive:
                        true
                }
            );
    }

    prepararTecladoNativo();

    function desativarPagina() {
        if (
            !paginaAtiva
        ) {
            return;
        }

        paginaAtiva =
            false;

        if (
            temporizadorHey !==
            null
        ) {
            window.clearTimeout(
                temporizadorHey
            );

            temporizadorHey =
                null;
        }

        cancelarRestauracao();

        removerListenersTeclado();

        document.removeEventListener(
            'pointerdown',
            interceptarToqueForaDoInput,
            true
        );

        $(document).off(
            NS
        );

        $miniMenu.off(
            NS
        );

        $botaoHey.off(
            NS
        );

        $formMensagem.off(
            NS
        );

        $inputMensagem.off(
            NS
        );

        $media.off(
            NS
        );

        $perfil.off(
            NS
        );

        $maisOpcoes.off(
            NS
        );

        $acoes.off(
            NS
        );

        $abrirDenuncia.off(
            NS
        );

        $voltarDenuncia.off(
            NS
        );

        $bloquearMembro.off(
            NS
        );

        $formDenuncia.off(
            NS
        );

        window.removeEventListener(
            'app:hey-enviado',
            aoHeyEnviado
        );

        window.removeEventListener(
            'app:hey-erro',
            aoHeyErro
        );

        if (
            window.visualViewport
        ) {
            window
                .visualViewport
                .removeEventListener(
                    'resize',
                    aoAlterarVisualViewport
                );

            window
                .visualViewport
                .removeEventListener(
                    'scroll',
                    aoAlterarVisualViewport
                );
        }

        document.removeEventListener(
            'margot:page-leave',
            desativarPagina
        );

        window.removeEventListener(
            'pagehide',
            desativarPagina
        );

        document.body
            .classList
            .remove(
                'margot-mini-menu-teclado'
            );

        if (
            window.prepararMiniMenuDaFoto ===
            prepararMiniMenu
        ) {
            delete window
                .prepararMiniMenuDaFoto;
        }

        if (
            window.desativarIndexMiniMenuMargot ===
            desativarPagina
        ) {
            delete window
                .desativarIndexMiniMenuMargot;
        }
    }

    window.desativarIndexMiniMenuMargot =
        desativarPagina;

    document.addEventListener(
        'margot:page-leave',
        desativarPagina
    );

    window.addEventListener(
        'pagehide',
        desativarPagina
    );
})(
    window,
    document,
    jQuery
);