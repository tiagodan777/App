(function (window, document) {
    'use strict';

    var galeria = document.getElementById(
        'perfil-galeria'
    );

    var faixa = document.getElementById(
        'perfil-fotos'
    );

    if (!galeria || !faixa) return;

    var slides = Array.prototype.slice.call(
        faixa.querySelectorAll(
            '.perfil-slide'
        )
    );

    var indicadores = Array.prototype.slice.call(
        document.querySelectorAll(
            '#perfil-indicadores button'
        )
    );

    var anterior = document.getElementById(
        'perfil-anterior'
    );

    var seguinte = document.getElementById(
        'perfil-seguinte'
    );

    var contadorAtual = document.getElementById(
        'perfil-contador-atual'
    );

    var indiceAtual = 0;
    var frameScroll = null;

    var ratoAtivo = false;
    var ratoMoveu = false;
    var ratoInicioX = 0;
    var scrollInicio = 0;

    var observadorTamanho = null;

    if (slides.length === 0) return;

    function limitarIndice(indice) {
        return Math.max(
            0,
            Math.min(
                indice,
                slides.length - 1
            )
        );
    }

    function formatarNumero(numero) {
        return numero < 10
            ? '0' + numero
            : String(numero);
    }

    function indiceMaisProximo() {
        var centro =
            faixa.scrollLeft +
            faixa.clientWidth / 2;

        var melhorIndice = 0;
        var menorDistancia = Infinity;

        slides.forEach(
            function (slide, indice) {
                var centroSlide =
                    slide.offsetLeft +
                    slide.offsetWidth / 2;

                var distancia = Math.abs(
                    centroSlide - centro
                );

                if (
                    distancia <
                    menorDistancia
                ) {
                    menorDistancia =
                        distancia;

                    melhorIndice =
                        indice;
                }
            }
        );

        return melhorIndice;
    }

    function atualizarInterface(indice) {
        indiceAtual =
            limitarIndice(indice);

        slides.forEach(
            function (slide, posicao) {
                slide.setAttribute(
                    'aria-hidden',
                    posicao === indiceAtual
                        ? 'false'
                        : 'true'
                );
            }
        );

        indicadores.forEach(
            function (
                indicador,
                posicao
            ) {
                var ativo =
                    posicao === indiceAtual;

                indicador.classList.toggle(
                    'ativo',
                    ativo
                );

                indicador.setAttribute(
                    'aria-current',
                    ativo
                        ? 'true'
                        : 'false'
                );
            }
        );

        if (contadorAtual) {
            contadorAtual.textContent =
                formatarNumero(
                    indiceAtual + 1
                );
        }

        if (anterior) {
            anterior.disabled =
                indiceAtual === 0;
        }

        if (seguinte) {
            seguinte.disabled =
                indiceAtual ===
                slides.length - 1;
        }
    }

    function prefereMovimentoReduzido() {
        return Boolean(
            window.matchMedia &&
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        );
    }

    function mostrarFoto(
        indice,
        suave
    ) {
        indice =
            limitarIndice(indice);

        faixa.scrollTo({
            left:
                slides[indice].offsetLeft,

            behavior:
                suave === false ||
                prefereMovimentoReduzido()
                    ? 'auto'
                    : 'smooth'
        });

        atualizarInterface(indice);
    }

    function corrigirFoto(imagem) {
        var tentativa = 0;

        imagem.addEventListener(
            'error',
            function () {
                tentativa += 1;

                var fallback =
                    imagem.dataset.fallback;

                var padrao =
                    imagem.dataset.default;

                if (
                    tentativa === 1 &&
                    fallback
                ) {
                    imagem.src =
                        fallback;

                    return;
                }

                if (
                    padrao &&
                    imagem.src !==
                        new URL(
                            padrao,
                            window.location.href
                        ).href
                ) {
                    imagem.src =
                        padrao;
                }
            }
        );
    }

    faixa
        .querySelectorAll('img')
        .forEach(corrigirFoto);

    faixa.addEventListener(
        'scroll',
        function () {
            if (
                frameScroll !== null
            ) {
                return;
            }

            frameScroll =
                window.requestAnimationFrame(
                    function () {
                        frameScroll = null;

                        atualizarInterface(
                            indiceMaisProximo()
                        );
                    }
                );
        },
        {
            passive: true
        }
    );

    indicadores.forEach(
        function (indicador) {
            indicador.addEventListener(
                'click',
                function () {
                    mostrarFoto(
                        Number(
                            indicador.dataset.indice
                        )
                    );
                }
            );
        }
    );

    if (anterior) {
        anterior.addEventListener(
            'click',
            function () {
                mostrarFoto(
                    indiceAtual - 1
                );
            }
        );
    }

    if (seguinte) {
        seguinte.addEventListener(
            'click',
            function () {
                mostrarFoto(
                    indiceAtual + 1
                );
            }
        );
    }

    /*
     * O arrasto manual só é necessário
     * quando se usa rato.
     *
     * No toque, o scroll nativo é mais
     * fluido no iOS e no Android.
     */

    faixa.addEventListener(
        'pointerdown',
        function (evento) {
            if (
                evento.pointerType !==
                    'mouse' ||
                evento.button !== 0
            ) {
                return;
            }

            ratoAtivo = true;
            ratoMoveu = false;

            ratoInicioX =
                evento.clientX;

            scrollInicio =
                faixa.scrollLeft;

            faixa.classList.add(
                'a-arrastar'
            );

            faixa.setPointerCapture(
                evento.pointerId
            );
        }
    );

    faixa.addEventListener(
        'pointermove',
        function (evento) {
            if (!ratoAtivo) return;

            var distancia =
                evento.clientX -
                ratoInicioX;

            if (
                Math.abs(distancia) > 4
            ) {
                ratoMoveu = true;
            }

            faixa.scrollLeft =
                scrollInicio -
                distancia;

            evento.preventDefault();
        }
    );

    function terminarArrasto(evento) {
        if (!ratoAtivo) return;

        ratoAtivo = false;

        faixa.classList.remove(
            'a-arrastar'
        );

        if (
            faixa.hasPointerCapture(
                evento.pointerId
            )
        ) {
            faixa.releasePointerCapture(
                evento.pointerId
            );
        }

        mostrarFoto(
            indiceMaisProximo()
        );

        window.setTimeout(
            function () {
                ratoMoveu = false;
            },
            0
        );
    }

    faixa.addEventListener(
        'pointerup',
        terminarArrasto
    );

    faixa.addEventListener(
        'pointercancel',
        terminarArrasto
    );

    faixa.addEventListener(
        'click',
        function (evento) {
            if (ratoMoveu) {
                evento.preventDefault();
            }
        },
        true
    );

    galeria.addEventListener(
        'keydown',
        function (evento) {
            if (
                evento.key ===
                'ArrowLeft'
            ) {
                evento.preventDefault();

                mostrarFoto(
                    indiceAtual - 1
                );
            }

            if (
                evento.key ===
                'ArrowRight'
            ) {
                evento.preventDefault();

                mostrarFoto(
                    indiceAtual + 1
                );
            }

            if (
                evento.key ===
                'Home'
            ) {
                evento.preventDefault();

                mostrarFoto(0);
            }

            if (
                evento.key ===
                'End'
            ) {
                evento.preventDefault();

                mostrarFoto(
                    slides.length - 1
                );
            }
        }
    );

    function aoRedimensionar() {
        mostrarFoto(
            indiceAtual,
            false
        );
    }

    if (
        'ResizeObserver' in window
    ) {
        observadorTamanho =
            new window.ResizeObserver(
                aoRedimensionar
            );

        observadorTamanho.observe(
            faixa
        );
    } else {
        window.addEventListener(
            'resize',
            aoRedimensionar,
            {
                passive: true
            }
        );
    }

    function desativarPagina() {
        if (
            frameScroll !== null
        ) {
            window.cancelAnimationFrame(
                frameScroll
            );

            frameScroll = null;
        }

        if (observadorTamanho) {
            observadorTamanho.disconnect();

            observadorTamanho = null;
        } else {
            window.removeEventListener(
                'resize',
                aoRedimensionar
            );
        }

        document.removeEventListener(
            'margot:page-leave',
            desativarPagina
        );
    }

    document.addEventListener(
        'margot:page-leave',
        desativarPagina
    );

    atualizarInterface(0);
})(window, document);


(function (window, document) {
    'use strict';

    var botao = document.getElementById(
        'enviar-hey-perfil'
    );

    if (!botao) return;

    var etiqueta = botao.querySelector(
        '.perfil-hey-label'
    );

    var estadoAcessivel =
        document.getElementById(
            'perfil-hey-estado'
        );

    var temporizadorReposicao = null;
    var temporizadorConfirmacao = null;

    var aEnviar = false;

    var textoInicial =
        etiqueta
            ? etiqueta.textContent
            : 'Enviar Hey';

    function detalheCorresponde(evento) {
        var detalhe =
            evento &&
            evento.detail
                ? evento.detail
                : {};

        return (
            String(
                detalhe.destinatario_id || ''
            ) ===
            String(
                botao.dataset
                    .destinatarioId || ''
            )
        );
    }

    function alterarEtiqueta(texto) {
        if (etiqueta) {
            etiqueta.textContent =
                texto;
        } else {
            botao.textContent =
                texto;
        }
    }

    function anunciar(texto) {
        if (estadoAcessivel) {
            estadoAcessivel.textContent =
                texto;
        }
    }

    function limparTemporizadorConfirmacao() {
        if (
            temporizadorConfirmacao ===
            null
        ) {
            return;
        }

        window.clearTimeout(
            temporizadorConfirmacao
        );

        temporizadorConfirmacao = null;
    }

    function reporBotao() {
        limparTemporizadorConfirmacao();

        aEnviar = false;

        botao.disabled = false;

        botao.removeAttribute(
            'aria-busy'
        );

        botao.classList.remove(
            'a-enviar',
            'enviado'
        );

        alterarEtiqueta(
            textoInicial
        );
    }

    function mostrarMensagem(
        texto,
        tipo
    ) {
        anunciar(texto);

        if (
            typeof window
                .mostrarMensagemTemporaria ===
            'function'
        ) {
            window.mostrarMensagemTemporaria(
                texto,
                tipo || 'erro'
            );
        }
    }

    function enviarHey() {
        var destinatarioId =
            botao.dataset
                .destinatarioId;

        if (
            aEnviar ||
            !destinatarioId
        ) {
            return;
        }

        if (
            !window.AppWebSocket ||
            typeof window.AppWebSocket
                .isConnected !==
                'function' ||
            !window.AppWebSocket
                .isConnected()
        ) {
            if (
                window.AppWebSocket &&
                typeof window.AppWebSocket
                    .connect ===
                    'function'
            ) {
                window.AppWebSocket
                    .connect();
            }

            mostrarMensagem(
                'A ligação está a ser restabelecida.',
                'erro'
            );

            return;
        }

        aEnviar = true;

        botao.disabled = true;

        botao.setAttribute(
            'aria-busy',
            'true'
        );

        botao.classList.add(
            'a-enviar'
        );

        alterarEtiqueta(
            'A enviar…'
        );

        anunciar(
            'A enviar o Hey.'
        );

        var enviado =
            window.AppWebSocket.send({
                type: 'notify',

                destinatario_id:
                    destinatarioId
            });

        if (!enviado) {
            reporBotao();

            mostrarMensagem(
                'Não foi possível enviar o Hey.',
                'erro'
            );

            return;
        }

        temporizadorConfirmacao =
            window.setTimeout(
                function () {
                    temporizadorConfirmacao =
                        null;

                    reporBotao();

                    anunciar(
                        'Não foi recebida confirmação do envio. Podes tentar novamente.'
                    );
                },
                8000
            );
    }

    function aoEnviarHey(evento) {
        if (
            !detalheCorresponde(
                evento
            )
        ) {
            return;
        }

        limparTemporizadorConfirmacao();

        aEnviar = false;

        botao.disabled = true;

        botao.removeAttribute(
            'aria-busy'
        );

        botao.classList.remove(
            'a-enviar'
        );

        botao.classList.add(
            'enviado'
        );

        alterarEtiqueta(
            'Hey enviado'
        );

        anunciar(
            'Hey enviado com sucesso.'
        );

        if (
            temporizadorReposicao !==
            null
        ) {
            window.clearTimeout(
                temporizadorReposicao
            );
        }

        temporizadorReposicao =
            window.setTimeout(
                function () {
                    temporizadorReposicao =
                        null;

                    reporBotao();
                },
                1600
            );
    }

    function aoFalharHey(evento) {
        if (
            !detalheCorresponde(
                evento
            )
        ) {
            return;
        }

        reporBotao();

        mostrarMensagem(
            'Não foi possível enviar o Hey.',
            'erro'
        );
    }

    function desativarPagina() {
        if (
            temporizadorReposicao !==
            null
        ) {
            window.clearTimeout(
                temporizadorReposicao
            );

            temporizadorReposicao =
                null;
        }

        limparTemporizadorConfirmacao();

        botao.removeEventListener(
            'click',
            enviarHey
        );

        window.removeEventListener(
            'app:hey-enviado',
            aoEnviarHey
        );

        window.removeEventListener(
            'app:hey-erro',
            aoFalharHey
        );

        document.removeEventListener(
            'margot:page-leave',
            desativarPagina
        );
    }

    botao.addEventListener(
        'click',
        enviarHey
    );

    window.addEventListener(
        'app:hey-enviado',
        aoEnviarHey
    );

    window.addEventListener(
        'app:hey-erro',
        aoFalharHey
    );

    document.addEventListener(
        'margot:page-leave',
        desativarPagina
    );
})(window, document);