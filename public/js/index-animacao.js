(() => {
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');

    let width = 0, height = 0, dpr = 1;
    let points = [];
    let time = 0;

    const spacing = 22; 

    const cY = [255, 215, 0];   // Amarelo
    const cB = [0, 100, 255];   // Azul
    const cP = [138, 43, 226];  // Roxo

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        // Usar innerHeight é mais seguro para PWAs (aplicações no menu principal)
        height = window.innerHeight; 

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createPoints();
    }

    function createPoints() {
        points = [];
        
        // Criar uma margem invisível gigante à volta do ecrã para nunca faltarem pontos
        const margin = spacing * 8; 
        const cols = Math.ceil((width + margin * 2) / spacing);
        const rows = Math.ceil((height + margin * 2) / spacing);

        const startX = -margin;
        const startY = -margin;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push({
                    x: startX + col * spacing,
                    y: startY + row * spacing,
                    seed: Math.random() * Math.PI * 2
                });
            }
        }
    }

    window.addEventListener('resize', resize);
    resize();

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

        // Muito mais lento e calmo
        time += 0.012; 

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            // Ondas mais "largas" para dar uma lógica de nuvem e não de ruído
            const nx = p.x * 0.0015; 
            const ny = p.y * 0.0015;

            // Lógica fluida e contínua
            const layer1 = Math.sin(nx * 3.0 + time) + Math.cos(ny * 2.5 - time * 0.8);
            const layer2 = Math.sin((nx + ny) * 2.0 - time * 0.5) + Math.cos((nx - ny) * 1.5 + time * 0.6);
            
            const v = layer1 * 0.5 + layer2 * 0.5;
            const n = Math.max(0, Math.min(1, (v + 1.5) / 3.0));

            const alpha = n * 0.85;

            if (alpha < 0.05) continue;

            const radius = 0.6 + (n * 1.4);

            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${getColor(n)}, ${alpha.toFixed(2)})`;
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();