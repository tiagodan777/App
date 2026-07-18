(function (window, document) {
    'use strict';

    var galeria =
        document.getElementById(
            'perfil-galeria'
        );

    var faixa =
        document.getElementById(
            'perfil-fotos'
        );

    if (!galeria || !faixa) return;

    var slides =
        Array.prototype.slice.call(
            faixa.querySelectorAll(
                '.perfil-slide'
            )
        );

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

    var indiceAtual = 0;
    var frameScroll = null;
    var ratoAtivo = false;
    var ratoMoveu = false;
    var ratoInicioX = 0;
    var scrollInicio = 0;

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
                suave === false
                    ? 'auto'
                    : 'smooth'
        });

        atualizarInterface(
            indice
        );
    }

    function corrigirFoto(imagem) {
        var tentativa = 0;

        imagem.addEventListener(
            'error',
            function () {
                tentativa += 1;

                var fallback =
                    imagem.dataset
                        .fallback;

                var padrao =
                    imagem.dataset
                        .default;

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
                            indicador.dataset
                                .indice
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
     * Arrasto com rato no computador.
     * No telefone é utilizado o scroll nativo.
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
                Math.abs(distancia) >
                4
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
        }
    );

    window.addEventListener(
        'resize',
        function () {
            mostrarFoto(
                indiceAtual,
                false
            );
        },
        {
            passive: true
        }
    );

    atualizarInterface(0);
})(
    window,
    document
);