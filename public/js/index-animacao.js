(() => {
    const canvas = document.getElementById('gridCanvas');
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
    });

    if (!gl) {
        console.warn('WebGL não suportado');
        return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let pointsCount = 0;
    let startTime = performance.now();

    const spacing = 19.5; // ~15% menos pontos que 18

    const vertexShaderSource = `
        attribute vec2 a_position;

        uniform vec2 u_resolution;
        uniform float u_time;

        varying float v_alpha;
        varying float v_mixValue;

        float rand(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
        }

        void main() {
            vec2 pos = a_position;

            float nx = pos.x * 0.003;
            float ny = pos.y * 0.003;

            float waveX =
                sin(ny * 2.5 + u_time * 2.5) * 18.0 +
                cos(nx * 1.8 - u_time) * 12.0;

            float waveY =
                cos(nx * 2.5 - u_time * 2.5) * 18.0 +
                sin(ny * 1.8 + u_time) * 12.0;

            vec2 finalPos = pos + vec2(waveX, waveY);

            vec2 center = u_resolution * 0.5;

            float holeTime = u_time * 3.5;

            float holeX =
                center.x +
                sin(holeTime * 0.7) * (center.x * 0.9) +
                cos(holeTime * 0.3) * (center.x * 0.3);

            float holeY =
                center.y +
                cos(holeTime * 0.8) * (center.y * 0.9) +
                sin(holeTime * 0.4) * (center.y * 0.3);

            vec2 hole = vec2(holeX, holeY);

            float distToHole = distance(finalPos, hole);

            float holeRadius = 160.0;
            float edgeSoftness = 60.0;

            float alpha = clamp((distToHole - holeRadius) / edgeSoftness, 0.0, 1.0);

            float borderNoise = sin(nx * 15.0 + u_time * 5.0) * 0.15;
            alpha = clamp(alpha + borderNoise, 0.0, 1.0);

            float waveValue =
                (
                    sin(nx * 2.2 + u_time * 1.5) +
                    cos(ny * 2.2 + u_time * 1.5) +
                    2.0
                ) / 4.0;

            v_alpha = alpha * (0.8 + waveValue * 0.2);
            v_mixValue = waveValue;

            vec2 clip = (finalPos / u_resolution) * 2.0 - 1.0;
            clip.y *= -1.0;

            gl_Position = vec4(clip, 0.0, 1.0);
            gl_PointSize = 3.0;
        }
    `;

    const fragmentShaderSource = `
        precision mediump float;

        varying float v_alpha;
        varying float v_mixValue;

        void main() {
            if (v_alpha < 0.05) discard;

            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);

            if (dist > 0.5) discard;

            vec3 yellow = vec3(1.0, 0.843, 0.0);
            vec3 blue = vec3(0.0, 0.392, 1.0);
            vec3 purple = vec3(0.541, 0.169, 0.886);

            vec3 color;

            if (v_mixValue < 0.5) {
                color = mix(yellow, blue, v_mixValue * 2.0);
            } else {
                color = mix(blue, purple, (v_mixValue - 0.5) * 2.0);
            }

            float softCircle = smoothstep(0.5, 0.15, dist);

            gl_FragColor = vec4(color, v_alpha * softCircle);
        }
    `;

    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    function createProgram(vertexSource, fragmentSource) {
        const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    const program = createProgram(vertexShaderSource, fragmentShaderSource);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');

    const positionBuffer = gl.createBuffer();

    function createGrid() {
        const points = [];

        const cols = Math.ceil(width / spacing) + 6;
        const rows = Math.ceil(height / spacing) + 6;

        const startX = -spacing * 3;
        const startY = -spacing * 3;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push(startX + col * spacing);
                points.push(startY + row * spacing);
            }
        }

        pointsCount = points.length / 2;

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        width = window.innerWidth;
        height = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        gl.viewport(0, 0, canvas.width, canvas.height);

        createGrid();
    }

    window.addEventListener('resize', resize);

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
    }

    resize();

    gl.useProgram(program);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    function draw(now) {
        const time = (now - startTime) * 0.001;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        gl.uniform2f(resolutionLocation, width, height);
        gl.uniform1f(timeLocation, time);

        gl.drawArrays(gl.POINTS, 0, pointsCount);

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();