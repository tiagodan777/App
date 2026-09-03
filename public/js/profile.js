(function (window, document) {
    'use strict';


    document.documentElement.classList.remove(
        'perfil-modal-aberta'
    );

    document.body.classList.remove(
        'perfil-modal-aberta'
    );


    var perfil =
        document.getElementById(
            'perfil'
        );


    var galeria =
        document.getElementById(
            'perfil-galeria'
        );


    var faixa =
        document.getElementById(
            'perfil-fotos'
        );


    if (
        !perfil ||
        !galeria ||
        !faixa
    ) {
        return;
    }


    var slides =
        Array.prototype.slice.call(
            faixa.querySelectorAll(
                '.perfil-slide'
            )
        );


    if (!slides.length) {
        return;
    }


    var indicadores =
        Array.prototype.slice.call(
            document.querySelectorAll(
                '#perfil-indicadores button'
            )
        );


    var anterior =
        document.getElementById(
            'perfil-anterior'
        );


    var seguinte =
        document.getElementById(
            'perfil-seguinte'
        );


    var contadorAtual =
        document.getElementById(
            'perfil-contador-atual'
        );


    var lightbox =
        document.getElementById(
            'perfil-lightbox'
        );


    var lightboxMedia =
        document.getElementById(
            'perfil-lightbox-media'
        );


    var lightboxImagem =
        document.getElementById(
            'perfil-lightbox-imagem'
        );


    var lightboxPath =
        document.getElementById(
            'perfil-lightbox-path'
        );


    var lightboxFechar =
        document.getElementById(
            'perfil-lightbox-fechar'
        );


    var lightboxAnterior =
        document.getElementById(
            'perfil-lightbox-anterior'
        );


    var lightboxSeguinte =
        document.getElementById(
            'perfil-lightbox-seguinte'
        );


    var lightboxContadorAtual =
        document.getElementById(
            'perfil-lightbox-contador-atual'
        );


    /* =====================================================
       ESTADO
       ===================================================== */

    var indiceAtual =
        0;


    var lightboxAberto =
        false;


    var frameScroll =
        null;


    var observadorTamanho =
        null;


    var temporizadorFecho =
        null;


    var animacaoPathFrame =
        null;


    var temporizadorSplash =
        null;


    var animacaoGaleriaFrame =
        null;


    var temporizadorTrocaLightbox =
        null;


    var pointerAtivo =
        false;


    var pointerId =
        null;


    var pointerInicioX =
        0;


    var pointerInicioY =
        0;


    var pointerUltimoX =
        0;


    var pointerInicioScroll =
        0;


    var pointerInicioTempo =
        0;


    var pointerDirecao =
        null;


    var pointerMoveu =
        false;


    var ignorarClickAte =
        0;


    /* =====================================================
       PATHS
       ===================================================== */

    var PATH_ILHA = [
        0.075, 0.235,

        0.055, 0.125,
        0.135, 0.045,
        0.285, 0.055,

        0.390, 0.010,
        0.500, 0.070,
        0.610, 0.050,

        0.750, 0.020,
        0.875, 0.095,
        0.915, 0.225,

        0.985, 0.320,
        0.940, 0.435,
        0.965, 0.545,

        0.995, 0.675,
        0.915, 0.775,
        0.825, 0.835,

        0.755, 0.945,
        0.620, 0.900,
        0.515, 0.950,

        0.405, 0.995,
        0.305, 0.930,
        0.215, 0.920,

        0.105, 0.910,
        0.045, 0.820,
        0.060, 0.700,

        0.015, 0.605,
        0.070, 0.495,
        0.045, 0.405,

        0.025, 0.330,
        0.095, 0.305,
        0.075, 0.235
    ];


    var PATH_SPLASH = [
        0.008, 0.115,

        0.000, 0.035,
        0.070, 0.008,
        0.195, 0.020,

        0.290, 0.000,
        0.405, 0.025,
        0.515, 0.008,

        0.655, 0.000,
        0.800, 0.018,
        0.925, 0.070,

        0.995, 0.115,
        0.985, 0.250,
        0.998, 0.365,

        1.000, 0.500,
        0.985, 0.620,
        0.997, 0.735,

        0.985, 0.870,
        0.875, 0.935,
        0.755, 0.950,

        0.655, 0.995,
        0.530, 0.975,
        0.420, 0.992,

        0.300, 0.998,
        0.200, 0.965,
        0.105, 0.950,

        0.020, 0.920,
        0.005, 0.820,
        0.015, 0.705,

        0.002, 0.600,
        0.018, 0.500,
        0.005, 0.390,

        0.002, 0.275,
        0.025, 0.205,
        0.008, 0.115
    ];


    var PATH_RECT = [
        0.000, 0.000,

        0.080, 0.000,
        0.170, 0.000,
        0.250, 0.000,

        0.330, 0.000,
        0.420, 0.000,
        0.500, 0.000,

        0.580, 0.000,
        0.670, 0.000,
        0.750, 0.000,

        0.830, 0.000,
        0.920, 0.000,
        1.000, 0.000,

        1.000, 0.160,
        1.000, 0.330,
        1.000, 0.500,

        1.000, 0.670,
        1.000, 0.840,
        1.000, 1.000,

        0.890, 1.000,
        0.770, 1.000,
        0.660, 1.000,

        0.550, 1.000,
        0.440, 1.000,
        0.330, 1.000,

        0.220, 1.000,
        0.110, 1.000,
        0.000, 1.000,

        0.000, 0.660,
        0.000, 0.330,
        0.000, 0.000
    ];


    /* =====================================================
       HELPERS
       ===================================================== */

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


    function prefereMovimentoReduzido() {
        return Boolean(
            window.matchMedia &&
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        );
    }


    function obterImagem(indice) {
        indice =
            limitarIndice(indice);


        return slides[indice]
            ? slides[indice].querySelector('img')
            : null;
    }


    function indiceMaisProximo() {
        var centro =
            faixa.scrollLeft +
            faixa.clientWidth / 2;


        var melhor =
            0;


        var menorDistancia =
            Infinity;


        slides.forEach(
            function (
                slide,
                indice
            ) {
                var centroSlide =
                    slide.offsetLeft +
                    slide.offsetWidth / 2;


                var distancia =
                    Math.abs(
                        centroSlide -
                        centro
                    );


                if (
                    distancia <
                    menorDistancia
                ) {
                    menorDistancia =
                        distancia;


                    melhor =
                        indice;
                }
            }
        );


        return limitarIndice(
            melhor
        );
    }


    /* =====================================================
       ANIMAÇÃO DA GALERIA

       Substitui scroll-behavior:smooth por uma animação
       consistente em Safari / Chrome / Capacitor.
       ===================================================== */

    function cancelarAnimacaoGaleria() {
        if (
            animacaoGaleriaFrame !==
            null
        ) {
            window.cancelAnimationFrame(
                animacaoGaleriaFrame
            );


            animacaoGaleriaFrame =
                null;
        }
    }


    function easingGaleria(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 -
              Math.pow(
                  -2 * t + 2,
                  3
              ) / 2;
    }


    function animarGaleriaPara(
        indice,
        duracao
    ) {
        indice =
            limitarIndice(indice);


        cancelarAnimacaoGaleria();


        var destino =
            slides[indice]
                .offsetLeft;


        var origem =
            faixa.scrollLeft;


        var distancia =
            destino -
            origem;


        if (
            prefereMovimentoReduzido() ||
            Math.abs(distancia) < 1
        ) {
            faixa.scrollLeft =
                destino;


            atualizarUI(
                indice
            );


            return;
        }


        var inicio =
            window.performance.now();


        faixa.classList.add(
            'a-arrastar'
        );


        function frame(agora) {
            var progresso =
                Math.min(
                    1,
                    (
                        agora -
                        inicio
                    ) /
                    duracao
                );


            var suavizado =
                easingGaleria(
                    progresso
                );


            faixa.scrollLeft =
                origem +
                distancia *
                suavizado;


            if (
                progresso <
                1
            ) {
                animacaoGaleriaFrame =
                    window.requestAnimationFrame(
                        frame
                    );
            } else {
                animacaoGaleriaFrame =
                    null;


                faixa.scrollLeft =
                    destino;


                faixa.classList.remove(
                    'a-arrastar'
                );


                atualizarUI(
                    indice
                );
            }
        }


        animacaoGaleriaFrame =
            window.requestAnimationFrame(
                frame
            );
    }


    /* =====================================================
       PATH
       ===================================================== */

    function criarPath(valores) {
        return [
            'M',
            valores[0],
            valores[1],

            'C',
            valores[2],
            valores[3],
            valores[4],
            valores[5],
            valores[6],
            valores[7],

            'C',
            valores[8],
            valores[9],
            valores[10],
            valores[11],
            valores[12],
            valores[13],

            'C',
            valores[14],
            valores[15],
            valores[16],
            valores[17],
            valores[18],
            valores[19],

            'C',
            valores[20],
            valores[21],
            valores[22],
            valores[23],
            valores[24],
            valores[25],

            'C',
            valores[26],
            valores[27],
            valores[28],
            valores[29],
            valores[30],
            valores[31],

            'C',
            valores[32],
            valores[33],
            valores[34],
            valores[35],
            valores[36],
            valores[37],

            'C',
            valores[38],
            valores[39],
            valores[40],
            valores[41],
            valores[42],
            valores[43],

            'C',
            valores[44],
            valores[45],
            valores[46],
            valores[47],
            valores[48],
            valores[49],

            'C',
            valores[50],
            valores[51],
            valores[52],
            valores[53],
            valores[54],
            valores[55],

            'C',
            valores[56],
            valores[57],
            valores[58],
            valores[59],
            valores[60],
            valores[61],

            'Z'
        ].join(' ');
    }


    function cancelarAnimacaoPath() {
        if (
            animacaoPathFrame !==
            null
        ) {
            window.cancelAnimationFrame(
                animacaoPathFrame
            );


            animacaoPathFrame =
                null;
        }


        if (
            temporizadorSplash !==
            null
        ) {
            window.clearTimeout(
                temporizadorSplash
            );


            temporizadorSplash =
                null;
        }
    }


    function animarPath(
        origem,
        destino,
        duracao,
        callback
    ) {
        if (!lightboxPath) {
            if (
                typeof callback ===
                'function'
            ) {
                callback();
            }


            return;
        }


        if (
            prefereMovimentoReduzido()
        ) {
            lightboxPath.setAttribute(
                'd',
                criarPath(destino)
            );


            if (
                typeof callback ===
                'function'
            ) {
                callback();
            }


            return;
        }


        if (
            animacaoPathFrame !==
            null
        ) {
            window.cancelAnimationFrame(
                animacaoPathFrame
            );


            animacaoPathFrame =
                null;
        }


        var inicio =
            window.performance.now();


        function easing(t) {
            return (
                1 -
                Math.pow(
                    1 - t,
                    4
                )
            );
        }


        function frame(agora) {
            var progresso =
                Math.min(
                    1,
                    (
                        agora -
                        inicio
                    ) /
                    duracao
                );


            var suavizado =
                easing(progresso);


            var atual =
                origem.map(
                    function (
                        valor,
                        indice
                    ) {
                        return (
                            valor +
                            (
                                destino[indice] -
                                valor
                            ) *
                            suavizado
                        );
                    }
                );


            lightboxPath.setAttribute(
                'd',
                criarPath(atual)
            );


            if (
                progresso <
                1
            ) {
                animacaoPathFrame =
                    window.requestAnimationFrame(
                        frame
                    );
            } else {
                animacaoPathFrame =
                    null;


                lightboxPath.setAttribute(
                    'd',
                    criarPath(destino)
                );


                if (
                    typeof callback ===
                    'function'
                ) {
                    callback();
                }
            }
        }


        animacaoPathFrame =
            window.requestAnimationFrame(
                frame
            );
    }


    function animarAberturaPath() {
        cancelarAnimacaoPath();


        animarPath(
            PATH_ILHA,
            PATH_SPLASH,
            360,
            function () {
                temporizadorSplash =
                    window.setTimeout(
                        function () {
                            temporizadorSplash =
                                null;


                            animarPath(
                                PATH_SPLASH,
                                PATH_RECT,
                                410
                            );
                        },
                        10
                    );
            }
        );
    }


    function animarFechoPath() {
        cancelarAnimacaoPath();


        animarPath(
            PATH_RECT,
            PATH_SPLASH,
            260,
            function () {
                animarPath(
                    PATH_SPLASH,
                    PATH_ILHA,
                    390
                );
            }
        );
    }


    /* =====================================================
       FALLBACK
       ===================================================== */

    function prepararFallback(imagem) {
        imagem.addEventListener(
            'error',
            function () {
                var tentativas =
                    Number(
                        imagem.dataset
                            .fallbackTentativas ||
                        0
                    );


                tentativas += 1;


                imagem.dataset
                    .fallbackTentativas =
                    String(tentativas);


                var fallback =
                    imagem.dataset
                        .fallback;


                var padrao =
                    imagem.dataset
                        .default;


                if (
                    tentativas === 1 &&
                    fallback
                ) {
                    imagem.src =
                        fallback;


                    return;
                }


                if (
                    tentativas <= 2 &&
                    padrao
                ) {
                    imagem.src =
                        padrao;
                }
            }
        );
    }


    faixa
        .querySelectorAll('img')
        .forEach(
            prepararFallback
        );


    /* =====================================================
       UI
       ===================================================== */

    function atualizarUI(indice) {
        indiceAtual =
            limitarIndice(indice);


        slides.forEach(
            function (
                slide,
                posicao
            ) {
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
                    posicao ===
                    indiceAtual;


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


    /* =====================================================
       LIGHTBOX TAMANHO
       ===================================================== */

    function ajustarLightboxAoAspecto(
        larguraNatural,
        alturaNatural
    ) {
        if (
            !lightboxMedia ||
            !larguraNatural ||
            !alturaNatural
        ) {
            return;
        }


        var larguraMaxima =
            Math.min(
                window.innerWidth * 0.92,
                880
            );


        var alturaMaxima =
            Math.min(
                window.innerHeight * 0.80,
                920
            );


        var proporcao =
            Math.min(
                larguraMaxima /
                    larguraNatural,

                alturaMaxima /
                    alturaNatural
            );


        lightboxMedia.style.width =
            Math.max(
                120,
                larguraNatural *
                    proporcao
            ) +
            'px';


        lightboxMedia.style.height =
            Math.max(
                120,
                alturaNatural *
                    proporcao
            ) +
            'px';
    }


    function atualizarLightboxFoto(
        indice
    ) {
        if (!lightboxImagem) {
            return;
        }


        indice =
            limitarIndice(indice);


        var imagem =
            obterImagem(indice);


        if (!imagem) {
            return;
        }


        if (
            imagem.naturalWidth &&
            imagem.naturalHeight
        ) {
            ajustarLightboxAoAspecto(
                imagem.naturalWidth,
                imagem.naturalHeight
            );
        }


        lightboxImagem.src =
            imagem.currentSrc ||
            imagem.src;


        lightboxImagem.alt =
            imagem.alt || '';


        if (
            lightboxContadorAtual
        ) {
            lightboxContadorAtual
                .textContent =
                formatarNumero(
                    indice + 1
                );
        }


        if (lightboxAnterior) {
            lightboxAnterior.disabled =
                indice === 0;
        }


        if (lightboxSeguinte) {
            lightboxSeguinte.disabled =
                indice ===
                slides.length - 1;
        }
    }


    /* =====================================================
       TROCA SUAVE NO LIGHTBOX
       ===================================================== */

    function trocarFotoLightbox(
        novoIndice
    ) {
        novoIndice =
            limitarIndice(
                novoIndice
            );


        if (
            novoIndice ===
            indiceAtual
        ) {
            return;
        }


        if (
            temporizadorTrocaLightbox !==
            null
        ) {
            window.clearTimeout(
                temporizadorTrocaLightbox
            );
        }


        lightboxImagem.classList.add(
            'a-trocar'
        );


        temporizadorTrocaLightbox =
            window.setTimeout(
                function () {
                    temporizadorTrocaLightbox =
                        null;


                    indiceAtual =
                        novoIndice;


                    atualizarUI(
                        indiceAtual
                    );


                    faixa.scrollLeft =
                        slides[indiceAtual]
                            .offsetLeft;


                    atualizarLightboxFoto(
                        indiceAtual
                    );


                    window.requestAnimationFrame(
                        function () {
                            lightboxImagem
                                .classList
                                .remove(
                                    'a-trocar'
                                );
                        }
                    );
                },
                145
            );
    }


    /* =====================================================
       ORIGEM LIGHTBOX
       ===================================================== */

    function calcularTransformacaoOrigem() {
        if (
            !lightboxMedia ||
            !galeria
        ) {
            return;
        }


        var origem =
            galeria
                .getBoundingClientRect();


        var destino =
            lightboxMedia
                .getBoundingClientRect();


        if (
            !origem.width ||
            !origem.height ||
            !destino.width ||
            !destino.height
        ) {
            return;
        }


        var centroOrigemX =
            origem.left +
            origem.width / 2;


        var centroOrigemY =
            origem.top +
            origem.height / 2;


        var centroDestinoX =
            destino.left +
            destino.width / 2;


        var centroDestinoY =
            destino.top +
            destino.height / 2;


        lightboxMedia.style.setProperty(
            '--perfil-origem-x',
            (
                centroOrigemX -
                centroDestinoX
            ) +
            'px'
        );


        lightboxMedia.style.setProperty(
            '--perfil-origem-y',
            (
                centroOrigemY -
                centroDestinoY
            ) +
            'px'
        );


        lightboxMedia.style.setProperty(
            '--perfil-origem-scale-x',
            String(
                origem.width /
                destino.width
            )
        );


        lightboxMedia.style.setProperty(
            '--perfil-origem-scale-y',
            String(
                origem.height /
                destino.height
            )
        );
    }


    /* =====================================================
       ABRIR
       ===================================================== */

    function abrirLightbox(indice) {
        if (
            !lightbox ||
            !lightboxMedia ||
            !lightboxImagem
        ) {
            return;
        }


        if (
            temporizadorFecho !==
            null
        ) {
            window.clearTimeout(
                temporizadorFecho
            );


            temporizadorFecho =
                null;
        }


        indiceAtual =
            limitarIndice(indice);


        atualizarUI(
            indiceAtual
        );


        atualizarLightboxFoto(
            indiceAtual
        );


        if (lightboxPath) {
            lightboxPath.setAttribute(
                'd',
                criarPath(
                    PATH_ILHA
                )
            );
        }


        lightbox.hidden =
            false;


        lightbox.setAttribute(
            'aria-hidden',
            'false'
        );


        lightbox.classList.add(
            'is-mounted'
        );


        document.documentElement
            .classList.add(
                'perfil-modal-aberta'
            );


        document.body
            .classList.add(
                'perfil-modal-aberta'
            );


        lightboxAberto =
            true;


        window.requestAnimationFrame(
            function () {
                calcularTransformacaoOrigem();


                window.requestAnimationFrame(
                    function () {
                        lightbox.classList.add(
                            'is-open'
                        );


                        animarAberturaPath();
                    }
                );
            }
        );


        if (lightboxFechar) {
            window.setTimeout(
                function () {
                    lightboxFechar.focus({
                        preventScroll:
                            true
                    });
                },
                80
            );
        }
    }


    /* =====================================================
       FECHAR
       ===================================================== */

    function fecharLightbox() {
        if (
            !lightbox ||
            !lightboxAberto
        ) {
            return;
        }


        calcularTransformacaoOrigem();


        animarFechoPath();


        lightbox.classList.remove(
            'is-open'
        );


        lightboxAberto =
            false;


        temporizadorFecho =
            window.setTimeout(
                function () {
                    temporizadorFecho =
                        null;


                    cancelarAnimacaoPath();


                    lightbox.classList.remove(
                        'is-mounted'
                    );


                    lightbox.hidden =
                        true;


                    lightbox.setAttribute(
                        'aria-hidden',
                        'true'
                    );


                    document.documentElement
                        .classList.remove(
                            'perfil-modal-aberta'
                        );


                    document.body
                        .classList.remove(
                            'perfil-modal-aberta'
                        );


                    if (lightboxImagem) {
                        lightboxImagem.src =
                            '';
                    }


                    if (lightboxPath) {
                        lightboxPath.setAttribute(
                            'd',
                            criarPath(
                                PATH_ILHA
                            )
                        );
                    }


                    galeria.focus({
                        preventScroll:
                            true
                    });
                },
                prefereMovimentoReduzido()
                    ? 0
                    : 830
            );
    }


    /* =====================================================
       SWIPE / DRAG PRINCIPAL
       ===================================================== */

    function terminarPointer(
        evento,
        cancelado
    ) {
        if (!pointerAtivo) {
            return;
        }


        var largura =
            faixa.clientWidth || 1;


        var distancia =
            pointerUltimoX -
            pointerInicioX;


        var tempo =
            Math.max(
                1,
                window.performance.now() -
                pointerInicioTempo
            );


        var velocidade =
            distancia /
            tempo;


        var indiceInicio =
            limitarIndice(
                Math.round(
                    pointerInicioScroll /
                    largura
                )
            );


        var destino =
            indiceMaisProximo();


        if (
            !cancelado &&
            pointerDirecao ===
                'horizontal'
        ) {
            var limite =
                largura * 0.16;


            if (
                distancia <
                    -limite ||
                velocidade <
                    -0.42
            ) {
                destino =
                    limitarIndice(
                        indiceInicio + 1
                    );
            } else if (
                distancia >
                    limite ||
                velocidade >
                    0.42
            ) {
                destino =
                    limitarIndice(
                        indiceInicio - 1
                    );
            } else {
                destino =
                    indiceInicio;
            }
        }


        if (
            pointerDirecao ===
            'horizontal'
        ) {
            ignorarClickAte =
                window.performance.now() +
                250;


            animarGaleriaPara(
                destino,
                380
            );
        }


        if (
            pointerId !== null &&
            faixa.hasPointerCapture &&
            faixa.hasPointerCapture(
                pointerId
            )
        ) {
            try {
                faixa.releasePointerCapture(
                    pointerId
                );
            } catch (erro) {
                /* sem ação */
            }
        }


        pointerAtivo =
            false;


        pointerId =
            null;


        pointerDirecao =
            null;


        pointerMoveu =
            false;
    }


    faixa.addEventListener(
        'pointerdown',
        function (evento) {
            if (
                evento.pointerType ===
                    'mouse' &&
                evento.button !== 0
            ) {
                return;
            }


            cancelarAnimacaoGaleria();


            pointerAtivo =
                true;


            pointerId =
                evento.pointerId;


            pointerDirecao =
                null;


            pointerMoveu =
                false;


            pointerInicioX =
                evento.clientX;


            pointerInicioY =
                evento.clientY;


            pointerUltimoX =
                evento.clientX;


            pointerInicioScroll =
                faixa.scrollLeft;


            pointerInicioTempo =
                window.performance.now();
        }
    );


    faixa.addEventListener(
        'pointermove',
        function (evento) {
            if (!pointerAtivo) {
                return;
            }


            pointerUltimoX =
                evento.clientX;


            var deltaX =
                evento.clientX -
                pointerInicioX;


            var deltaY =
                evento.clientY -
                pointerInicioY;


            var absX =
                Math.abs(deltaX);


            var absY =
                Math.abs(deltaY);


            if (
                pointerDirecao ===
                    null &&
                (
                    absX > 6 ||
                    absY > 6
                )
            ) {
                if (
                    absX >
                    absY * 1.15
                ) {
                    pointerDirecao =
                        'horizontal';


                    faixa.classList.add(
                        'a-arrastar'
                    );


                    if (
                        faixa
                            .setPointerCapture
                    ) {
                        try {
                            faixa.setPointerCapture(
                                evento.pointerId
                            );
                        } catch (erro) {
                            /* sem ação */
                        }
                    }
                } else {
                    pointerDirecao =
                        'vertical';
                }
            }


            if (
                pointerDirecao !==
                'horizontal'
            ) {
                return;
            }


            evento.preventDefault();


            pointerMoveu =
                true;


            faixa.scrollLeft =
                pointerInicioScroll -
                deltaX;
        }
    );


    faixa.addEventListener(
        'pointerup',
        function (evento) {
            faixa.classList.remove(
                'a-arrastar'
            );


            terminarPointer(
                evento,
                false
            );
        }
    );


    faixa.addEventListener(
        'pointercancel',
        function (evento) {
            faixa.classList.remove(
                'a-arrastar'
            );


            terminarPointer(
                evento,
                true
            );
        }
    );


    /* =====================================================
       SCROLL
       ===================================================== */

    faixa.addEventListener(
        'scroll',
        function () {
            if (
                pointerAtivo ||
                animacaoGaleriaFrame !==
                    null
            ) {
                return;
            }


            if (
                frameScroll !==
                null
            ) {
                return;
            }


            frameScroll =
                window.requestAnimationFrame(
                    function () {
                        frameScroll =
                            null;


                        atualizarUI(
                            indiceMaisProximo()
                        );
                    }
                );
        },
        {
            passive: true
        }
    );


    /* =====================================================
       INDICADORES
       ===================================================== */

    indicadores.forEach(
        function (indicador) {
            indicador.addEventListener(
                'click',
                function (evento) {
                    evento.stopPropagation();


                    animarGaleriaPara(
                        Number(
                            indicador.dataset
                                .indice ||
                            0
                        ),
                        420
                    );
                }
            );
        }
    );


    /* =====================================================
       SETAS PRINCIPAIS
       ===================================================== */

    if (anterior) {
        anterior.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                animarGaleriaPara(
                    indiceAtual - 1,
                    420
                );
            }
        );
    }


    if (seguinte) {
        seguinte.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                animarGaleriaPara(
                    indiceAtual + 1,
                    420
                );
            }
        );
    }


    /* =====================================================
       ABRIR FOTO
       ===================================================== */

    faixa.addEventListener(
        'click',
        function (evento) {
            if (
                window.performance.now() <
                ignorarClickAte
            ) {
                evento.preventDefault();

                return;
            }


            var imagem =
                evento.target.closest(
                    '.perfil-slide img'
                );


            if (!imagem) {
                return;
            }


            var slide =
                imagem.closest(
                    '.perfil-slide'
                );


            if (!slide) {
                return;
            }


            abrirLightbox(
                Number(
                    slide.dataset
                        .indice ||
                    0
                )
            );
        }
    );


    /* =====================================================
       LIGHTBOX CONTROLOS
       ===================================================== */

    if (lightbox) {
        lightbox.addEventListener(
            'click',
            function (evento) {
                if (!lightboxAberto) {
                    return;
                }


                if (
                    evento.target.closest(
                        '.perfil-lightbox-media'
                    )
                ) {
                    return;
                }


                if (
                    evento.target.closest(
                        '.perfil-lightbox-nav'
                    )
                ) {
                    return;
                }


                if (
                    evento.target.closest(
                        '.perfil-lightbox-fechar'
                    )
                ) {
                    return;
                }


                fecharLightbox();
            }
        );
    }


    if (lightboxFechar) {
        lightboxFechar.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                fecharLightbox();
            }
        );
    }


    if (lightboxAnterior) {
        lightboxAnterior.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                if (
                    indiceAtual <= 0
                ) {
                    return;
                }


                trocarFotoLightbox(
                    indiceAtual - 1
                );
            }
        );
    }


    if (lightboxSeguinte) {
        lightboxSeguinte.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                if (
                    indiceAtual >=
                    slides.length - 1
                ) {
                    return;
                }


                trocarFotoLightbox(
                    indiceAtual + 1
                );
            }
        );
    }


    /* =====================================================
       TECLADO
       ===================================================== */

    function aoPremirTecla(evento) {
        if (lightboxAberto) {

            if (
                evento.key ===
                'Escape'
            ) {
                evento.preventDefault();


                fecharLightbox();


                return;
            }


            if (
                evento.key ===
                    'ArrowLeft' &&
                indiceAtual > 0
            ) {
                evento.preventDefault();


                trocarFotoLightbox(
                    indiceAtual - 1
                );


                return;
            }


            if (
                evento.key ===
                    'ArrowRight' &&
                indiceAtual <
                    slides.length - 1
            ) {
                evento.preventDefault();


                trocarFotoLightbox(
                    indiceAtual + 1
                );


                return;
            }


            return;
        }


        if (
            document.activeElement !==
            galeria
        ) {
            return;
        }


        if (
            evento.key ===
            'ArrowLeft'
        ) {
            evento.preventDefault();


            animarGaleriaPara(
                indiceAtual - 1,
                420
            );
        }


        if (
            evento.key ===
            'ArrowRight'
        ) {
            evento.preventDefault();


            animarGaleriaPara(
                indiceAtual + 1,
                420
            );
        }


        if (
            evento.key ===
                'Enter' ||
            evento.key ===
                ' '
        ) {
            evento.preventDefault();


            abrirLightbox(
                indiceAtual
            );
        }
    }


    document.addEventListener(
        'keydown',
        aoPremirTecla
    );


    /* =====================================================
       RESIZE
       ===================================================== */

    function aoRedimensionar() {
        cancelarAnimacaoGaleria();


        faixa.scrollLeft =
            slides[indiceAtual]
                .offsetLeft;


        if (lightboxAberto) {
            atualizarLightboxFoto(
                indiceAtual
            );


            calcularTransformacaoOrigem();
        }
    }


    if (
        'ResizeObserver' in
        window
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


    /* =====================================================
       CLEANUP
       ===================================================== */

    function desativarPagina() {
        cancelarAnimacaoGaleria();

        cancelarAnimacaoPath();


        if (
            frameScroll !==
            null
        ) {
            window.cancelAnimationFrame(
                frameScroll
            );


            frameScroll =
                null;
        }


        if (
            temporizadorFecho !==
            null
        ) {
            window.clearTimeout(
                temporizadorFecho
            );
        }


        if (
            temporizadorTrocaLightbox !==
            null
        ) {
            window.clearTimeout(
                temporizadorTrocaLightbox
            );
        }


        if (observadorTamanho) {
            observadorTamanho.disconnect();


            observadorTamanho =
                null;
        }


        document.documentElement
            .classList.remove(
                'perfil-modal-aberta'
            );


        document.body
            .classList.remove(
                'perfil-modal-aberta'
            );


        document.removeEventListener(
            'keydown',
            aoPremirTecla
        );


        document.removeEventListener(
            'margot:page-leave',
            desativarPagina
        );
    }


    document.addEventListener(
        'margot:page-leave',
        desativarPagina
    );


    atualizarUI(0);

})(window, document);


/* =========================================================
   HEY
   ========================================================= */

(function (window, document) {
    'use strict';


    var botao =
        document.getElementById(
            'enviar-hey-perfil'
        );


    if (!botao) {
        return;
    }


    var etiqueta =
        botao.querySelector(
            '.perfil-hey-label'
        );


    var estadoAcessivel =
        document.getElementById(
            'perfil-hey-estado'
        );


    var temporizadorReposicao =
        null;


    var temporizadorConfirmacao =
        null;


    var aEnviar =
        false;


    var textoInicial =
        etiqueta
            ? etiqueta.textContent
            : 'Hey';


    function detalheCorresponde(evento) {
        var detalhe =
            evento &&
            evento.detail
                ? evento.detail
                : {};


        return (
            String(
                detalhe
                    .destinatario_id ||
                ''
            ) ===
            String(
                botao.dataset
                    .destinatarioId ||
                ''
            )
        );
    }


    function alterarEtiqueta(texto) {
        if (etiqueta) {
            etiqueta.textContent =
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


        temporizadorConfirmacao =
            null;
    }


    function reporBotao() {
        limparTemporizadorConfirmacao();


        aEnviar =
            false;


        botao.disabled =
            false;


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
            window
                .mostrarMensagemTemporaria(
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
            typeof window
                .AppWebSocket
                .isConnected !==
                'function' ||
            !window.AppWebSocket
                .isConnected()
        ) {
            if (
                window.AppWebSocket &&
                typeof window
                    .AppWebSocket
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


        aEnviar =
            true;


        botao.disabled =
            true;


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


        aEnviar =
            false;


        botao.disabled =
            true;


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
            'Enviado'
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


/* CONEXÃO DE PROXIMIDADE */
(function (window, document) {
    'use strict';

    var botao =
        document.getElementById(
            'conectar-perfil'
        );

    if (!botao) {
        return;
    }

    var label =
        botao.querySelector(
            '.perfil-conectar-label'
        );

    var estado =
        document.getElementById(
            'perfil-conectar-estado'
        );

    var temporizador =
        null;

    var aEsperar =
        false;

    function destinatarioId() {
        return String(
            botao.dataset
                .destinatarioId ||
            ''
        ).trim();
    }

    function corresponde(evento) {
        var detalhe =
            evento &&
            evento.detail
                ? evento.detail
                : {};

        var outro =
            String(
                detalhe.other_member_id ||
                detalhe.outro_id ||
                detalhe.destinatario_id ||
                ''
            ).trim();

        return (
            outro !== '' &&
            outro === destinatarioId()
        );
    }

    function anunciar(texto) {
        if (estado) {
            estado.textContent =
                texto || '';
        }
    }

    function mostrarErro(texto) {
        anunciar(texto);

        if (
            typeof window
                .mostrarMensagemTemporaria ===
                'function'
        ) {
            window.mostrarMensagemTemporaria(
                texto,
                'erro'
            );
        }
    }

    function limparEspera() {
        if (
            temporizador !==
            null
        ) {
            window.clearTimeout(
                temporizador
            );

            temporizador =
                null;
        }

        aEsperar =
            false;

        if (
            botao.dataset.ligado !==
            '1'
        ) {
            botao.disabled =
                false;

            botao.classList.remove(
                'a-espera'
            );

            if (label) {
                label.textContent =
                    'Conectar';
            }

            botao.setAttribute(
                'aria-pressed',
                'false'
            );
        }
    }

    function marcarLigado() {
        if (
            temporizador !==
            null
        ) {
            window.clearTimeout(
                temporizador
            );

            temporizador =
                null;
        }

        aEsperar =
            false;

        botao.dataset.ligado =
            '1';

        botao.disabled =
            true;

        botao.classList.remove(
            'a-espera'
        );

        botao.classList.add(
            'ligado'
        );

        botao.setAttribute(
            'aria-pressed',
            'true'
        );

        if (label) {
            label.textContent =
                'Ligados';
        }

        anunciar(
            'Agora estão ligados na Margot. Podem conversar mesmo quando já não estão perto.'
        );
    }

    function celebrar(nome) {
        if (
            document.querySelector(
                '.perfil-conexao-celebracao'
            )
        ) {
            return;
        }

        var camada =
            document.createElement(
                'div'
            );

        camada.className =
            'perfil-conexao-celebracao';

        camada.setAttribute(
            'aria-hidden',
            'true'
        );

        var mensagem =
            document.createElement(
                'div'
            );

        mensagem.className =
            'perfil-conexao-celebracao-mensagem';

        mensagem.textContent =
            nome
                ? 'Tu e ' +
                    nome +
                    ' estão ligados'
                : 'Agora estão ligados';

        camada.appendChild(
            mensagem
        );

        document.body.appendChild(
            camada
        );

        window.setTimeout(
            function () {
                if (
                    camada.parentNode
                ) {
                    camada.parentNode
                        .removeChild(
                            camada
                        );
                }
            },
            1450
        );
    }

    function tentarConectar() {
        if (
            aEsperar ||
            botao.dataset.ligado ===
                '1'
        ) {
            return;
        }

        var outroId =
            destinatarioId();

        if (!outroId) {
            return;
        }

        if (
            !window.AppWebSocket ||
            typeof window
                .AppWebSocket
                .isConnected !==
                'function' ||
            !window.AppWebSocket
                .isConnected()
        ) {
            if (
                window.AppWebSocket &&
                typeof window
                    .AppWebSocket
                    .connect ===
                    'function'
            ) {
                window.AppWebSocket
                    .connect();
            }

            mostrarErro(
                'A ligação está a ser restabelecida. Tenta novamente daqui a um instante.'
            );

            return;
        }

        var enviado =
            window.AppWebSocket.send({
                type:
                    'connection_attempt',

                destinatario_id:
                    outroId
            });

        if (!enviado) {
            mostrarErro(
                'Não foi possível tentar a ligação.'
            );

            return;
        }

        aEsperar =
            true;

        botao.disabled =
            true;

        botao.classList.add(
            'a-espera'
        );

        if (label) {
            label.textContent =
                'Agora…';
        }

        anunciar(
            'A outra pessoa tem um instante para tocar em Conectar.'
        );

        temporizador =
            window.setTimeout(
                limparEspera,
                1800
            );
    }

    function aoAguardar(evento) {
        if (
            !corresponde(
                evento
            )
        ) {
            return;
        }

        anunciar(
            'A outra pessoa tem um instante para tocar em Conectar.'
        );
    }

    function aoConectar(evento) {
        if (
            !corresponde(
                evento
            )
        ) {
            return;
        }

        var detalhe =
            evento.detail ||
            {};

        var jaLigados =
            !!detalhe
                .already_connected;

        marcarLigado();

        if (!jaLigados) {
            celebrar(
                String(
                    detalhe.other_name ||
                    ''
                ).trim()
            );
        }
    }

    function aoErro(evento) {
        if (
            !corresponde(
                evento
            )
        ) {
            return;
        }

        var detalhe =
            evento.detail ||
            {};

        limparEspera();

        mostrarErro(
            String(
                detalhe.message ||
                'Não foi possível criar a ligação.'
            )
        );
    }

    function sair() {
        if (
            temporizador !==
            null
        ) {
            window.clearTimeout(
                temporizador
            );
        }

        botao.removeEventListener(
            'click',
            tentarConectar
        );

        window.removeEventListener(
            'app:connection-waiting',
            aoAguardar
        );

        window.removeEventListener(
            'app:connection-created',
            aoConectar
        );

        window.removeEventListener(
            'app:connection-error',
            aoErro
        );

        document.removeEventListener(
            'margot:page-leave',
            sair
        );
    }

    botao.addEventListener(
        'click',
        tentarConectar
    );

    window.addEventListener(
        'app:connection-waiting',
        aoAguardar
    );

    window.addEventListener(
        'app:connection-created',
        aoConectar
    );

    window.addEventListener(
        'app:connection-error',
        aoErro
    );

    document.addEventListener(
        'margot:page-leave',
        sair
    );
})(window, document);