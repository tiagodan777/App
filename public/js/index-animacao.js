(() => {
    'use strict';

    const canvas = document.getElementById('gridCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    let time = 0;
    let lastFrame = 0;
    let resizeFrame = null;

    const FPS = 45;
    const FRAME_TIME = 1000 / FPS;
    const spacing = 19.5;

    const colorYellow = [255, 215, 0];
    const colorBlue = [0, 100, 255];
    const colorPurple = [138, 43, 226];

    function resize() {
        resizeFrame = null;

        /*
         * O CSS define o tamanho visível do canvas.
         * Não usamos visualViewport.height porque, numa PWA
         * instalada no iOS, esse valor pode excluir a safe area.
         */
        const rect = canvas.getBoundingClientRect();

        const nextWidth = Math.max(
            1,
            Math.ceil(rect.width)
        );

        const nextHeight = Math.max(
            1,
            Math.ceil(rect.height)
        );

        const nextDpr = Math.min(
            window.devicePixelRatio || 1,
            1.5
        );

        if (
            nextWidth === width &&
            nextHeight === height &&
            nextDpr === dpr
        ) {
            return;
        }

        width = nextWidth;
        height = nextHeight;
        dpr = nextDpr;

        /*
         * Alteramos apenas a resolução interna.
         * Nunca definimos canvas.style.height em JavaScript.
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

        createGrid();
    }

    function scheduleResize() {
        if (resizeFrame !== null) {
            cancelAnimationFrame(
                resizeFrame
            );
        }

        resizeFrame =
            requestAnimationFrame(
                resize
            );
    }

    function createGrid() {
        points = [];

        const cols =
            Math.ceil(width / spacing) + 6;

        const rows =
            Math.ceil(height / spacing) + 6;

        const startX = -spacing * 3;
        const startY = -spacing * 3;

        for (
            let row = 0;
            row < rows;
            row++
        ) {
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

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function clamp(v, min, max) {
        return v < min
            ? min
            : (
                v > max
                    ? max
                    : v
            );
    }

    function getGradientColorRGB(t) {
        t = clamp(t, 0, 1);

        let c1;
        let c2;
        let factor;

        if (t < 0.5) {
            c1 = colorYellow;
            c2 = colorBlue;
            factor = t * 2;
        } else {
            c1 = colorBlue;
            c2 = colorPurple;
            factor = (t - 0.5) * 2;
        }

        const r = Math.floor(
            lerp(
                c1[0],
                c2[0],
                factor
            )
        );

        const g = Math.floor(
            lerp(
                c1[1],
                c2[1],
                factor
            )
        );

        const b = Math.floor(
            lerp(
                c1[2],
                c2[2],
                factor
            )
        );

        return `${r}, ${g}, ${b}`;
    }

    function draw(now) {
        if (
            now - lastFrame <
            FRAME_TIME
        ) {
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

        const cx = width / 2;
        const cy = height / 2;
        const holeTime = time * 3.5;

        const holeX =
            cx +
            Math.sin(
                holeTime * 0.7
            ) * (cx * 0.9) +
            Math.cos(
                holeTime * 0.3
            ) * (cx * 0.3);

        const holeY =
            cy +
            Math.cos(
                holeTime * 0.8
            ) * (cy * 0.9) +
            Math.sin(
                holeTime * 0.4
            ) * (cy * 0.3);

        const holeRadius = 160;

        const holeRadiusSq =
            holeRadius *
            holeRadius;

        const edgeSoftnessInv =
            1 / 60;

        for (
            let i = 0;
            i < points.length;
            i++
        ) {
            const p = points[i];

            const nx =
                p.baseX * 0.003;

            const ny =
                p.baseY * 0.003;

            const waveX =
                Math.sin(
                    ny * 2.5 +
                    time * 2.5
                ) * 18 +
                Math.cos(
                    nx * 1.8 -
                    time
                ) * 12;

            const waveY =
                Math.cos(
                    nx * 2.5 -
                    time * 2.5
                ) * 18 +
                Math.sin(
                    ny * 1.8 +
                    time
                ) * 12;

            const finalX =
                p.baseX + waveX;

            const finalY =
                p.baseY + waveY;

            const waveValue =
                (
                    Math.sin(
                        nx * 2.2 +
                        time * 1.5
                    ) +
                    Math.cos(
                        ny * 2.2 +
                        time * 1.5
                    ) +
                    2
                ) * 0.25;

            const dx =
                finalX - holeX;

            const dy =
                finalY - holeY;

            const distSq =
                dx * dx +
                dy * dy;

            let alpha;

            if (
                distSq <
                holeRadiusSq
            ) {
                alpha = 0;
            } else {
                const distance =
                    Math.sqrt(
                        distSq
                    );

                alpha = clamp(
                    (
                        distance -
                        holeRadius
                    ) *
                    edgeSoftnessInv,
                    0,
                    1
                );
            }

            const borderNoise =
                Math.sin(
                    nx * 15 +
                    time * 5
                ) * 0.15;

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
                    waveValue * 0.2
                );

            if (
                finalAlpha < 0.05
            ) {
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
        scheduleResize,
        {
            passive: true
        }
    );

    window.addEventListener(
        'orientationchange',
        scheduleResize,
        {
            passive: true
        }
    );

    if (
        'ResizeObserver' in window
    ) {
        const resizeObserver =
            new ResizeObserver(
                scheduleResize
            );

        resizeObserver.observe(
            canvas
        );
    }

    resize();

    requestAnimationFrame(
        draw
    );
})();