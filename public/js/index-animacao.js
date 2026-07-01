(() => {
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];

    let time = 0;
    let lastNow = performance.now();

    const spacing = 18;

    const flow = {
        offsetX: 0,
        offsetY: 0,
        vx: 0.28,
        vy: 0.12,
        targetVx: 0.28,
        targetVy: 0.12,
        nextTurn: 0
    };

    const pattern = {
        a: 2.2,
        b: 1.9,
        c: 1.6,
        d: 2.4,

        targetA: 2.2,
        targetB: 1.9,
        targetC: 1.6,
        targetD: 2.4,

        phase1: 0.0,
        phase2: 1.5,
        phase3: 3.0,

        targetPhase1: 0.0,
        targetPhase2: 1.5,
        targetPhase3: 3.0,

        nextChange: 0
    };

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.style.width = '100vw';
        canvas.style.height = '100lvh';

        const rect = canvas.getBoundingClientRect();

        width = rect.width;
        height = rect.height;

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createPoints();
    }

    function createPoints() {
        points = [];

        const cols = Math.ceil(width / spacing) + 8;
        const rows = Math.ceil(height / spacing) + 8;

        const startX = -spacing * 4;
        const startY = -spacing * 4;

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

    window.addEventListener('resize', resize);

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
    }

    resize();

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
        const speed = 0.34;

        const directions = [
            [speed, 0],
            [-speed, 0],
            [0, speed],
            [0, -speed],

            [speed * 0.75, speed * 0.45],
            [speed * 0.75, -speed * 0.45],
            [-speed * 0.75, speed * 0.45],
            [-speed * 0.75, -speed * 0.45],

            [speed * 0.35, speed * 0.9],
            [-speed * 0.35, speed * 0.9],
            [speed * 0.35, -speed * 0.9],
            [-speed * 0.35, -speed * 0.9]
        ];

        const dir = directions[Math.floor(Math.random() * directions.length)];

        flow.targetVx = dir[0];
        flow.targetVy = dir[1];

        flow.nextTurn = now + 3000 + Math.random() * 3000;
    }

    function choosePattern(now) {
        pattern.targetA = 1.7 + Math.random() * 1.7;
        pattern.targetB = 1.6 + Math.random() * 1.8;
        pattern.targetC = 1.4 + Math.random() * 1.9;
        pattern.targetD = 1.5 + Math.random() * 1.8;

        pattern.targetPhase1 += -0.8 + Math.random() * 1.6;
        pattern.targetPhase2 += -0.8 + Math.random() * 1.6;
        pattern.targetPhase3 += -0.8 + Math.random() * 1.6;

        pattern.nextChange = now + 3600 + Math.random() * 3600;
    }

    chooseDirection(performance.now());
    choosePattern(performance.now());

    function updateFlow(now, delta) {
        if (now >= flow.nextTurn) {
            chooseDirection(now);
        }

        if (now >= pattern.nextChange) {
            choosePattern(now);
        }

        flow.vx = lerp(flow.vx, flow.targetVx, 0.016);
        flow.vy = lerp(flow.vy, flow.targetVy, 0.016);

        flow.offsetX += flow.vx * delta * 60;
        flow.offsetY += flow.vy * delta * 60;

        pattern.a = lerp(pattern.a, pattern.targetA, 0.005);
        pattern.b = lerp(pattern.b, pattern.targetB, 0.005);
        pattern.c = lerp(pattern.c, pattern.targetC, 0.005);
        pattern.d = lerp(pattern.d, pattern.targetD, 0.005);

        pattern.phase1 = lerp(pattern.phase1, pattern.targetPhase1, 0.005);
        pattern.phase2 = lerp(pattern.phase2, pattern.targetPhase2, 0.005);
        pattern.phase3 = lerp(pattern.phase3, pattern.targetPhase3, 0.005);
    }

    function field(nx, ny, t) {
        const layer1 =
            Math.sin(nx * pattern.a + t * 0.58 + pattern.phase1) +
            Math.cos(ny * pattern.b - t * 0.44 + pattern.phase2);

        const layer2 =
            Math.sin((nx + ny) * pattern.c - t * 0.38 + pattern.phase2) +
            Math.cos((nx - ny) * pattern.d + t * 0.46 + pattern.phase3);

        const layer3 =
            Math.sin(nx * 3.2 - ny * 1.1 + t * 0.31 + pattern.phase3) +
            Math.cos(ny * 2.7 + nx * 1.0 - t * 0.29 + pattern.phase1);

        const organic =
            Math.sin(nx * 5.0 + ny * 2.6 + t * 0.25 + pattern.phase2) * 0.22;

        return layer1 * 0.34 + layer2 * 0.38 + layer3 * 0.24 + organic;
    }

    function draw(now) {
        const rawDelta = (now - lastNow) / 1000;
        const delta = Math.min(rawDelta, 0.033);
        lastNow = now;

        ctx.clearRect(0, 0, width, height);

        updateFlow(now, delta);

        time += delta * 0.62;

        const breath = 0.5 + 0.5 * Math.sin(time * 0.9);
        const zoom = 0.93 + breath * 0.19;

        const driftX = flow.offsetX * 0.0022;
        const driftY = flow.offsetY * 0.0022;

        const cx = width / 2;
        const cy = height / 2;

        for (const p of points) {
            let nx = (p.x - cx) / cx;
            let ny = (p.y - cy) / cy;

            nx /= zoom;
            ny /= zoom;

            nx += driftX;
            ny += driftY;

            const warpX =
                Math.sin(ny * 1.7 + time * 0.38 + pattern.phase1) * 0.065 +
                Math.sin((nx + ny) * 2.2 + time * 0.22 + p.seed) * 0.025;

            const warpY =
                Math.cos(nx * 1.6 - time * 0.42 + pattern.phase2) * 0.065 +
                Math.cos((nx - ny) * 2.0 - time * 0.24 + p.seed) * 0.025;

            const sx = nx + warpX;
            const sy = ny + warpY;

            const v = field(sx, sy, time);

            const n = clamp((v + 2.1) / 4.2, 0, 1);
            const density = smoothstep(0.12, 0.92, n);

            const [r, g, b] = getGradientColor(n);

            const localPulse =
                0.5 + 0.5 * Math.sin(time * 1.55 + p.seed + n * 2.8);

            const radius =
                0.55 +
                density * 2.85 * p.sizeSeed +
                localPulse * density * 0.55;

            const alpha = 0.20 + density * 0.70;

            const pushAmount = (density - 0.5) * 5.8 + (breath - 0.5) * 5.0;
            const angle = n * Math.PI * 2 + p.seed * 0.2;

            const px = p.x + Math.cos(angle) * pushAmount * 0.38;
            const py = p.y + Math.sin(angle) * pushAmount * 0.38;

            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();