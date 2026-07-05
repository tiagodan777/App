let ativos = {};

let scale = 1;
let panX = 0;
let panY = 0;
let rotation = 0; // NOVA VARIÁVEL: Ângulo atual de rotação

let refX = 0;
let refY = 0;
let ultimaDistancia = 0;
let ultimoAngulo = 0; // NOVA VARIÁVEL: Ângulo inicial dos dedos

let fotoEmArrasto = null;

// FÍSICA DAS FOTOS
let inerciaAnimId = null;
let velX = 0;
let velY = 0;

// FÍSICA DO MAPA (PAN, ZOOM E ROTAÇÃO)
let mapInerciaAnimId = null;
let mapVelX = 0;
let mapVelY = 0;
let mapVelScale = 0;
let mapVelRotation = 0; // NOVA VARIÁVEL: Velocidade da rotação (inércia)
let lastZoomCX = window.innerWidth / 2;
let lastZoomCY = window.innerHeight / 2;

const MIN_SCALE = 0.3; 
const MAX_SCALE = 5;
const FOTO_ZOOM_INTENSIDADE = 0.25;
const MIN_FOTO_SCALE = 0.45;

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

// NOVA FUNÇÃO: Calcula o ângulo entre os dois dedos (em radianos)
function angulo(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
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
    
    let fotoScale;
    if (scale < 1) {
        fotoScale = Math.max(MIN_FOTO_SCALE, 1 + (scale - 1) * 0.8);
    } else {
        fotoScale = 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;
    }

    for (const foto of fotosCache) {
        foto.elemento.style.left = (foto.left * scale + panX) + 'px';
        foto.elemento.style.top = (foto.top * scale + panY) + 'px';
        
        // APLICAR ROTAÇÃO: Adicionado o "rotate" à propriedade CSS transform
        foto.elemento.style.transform = `scale(${fotoScale}) rotate(${rotation}deg)`;
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
        ultimoAngulo = angulo(ativos[chaves[0]], ativos[chaves[1]]); // Gravar o ângulo base
    }
}

function iniciarInerciaFoto(foto, vx, vy) {
    function animar() {
        vx *= 0.92; 
        vy *= 0.92;

        if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) return; 

        foto.left += vx;
        foto.top += vy;
        
        foto.elemento.setAttribute('data-left', foto.left);
        foto.elemento.setAttribute('data-top', foto.top);

        aplicarTransform();
        inerciaAnimId = requestAnimationFrame(animar);
    }
    animar();
}

function iniciarInerciaMapa() {
    function animar() {
        mapVelX *= 0.92;
        mapVelY *= 0.92;
        mapVelScale *= 0.88; 
        mapVelRotation *= 0.88; // Desaceleração da rotação

        if (Math.abs(mapVelX) < 0.1 && Math.abs(mapVelY) < 0.1 && Math.abs(mapVelScale) < 0.001 && Math.abs(mapVelRotation) < 0.05) {
            return;
        }

        panX += mapVelX;
        panY += mapVelY;
        rotation += mapVelRotation; // Aplicar inércia de giro

        if (Math.abs(mapVelScale) > 0.0001) {
            zoomNoPonto(lastZoomCX, lastZoomCY, 1 + mapVelScale);
        }

        aplicarTransform();
        mapInerciaAnimId = requestAnimationFrame(animar);
    }
    animar();
}

function touchStart(e) {
    if(e.target.closest('.foto') || e.target.id === 'mapa-container' || e.target.tagName.toLowerCase() === 'canvas') {
        e.preventDefault();
    }
    
    cancelAnimationFrame(inerciaAnimId);
    cancelAnimationFrame(mapInerciaAnimId);
    
    velX = 0; velY = 0;
    mapVelX = 0; mapVelY = 0; mapVelScale = 0; mapVelRotation = 0;
    
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
            
            velX = (velX * 0.4) + (dx * 0.6);
            velY = (velY * 0.4) + (dy * 0.6);
            
            fotoEmArrasto.elemento.setAttribute('data-left', fotoEmArrasto.left);
            fotoEmArrasto.elemento.setAttribute('data-top', fotoEmArrasto.top);
            
        } else {
            panX += deltaX;
            panY += deltaY;
            
            mapVelX = (mapVelX * 0.4) + (deltaX * 0.6);
            mapVelY = (mapVelY * 0.4) + (deltaY * 0.6);
        }

        refX = currX;
        refY = currY;

        aplicarTransform();

    } else if (chaves.length === 2) {
        fotoEmArrasto = null; 
        
        const currX = (ativos[chaves[0]].x + ativos[chaves[1]].x) / 2;
        const currY = (ativos[chaves[0]].y + ativos[chaves[1]].y) / 2;
        const dAtual = distancia(ativos[chaves[0]], ativos[chaves[1]]);
        const aAtual = angulo(ativos[chaves[0]], ativos[chaves[1]]); // Calcular ângulo atual

        const deltaX = currX - refX;
        const deltaY = currY - refY;

        panX += deltaX;
        panY += deltaY;
        
        mapVelX = (mapVelX * 0.4) + (deltaX * 0.6);
        mapVelY = (mapVelY * 0.4) + (deltaY * 0.6);

        if (ultimaDistancia > 0) {
            const zoomFactor = dAtual / ultimaDistancia;
            zoomNoPonto(currX, currY, zoomFactor);
            
            mapVelScale = (mapVelScale * 0.4) + ((zoomFactor - 1) * 0.6);
            
            lastZoomCX = currX;
            lastZoomCY = currY;
        }

        // CALCULAR DELTA DA ROTAÇÃO
        let deltaAngle = aAtual - ultimoAngulo;
        
        // Evita saltos bruscos se o ângulo der a volta completa ao círculo
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

        const graus = deltaAngle * (180 / Math.PI); // Radianos para graus
        rotation += graus;
        mapVelRotation = (mapVelRotation * 0.4) + (graus * 0.6);

        refX = currX;
        refY = currY;
        ultimaDistancia = dAtual;
        ultimoAngulo = aAtual;

        aplicarTransform();
    }
}

function touchEnd(e) {
    for (const touch of e.changedTouches) {
        delete ativos[touch.identifier];
    }
    
    if (Object.keys(ativos).length === 0) {
        if (fotoEmArrasto) {
            if (Math.abs(velX) > 0.5 || Math.abs(velY) > 0.5) {
                iniciarInerciaFoto(fotoEmArrasto, velX, velY);
            }
        } else {
            // Se houver velocidade no zoom, pan ou rotação, dispara inércia
            if (Math.abs(mapVelX) > 0.5 || Math.abs(mapVelY) > 0.5 || Math.abs(mapVelScale) > 0.005 || Math.abs(mapVelRotation) > 0.5) {
                iniciarInerciaMapa();
            }
        }
        fotoEmArrasto = null;
    }

    atualizarReferencias();
}

document.addEventListener("touchstart", touchStart, { passive: false });
document.addEventListener("touchmove", touchMove, { passive: false });
document.addEventListener("touchend", touchEnd, { passive: false });
document.addEventListener("touchcancel", touchEnd, { passive: false });