(() => {
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');

    let width = 0, height = 0, dpr = 1;
    let points = [];
    let time = 0;

    const spacing = 22; // Equilíbrio ideal entre preenchimento e performance

    // Cores base
    const cY = [255, 215, 0];   // Amarelo
    const cB = [0, 100, 255];   // Azul
    const cP = [138, 43, 226];  // Roxo

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        height += 100; // Margem de segurança

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createPoints();
    }

    function createPoints() {
        points = [];
        const cols = Math.ceil(width / spacing) + 4;
        const rows = Math.ceil(height / spacing) + 4;

        for (let row = -2; row < rows; row++) {
            for (let col = -2; col < cols; col++) {
                points.push({
                    x: col * spacing,
                    y: row * spacing,
                    seed: Math.random() * Math.PI * 2
                });
            }
        }
    }

    window.addEventListener('resize', resize);
    resize();

    // Mistura as três cores de forma ultra rápida
    function getColor(t) {
        if (t < 0.5) {
            const f = t * 2.0;
            return `${Math.floor(cY[0] + (cB[0] - cY[0]) * f)}, ${Math.floor(cY[1] + (cB[1] - cY[1]) * f)}, ${Math.floor(cY[2] + (cB[2] - cY[2]) * f)}`;
        } else {
            const f = (t - 0.5) * 2.0;
            return `${Math.floor(cB[0] + (cP[0] - cB[0]) * f)}, ${Math.floor(cB[1] + (cP[1] - cB[1]) * f)}, ${Math.floor(cB[2] + (cP[2] - cB[2]) * f)}`;
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        // A velocidade de animação. Aumentado para ser mais rápido.
        time += 0.045; 

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            const nx = p.x * 0.0025;
            const ny = p.y * 0.0025;

            // O coração do teu 1º código: ondas que criam manchas que aparecem/desaparecem
            // Reduzido para 2 camadas de cálculo em vez de 4 para ser muito mais leve
            const layer1 = Math.sin(nx * 3.2 + time * 0.8) + Math.cos(ny * 2.7 - time * 0.6);
            const layer2 = Math.sin((nx + ny) * 2.0 - time * 0.4) + Math.cos((nx - ny) * 2.5 + time * 0.5);
            
            const v = layer1 * 0.5 + layer2 * 0.5;

            // Converte o resultado matemático para uma percentagem de 0 a 1
            const n = Math.max(0, Math.min(1, (v + 1.2) / 2.4));

            // A opacidade dita se está a aparecer ou desaparecer
            const alpha = n * 0.9;

            // GRANDE OTIMIZAÇÃO: Se a bolinha está apagada, ignoramos e não desenhamos
            if (alpha < 0.05) continue;

            // Pontos significativamente mais pequenos (entre 0.5px e 2.0px)
            const radius = 0.5 + (n * 1.5);

            // Um micro-empurrão natural para a malha não parecer um papel quadriculado rígido
            const pushAmount = n * 4.0;
            const px = p.x + Math.cos(p.seed) * pushAmount;
            const py = p.y + Math.sin(p.seed) * pushAmount;

            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            // Usamos alpha.toFixed(2) para garantir que o Javascript não sofre com decimais gigantes
            ctx.fillStyle = `rgba(${getColor(n)}, ${alpha.toFixed(2)})`;
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();