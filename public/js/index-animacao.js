(() => {
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points = [];

    let time = 0;
    let lastNow = performance.now();

    // 1. OTIMIZAÇÃO: Espaçamento maior significa menos pontos para processar.
    const spacing = 26; 

    const flow = {
        offsetX: 0, offsetY: 0,
        vx: 0.28, vy: 0.12,
        targetVx: 0.28, targetVy: 0.12,
        nextTurn: 0
    };

    const pattern = {
        a: 2.2, b: 1.9, c: 1.6,
        targetA: 2.2, targetB: 1.9, targetC: 1.6,
        phase1: 0.0, phase2: 1.5,
        targetPhase1: 0.0, targetPhase2: 1.5,
        nextChange: 0
    };

    const PI2 = Math.PI * 2; // Cache do valor para evitar calcular repetidamente

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        height += 140;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
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
                    seed: Math.random() * PI2,
                    sizeSeed: 0.85 + Math.random() * 0.3
                });
            }
        }
    }

    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    resize();

    // Funções matemáticas simplificadas
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

    // 2. CORES: Amarelo, Azul e Roxo vibrantes e definidos
    const colorYellow = [255, 215, 0];
    const colorBlue = [0, 100, 255];
    const colorPurple = [138, 43, 226];

    function getGradientColor(t) {
        t = clamp(t, 0, 1);
        let c1, c2, factor;

        if (t < 0.5) {
            c1 = colorYellow;
            c2 = colorBlue;
            factor = t * 2.0; // t / 0.5
        } else {
            c1 = colorBlue;
            c2 = colorPurple;
            factor = (t - 0.5) * 2.0;
        }

        // Arredondar logo aqui melhora a performance ao criar a string do fillStyle
        return [
            Math.floor(lerp(c1[0], c2[0], factor)),
            Math.floor(lerp(c1[1], c2[1], factor)),
            Math.floor(lerp(c1[2], c2[2], factor))
        ];
    }

    function chooseDirection(now) {
        const speed = 0.34;
        const dirX = (Math.random() > 0.5 ? 1 : -1) * speed * Math.random();
        const dirY = (Math.random() > 0.5 ? 1 : -1) * speed * Math.random();
        
        flow.targetVx = dirX;
        flow.targetVy = dirY;
        flow.nextTurn = now + 3000 + Math.random() * 3000;
    }

    function choosePattern(now) {
        pattern.targetA = 1.7 + Math.random() * 1.7;
        pattern.targetB = 1.6 + Math.random() * 1.8;
        pattern.targetC = 1.4 + Math.random() * 1.9;
        pattern.targetPhase1 += -0.8 + Math.random() * 1.6;
        pattern.targetPhase2 += -0.8 + Math.random() * 1.6;
        pattern.nextChange = now + 3600 + Math.random() * 3600;
    }

    chooseDirection(performance.now());
    choosePattern(performance.now());

    function updateFlow(now, delta) {
        if (now >= flow.nextTurn) chooseDirection(now);
        if (now >= pattern.nextChange) choosePattern(now);

        flow.vx = lerp(flow.vx, flow.targetVx, 0.016);
        flow.vy = lerp(flow.vy, flow.targetVy, 0.016);
        flow.offsetX += flow.vx * delta * 60;
        flow.offsetY += flow.vy * delta * 60;

        pattern.a = lerp(pattern.a, pattern.targetA, 0.005);
        pattern.b = lerp(pattern.b, pattern.targetB, 0.005);
        pattern.c = lerp(pattern.c, pattern.targetC, 0.005);
        pattern.phase1 = lerp(pattern.phase1, pattern.targetPhase1, 0.005);
        pattern.phase2 = lerp(pattern.phase2, pattern.targetPhase2, 0.005);
    }

    // 3. MATEMÁTICA: Menos camadas de ondas para poupar o processador
    function field(nx, ny, t) {
        const layer1 = Math.sin(nx * pattern.a + t * 0.5 + pattern.phase1) +
                       Math.cos(ny * pattern.b - t * 0.4 + pattern.phase2);
        const layer2 = Math.sin((nx + ny) * pattern.c - t * 0.3 + pattern.phase2);
        return (layer1 * 0.5) + (layer2 * 0.4); 
    }

    function draw(now) {
        const rawDelta = (now - lastNow) / 1000;
        const delta = rawDelta > 0.033 ? 0.033 : rawDelta; // Cap a ~30/60fps lógicos
        lastNow = now;

        ctx.clearRect(0, 0, width, height);
        updateFlow(now, delta);
        time += delta * 0.62;

        const zoom = 0.95;
        const driftX = flow.offsetX * 0.0022;
        const driftY = flow.offsetY * 0.0022;
        const cx = width / 2;
        const cy = height / 2;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            let nx = ((p.x - cx) / cx) / zoom + driftX;
            let ny = ((p.y - cy) / cy) / zoom + driftY;

            // Ondulação leve
            const sx = nx + Math.sin(ny * 1.5 + time * 0.3) * 0.05;
            const sy = ny + Math.cos(nx * 1.5 - time * 0.3) * 0.05;

            const v = field(sx, sy, time);
            
            // Mapear o valor da onda (v) de forma segura para o intervalo [0, 1]
            const n = clamp((v + 1.5) / 3.0, 0, 1);
            
            const [r, g, b] = getGradientColor(n);

            // Reduzida a complexidade do tamanho da bolinha
            const localPulse = Math.sin(time * 1.5 + p.seed);
            const radius = 1.0 + (n * 2.5 * p.sizeSeed) + (localPulse * 0.5);
            
            // Arredondar alpha a 2 casas decimais ajuda muito o rendering do Canvas
            const alpha = Math.floor((0.3 + n * 0.6) * 100) / 100;

            const pushAmount = (n - 0.5) * 4.0;
            const px = p.x + Math.cos(p.seed) * pushAmount;
            const py = p.y + Math.sin(p.seed) * pushAmount;

            ctx.beginPath();
            ctx.arc(px, py, radius, 0, PI2);
            // Usar concatenação em vez de crases (template literals) é marginalmente mais rápido em ciclos pesados
            ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();