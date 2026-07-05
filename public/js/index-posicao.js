let ativos = {}; // Guardar apenas as coordenadas necessárias

let scale = 1;
let panX = 0;
let panY = 0;

// Referências base para não haver saltos quando se tira/põe um dedo
let refX = 0;
let refY = 0;
let ultimaDistancia = 0;

const MIN_SCALE = 0.7;
const MAX_SCALE = 5;
const FOTO_ZOOM_INTENSIDADE = 0.25;

const SAFE_TOP = 20, SAFE_LEFT = 20, SAFE_RIGHT = 20, SAFE_BOTTOM = 100;

// Cache para não ler o HTML a cada frame
let fotosCache = [];

// 1. OTIMIZAÇÃO: Executar isto apenas uma vez quando a página carrega
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

// 2. MATEMÁTICA CORRIGIDA: Atualizar referências sempre que muda o número de dedos
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

function touchStart(e) {
    // Apenas prevenir o default se estivermos a tocar na área do mapa (podes ajustar o alvo se necessário)
    if(e.target.closest('.foto') || e.target.id === 'mapa-container') {
        e.preventDefault();
    }
    
    for (const touch of e.changedTouches) {
        ativos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
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

        panX += currX - refX;
        panY += currY - refY;

        refX = currX;
        refY = currY;

        aplicarTransform();
    } else if (chaves.length === 2) {
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
    atualizarReferencias();
}

document.addEventListener("touchstart", touchStart, { passive: false });
document.addEventListener("touchmove", touchMove, { passive: false });
document.addEventListener("touchend", touchEnd, { passive: false });
document.addEventListener("touchcancel", touchEnd, { passive: false });

// Exemplo de como deves inicializar quando a página carrega:
// window.onload = () => inicializarFotos();