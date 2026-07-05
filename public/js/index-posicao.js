let ativos = {};

let scale = 1;
let panX = 0;
let panY = 0;

let refX = 0;
let refY = 0;
let ultimaDistancia = 0;

let fotoEmArrasto = null;

// NOVAS VARIÁVEIS PARA A INÉRCIA (FÍSICA)
let inerciaAnimId = null;
let velX = 0;
let velY = 0;

const MIN_SCALE = 0.2; 
const MAX_SCALE = 5;
const FOTO_ZOOM_INTENSIDADE = 0.25;

const SAFE_TOP = 20, SAFE_LEFT = 20, SAFE_RIGHT = 20, SAFE_BOTTOM = 100;

let fotosCache = [];

function inicializarFotos() {
    const fotos = document.querySelectorAll('.foto');
    fotosCache = Array.from(fotos).map(el => {
        el.style.position = 'absolute';
        el.style.transformOrigin = 'center center';
        return {
            elemento: el,
            top: Number(el.getAttribute('data-top')) || 0,
            left: Number(el.getAttribute('data-left')) || 0
        };
    });
    aplicarTransform();
}

function distancia(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function limitarScale(valor) {
    return Math.max(MIN_SCALE, Math.min(valor, MAX_SCALE));
}

function limitarPan() {
    if (fotosCache.length === 0) return;

    let minLeft = Infinity, maxLeft = -Infinity;
    let minTop = Infinity, maxTop = -Infinity;

    for (const foto of fotosCache) {
        minLeft = Math.min(minLeft, foto.left * scale);
        maxLeft = Math.max(maxLeft, foto.left * scale);
        minTop = Math.min(minTop, foto.top * scale);
        maxTop = Math.max(maxTop, foto.top * scale);
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    const minPanX = SAFE_LEFT - minLeft;
    const maxPanX = (screenW - SAFE_RIGHT) - maxLeft;
    const minPanY = SAFE_TOP - minTop;
    const maxPanY = (screenH - SAFE_BOTTOM) - maxTop;

    panX = minPanX > maxPanX ? (minPanX + maxPanX) / 2 : Math.max(minPanX, Math.min(panX, maxPanX));
    panY = minPanY > maxPanY ? (minPanY + maxPanY) / 2 : Math.max(minPanY, Math.min(panY, maxPanY));
}

function aplicarTransform() {
    limitarPan();
    const fotoScale = 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;

    for (const foto of fotosCache) {
        foto.elemento.style.left = (foto.left * scale + panX) + 'px';
        foto.elemento.style.top = (foto.top * scale + panY) + 'px';
        foto.elemento.style.transform = `scale(${fotoScale})`;
    }
}

function zoomNoPonto(screenX, screenY, zoomFactor) {
    const novoScale = limitarScale(scale * zoomFactor);
    const realZoomFactor = novoScale / scale;
    scale = novoScale;
    panX = screenX - (screenX - panX) * realZoomFactor;
    panY = screenY - (screenY - panY) * realZoomFactor;
}

function atualizarReferencias() {
    const chaves = Object.keys(ativos);
    if (chaves.length === 1) {
        refX = ativos[chaves[0]].x;
        refY = ativos[chaves[0]].y;
    } else if (chaves.length === 2) {
        refX = (ativos[chaves[0]].x + ativos[chaves[1]].x) / 2;
        refY = (ativos[chaves[0]].y + ativos[chaves[1]].y) / 2;
        ultimaDistancia = distancia(ativos[chaves[0]], ativos[chaves[1]]);
    }
}

// NOVA FUNÇÃO: O "Motor" da Física
function iniciarInercia(foto, vx, vy) {
    function animar() {
        // Multiplicar por 0.92 cria a fricção. Quanto mais perto de 1, mais desliza.
        vx *= 0.92; 
        vy *= 0.92;

        // Quando a velocidade é quase zero, paramos a animação para poupar bateria
        if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
            return; 
        }

        foto.left += vx;
        foto.top += vy;
        
        foto.elemento.setAttribute('data-left', foto.left);
        foto.elemento.setAttribute('data-top', foto.top);

        aplicarTransform();
        
        // Pede ao navegador para calcular o próximo frame
        inerciaAnimId = requestAnimationFrame(animar);
    }
    animar();
}

function touchStart(e) {
    if(e.target.closest('.foto') || e.target.id === 'mapa-container' || e.target.tagName.toLowerCase() === 'canvas') {
        e.preventDefault();
    }
    
    // Parar qualquer inércia que esteja a acontecer no momento em que tocamos no ecrã
    cancelAnimationFrame(inerciaAnimId);
    velX = 0;
    velY = 0;
    
    for (const touch of e.changedTouches) {
        ativos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
    }
    
    const chaves = Object.keys(ativos);
    
    if (chaves.length === 1) {
        const alvoFoto = e.target.closest('.foto');
        if (alvoFoto) {
            fotoEmArrasto = fotosCache.find(f => f.elemento === alvoFoto);
        } else {
            fotoEmArrasto = null;
        }
    } else {
        fotoEmArrasto = null;
    }

    atualizarReferencias();
}

function touchMove(e) {
    if (Object.keys(ativos).length === 0) return;
    e.preventDefault();
    
    for (const touch of e.changedTouches) {
        if (ativos[touch.identifier]) {
            ativos[touch.identifier].x = touch.clientX;
            ativos[touch.identifier].y = touch.clientY;
        }
    }

    const chaves = Object.keys(ativos);

    if (chaves.length === 1) {
        const currX = ativos[chaves[0]].x;
        const currY = ativos[chaves[0]].y;

        const deltaX = currX - refX;
        const deltaY = currY - refY;

        if (fotoEmArrasto) {
            const dx = deltaX / scale;
            const dy = deltaY / scale;
            
            fotoEmArrasto.left += dx;
            fotoEmArrasto.top += dy;
            
            // Gravar a velocidade do movimento. 
            // Usamos uma média (0.4 do antigo + 0.6 do novo) para evitar arranques bruscos
            velX = (velX * 0.4) + (dx * 0.6);
            velY = (velY * 0.4) + (dy * 0.6);
            
            fotoEmArrasto.elemento.setAttribute('data-left', fotoEmArrasto.left);
            fotoEmArrasto.elemento.setAttribute('data-top', fotoEmArrasto.top);
            
        } else {
            panX += deltaX;
            panY += deltaY;
        }

        refX = currX;
        refY = currY;

        aplicarTransform();

    } else if (chaves.length === 2) {
        fotoEmArrasto = null; 
        
        const currX = (ativos[chaves[0]].x + ativos[chaves[1]].x) / 2;
        const currY = (ativos[chaves[0]].y + ativos[chaves[1]].y) / 2;
        const dAtual = distancia(ativos[chaves[0]], ativos[chaves[1]]);

        panX += currX - refX;
        panY += currY - refY;

        if (ultimaDistancia > 0) {
            zoomNoPonto(currX, currY, dAtual / ultimaDistancia);
        }

        refX = currX;
        refY = currY;
        ultimaDistancia = dAtual;

        aplicarTransform();
    }
}

function touchEnd(e) {
    for (const touch of e.changedTouches) {
        delete ativos[touch.identifier];
    }
    
    if (Object.keys(ativos).length === 0) {
        // Se a foto estava a ser arrastada e tem velocidade suficiente, atira-a com inércia
        if (fotoEmArrasto && (Math.abs(velX) > 0.5 || Math.abs(velY) > 0.5)) {
            iniciarInercia(fotoEmArrasto, velX, velY);
        }
        fotoEmArrasto = null;
    }

    atualizarReferencias();
}

document.addEventListener("touchstart", touchStart, { passive: false });
document.addEventListener("touchmove", touchMove, { passive: false });
document.addEventListener("touchend", touchEnd, { passive: false });
document.addEventListener("touchcancel", touchEnd, { passive: false });