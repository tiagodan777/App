(() => {
    'use strict';

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
    let fotoEmInercia = null;
    let inerciaAnimId = null;
    let velX = 0;
    let velY = 0;
    let mapInerciaAnimId = null;
    let mapVelX = 0;
    let mapVelY = 0;
    let mapVelScale = 0;
    let mapVelRotation = 0;
    let lastZoomCX = window.innerWidth / 2;
    let lastZoomCY = window.innerHeight / 2;
    const MIN_SCALE = 0.25;
    const MAX_SCALE = 8;
    const FOTO_ZOOM_INTENSIDADE = 0.25;
    const MIN_FOTO_SCALE = 0.45;
    const SAFE_TOP = 10;
    const SAFE_LEFT = 10;
    const SAFE_RIGHT = 20;
    const SAFE_BOTTOM = 100;
    let fotosCache = [];

    function memorizarPosicaoFoto(foto) {
        if (!foto || !foto.elemento) return;
        foto.elemento.setAttribute('data-left', String(foto.left));
        foto.elemento.setAttribute('data-top', String(foto.top));
        window.dispatchEvent(
            new CustomEvent('margot:photo-position-changed', {
                detail: {
                    id: String(foto.elemento.getAttribute('data-membro-id') || foto.elemento.id || ''),
                    left: foto.left,
                    top: foto.top
                }
            })
        );
    }

    function inicializarFotos() {
        const fotos = document.querySelectorAll('.foto');
        const anteriores = new Map(fotosCache.map((foto) => [foto.elemento, foto]));
        fotosCache = Array.from(fotos).map((el) => {
            const anterior = anteriores.get(el);
            el.style.position = 'absolute';
            el.style.top = '0px';
            el.style.left = '0px';
            el.style.transformOrigin = 'center center';
            if (anterior) {
                anterior.largura = el.offsetWidth || 60;
                anterior.altura = el.offsetHeight || 60;
                anterior.elemento = el;
                return anterior;
            }
            return {
                elemento: el,
                largura: el.offsetWidth || 60,
                altura: el.offsetHeight || 60,
                top: Number(el.getAttribute('data-top')) || 0,
                left: Number(el.getAttribute('data-left')) || 0
            };
        });
        const colocadas = fotosCache.filter(foto => anteriores.has(foto.elemento));
        for (const foto of fotosCache) {
            if (!anteriores.has(foto.elemento)) {
                posicionarNovaFoto(foto, colocadas);
                colocadas.push(foto);
                memorizarPosicaoFoto(foto);
            }
        }
        if (fotoEmInercia && !fotosCache.includes(fotoEmInercia)) {
            cancelAnimationFrame(inerciaAnimId);
            fotoEmInercia = null;
        }
        if (fotoEmArrasto && !fotosCache.includes(fotoEmArrasto)) fotoEmArrasto = null;
        aplicarTransform();
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

    function escalaFoto() {
        return scale < 1
            ? Math.max(MIN_FOTO_SCALE, 1 + (scale - 1) * 0.8)
            : 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;
    }

    function limitesFoto(foto, margem = 0, zoom = escalaFoto()) {
        const viewport = window.visualViewport;
        const x = viewport ? viewport.offsetLeft : 0;
        const y = viewport ? viewport.offsetTop : 0;
        const w = viewport ? viewport.width : window.innerWidth;
        const h = viewport ? viewport.height : window.innerHeight;
        const largura = foto.largura || 60;
        const altura = foto.altura || 60;
        const extraX = largura * (zoom - 1) / 2;
        const extraY = altura * (zoom - 1) / 2;
        let minX = x + SAFE_LEFT + extraX;
        let maxX = x + w - SAFE_RIGHT - largura - extraX;
        let minY = y + SAFE_TOP + extraY;
        let maxY = y + h - SAFE_BOTTOM - altura - extraY;
        if (maxX < minX) minX = maxX = (minX + maxX) / 2;
        if (maxY < minY) minY = maxY = (minY + maxY) / 2;
        return {
            minX: minX - largura * zoom * margem,
            maxX: maxX + largura * zoom * margem,
            minY: minY - altura * zoom * margem,
            maxY: maxY + altura * zoom * margem
        };
    }

    // Place new people in the initial map, without undoing the user's zoom.
    function posicionarNovaFoto(foto, colocadas) {
        const bounds = limitesFoto(foto, 0, 1);
        const originalX = foto.left;
        const originalY = foto.top;
        const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
        let best = null;
        function avaliar(x, y) {
            let separacao = Infinity;
            for (const outra of colocadas) {
                const dx = x + foto.largura / 2 - outra.left - outra.largura / 2;
                const dy = y + foto.altura / 2 - outra.top - outra.altura / 2;
                const espaco = (Math.max(foto.largura, foto.altura) +
                    Math.max(outra.largura, outra.altura)) / 2 + 8;
                separacao = Math.min(separacao, Math.hypot(dx, dy) / espaco);
            }
            const deslocamento = Math.hypot(x - originalX, y - originalY);
            if (!best || separacao > best.separacao ||
                (separacao === best.separacao && deslocamento < best.deslocamento)) {
                best = { x, y, separacao, deslocamento };
            }
        }
        avaliar(clamp(originalX, bounds.minX, bounds.maxX),
            clamp(originalY, bounds.minY, bounds.maxY));
        if (best.separacao < 1) {
            // A bounded search runs only when inserting a photo, never every frame.
            const colunas = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / 24));
            const linhas = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / 24));
            for (let y = 0; y <= linhas; y++) {
                for (let x = 0; x <= colunas; x++) {
                    avaliar(bounds.minX + (bounds.maxX - bounds.minX) * x / colunas,
                        bounds.minY + (bounds.maxY - bounds.minY) * y / linhas);
                }
            }
        }
        foto.left = best.x;
        foto.top = best.y;
    }

    function correcaoFoto(foto, margem = 0) {
        const cos = Math.cos(globalRotation);
        const sin = Math.sin(globalRotation);
        const x = (foto.left * cos - foto.top * sin) * scale + panX;
        const y = (foto.left * sin + foto.top * cos) * scale + panY;
        const limites = limitesFoto(foto, margem);
        const dx = Math.max(limites.minX, Math.min(x, limites.maxX)) - x;
        const dy = Math.max(limites.minY, Math.min(y, limites.maxY)) - y;
        return { x: (dx * cos + dy * sin) / scale,
                 y: (-dx * sin + dy * cos) / scale };
    }

    function conterFoto(foto, margem = 0) {
        const ajuste = correcaoFoto(foto, margem);
        foto.left += ajuste.x;
        foto.top += ajuste.y;
    }

    function getTargetPan() {
        if (fotosCache.length === 0) return { x: panX, y: panY };
        let minX = -Infinity, maxX = Infinity;
        let minY = -Infinity, maxY = Infinity;
        const cos = Math.cos(globalRotation);
        const sin = Math.sin(globalRotation);
        for (const foto of fotosCache) {
            const x = (foto.left * cos - foto.top * sin) * scale;
            const y = (foto.left * sin + foto.top * cos) * scale;
            const limites = limitesFoto(foto);
            minX = Math.max(minX, limites.minX - x);
            maxX = Math.min(maxX, limites.maxX - x);
            minY = Math.max(minY, limites.minY - y);
            maxY = Math.min(maxY, limites.maxY - y);
        }
        // If zoom makes the map wider than the screen, allow panning between edges.
        return {
            x: Math.max(Math.min(minX, maxX), Math.min(panX, Math.max(minX, maxX))),
            y: Math.max(Math.min(minY, maxY), Math.min(panY, Math.max(minY, maxY)))
        };
    }

    function aplicarTransform() {
        const cosR = Math.cos(globalRotation);
        const sinR = Math.sin(globalRotation);
        const fotoScale = escalaFoto();
        for (const foto of fotosCache) {
            const ox = foto.left * scale;
            const oy = foto.top * scale;
            foto.rx = ox * cosR - oy * sinR;
            foto.ry = ox * sinR + oy * cosR;
            const posX = foto.rx + panX;
            const posY = foto.ry + panY;
            foto.elemento.style.transform = `translate3d(${posX}px, ${posY}px, 0) scale(${fotoScale})`;
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
        cancelAnimationFrame(inerciaAnimId);
        fotoEmInercia = foto;
        function animar() {
            const ajuste = correcaoFoto(foto);
            vx = vx * 0.82 + ajuste.x * 0.18;
            vy = vy * 0.82 + ajuste.y * 0.18;
            foto.left += vx;
            foto.top += vy;
            // Keep at least part of the photo on screen, even after a fast fling.
            conterFoto(foto, 0.35);
            const restante = correcaoFoto(foto);
            if (Math.hypot(vx, vy) * scale < 0.1 &&
                Math.hypot(restante.x, restante.y) * scale < 0.1) {
                conterFoto(foto);
                aplicarTransform();
                memorizarPosicaoFoto(foto);
                fotoEmInercia = null;
                inerciaAnimId = null;
                return;
            }
            aplicarTransform();
            inerciaAnimId = requestAnimationFrame(animar);
        }
        animar();
    }

    function iniciarInerciaMapa() {
        cancelAnimationFrame(mapInerciaAnimId);
        function animar() {
            let moving = false;
            mapVelX *= 0.92;
            mapVelY *= 0.92;
            mapVelScale *= 0.88;
            mapVelRotation *= 0.88;
            panX += mapVelX;
            panY += mapVelY;
            globalRotation += mapVelRotation;
            if (Math.abs(mapVelScale) > 0.0001) {
                zoomNoPonto(lastZoomCX, lastZoomCY, 1 + mapVelScale);
            }
            if (Math.abs(mapVelRotation) > 0.0001) {
                const cosA = Math.cos(mapVelRotation);
                const sinA = Math.sin(mapVelRotation);
                const dx = panX - lastZoomCX;
                const dy = panY - lastZoomCY;
                panX = lastZoomCX + dx * cosA - dy * sinA;
                panY = lastZoomCY + dx * sinA + dy * cosA;
            }
            const target = getTargetPan();
            const dx = target.x - panX;
            const dy = target.y - panY;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                panX += dx * 0.15;
                panY += dy * 0.15;
                moving = true;
            }
            if (
                Math.abs(mapVelX) > 0.1 ||
                Math.abs(mapVelY) > 0.1 ||
                Math.abs(mapVelScale) > 0.001 ||
                Math.abs(mapVelRotation) > 0.001
            ) {
                moving = true;
            }
            if (!moving) {
                panX = target.x;
                panY = target.y;
                mapInerciaAnimId = null;
            }
            aplicarTransform();
            if (moving) {
                mapInerciaAnimId = requestAnimationFrame(animar);
            }
        }
        animar();
    }

    function touchStart(e) {
        if (e.target.closest('.mini-menu, #menuPrincipal, ' + '#estado-ligacao, #ativar-notificacoes')) {
            return;
        }
        if (
            e.target.closest('.foto') ||
            e.target.id === 'mapa-container' ||
            e.target.tagName.toLowerCase() === 'canvas'
        ) {
            e.preventDefault();
        }
        cancelAnimationFrame(inerciaAnimId);
        cancelAnimationFrame(mapInerciaAnimId);
        if (fotoEmInercia) {
            conterFoto(fotoEmInercia);
            memorizarPosicaoFoto(fotoEmInercia);
            fotoEmInercia = null;
            aplicarTransform();
        }
        velX = 0;
        velY = 0;
        mapVelX = 0;
        mapVelY = 0;
        mapVelScale = 0;
        mapVelRotation = 0;
        for (const touch of e.changedTouches) {
            ativos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
        }
        const chaves = Object.keys(ativos);
        if (chaves.length === 1) {
            const alvoFoto = e.target.closest('.foto');
            if (alvoFoto) {
                fotoEmArrasto = fotosCache.find((foto) => foto.elemento === alvoFoto);
            } else {
                fotoEmArrasto = null;
            }
        } else {
            if (fotoEmArrasto) {
                conterFoto(fotoEmArrasto);
                memorizarPosicaoFoto(fotoEmArrasto);
                aplicarTransform();
            }
            fotoEmArrasto = null;
        }
        atualizarReferencias();
    }

    function touchMove(e) {
        if (Object.keys(ativos).length === 0) {
            return;
        }
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
                conterFoto(fotoEmArrasto, 0.35);
                velX = velX * 0.4 + mapDx * 0.6;
                velY = velY * 0.4 + mapDy * 0.6;
            } else {
                const target = getTargetPan();
                let resX = 1;
                let resY = 1;
                if ((panX < target.x && deltaX < 0) || (panX > target.x && deltaX > 0)) {
                    resX = 0.3;
                }
                if ((panY < target.y && deltaY < 0) || (panY > target.y && deltaY > 0)) {
                    resY = 0.3;
                }
                panX += deltaX * resX;
                panY += deltaY * resY;
                mapVelX = mapVelX * 0.4 + deltaX * 0.6;
                mapVelY = mapVelY * 0.4 + deltaY * 0.6;
            }
            refX = currX;
            refY = currY;
            aplicarTransform();
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
            mapVelX = mapVelX * 0.4 + deltaX * 0.6;
            mapVelY = mapVelY * 0.4 + deltaY * 0.6;
            if (ultimaDistancia > 0) {
                const zoomFactor = dAtual / ultimaDistancia;
                zoomNoPonto(currX, currY, zoomFactor);
                mapVelScale = mapVelScale * 0.4 + (zoomFactor - 1) * 0.6;
                lastZoomCX = currX;
                lastZoomCY = currY;
            }
            let deltaAngle = aAtual - ultimoAngulo;
            if (deltaAngle > Math.PI) {
                deltaAngle -= Math.PI * 2;
            }
            if (deltaAngle < -Math.PI) {
                deltaAngle += Math.PI * 2;
            }
            globalRotation += deltaAngle;
            mapVelRotation = mapVelRotation * 0.4 + deltaAngle * 0.6;
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
            aplicarTransform();
        }
    }

    function touchEnd(e) {
        for (const touch of e.changedTouches) {
            delete ativos[touch.identifier];
        }
        if (Object.keys(ativos).length === 0) {
            if (fotoEmArrasto) {
                iniciarInerciaFoto(fotoEmArrasto, velX, velY);
            } else {
                iniciarInerciaMapa();
            }
            fotoEmArrasto = null;
        }
        atualizarReferencias();
    }
    document.addEventListener('touchstart', touchStart, { passive: false });
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd, { passive: false });
    document.addEventListener('touchcancel', touchEnd, { passive: false });
    window.inicializarFotos = inicializarFotos;

    function redimensionar() {
        cancelAnimationFrame(inerciaAnimId);
        cancelAnimationFrame(mapInerciaAnimId);
        if (fotoEmArrasto) conterFoto(fotoEmArrasto);
        if (fotoEmInercia) conterFoto(fotoEmInercia);
        fotoEmArrasto = null;
        fotoEmInercia = null;
        ativos = {};
        const zoomInicial = Math.abs(scale - 1) < 0.0001 && Math.abs(globalRotation) < 0.0001;
        for (const foto of fotosCache) {
            foto.largura = foto.elemento.offsetWidth || 60;
            foto.altura = foto.elemento.offsetHeight || 60;
            if (zoomInicial) conterFoto(foto);
            memorizarPosicaoFoto(foto);
        }
        const target = getTargetPan();
        panX = target.x;
        panY = target.y;
        aplicarTransform();
    }
    window.addEventListener('resize', redimensionar);

    function desativarPagina() {
        cancelAnimationFrame(inerciaAnimId);
        cancelAnimationFrame(mapInerciaAnimId);
        if (fotoEmArrasto) conterFoto(fotoEmArrasto);
        if (fotoEmInercia) conterFoto(fotoEmInercia);
        fotosCache.forEach(memorizarPosicaoFoto);
        fotoEmInercia = null;
        window.removeEventListener('resize', redimensionar);
        document.removeEventListener('touchstart', touchStart);
        document.removeEventListener('touchmove', touchMove);
        document.removeEventListener('touchend', touchEnd);
        document.removeEventListener('touchcancel', touchEnd);
        document.removeEventListener('margot:page-leave', desativarPagina);
        if (window.inicializarFotos === inicializarFotos) {
            delete window.inicializarFotos;
        }
        document.querySelectorAll('.foto').forEach((foto) => {
            foto.remove();
        });
        ativos = {};
        fotosCache = [];
    }
    document.addEventListener('margot:page-leave', desativarPagina);
})();