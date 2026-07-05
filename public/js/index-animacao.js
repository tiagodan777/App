(() => {
    const canvas = document.getElementById('gridCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    const spacing = isTouch ? 34 : 18;
    const maxDpr = isTouch ? 1 : 2;
    const fps = isTouch ? 30 : 60;
    const frameInterval = 1000 / fps;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];

    let time = 0;
    let lastNow = performance.now();
    let lastFrame = 0;

    if (!window.radarView) {
        window.radarView = {
            scale: 1,
            panX: 0,
            panY: 0
        };
    }

    const flow = {
        offsetX: 0,
        offsetY: 0,
        vx: 0.22,
        vy: 0.10,
        targetVx: 0.22,
        targetVy: 0.10,
        nextTurn: 0
    };

    const pattern = {
        a: 2.2,
        b: 1.9,
        c: 1.6,

        targetA: 2.2,
        targetB: 1.9,
        targetC: 1.6,

        phase1: 0,
        phase2: 1.5,

        targetPhase1: 0,
        targetPhase2: 1.5,

        nextChange: 0
    };

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

        width = window.innerWidth;
        height = window.innerHeight + 50;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createPoints();
    }

    function createPoints() {
        points = [];

        const extra = isTouch ? 4 : 6;

        const cols = Math.ceil(width / spacing) + extra;
        const rows = Math.ceil(height / spacing) + extra;

        const startX = -spacing * (extra / 2);
        const startY = -spacing * (extra / 2);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push({
                    x: startX + col * spacing,
                    y: startY + row * spacing,
                    seed: Math.random() * Math.PI * 2,
                    sizeSeed: 0.85 + Math.random() * 0.3
                });
            }
        }
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function mixColor(c1, c2, t) {
        return [
            Math.round(lerp(c1[0], c2[0], t)),
            Math.round(lerp(c1[1], c2[1], t)),
            Math.round(lerp(c1[2], c2[2], t))
        ];
    }

    function getGradientColor(t) {
        const yellow = [255, 205, 70];
        const blue = [65, 135, 255];
        const purple = [175, 85, 255];

        t = clamp(t, 0, 1);

        if (t < 0.5) {
            return mixColor(yellow, blue, t / 0.5);
        }

        return mixColor(blue, purple, (t - 0.5) / 0.5);
    }

    function chooseDirection(now) {
        const speed = isTouch ? 0.22 : 0.34;

        const directions = [
            [speed, 0],
            [-speed, 0],
            [0, speed],
            [0, -speed],
            [speed * 0.65, speed * 0.45],
            [speed * 0.65, -speed * 0.45],
            [-speed * 0.65, speed * 0.45],
            [-speed * 0.65, -speed * 0.45]
        ];

        const dir = directions[Math.floor(Math.random() * directions.length)];

        flow.targetVx = dir[0];
        flow.targetVy = dir[1];

        flow.nextTurn = now + 3500 + Math.random() * 3500;
    }

    function choosePattern(now) {
        pattern.targetA = 1.7 + Math.random() * 1.5;
        pattern.targetB = 1.6 + Math.random() * 1.5;
        pattern.targetC = 1.4 + Math.random() * 1.5;

        pattern.targetPhase1 += -0.7 + Math.random() * 1.4;
        pattern.targetPhase2 += -0.7 + Math.random() * 1.4;

        pattern.nextChange = now + 4200 + Math.random() * 4200;
    }

    function updateFlow(now, delta) {
        if (now >= flow.nextTurn) chooseDirection(now);
        if (now >= pattern.nextChange) choosePattern(now);

        flow.vx = lerp(flow.vx, flow.targetVx, 0.014);
        flow.vy = lerp(flow.vy, flow.targetVy, 0.014);

        flow.offsetX += flow.vx * delta * 60;
        flow.offsetY += flow.vy * delta * 60;

        pattern.a = lerp(pattern.a, pattern.targetA, 0.004);
        pattern.b = lerp(pattern.b, pattern.targetB, 0.004);
        pattern.c = lerp(pattern.c, pattern.targetC, 0.004);

        pattern.phase1 = lerp(pattern.phase1, pattern.targetPhase1, 0.004);
        pattern.phase2 = lerp(pattern.phase2, pattern.targetPhase2, 0.004);
    }

    function field(nx, ny, t) {
        const layer1 =
            Math.sin(nx * pattern.a + t * 0.55 + pattern.phase1) +
            Math.cos(ny * pattern.b - t * 0.42 + pattern.phase2);

        const layer2 =
            Math.sin((nx + ny) * pattern.c - t * 0.34 + pattern.phase2) +
            Math.cos((nx - ny) * 2.0 + t * 0.40 + pattern.phase1);

        return layer1 * 0.55 + layer2 * 0.45;
    }

    function draw(now) {
        requestAnimationFrame(draw);

        if (now - lastFrame < frameInterval) return;
        lastFrame = now;

        const rawDelta = (now - lastNow) / 1000;
        const delta = Math.min(rawDelta, 0.05);
        lastNow = now;

        ctx.clearRect(0, 0, width, height);

        updateFlow(now, delta);

        time += delta * 0.55;

        const appScale = window.radarView.scale || 1;
        const appPanX = window.radarView.panX || 0;
        const appPanY = window.radarView.panY || 0;

        const breath = 0.5 + 0.5 * Math.sin(time * 0.85);

        const baseZoom = 0.95 + breath * 0.14;
        const zoom = baseZoom * (0.9 + appScale * 0.10);

        const driftX = flow.offsetX * 0.002;
        const driftY = flow.offsetY * 0.002;

        const cx = width / 2 - appPanX * 0.22;
        const cy = height / 2 - appPanY * 0.22;

        const invCx = 1 / cx;
        const invCy = 1 / cy;

        for (const p of points) {
            let nx = (p.x - cx) * invCx;
            let ny = (p.y - cy) * invCy;

            nx /= zoom;
            ny /= zoom;

            nx += driftX;
            ny += driftY;

            const warpX =
                Math.sin(ny * 1.4 + time * 0.32 + pattern.phase1) * 0.045;

            const warpY =
                Math.cos(nx * 1.4 - time * 0.34 + pattern.phase2) * 0.045;

            const sx = nx + warpX;
            const sy = ny + warpY;

            const v = field(sx, sy, time);
            const n = clamp((v + 2.0) / 4.0, 0, 1);
            const density = smoothstep(0.14, 0.92, n);

            const color = getGradientColor(n);

            const localPulse =
                0.5 + 0.5 * Math.sin(time * 1.3 + p.seed + n * 2.4);

            const radius =
                0.55 +
                density * (isTouch ? 2.2 : 2.85) * p.sizeSeed +
                localPulse * density * 0.42;

            const alpha = 0.18 + density * 0.65;

            const pushAmount = (density - 0.5) * 4.2 + (breath - 0.5) * 3.8;
            const angle = n * Math.PI * 2 + p.seed * 0.2;

            const px = p.x + Math.cos(angle) * pushAmount * 0.35;
            const py = p.y + Math.sin(angle) * pushAmount * 0.35;

            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
            ctx.fill();
        }
    }

    let resizeTimeout = null;

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resize, 150);
    });

    chooseDirection(performance.now());
    choosePattern(performance.now());
    resize();

    requestAnimationFrame(draw);
})();