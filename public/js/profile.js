(function (window, document) {
    'use strict';


    /* =====================================================
       LIMPEZA DE ESTADO
       ===================================================== */

    document.documentElement.classList.remove(
        'perfil-modal-aberta'
    );

    document.body.classList.remove(
        'perfil-modal-aberta'
    );


    /* =====================================================
       ELEMENTOS
       ===================================================== */

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

    var indiceAtual = 0;

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


    var pointerAtivo =
        false;


    var pointerInicioX =
        0;


    var pointerInicioY =
        0;


    var pointerMoveu =
        false;


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


    var PATH_ABERTO = [
        0.025, 0.155,

        0.020, 0.065,
        0.095, 0.020,
        0.205, 0.035,

        0.315, 0.000,
        0.415, 0.045,
        0.520, 0.025,

        0.650, 0.005,
        0.790, 0.040,
        0.885, 0.105,

        0.980, 0.165,
        0.955, 0.285,
        0.985, 0.390,

        1.000, 0.515,
        0.960, 0.620,
        0.975, 0.715,

        0.950, 0.845,
        0.855, 0.905,
        0.745, 0.920,

        0.645, 0.990,
        0.535, 0.945,
        0.430, 0.975,

        0.315, 0.995,
        0.235, 0.940,
        0.145, 0.925,

        0.045, 0.900,
        0.020, 0.810,
        0.035, 0.705,

        0.000, 0.605,
        0.035, 0.505,
        0.015, 0.405,

        0.000, 0.305,
        0.050, 0.245,
        0.025, 0.155
    ];


    /* =====================================================
       UTILITÁRIOS
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
            ? slides[indice]
                .querySelector('img')
            : null;
    }


    function indiceMaisProximo() {
        var largura =
            faixa.clientWidth || 1;


        return limitarIndice(
            Math.round(
                faixa.scrollLeft /
                largura
            )
        );
    }


    /* =====================================================
       PATH SVG
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
    }


    function animarPath(
        origem,
        destino,
        duracao
    ) {
        if (!lightboxPath) {
            return;
        }


        cancelarAnimacaoPath();


        if (
            prefereMovimentoReduzido()
        ) {
            lightboxPath.setAttribute(
                'd',
                criarPath(
                    destino
                )
            );


            return;
        }


        var inicio =
            window.performance.now();


        function easeOutExpo(t) {
            if (t >= 1) {
                return 1;
            }


            return (
                1 -
                Math.pow(
                    2,
                    -10 * t
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
                easeOutExpo(
                    progresso
                );


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
                criarPath(
                    atual
                )
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
                    criarPath(
                        destino
                    )
                );
            }
        }


        animacaoPathFrame =
            window.requestAnimationFrame(
                frame
            );
    }


    /* =====================================================
       FALLBACK DE IMAGEM
       ===================================================== */

    function prepararFallback(
        imagem
    ) {
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
                    String(
                        tentativas
                    );


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
       UI GALERIA
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


        if (lightboxAberto) {
            atualizarLightboxFoto(
                indiceAtual
            );
        }
    }


    function mostrarFoto(
        indice,
        suave
    ) {
        indice =
            limitarIndice(indice);


        faixa.scrollTo({
            left:
                slides[indice]
                    .offsetLeft,

            behavior:
                (
                    suave === false ||
                    prefereMovimentoReduzido()
                )
                    ? 'auto'
                    : 'smooth'
        });


        atualizarUI(
            indice
        );
    }


    /* =====================================================
       LIGHTBOX FOTO
       ===================================================== */

    function atualizarLightboxFoto(
        indice
    ) {
        if (!lightboxImagem) {
            return;
        }


        indice =
            limitarIndice(indice);


        var imagem =
            obterImagem(
                indice
            );


        if (!imagem) {
            return;
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
       TRANSFORMAÇÃO DE ORIGEM
       ===================================================== */

    function calcularTransformacaoOrigem() {
        if (
            !lightboxMedia ||
            !galeria
        ) {
            return;
        }


        var origem =
            galeria.getBoundingClientRect();


        var destino =
            lightboxMedia.getBoundingClientRect();


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


        var deltaX =
            centroOrigemX -
            centroDestinoX;


        var deltaY =
            centroOrigemY -
            centroDestinoY;


        var scaleX =
            origem.width /
            destino.width;


        var scaleY =
            origem.height /
            destino.height;


        lightboxMedia.style
            .setProperty(
                '--perfil-origem-x',
                deltaX + 'px'
            );


        lightboxMedia.style
            .setProperty(
                '--perfil-origem-y',
                deltaY + 'px'
            );


        lightboxMedia.style
            .setProperty(
                '--perfil-origem-scale-x',
                String(
                    scaleX
                )
            );


        lightboxMedia.style
            .setProperty(
                '--perfil-origem-scale-y',
                String(
                    scaleY
                )
            );
    }


    /* =====================================================
       ABRIR LIGHTBOX
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


        indice =
            limitarIndice(indice);


        atualizarUI(
            indice
        );


        atualizarLightboxFoto(
            indice
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


                        animarPath(
                            PATH_ILHA,
                            PATH_ABERTO,
                            680
                        );
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
                70
            );
        }
    }


    /* =====================================================
       FECHAR LIGHTBOX
       ===================================================== */

    function fecharLightbox() {
        if (
            !lightbox ||
            !lightboxAberto
        ) {
            return;
        }


        calcularTransformacaoOrigem();


        animarPath(
            PATH_ABERTO,
            PATH_ILHA,
            620
        );


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
                    : 690
            );
    }


    /* =====================================================
       LIGHTBOX NAVEGAÇÃO
       ===================================================== */

    function lightboxFotoAnterior() {
        if (
            indiceAtual <= 0
        ) {
            return;
        }


        mostrarFoto(
            indiceAtual - 1,
            false
        );
    }


    function lightboxFotoSeguinte() {
        if (
            indiceAtual >=
            slides.length - 1
        ) {
            return;
        }


        mostrarFoto(
            indiceAtual + 1,
            false
        );
    }


    /* =====================================================
       SCROLL DA GALERIA
       ===================================================== */

    faixa.addEventListener(
        'scroll',
        function () {
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


                    mostrarFoto(
                        Number(
                            indicador.dataset
                                .indice ||
                            0
                        )
                    );
                }
            );
        }
    );


    /* =====================================================
       SETAS
       ===================================================== */

    if (anterior) {
        anterior.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                mostrarFoto(
                    indiceAtual - 1
                );
            }
        );
    }


    if (seguinte) {
        seguinte.addEventListener(
            'click',
            function (evento) {
                evento.stopPropagation();


                mostrarFoto(
                    indiceAtual + 1
                );
            }
        );
    }


    /* =====================================================
       DETETAR SWIPE VS TOQUE
       ===================================================== */

    faixa.addEventListener(
        'pointerdown',
        function (evento) {
            pointerAtivo =
                true;


            pointerMoveu =
                false;


            pointerInicioX =
                evento.clientX;


            pointerInicioY =
                evento.clientY;
        },
        {
            passive: true
        }
    );


    faixa.addEventListener(
        'pointermove',
        function (evento) {
            if (!pointerAtivo) {
                return;
            }


            var distanciaX =
                Math.abs(
                    evento.clientX -
                    pointerInicioX
                );


            var distanciaY =
                Math.abs(
                    evento.clientY -
                    pointerInicioY
                );


            if (
                distanciaX > 10 ||
                distanciaY > 10
            ) {
                pointerMoveu =
                    true;
            }
        },
        {
            passive: true
        }
    );


    faixa.addEventListener(
        'pointerup',
        function () {
            pointerAtivo =
                false;


            window.setTimeout(
                function () {
                    pointerMoveu =
                        false;
                },
                80
            );
        },
        {
            passive: true
        }
    );


    faixa.addEventListener(
        'pointercancel',
        function () {
            pointerAtivo =
                false;


            pointerMoveu =
                false;
        },
        {
            passive: true
        }
    );


    /* =====================================================
       TOQUE NA FOTO
       ===================================================== */

    faixa.addEventListener(
        'click',
        function (evento) {
            if (pointerMoveu) {
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
       FECHAR LIGHTBOX
       ===================================================== */

    if (lightboxFechar) {
        lightboxFechar.addEventListener(
            'click',
            fecharLightbox
        );
    }


    if (lightbox) {
        lightbox.addEventListener(
            'click',
            function (evento) {
                if (
                    evento.target &&
                    evento.target.hasAttribute(
                        'data-fechar-lightbox'
                    )
                ) {
                    fecharLightbox();
                }
            }
        );
    }


    /* =====================================================
       SETAS LIGHTBOX
       ===================================================== */

    if (lightboxAnterior) {
        lightboxAnterior.addEventListener(
            'click',
            lightboxFotoAnterior
        );
    }


    if (lightboxSeguinte) {
        lightboxSeguinte.addEventListener(
            'click',
            lightboxFotoSeguinte
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
                'ArrowLeft'
            ) {
                evento.preventDefault();


                lightboxFotoAnterior();


                return;
            }


            if (
                evento.key ===
                'ArrowRight'
            ) {
                evento.preventDefault();


                lightboxFotoSeguinte();


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


            mostrarFoto(
                indiceAtual - 1
            );


            return;
        }


        if (
            evento.key ===
            'ArrowRight'
        ) {
            evento.preventDefault();


            mostrarFoto(
                indiceAtual + 1
            );


            return;
        }


        if (
            evento.key ===
            'Home'
        ) {
            evento.preventDefault();


            mostrarFoto(
                0
            );


            return;
        }


        if (
            evento.key ===
            'End'
        ) {
            evento.preventDefault();


            mostrarFoto(
                slides.length - 1
            );


            return;
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
        mostrarFoto(
            indiceAtual,
            false
        );


        if (lightboxAberto) {
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


        cancelarAnimacaoPath();


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


        if (observadorTamanho) {
            observadorTamanho.disconnect();


            observadorTamanho =
                null;
        } else {
            window.removeEventListener(
                'resize',
                aoRedimensionar
            );
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


    /* =====================================================
       INICIALIZAÇÃO
       ===================================================== */

    atualizarUI(
        0
    );

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


    /* =====================================================
       HELPERS
       ===================================================== */

    function detalheCorresponde(
        evento
    ) {
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


    function alterarEtiqueta(
        texto
    ) {
        if (etiqueta) {
            etiqueta.textContent =
                texto;
        } else {
            botao.textContent =
                texto;
        }
    }


    function anunciar(
        texto
    ) {
        if (estadoAcessivel) {
            estadoAcessivel
                .textContent =
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
        anunciar(
            texto
        );


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


    /* =====================================================
       ENVIAR
       ===================================================== */

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
                type:
                    'notify',

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


    /* =====================================================
       SUCESSO
       ===================================================== */

    function aoEnviarHey(
        evento
    ) {
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


    /* =====================================================
       ERRO
       ===================================================== */

    function aoFalharHey(
        evento
    ) {
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


    /* =====================================================
       CLEANUP
       ===================================================== */

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


    /* =====================================================
       EVENTOS
       ===================================================== */

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