(() => {
    'use strict';

    const canvas =
        document.getElementById(
            'gridCanvas'
        );

    if (!canvas) {
        return;
    }

    const ctx =
        canvas.getContext('2d');

    if (!ctx) {
        return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    let time = 0;
    let lastFrame = 0;
    let resizeFrame = null;

    const FPS = 45;
    const FRAME_TIME = 1000 / FPS;
    const SPACING = 19.5;

    /*
     * Margem extra para garantir que o desenho continua
     * por baixo da safe area inferior do iPhone.
     */
    const VERTICAL_OVERSCAN = 160;

    const COLOR_YELLOW = [
        255,
        215,
        0
    ];

    const COLOR_BLUE = [
        0,
        100,
        255
    ];

    const COLOR_PURPLE = [
        138,
        43,
        226
    ];

    function obterLargura() {
        return Math.max(
            window.innerWidth || 0,
            document.documentElement.clientWidth || 0,
            canvas.getBoundingClientRect().width || 0
        );
    }

    function obterAltura() {
        const rect =
            canvas.getBoundingClientRect();

        const alturaCanvas =
            rect.height || 0;

        const alturaJanela =
            window.innerHeight || 0;

        const alturaDocumento =
            document.documentElement
                .clientHeight || 0;

        let alturaVisual = 0;

        if (window.visualViewport) {
            alturaVisual =
                window.visualViewport.height +
                window.visualViewport.offsetTop;
        }

        return Math.max(
            alturaCanvas,
            alturaJanela,
            alturaDocumento,
            alturaVisual
        ) + VERTICAL_OVERSCAN;
    }

    function resize() {
        width = Math.ceil(
            obterLargura()
        );

        height = Math.ceil(
            obterAltura()
        );

        dpr = Math.min(
            window.devicePixelRatio || 1,
            1.5
        );

        /*
         * A altura CSS também recebe uma margem extra.
         */
        canvas.style.width =
            width + 'px';

        canvas.style.height =
            height + 'px';

        const pixelWidth =
            Math.max(
                1,
                Math.round(
                    width * dpr
                )
            );

        const pixelHeight =
            Math.max(
                1,
                Math.round(
                    height * dpr
                )
            );

        if (
            canvas.width !==
            pixelWidth
        ) {
            canvas.width =
                pixelWidth;
        }

        if (
            canvas.height !==
            pixelHeight
        ) {
            canvas.height =
                pixelHeight;
        }

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        criarGrelha();
    }

    function agendarResize() {
        if (resizeFrame !== null) {
            cancelAnimationFrame(
                resizeFrame
            );
        }

        resizeFrame =
            requestAnimationFrame(
                function () {
                    resizeFrame = null;
                    resize();
                }
            );
    }

    function criarGrelha() {
        points = [];

        const colunas =
            Math.ceil(
                width / SPACING
            ) + 8;

        const linhas =
            Math.ceil(
                height / SPACING
            ) + 8;

        const inicioX =
            -SPACING * 4;

        const inicioY =
            -SPACING * 4;

        for (
            let linha = 0;
            linha < linhas;
            linha++
        ) {
            for (
                let coluna = 0;
                coluna < colunas;
                coluna++
            ) {
                points.push({
                    baseX:
                        inicioX +
                        coluna * SPACING,

                    baseY:
                        inicioY +
                        linha * SPACING
                });
            }
        }
    }

    function interpolar(
        inicio,
        fim,
        fator
    ) {
        return (
            inicio +
            (
                fim -
                inicio
            ) *
                fator
        );
    }

    function limitar(
        valor,
        minimo,
        maximo
    ) {
        return Math.max(
            minimo,
            Math.min(
                maximo,
                valor
            )
        );
    }

    function obterCorGradiente(
        valor
    ) {
        valor = limitar(
            valor,
            0,
            1
        );

        let cor1;
        let cor2;
        let fator;

        if (valor < 0.5) {
            cor1 = COLOR_YELLOW;
            cor2 = COLOR_BLUE;
            fator = valor * 2;
        } else {
            cor1 = COLOR_BLUE;
            cor2 = COLOR_PURPLE;

            fator =
                (
                    valor -
                    0.5
                ) *
                2;
        }

        const vermelho =
            Math.floor(
                interpolar(
                    cor1[0],
                    cor2[0],
                    fator
                )
            );

        const verde =
            Math.floor(
                interpolar(
                    cor1[1],
                    cor2[1],
                    fator
                )
            );

        const azul =
            Math.floor(
                interpolar(
                    cor1[2],
                    cor2[2],
                    fator
                )
            );

        return (
            vermelho +
            ', ' +
            verde +
            ', ' +
            azul
        );
    }

    function desenhar(agora) {
        requestAnimationFrame(
            desenhar
        );

        if (
            agora - lastFrame <
            FRAME_TIME
        ) {
            return;
        }

        lastFrame = agora;

        ctx.clearRect(
            0,
            0,
            width,
            height
        );

        time += 0.0015;

        const centroX =
            width / 2;

        const centroY =
            height / 2;

        const tempoBuraco =
            time * 3.5;

        const buracoX =
            centroX +
            Math.sin(
                tempoBuraco *
                    0.7
            ) *
                (
                    centroX *
                    0.9
                ) +
            Math.cos(
                tempoBuraco *
                    0.3
            ) *
                (
                    centroX *
                    0.3
                );

        const buracoY =
            centroY +
            Math.cos(
                tempoBuraco *
                    0.8
            ) *
                (
                    centroY *
                    0.9
                ) +
            Math.sin(
                tempoBuraco *
                    0.4
            ) *
                (
                    centroY *
                    0.3
                );

        const raioBuraco =
            160;

        const raioBuracoQuadrado =
            raioBuraco *
            raioBuraco;

        const suavidadeMargem =
            60;

        const inversoSuavidade =
            1 /
            suavidadeMargem;

        for (
            let indice = 0;
            indice < points.length;
            indice++
        ) {
            const ponto =
                points[indice];

            const normalizadoX =
                ponto.baseX *
                0.003;

            const normalizadoY =
                ponto.baseY *
                0.003;

            const ondaX =
                Math.sin(
                    normalizadoY *
                        2.5 +
                    time *
                        2.5
                ) *
                    18 +
                Math.cos(
                    normalizadoX *
                        1.8 -
                    time
                ) *
                    12;

            const ondaY =
                Math.cos(
                    normalizadoX *
                        2.5 -
                    time *
                        2.5
                ) *
                    18 +
                Math.sin(
                    normalizadoY *
                        1.8 +
                    time
                ) *
                    12;

            const finalX =
                ponto.baseX +
                ondaX;

            const finalY =
                ponto.baseY +
                ondaY;

            const valorOnda =
                (
                    Math.sin(
                        normalizadoX *
                            2.2 +
                        time *
                            1.5
                    ) +
                    Math.cos(
                        normalizadoY *
                            2.2 +
                        time *
                            1.5
                    ) +
                    2
                ) *
                0.25;

            const deltaX =
                finalX -
                buracoX;

            const deltaY =
                finalY -
                buracoY;

            const distanciaQuadrada =
                deltaX *
                    deltaX +
                deltaY *
                    deltaY;

            let alpha;

            if (
                distanciaQuadrada <
                raioBuracoQuadrado
            ) {
                alpha = 0;
            } else {
                const distancia =
                    Math.sqrt(
                        distanciaQuadrada
                    );

                alpha = limitar(
                    (
                        distancia -
                        raioBuraco
                    ) *
                        inversoSuavidade,
                    0,
                    1
                );
            }

            const ruidoMargem =
                Math.sin(
                    normalizadoX *
                        15 +
                    time *
                        5
                ) *
                0.15;

            alpha = limitar(
                alpha +
                    ruidoMargem,
                0,
                1
            );

            const alphaFinal =
                alpha *
                (
                    0.8 +
                    valorOnda *
                        0.2
                );

            if (
                alphaFinal <
                0.05
            ) {
                continue;
            }

            const rgb =
                obterCorGradiente(
                    valorOnda
                );

            const alphaArredondado =
                Math.round(
                    alphaFinal *
                        100
                ) /
                100;

            ctx.fillStyle =
                'rgba(' +
                rgb +
                ', ' +
                alphaArredondado +
                ')';

            ctx.fillRect(
                finalX - 1.2,
                finalY - 1.2,
                2.4,
                2.4
            );
        }
    }

    window.addEventListener(
        'resize',
        agendarResize
    );

    window.addEventListener(
        'orientationchange',
        function () {
            window.setTimeout(
                agendarResize,
                100
            );

            window.setTimeout(
                agendarResize,
                400
            );

            window.setTimeout(
                agendarResize,
                1000
            );
        }
    );

    window.addEventListener(
        'pageshow',
        function () {
            agendarResize();

            window.setTimeout(
                agendarResize,
                300
            );
        }
    );

    document.addEventListener(
        'visibilitychange',
        function () {
            if (
                document.visibilityState ===
                'visible'
            ) {
                agendarResize();

                window.setTimeout(
                    agendarResize,
                    300
                );
            }
        }
    );

    if (window.visualViewport) {
        window.visualViewport
            .addEventListener(
                'resize',
                agendarResize
            );

        window.visualViewport
            .addEventListener(
                'scroll',
                agendarResize
            );
    }

    resize();

    requestAnimationFrame(
        desenhar
    );
})();