(() => {
    const canvas = document.getElementById('gridCanvas');

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d', {
        alpha: false
    });

    if (!ctx) {
        return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    let time = 0;
    let lastFrame = 0;
    let resizeTimeout = null;

    const FPS = 45;
    const FRAME_TIME = 1000 / FPS;

    const SPACING = 19.5;

    /*
     * Área adicional desenhada por baixo do ecrã.
     */
    const BOTTOM_OVERSCAN = 120;

    const colorYellow = [255, 215, 0];
    const colorBlue = [0, 100, 255];
    const colorPurple = [138, 43, 226];

    function getViewportWidth() {
        return Math.max(
            window.innerWidth || 0,
            document.documentElement.clientWidth || 0,
            document.body ? document.body.clientWidth : 0
        );
    }

    function getViewportHeight() {
        /*
         * Não utilizar visualViewport.height aqui.
         *
         * No iOS, visualViewport pode excluir a zona inferior
         * ou diminuir quando aparece o teclado.
         */
        return Math.max(
            window.innerHeight || 0,
            document.documentElement.clientHeight || 0,
            document.body ? document.body.clientHeight : 0
        );
    }

    function resize() {
        dpr = Math.min(
            window.devicePixelRatio || 1,
            1.5
        );

        width = Math.ceil(getViewportWidth());

        height =
            Math.ceil(getViewportHeight()) +
            BOTTOM_OVERSCAN;

        /*
         * O tamanho visual do canvas.
         */
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        /*
         * O tamanho real interno do desenho.
         */
        canvas.width = Math.ceil(width * dpr);
        canvas.height = Math.ceil(height * dpr);

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        ctx.imageSmoothingEnabled = false;

        createGrid();
    }

    function requestResize() {
        clearTimeout(resizeTimeout);

        resizeTimeout = setTimeout(() => {
            resize();
        }, 60);
    }

    function createGrid() {
        points = [];

        const cols =
            Math.ceil(width / SPACING) +
            6;

        const rows =
            Math.ceil(height / SPACING) +
            6;

        const startX = -SPACING * 3;
        const startY = -SPACING * 3;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push({
                    baseX:
                        startX +
                        col * SPACING,

                    baseY:
                        startY +
                        row * SPACING
                });
            }
        }
    }

    function lerp(a, b, amount) {
        return a + (b - a) * amount;
    }

    function clamp(value, min, max) {
        if (value < min) {
            return min;
        }

        if (value > max) {
            return max;
        }

        return value;
    }

    function getGradientColorRGB(value) {
        value = clamp(value, 0, 1);

        let color1;
        let color2;
        let factor;

        if (value < 0.5) {
            color1 = colorYellow;
            color2 = colorBlue;
            factor = value * 2;
        } else {
            color1 = colorBlue;
            color2 = colorPurple;
            factor = (value - 0.5) * 2;
        }

        const red = Math.floor(
            lerp(
                color1[0],
                color2[0],
                factor
            )
        );

        const green = Math.floor(
            lerp(
                color1[1],
                color2[1],
                factor
            )
        );

        const blue = Math.floor(
            lerp(
                color1[2],
                color2[2],
                factor
            )
        );

        return `${red}, ${green}, ${blue}`;
    }

    function draw(now) {
        requestAnimationFrame(draw);

        if (now - lastFrame < FRAME_TIME) {
            return;
        }

        lastFrame = now;

        /*
         * Como o contexto foi criado com alpha: false,
         * pintamos sempre o fundo completamente.
         */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
            0,
            0,
            width,
            height
        );

        time += 0.0015;

        const centerX = width / 2;
        const centerY =
            (height - BOTTOM_OVERSCAN) / 2;

        const holeTime = time * 3.5;

        const holeX =
            centerX +
            Math.sin(holeTime * 0.7) *
                (centerX * 0.9) +
            Math.cos(holeTime * 0.3) *
                (centerX * 0.3);

        const holeY =
            centerY +
            Math.cos(holeTime * 0.8) *
                (centerY * 0.9) +
            Math.sin(holeTime * 0.4) *
                (centerY * 0.3);

        const holeRadius = 160;
        const holeRadiusSquared =
            holeRadius * holeRadius;

        const edgeSoftness = 60;
        const edgeSoftnessInverse =
            1 / edgeSoftness;

        for (
            let index = 0;
            index < points.length;
            index++
        ) {
            const point = points[index];

            const normalX =
                point.baseX * 0.003;

            const normalY =
                point.baseY * 0.003;

            const waveX =
                Math.sin(
                    normalY * 2.5 +
                    time * 2.5
                ) * 18 +
                Math.cos(
                    normalX * 1.8 -
                    time
                ) * 12;

            const waveY =
                Math.cos(
                    normalX * 2.5 -
                    time * 2.5
                ) * 18 +
                Math.sin(
                    normalY * 1.8 +
                    time
                ) * 12;

            const finalX =
                point.baseX +
                waveX;

            const finalY =
                point.baseY +
                waveY;

            const waveValue =
                (
                    Math.sin(
                        normalX * 2.2 +
                        time * 1.5
                    ) +
                    Math.cos(
                        normalY * 2.2 +
                        time * 1.5
                    ) +
                    2
                ) * 0.25;

            const differenceX =
                finalX -
                holeX;

            const differenceY =
                finalY -
                holeY;

            const distanceSquared =
                differenceX * differenceX +
                differenceY * differenceY;

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
                    edgeSoftnessInverse,
                    0,
                    1
                );
            }

            const borderNoise =
                Math.sin(
                    normalX * 15 +
                    time * 5
                ) * 0.15;

            alpha = clamp(
                alpha + borderNoise,
                0,
                1
            );

            const finalAlpha =
                alpha *
                (
                    0.8 +
                    waveValue * 0.2
                );

            if (finalAlpha < 0.05) {
                continue;
            }

            const rgb =
                getGradientColorRGB(
                    waveValue
                );

            const roundedAlpha =
                Math.round(
                    finalAlpha * 100
                ) / 100;

            ctx.fillStyle =
                `rgba(${rgb}, ${roundedAlpha})`;

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
        requestResize
    );

    window.addEventListener(
        'orientationchange',
        () => {
            setTimeout(resize, 100);
            setTimeout(resize, 350);
            setTimeout(resize, 700);
        }
    );

    /*
     * visualViewport pode avisar que algo mudou,
     * mas nunca utilizamos a sua altura para dimensionar
     * o canvas.
     */
    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            requestResize
        );
    }

    document.addEventListener(
        'visibilitychange',
        () => {
            if (!document.hidden) {
                setTimeout(resize, 100);
            }
        }
    );

    resize();
    requestAnimationFrame(draw);
})();