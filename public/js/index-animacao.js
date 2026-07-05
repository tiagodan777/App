(() => {
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');

    let width, height, dpr;
    let points = [];
    let time = 0;

    const spacing = 18; 

    const colorYellow = [255, 215, 0];
    const colorBlue = [0, 100, 255];
    const colorPurple = [138, 43, 226];

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createGrid();
    }

    function createGrid() {
        points = [];
        const cols = Math.ceil(width / spacing) + 6;
        const rows = Math.ceil(height / spacing) + 6;
        
        const startX = -spacing * 3;
        const startY = -spacing * 3;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push({
                    baseX: startX + col * spacing,
                    baseY: startY + row * spacing
                });
            }
        }
    }

    window.addEventListener('resize', resize);
    resize();

    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

    function getGradientColorRGB(t) {
        t = clamp(t, 0, 1);
        let c1, c2, factor;
        if (t < 0.5) {
            c1 = colorYellow; c2 = colorBlue; factor = t * 2.0;
        } else {
            c1 = colorBlue; c2 = colorPurple; factor = (t - 0.5) * 2.0;
        }
        return `${Math.floor(lerp(c1[0], c2[0], factor))}, ${Math.floor(lerp(c1[1], c2[1], factor))}, ${Math.floor(lerp(c1[2], c2[2], factor))}`;
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        time += 0.001; 

        const cx = width / 2;
        const cy = height / 2;
        const holeTime = time * 3.5; 
        
        const holeX = cx + Math.sin(holeTime * 0.7) * (cx * 0.9) + Math.cos(holeTime * 0.3) * (cx * 0.3);
        const holeY = cy + Math.cos(holeTime * 0.8) * (cy * 0.9) + Math.sin(holeTime * 0.4) * (cy * 0.3);

        // 1. Buraco maior
        const holeRadius = 340; 
        // 2. Transição muito mais curta para não esbater demasiado
        const edgeSoftness = 70; 

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            const nx = p.baseX * 0.003;
            const ny = p.baseY * 0.003;

            const waveX = Math.sin(ny * 2.5 + time * 2.5) * 18 + Math.cos(nx * 1.8 - time) * 12;
            const waveY = Math.cos(nx * 2.5 - time * 2.5) * 18 + Math.sin(ny * 1.8 + time) * 12;

            const finalX = p.baseX + waveX;
            const finalY = p.baseY + waveY;

            const waveValue = (Math.sin(nx * 2.2 + time * 1.5) + Math.cos(ny * 2.2 + time * 1.5) + 2) / 4; 
            
            const dx = finalX - holeX;
            const dy = finalY - holeY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // A matemática agora empurra rapidamente a opacidade de 0 (dentro do buraco) para 1 (fora do buraco)
            let alpha = clamp((dist - holeRadius) / edgeSoftness, 0, 1);
            
            const borderNoise = Math.sin(nx * 15 + time * 5) * 0.15;
            alpha = clamp(alpha + borderNoise, 0, 1);

            const finalAlpha = alpha * (0.8 + waveValue * 0.2);

            // Se o finalAlpha for quase zero (está no núcleo do buraco), ele é ignorado e o ecrã fica 100% branco por trás
            if (finalAlpha < 0.05) continue;
            
            ctx.beginPath();
            ctx.arc(finalX, finalY, 1.2, 0, Math.PI * 2);
            
            const rgb = getGradientColorRGB(waveValue);
            ctx.fillStyle = `rgba(${rgb}, ${finalAlpha.toFixed(2)})`;
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();