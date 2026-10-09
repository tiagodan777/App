(() => {
    'use strict';

    const canvas = document.getElementById('gridCanvas');
    if (!canvas) return;
    canvas.stopMargotAnimation?.();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];
    let time = 0;
    let lastFrame = 0;
    let resizeFrame = null;
    let animationFrame = null;
    let resizeObserver = null;
    let ativo = true;

    const FPS = 30;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FRAME_TIME = 1000 / FPS;
    const spacing = 19.5;

    /*
     * Pontos fortes/saturados.
     *
     * O fundo é que fica quase branco.
     * Assim a animação volta a ter contraste.
     */
    const theme = matchMedia('(prefers-color-scheme: dark)');
    let darkMix = theme.matches ? 1 : 0;
    let paused = false;
    let overlayObserver = null;

    const colorYellow = [255, 215, 0];
    const colorBlue = [0, 100, 255];
    const colorPurple = [138, 43, 226];

    /*
     * Vermelho Margot:
     * #e12346
     */
    const colorRed = [225, 35, 70];

    function resize() {
        if (!ativo) return;
        resizeFrame = null;

        const rect = canvas.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.ceil(rect.width));
        const nextHeight = Math.max(1, Math.ceil(rect.height));
        const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);

        if (nextWidth === width && nextHeight === height && nextDpr === dpr) {
            return;
        }

        width = nextWidth;
        height = nextHeight;
        dpr = nextDpr;

        canvas.width = Math.ceil(width * dpr);
        canvas.height = Math.ceil(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        createGrid();

        // Alterar width/height apaga o bitmap, mesmo com a animação em pausa.
        // Pintar no mesmo frame evita mostrar um fundo vazio entre os dois tamanhos.
        paint();
    }

    function scheduleResize() {
        if (!ativo) return;

        if (resizeFrame !== null) {
            cancelAnimationFrame(resizeFrame);
        }

        resizeFrame = requestAnimationFrame(resize);
    }

    function createGrid() {
        points = [];
        const cols = Math.ceil(width / spacing) + 6;
        const rows = Math.ceil(height / spacing) + 6;
        const startX = -spacing * 3;
        const startY = -spacing * 3;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const baseX = startX + col * spacing,
                    baseY = startY + row * spacing;

                points.push({
                    baseX,
                    baseY,
                    nx: baseX * 0.003,
                    ny: baseY * 0.003
                });
            }
        }
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function clamp(v, min, max) {
        return v < min ? min : v > max ? max : v;
    }

    /*
     * Gradiente:
     *
     * amarelo
     *   ↓
     * azul
     *   ↓
     * roxo
     *   ↓
     * vermelho Margot
     */
    function getGradientColorRGB(t, dark = false) {
        t = clamp(t, 0, 1);

        let c1;
        let c2;
        let factor;

        if (t < 1 / 3) {
            c1 = colorYellow;
            c2 = colorBlue;
            factor = t * 3;
        } else if (t < 2 / 3) {
            c1 = colorBlue;
            c2 = colorPurple;
            factor = (t - 1 / 3) * 3;
        } else {
            c1 = colorPurple;
            c2 = colorRed;
            factor = (t - 2 / 3) * 3;
        }

        if (dark) {
            const brighter = new Map([
                [colorYellow, [255, 225, 70]],
                [colorBlue, [60, 160, 255]],
                [colorPurple, [185, 90, 255]],
                [colorRed, [255, 65, 110]]
            ]);
            c1 = brighter.get(c1);
            c2 = brighter.get(c2);
        }

        const r = Math.floor(lerp(c1[0], c2[0], factor));
        const g = Math.floor(lerp(c1[1], c2[1], factor));
        const b = Math.floor(lerp(c1[2], c2[2], factor));

        return `${r}, ${g}, ${b}`;
    }

    const palette = Array.from(
        { length: 256 },
        (_, index) => getGradientColorRGB(index / 255)
    );

    const darkPalette = Array.from(
        { length: 256 },
        (_, index) => getGradientColorRGB(index / 255, true)
    );

    function draw(now) {
        if (!ativo || document.hidden || paused) return;

        if (!reduced && lastFrame && now - lastFrame < FRAME_TIME - 0.5) {
            animationFrame = requestAnimationFrame(draw);
            return;
        }

        const elapsed = lastFrame ? Math.min(now - lastFrame, 50) : FRAME_TIME;
        lastFrame = now;

        time += reduced ? 0 : elapsed * 0.000045;
        paint();
        if (!reduced) animationFrame = requestAnimationFrame(draw);
    }

    function paint() {
        if (!ativo || !width || !height) return;
        darkMix = theme.matches ? 1 : 0;
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const holeTime = time * 1.25;

        const holeX =
            cx +
            Math.sin(holeTime * 0.7) * (cx * 0.40) +
            Math.cos(holeTime * 0.3) * (cx * 0.10);

        const holeY =
            cy +
            Math.cos(holeTime * 0.8) * (cy * 0.40) +
            Math.sin(holeTime * 0.4) * (cy * 0.10);

        const holeRadius = Math.min(100, Math.min(width, height) * 0.18);
        const holeRadiusSq = holeRadius * holeRadius;
        const edgeSoftnessInv = 1 / 60;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const nx = p.nx;
            const ny = p.ny;

            const waveX =
                Math.sin(ny * 2.5 + time * 2.5) * 18 +
                Math.cos(nx * 1.8 - time) * 12;

            const waveY =
                Math.cos(nx * 2.5 - time * 2.5) * 18 +
                Math.sin(ny * 1.8 + time) * 12;

            const finalX = p.baseX + waveX;
            const finalY = p.baseY + waveY;

            const waveValue =
                (Math.sin(nx * 2.2 + time * 1.5) +
                    Math.cos(ny * 2.2 + time * 1.5) +
                    2) * 0.25;

            const dx = finalX - holeX;
            const dy = finalY - holeY;
            const distSq = dx * dx + dy * dy;

            let alpha;

            if (distSq < holeRadiusSq) {
                alpha = 0;
            } else {
                const distance = Math.sqrt(distSq);
                alpha = clamp((distance - holeRadius) * edgeSoftnessInv, 0, 1);
            }

            // A zona sem pontos mantém a mesma forma e movimento nos dois temas.

            const finalAlpha = alpha * (0.8 + waveValue * 0.2);
            if (finalAlpha < 0.05) {
                continue;
            }

            const rgb = (darkMix ? darkPalette : palette)[Math.min(255, Math.round(waveValue * 255))];
            const roundedAlpha = Math.round(finalAlpha * 100) / 100;
            const size = 2.4 + darkMix * 0.4;

            ctx.fillStyle = `rgba(${rgb}, ${roundedAlpha})`;
            ctx.fillRect(finalX - size / 2, finalY - size / 2, size, size);

        }

    }

    function visibility() {
        cancelAnimationFrame(animationFrame);
        lastFrame = 0;
        if (ativo && !document.hidden && !paused) animationFrame = requestAnimationFrame(draw);
    }

    // Freeze the decorative canvas while a panel/input needs the main thread.
    function overlayChanged() {
        const next = document.body.classList.contains('margot-mini-menu-aberto')
            || document.body.classList.contains('hoje-editor-aberto');
        if (next !== paused) {
            paused = next;
            visibility();
        }
    }
    overlayObserver = new MutationObserver(overlayChanged);
    overlayObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    overlayChanged();
    function themeChanged() {
        paint();
        visibility();
    }
    theme.addEventListener('change', themeChanged);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', scheduleResize, { passive: true });
    window.addEventListener('orientationchange', scheduleResize, { passive: true });

    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(canvas);
    }

    resize();
    visibility();

    function desativarPagina() {
        ativo = false;
        overlayObserver?.disconnect();
        theme.removeEventListener('change', themeChanged);
        document.removeEventListener('visibilitychange', visibility);

        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
        }

        if (resizeFrame !== null) {
            cancelAnimationFrame(resizeFrame);
        }

        if (resizeObserver) {
            resizeObserver.disconnect();
        }

        window.removeEventListener('resize', scheduleResize);
        window.removeEventListener('orientationchange', scheduleResize);
        document.removeEventListener('margot:page-leave', desativarPagina);
        delete canvas.stopMargotAnimation;
    }

    canvas.stopMargotAnimation = desativarPagina;
    document.addEventListener('margot:page-leave', desativarPagina);
})();