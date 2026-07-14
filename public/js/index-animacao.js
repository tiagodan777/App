(function () {
    'use strict';

    const canvas = document.getElementById('gridCanvas');

    if (!canvas) {
        return;
    }

    const context = canvas.getContext('2d', {
        alpha: false
    });

    if (!context) {
        return;
    }

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let points = [];
    let animationTime = 0;
    let lastFrameTime = 0;
    let resizeAnimationFrame = null;

    const FPS = 45;
    const FRAME_INTERVAL = 1000 / FPS;
    const POINT_SPACING = 19.5;

    /*
     * Espaço adicional para cobrir completamente a safe area
     * inferior do iPhone em modo PWA.
     */
    const BOTTOM_OVERSCAN = 80;

    const COLOR_YELLOW = [255, 215, 0];
    const COLOR_BLUE = [0, 100, 255];
    const COLOR_PURPLE = [138, 43, 226];

    function getViewportWidth() {
        return Math.max(
            window.innerWidth || 0,
            document.documentElement.clientWidth || 0,
            window.visualViewport
                ? window.visualViewport.width
                : 0
        );
    }

    function getViewportHeight() {
        const innerHeight =
            window.innerHeight || 0;

        const documentHeight =
            document.documentElement.clientHeight || 0;

        const visualHeight =
            window.visualViewport
                ? (
                    window.visualViewport.height +
                    window.visualViewport.offsetTop
                )
                : 0;

        /*
         * Adicionamos uma margem inferior real ao canvas.
         * Desta forma, os pontos continuam a ser desenhados
         * atrás da área do indicador Home.
         */
        return Math.max(
            innerHeight,
            documentHeight,
            visualHeight
        ) + BOTTOM_OVERSCAN;
    }

    function resizeCanvas() {
        width = getViewportWidth();
        height = getViewportHeight();

        pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            1.5
        );

        canvas.style.width =
            width + 'px';

        canvas.style.height =
            height + 'px';

        canvas.width =
            Math.ceil(
                width * pixelRatio
            );

        canvas.height =
            Math.ceil(
                height * pixelRatio
            );

        context.setTransform(
            pixelRatio,
            0,
            0,
            pixelRatio,
            0,
            0
        );

        createGrid();
    }

    function scheduleResize() {
        if (resizeAnimationFrame !== null) {
            cancelAnimationFrame(
                resizeAnimationFrame
            );
        }

        resizeAnimationFrame =
            requestAnimationFrame(
                function () {
                    resizeAnimationFrame = null;
                    resizeCanvas();
                }
            );
    }

    function createGrid() {
        points = [];

        const columns =
            Math.ceil(
                width / POINT_SPACING
            ) + 8;

        const rows =
            Math.ceil(
                height / POINT_SPACING
            ) + 8;

        const startX =
            -POINT_SPACING * 4;

        const startY =
            -POINT_SPACING * 4;

        for (
            let row = 0;
            row < rows;
            row++
        ) {
            for (
                let column = 0;
                column < columns;
                column++
            ) {
                points.push({
                    baseX:
                        startX +
                        column *
                        POINT_SPACING,

                    baseY:
                        startY +
                        row *
                        POINT_SPACING
                });
            }
        }
    }

    function lerp(start, end, factor) {
        return (
            start +
            (end - start) *
            factor
        );
    }

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(
                value,
                maximum
            )
        );
    }

    function getGradientColor(value) {
        value = clamp(
            value,
            0,
            1
        );

        let firstColor;
        let secondColor;
        let factor;

        if (value < 0.5) {
            firstColor =
                COLOR_YELLOW;

            secondColor =
                COLOR_BLUE;

            factor =
                value * 2;
        } else {
            firstColor =
                COLOR_BLUE;

            secondColor =
                COLOR_PURPLE;

            factor =
                (value - 0.5) * 2;
        }

        const red = Math.floor(
            lerp(
                firstColor[0],
                secondColor[0],
                factor
            )
        );

        const green = Math.floor(
            lerp(
                firstColor[1],
                secondColor[1],
                factor
            )
        );

        const blue = Math.floor(
            lerp(
                firstColor[2],
                secondColor[2],
                factor
            )
        );

        return (
            red +
            ', ' +
            green +
            ', ' +
            blue
        );
    }

    function draw(timestamp) {
        requestAnimationFrame(draw);

        if (
            timestamp -
            lastFrameTime <
            FRAME_INTERVAL
        ) {
            return;
        }

        lastFrameTime = timestamp;

        /*
         * Preenche explicitamente o canvas inteiro.
         * O alpha:false também evita transparências estranhas
         * na zona inferior no Safari.
         */
        context.fillStyle = '#ffffff';

        context.fillRect(
            0,
            0,
            width,
            height
        );

        animationTime += 0.0015;

        const centerX =
            width / 2;

        const centerY =
            height / 2;

        const holeTime =
            animationTime * 3.5;

        const holeX =
            centerX +
            Math.sin(
                holeTime * 0.7
            ) *
            (
                centerX * 0.9
            ) +
            Math.cos(
                holeTime * 0.3
            ) *
            (
                centerX * 0.3
            );

        const holeY =
            centerY +
            Math.cos(
                holeTime * 0.8
            ) *
            (
                centerY * 0.9
            ) +
            Math.sin(
                holeTime * 0.4
            ) *
            (
                centerY * 0.3
            );

        const holeRadius = 160;

        const holeRadiusSquared =
            holeRadius *
            holeRadius;

        const edgeSoftness = 60;

        const inverseEdgeSoftness =
            1 /
            edgeSoftness;

        for (
            let index = 0;
            index < points.length;
            index++
        ) {
            const point =
                points[index];

            const normalizedX =
                point.baseX *
                0.003;

            const normalizedY =
                point.baseY *
                0.003;

            const waveX =
                Math.sin(
                    normalizedY *
                    2.5 +
                    animationTime *
                    2.5
                ) *
                18 +
                Math.cos(
                    normalizedX *
                    1.8 -
                    animationTime
                ) *
                12;

            const waveY =
                Math.cos(
                    normalizedX *
                    2.5 -
                    animationTime *
                    2.5
                ) *
                18 +
                Math.sin(
                    normalizedY *
                    1.8 +
                    animationTime
                ) *
                12;

            const finalX =
                point.baseX +
                waveX;

            const finalY =
                point.baseY +
                waveY;

            const waveValue =
                (
                    Math.sin(
                        normalizedX *
                        2.2 +
                        animationTime *
                        1.5
                    ) +
                    Math.cos(
                        normalizedY *
                        2.2 +
                        animationTime *
                        1.5
                    ) +
                    2
                ) *
                0.25;

            const deltaX =
                finalX -
                holeX;

            const deltaY =
                finalY -
                holeY;

            const distanceSquared =
                deltaX *
                deltaX +
                deltaY *
                deltaY;

            let alpha;

            if (
                distanceSquared <
                holeRadiusSquared
            ) {
                alpha = 0;
            } else {
                const distance =
                    Math.sqrt(
                        distanceSquared
                    );

                alpha = clamp(
                    (
                        distance -
                        holeRadius
                    ) *
                    inverseEdgeSoftness,
                    0,
                    1
                );
            }

            const borderNoise =
                Math.sin(
                    normalizedX *
                    15 +
                    animationTime *
                    5
                ) *
                0.15;

            alpha = clamp(
                alpha +
                borderNoise,
                0,
                1
            );

            const finalAlpha =
                alpha *
                (
                    0.8 +
                    waveValue *
                    0.2
                );

            if (
                finalAlpha <
                0.05
            ) {
                continue;
            }

            const rgb =
                getGradientColor(
                    waveValue
                );

            const roundedAlpha =
                Math.round(
                    finalAlpha *
                    100
                ) /
                100;

            context.fillStyle =
                'rgba(' +
                rgb +
                ', ' +
                roundedAlpha +
                ')';

            context.fillRect(
                finalX - 1.2,
                finalY - 1.2,
                2.4,
                2.4
            );
        }
    }

    window.addEventListener(
        'resize',
        scheduleResize
    );

    window.addEventListener(
        'orientationchange',
        function () {
            window.setTimeout(
                scheduleResize,
                200
            );
        }
    );

    window.addEventListener(
        'pageshow',
        scheduleResize
    );

    window.addEventListener(
        'focus',
        scheduleResize
    );

    document.addEventListener(
        'visibilitychange',
        function () {
            if (
                document.visibilityState ===
                'visible'
            ) {
                scheduleResize();
            }
        }
    );

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            scheduleResize
        );
    }

    resizeCanvas();
    requestAnimationFrame(draw);
})();