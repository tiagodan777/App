(function (window, document) {
    'use strict';

    var canvas =
        document.getElementById(
            'gridCanvas'
        );

    if (!canvas) {
        return;
    }

    var context =
        canvas.getContext(
            '2d',
            {
                alpha: false,
                desynchronized: true
            }
        );

    if (!context) {
        return;
    }

    var width = 0;
    var height = 0;
    var drawingHeight = 0;
    var devicePixelRatio = 1;

    var baseX =
        new Float32Array(0);

    var baseY =
        new Float32Array(0);

    var normalizedX =
        new Float32Array(0);

    var normalizedY =
        new Float32Array(0);

    var pointCount = 0;
    var animationTime = 0;
    var previousFrame = 0;
    var resizeFrame = null;

    var FPS = 45;
    var FRAME_TIME = 1000 / FPS;
    var GRID_SPACING = 19.5;
    var CANVAS_OVERSCAN = 160;

    var COLOR_YELLOW = [
        255,
        215,
        0
    ];

    var COLOR_BLUE = [
        0,
        100,
        255
    ];

    var COLOR_PURPLE = [
        138,
        43,
        226
    ];

    function getRootNumber(
        propertyName,
        fallback
    ) {
        var value = parseFloat(
            window
                .getComputedStyle(
                    document.documentElement
                )
                .getPropertyValue(
                    propertyName
                )
        );

        return Number.isFinite(value)
            ? value
            : fallback;
    }

    function getWidth() {
        return Math.ceil(
            getRootNumber(
                '--app-width',
                window.innerWidth ||
                document.documentElement
                    .clientWidth ||
                1
            )
        );
    }

    function getHeight() {
        return Math.ceil(
            getRootNumber(
                '--app-height',
                window.innerHeight ||
                document.documentElement
                    .clientHeight ||
                1
            )
        );
    }

    function resizeCanvas() {
        resizeFrame = null;

        width = getWidth();
        height = getHeight();

        CANVAS_OVERSCAN =
            getRootNumber(
                '--canvas-overscan',
                160
            );

        drawingHeight =
            height +
            CANVAS_OVERSCAN;

        devicePixelRatio = Math.min(
            window.devicePixelRatio || 1,
            1.5
        );

        canvas.style.width =
            width + 'px';

        canvas.style.height =
            drawingHeight + 'px';

        canvas.width = Math.ceil(
            width *
            devicePixelRatio
        );

        canvas.height = Math.ceil(
            drawingHeight *
            devicePixelRatio
        );

        context.setTransform(
            devicePixelRatio,
            0,
            0,
            devicePixelRatio,
            0,
            0
        );

        context.imageSmoothingEnabled =
            false;

        createGrid();
    }

    function scheduleResize() {
        if (resizeFrame !== null) {
            window.cancelAnimationFrame(
                resizeFrame
            );
        }

        resizeFrame =
            window.requestAnimationFrame(
                resizeCanvas
            );
    }

    function createGrid() {
        var columns =
            Math.ceil(
                width /
                GRID_SPACING
            ) +
            6;

        var rows =
            Math.ceil(
                drawingHeight /
                GRID_SPACING
            ) +
            6;

        pointCount =
            columns *
            rows;

        baseX =
            new Float32Array(
                pointCount
            );

        baseY =
            new Float32Array(
                pointCount
            );

        normalizedX =
            new Float32Array(
                pointCount
            );

        normalizedY =
            new Float32Array(
                pointCount
            );

        var startX =
            -GRID_SPACING * 3;

        var startY =
            -GRID_SPACING * 3;

        var index = 0;

        for (
            var row = 0;
            row < rows;
            row++
        ) {
            var y =
                startY +
                row *
                GRID_SPACING;

            var normalizedPointY =
                y * 0.003;

            for (
                var column = 0;
                column < columns;
                column++
            ) {
                var x =
                    startX +
                    column *
                    GRID_SPACING;

                baseX[index] = x;
                baseY[index] = y;

                normalizedX[index] =
                    x * 0.003;

                normalizedY[index] =
                    normalizedPointY;

                index++;
            }
        }
    }

    function clamp(
        value,
        minimum,
        maximum
    ) {
        return Math.max(
            minimum,
            Math.min(
                value,
                maximum
            )
        );
    }

    function interpolate(
        start,
        end,
        factor
    ) {
        return (
            start +
            (
                end -
                start
            ) *
            factor
        );
    }

    function getGradientColor(
        value
    ) {
        value = clamp(
            value,
            0,
            1
        );

        var color1;
        var color2;
        var factor;

        if (value < 0.5) {
            color1 = COLOR_YELLOW;
            color2 = COLOR_BLUE;
            factor = value * 2;
        } else {
            color1 = COLOR_BLUE;
            color2 = COLOR_PURPLE;
            factor =
                (
                    value -
                    0.5
                ) *
                2;
        }

        var red = Math.floor(
            interpolate(
                color1[0],
                color2[0],
                factor
            )
        );

        var green = Math.floor(
            interpolate(
                color1[1],
                color2[1],
                factor
            )
        );

        var blue = Math.floor(
            interpolate(
                color1[2],
                color2[2],
                factor
            )
        );

        return (
            red +
            ',' +
            green +
            ',' +
            blue
        );
    }

    function drawFrame(timestamp) {
        window.requestAnimationFrame(
            drawFrame
        );

        if (
            document.visibilityState !==
            'visible'
        ) {
            previousFrame = timestamp;
            return;
        }

        if (
            timestamp -
            previousFrame <
            FRAME_TIME
        ) {
            return;
        }

        previousFrame = timestamp;

        context.fillStyle = '#ffffff';

        context.fillRect(
            0,
            0,
            width,
            drawingHeight
        );

        animationTime += 0.0015;

        var centerX =
            width / 2;

        var centerY =
            height / 2;

        var holeTime =
            animationTime * 3.5;

        var holeX =
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

        var holeY =
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

        var holeRadius = 160;

        var holeRadiusSquared =
            holeRadius *
            holeRadius;

        var edgeSoftness = 60;

        var inverseEdgeSoftness =
            1 /
            edgeSoftness;

        for (
            var index = 0;
            index < pointCount;
            index++
        ) {
            var nx =
                normalizedX[index];

            var ny =
                normalizedY[index];

            var waveX =
                Math.sin(
                    ny * 2.5 +
                    animationTime * 2.5
                ) *
                18 +
                Math.cos(
                    nx * 1.8 -
                    animationTime
                ) *
                12;

            var waveY =
                Math.cos(
                    nx * 2.5 -
                    animationTime * 2.5
                ) *
                18 +
                Math.sin(
                    ny * 1.8 +
                    animationTime
                ) *
                12;

            var finalX =
                baseX[index] +
                waveX;

            var finalY =
                baseY[index] +
                waveY;

            var waveValue =
                (
                    Math.sin(
                        nx * 2.2 +
                        animationTime * 1.5
                    ) +
                    Math.cos(
                        ny * 2.2 +
                        animationTime * 1.5
                    ) +
                    2
                ) *
                0.25;

            var deltaX =
                finalX -
                holeX;

            var deltaY =
                finalY -
                holeY;

            var distanceSquared =
                deltaX *
                deltaX +
                deltaY *
                deltaY;

            var alpha;

            if (
                distanceSquared <
                holeRadiusSquared
            ) {
                alpha = 0;
            } else {
                var distance =
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

            var borderNoise =
                Math.sin(
                    nx * 15 +
                    animationTime * 5
                ) *
                0.15;

            alpha = clamp(
                alpha +
                borderNoise,
                0,
                1
            );

            var finalAlpha =
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

            var color =
                getGradientColor(
                    waveValue
                );

            var roundedAlpha =
                Math.round(
                    finalAlpha *
                    100
                ) /
                100;

            context.fillStyle =
                'rgba(' +
                color +
                ',' +
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
        'appviewportchange',
        scheduleResize
    );

    window.addEventListener(
        'resize',
        scheduleResize,
        { passive: true }
    );

    window.addEventListener(
        'orientationchange',
        function () {
            window.setTimeout(
                scheduleResize,
                150
            );
        },
        { passive: true }
    );

    window.addEventListener(
        'pageshow',
        scheduleResize,
        { passive: true }
    );

    resizeCanvas();

    window.requestAnimationFrame(
        drawFrame
    );
})(
    window,
    document
);