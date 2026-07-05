let ativos = {};

let scale = 1;
let panX = 0;
let panY = 0;
let globalRotation = 0; 

let refX = 0;
let refY = 0;
let ultimaDistancia = 0;
let ultimoAngulo = 0;

let fotoEmArrasto = null;

// FÍSICA DAS FOTOS
let inerciaAnimId = null;
let velX = 0;
let velY = 0;

// FÍSICA DO MAPA
let mapInerciaAnimId = null;
let mapVelX = 0;
let mapVelY = 0;
let mapVelScale = 0;
let mapVelRotation = 0; 
let lastZoomCX = window.innerWidth / 2;
let lastZoomCY = window.innerHeight / 2;

const MIN_SCALE = 0.3; 
const MAX_SCALE = 5;
const FOTO_ZOOM_INTENSIDADE = 0.25;
const MIN_FOTO_SCALE = 0.45;

const SAFE_TOP = 10, SAFE_LEFT = 10, SAFE_RIGHT = 20, SAFE_BOTTOM = 100;

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
    // Ao iniciar, aplicamos os limites para garantir que arranca no centro
    aplicarTransform(false); 
}

function distancia(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

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
        minLeft = Math.min(minLeft, foto.rx);
        maxLeft = Math.max(maxLeft, foto.rx);
        minTop = Math.min(minTop, foto.ry);
        maxTop = Math.max(maxTop, foto.ry);
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    const maxAllowedPanX = SAFE_LEFT - minLeft;
    const minAllowedPanX = (screenW - SAFE_RIGHT) - maxLeft;

    const maxAllowedPanY = SAFE_TOP - minTop;
    const minAllowedPanY = (screenH - SAFE_BOTTOM) - maxTop;

    if (minAllowedPanX < maxAllowedPanX) {
        panX = Math.max(minAllowedPanX, Math.min(panX, maxAllowedPanX));
    } else {
        panX = (minAllowedPanX + maxAllowedPanX) / 2;
    }

    if (minAllowedPanY < maxAllowedPanY) {
        panY = Math.max(minAllowedPanY, Math.min(panY, maxAllowedPanY));
    } else {
        panY = (minAllowedPanY + maxAllowedPanY) / 2;
    }
}

// CORREÇÃO: Adicionado o parâmetro para podermos desligar os limites temporariamente
function aplicarTransform(ignorarLimites = false) {
    const cosR = Math.cos(globalRotation);
    const sinR = Math.sin(globalRotation);

    for (const foto of fotosCache) {
        const ox = foto.left * scale;
        const oy = foto.top * scale;
        
        foto.rx = ox * cosR - oy * sinR;
        foto.ry = ox * sinR + oy * cosR;
    }

    // Só limitamos o ecrã se não houver gestos complexos a decorrer
    if (!ignorarLimites) {
        limitarPan();
    }

    let fotoScale = scale < 1 
        ? Math.max(MIN_FOTO_SCALE, 1 + (scale - 1) * 0.8) 
        : 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;

    for (const foto of fotosCache) {
        foto.elemento.style.left = (foto.rx + panX) + 'px';
        foto.elemento.style.top = (foto.ry + panY) + 'px';
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
        ultimoAngulo = angulo(ativos[chaves[0]], ativos[chaves[1]]);
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

        // Enquanto a foto desliza com inércia, ignoramos os limites para o ecrã não tremer
        aplicarTransform(true);
        inerciaAnimId = requestAnimationFrame(animar);
    }
    animar();
}

function iniciarInerciaMapa() {
    function animar() {
        mapVelX *= 0.92;
        mapVelY *= 0.92;
        mapVelScale *= 0.88; 
        mapVelRotation *= 0.88;

        if (Math.abs(mapVelX) < 0.1 && Math.abs(mapVelY) < 0.1 && Math.abs(mapVelScale) < 0.001 && Math.abs(mapVelRotation) < 0.001) {
            return;
        }

        panX += mapVelX;
        panY += mapVelY;

        if (Math.abs(mapVelScale) > 0.0001) {
            zoomNoPonto(lastZoomCX, lastZoomCY, 1 + mapVelScale);
        }

        if (Math.abs(mapVelRotation) > 0.0001) {
            globalRotation += mapVelRotation;
            
            const cosA = Math.cos(mapVelRotation);
            const sinA = Math.sin(mapVelRotation);
            const dx = panX - lastZoomCX;
            const dy = panY - lastZoomCY;
            panX = lastZoomCX + dx * cosA - dy * sinA;
            panY = lastZoomCY + dx * sinA + dy * cosA;
        }

        // Aplicamos com limites ligados (false) para que o mapa trave suavemente nas bordas
        aplicarTransform(false);
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
            const invCos = Math.cos(-globalRotation);
            const invSin = Math.sin(-globalRotation);
            
            const mapDx = (deltaX * invCos - deltaY * invSin) / scale;
            const mapDy = (deltaX * invSin + deltaY * invCos) / scale;
            
            fotoEmArrasto.left += mapDx;
            fotoEmArrasto.top += mapDy;
            
            velX = (velX * 0.4) + (mapDx * 0.6);
            velY = (velY * 0.4) + (mapDy * 0.6);
            
            fotoEmArrasto.elemento.setAttribute('data-left', fotoEmArrasto.left);
            fotoEmArrasto.elemento.setAttribute('data-top', fotoEmArrasto.top);
            
            // CORREÇÃO: Ignorar limites enquanto arrastamos uma foto
            aplicarTransform(true);
            
        } else {
            panX += deltaX;
            panY += deltaY;
            
            mapVelX = (mapVelX * 0.4) + (deltaX * 0.6);
            mapVelY = (mapVelY * 0.4) + (deltaY * 0.6);
            
            // CORREÇÃO: Manter os limites ligados enquanto arrastamos o mapa geral
            aplicarTransform(false);
        }

        refX = currX;
        refY = currY;

    } else if (chaves.length === 2) {
        fotoEmArrasto = null; 
        
        const currX = (ativos[chaves[0]].x + ativos[chaves[1]].x) / 2;
        const currY = (ativos[chaves[0]].y + ativos[chaves[1]].y) / 2;
        const dAtual = distancia(ativos[chaves[0]], ativos[chaves[1]]);
        const aAtual = angulo(ativos[chaves[0]], ativos[chaves[1]]);

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

        let deltaAngle = aAtual - ultimoAngulo;
        
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

        globalRotation += deltaAngle;
        mapVelRotation = (mapVelRotation * 0.4) + (deltaAngle * 0.6);

        const cosA = Math.cos(deltaAngle);
        const sinA = Math.sin(deltaAngle);
        const dx = panX - currX;
        const dy = panY - currY;
        
        panX = currX + dx * cosA - dy * sinA;
        panY = currY + dx * sinA + dy * cosA;

        refX = currX;
        refY = currY;
        ultimaDistancia = dAtual;
        ultimoAngulo = aAtual;

        // CORREÇÃO: Ignorar limites enquanto os 2 dedos estão no ecrã (Zoom livre)
        aplicarTransform(true);
    }
}

function touchEnd(e) {
    for (const touch of e.changedTouches) {
        delete ativos[touch.identifier];
    }
    
    if (Object.keys(ativos).length === 0) {
        
        // CORREÇÃO: Assim que largas o ecrã, forçamos os limites para o mapa "encaixar" de volta
        aplicarTransform(false);

        if (fotoEmArrasto) {
            if (Math.abs(velX) > 0.5 || Math.abs(velY) > 0.5) {
                iniciarInerciaFoto(fotoEmArrasto, velX, velY);
            }
        } else {
            if (Math.abs(mapVelX) > 0.5 || Math.abs(mapVelY) > 0.5 || Math.abs(mapVelScale) > 0.005 || Math.abs(mapVelRotation) > 0.005) {
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