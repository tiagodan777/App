(() => {
    const canvas =
        document.getElementById(
            'gridCanvas'
        );

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    let time = 0;
    let lastFrame = 0;

    const FPS = 45;
    const FRAME_TIME = 1000 / FPS;
    const spacing = 19.5;

    const colorYellow = [255, 215, 0];
    const colorBlue = [0, 100, 255];
    const colorPurple = [138, 43, 226];

    function resize() {
        dpr = Math.min(
            window.devicePixelRatio || 1,
            1.5
        );

        width = window.innerWidth;

        height = window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        canvas.width = Math.floor(
            width * dpr
        );

        canvas.height = Math.floor(
            height * dpr
        );

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        createGrid();
    }

    function createGrid() {
        points = [];

        const cols =
            Math.ceil(width / spacing) + 6;

        const rows =
            Math.ceil(height / spacing) + 6;

        const startX = -spacing * 3;
        const startY = -spacing * 3;

        for (let row = 0; row < rows; row++) {
            for (
                let col = 0;
                col < cols;
                col++
            ) {
                points.push({
                    baseX:
                        startX +
                        col * spacing,
                    baseY:
                        startY +
                        row * spacing
                });
            }
        }
    }

    function lerp(a, b, factor) {
        return a + (b - a) * factor;
    }

    function clamp(value, min, max) {
        return value < min
            ? min
            : value > max
                ? max
                : value;
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
            factor =
                (value - 0.5) * 2;
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
        if (now - lastFrame < FRAME_TIME) {
            requestAnimationFrame(draw);
            return;
        }

        lastFrame = now;

        ctx.clearRect(
            0,
            0,
            width,
            height
        );

        time += 0.0015;

        const centerX = width / 2;
        const centerY = height / 2;
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
        const holeRadiusSq =
            holeRadius * holeRadius;

        const edgeSoftness = 60;
        const edgeSoftnessInv =
            1 / edgeSoftness;

        for (
            let index = 0;
            index < points.length;
            index++
        ) {
            const point = points[index];

            const normalizedX =
                point.baseX * 0.003;

            const normalizedY =
                point.baseY * 0.003;

            const waveX =
                Math.sin(
                    normalizedY * 2.5 +
                    time * 2.5
                ) * 18 +
                Math.cos(
                    normalizedX * 1.8 -
                    time
                ) * 12;

            const waveY =
                Math.cos(
                    normalizedX * 2.5 -
                    time * 2.5
                ) * 18 +
                Math.sin(
                    normalizedY * 1.8 +
                    time
                ) * 12;

            const finalX =
                point.baseX + waveX;

            const finalY =
                point.baseY + waveY;

            const waveValue =
                (
                    Math.sin(
                        normalizedX * 2.2 +
                        time * 1.5
                    ) +
                    Math.cos(
                        normalizedY * 2.2 +
                        time * 1.5
                    ) +
                    2
                ) * 0.25;

            const deltaX =
                finalX - holeX;

            const deltaY =
                finalY - holeY;

            const distanceSq =
                deltaX * deltaX +
                deltaY * deltaY;

            let alpha;

            if (distanceSq < holeRadiusSq) {
                alpha = 0;
            } else {
                const distance =
                    Math.sqrt(distanceSq);

                alpha = clamp(
                    (
                        distance -
                        holeRadius
                    ) * edgeSoftnessInv,
                    0,
                    1
                );
            }

            const borderNoise =
                Math.sin(
                    normalizedX * 15 +
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

        requestAnimationFrame(draw);
    }

    window.addEventListener(
        'resize',
        resize
    );

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            resize
        );
    }

    resize();
    requestAnimationFrame(draw);
})();