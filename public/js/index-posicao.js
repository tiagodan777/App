(() => {
    'use strict';

    if (!document.getElementById('gridCanvas')) return;

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
    let paginaAtiva = true;
    let visualFrame = null;
    let ultimoFrame = 0;
    let tempoVisual = 0;
    let regresso = null;
    let area = null;

    const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)');
    const miniMenu = document.querySelector('.mini-menu');
    const viewport = window.visualViewport;
    const safeArea = document.createElement('div');

    safeArea.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
        'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';

    document.body.appendChild(safeArea);

    function clamp(valor, min, max) {
        return Math.max(min, Math.min(valor, max));
    }

    function atualizarArea() {
        const estilo = getComputedStyle(safeArea);
        const x = viewport?.offsetLeft || 0;
        const y = viewport?.offsetTop || 0;
        const w = viewport?.width || window.innerWidth;
        const h = viewport?.height || window.innerHeight;
        const menu = document.getElementById('menuPrincipal')?.getBoundingClientRect();

        area = {
            left: x + Math.max(SAFE_LEFT, parseFloat(estilo.paddingLeft) || 0),
            top: y + Math.max(SAFE_TOP, (parseFloat(estilo.paddingTop) || 0) + 12),
            right: x + w - Math.max(SAFE_RIGHT, parseFloat(estilo.paddingRight) || 0),
            bottom: y + h - Math.max(
                SAFE_BOTTOM,
                (parseFloat(estilo.paddingBottom) || 0) + 76
            )
        };

        if (menu?.height > 0 && menu.top > area.top && menu.top < area.bottom) {
            area.bottom = menu.top - 12;
        }
    }

    function escalaFoto() {
        return scale < 1
            ? Math.max(MIN_FOTO_SCALE, 1 + (scale - 1) * 0.8)
            : 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;
    }

    function limitesFoto(foto, margem = 0) {
        const zoom = escalaFoto();
        const extraX = foto.largura * (zoom - 1) / 2;
        const extraY = foto.altura * (zoom - 1) / 2;

        let minX = area.left + extraX + margem;
        let maxX = area.right - foto.largura - extraX - margem;
        let minY = area.top + extraY + margem;
        let maxY = area.bottom - foto.altura - extraY - margem;

        if (maxX < minX) minX = maxX = (minX + maxX) / 2;
        if (maxY < minY) minY = maxY = (minY + maxY) / 2;

        return { minX, maxX, minY, maxY };
    }

    function noEcra(foto) {
        const cos = Math.cos(globalRotation);
        const sin = Math.sin(globalRotation);

        return {
            x: (foto.left * cos - foto.top * sin) * scale + panX,
            y: (foto.left * sin + foto.top * cos) * scale + panY
        };
    }

    function noMapa(x, y) {
        const cos = Math.cos(globalRotation);
        const sin = Math.sin(globalRotation);
        const dx = x - panX;
        const dy = y - panY;

        return {
            left: (dx * cos + dy * sin) / scale,
            top: (-dx * sin + dy * cos) / scale
        };
    }

    // Pesquisa limitada, apenas nas entradas e nos regressos ao ecrã.
    function escolherPosicao(foto, colocadas) {
        const b = limitesFoto(foto, 7);
        const preferida = noEcra(foto);
        let melhor = null;

        function avaliar(x, y) {
            let separacao = Infinity;

            for (const outra of colocadas) {
                const p = noEcra(outra);
                const dx = x + foto.largura / 2 - p.x - outra.largura / 2;
                const dy = y + foto.altura / 2 - p.y - outra.altura / 2;
                const espaco = (
                    Math.max(foto.largura, foto.altura) +
                    Math.max(outra.largura, outra.altura)
                ) * escalaFoto() / 2 + 12;

                separacao = Math.min(separacao, Math.hypot(dx, dy) / espaco);
            }

            const distancia = Math.hypot(x - preferida.x, y - preferida.y);
            const qualidade = Math.min(1, separacao);

            if (
                !melhor ||
                qualidade > melhor.qualidade ||
                (qualidade === melhor.qualidade && distancia < melhor.distancia)
            ) {
                melhor = { x, y, qualidade, distancia };
            }
        }

        avaliar(
            clamp(preferida.x, b.minX, b.maxX),
            clamp(preferida.y, b.minY, b.maxY)
        );

        if (melhor.qualidade < 1) {
            for (let linha = 0; linha <= 10; linha++) {
                for (let coluna = 0; coluna <= 6; coluna++) {
                    avaliar(
                        b.minX + (b.maxX - b.minX) * coluna / 6,
                        b.minY + (b.maxY - b.minY) * linha / 10
                    );
                }
            }
        }

        return noMapa(melhor.x, melhor.y);
    }

    function emMovimento() {
        return Object.keys(ativos).length > 0 ||
            fotoEmInercia !== null ||
            inerciaAnimId !== null ||
            mapInerciaAnimId !== null;
    }

    function sobreposto() {
        return mapaBloqueado() ||
            document.body.classList.contains('margot-mini-menu-aberto') ||
            miniMenu?.getAttribute('aria-hidden') === 'false';
    }

    function reagir(origem, dx, dy) {
        if (movimentoReduzido.matches) return;

        const p = noEcra(origem);

        for (const foto of fotosCache) {
            if (
                foto === origem ||
                foto === fotoEmArrasto ||
                foto === fotoEmInercia
            ) {
                continue;
            }

            const q = noEcra(foto);
            const peso = 0.10 +
                0.24 * Math.exp(-Math.hypot(q.x - p.x, q.y - p.y) / 240);

            foto.vx = clamp(
                foto.vx + clamp(dx, -40, 40) * peso * 12,
                -100,
                100
            );

            foto.vy = clamp(
                foto.vy + clamp(dy, -40, 40) * peso * 12,
                -100,
                100
            );
        }

        iniciarVisual();
    }

    function garantirVisiveis() {
        if (
            !paginaAtiva ||
            document.hidden ||
            sobreposto() ||
            emMovimento() ||
            regresso
        ) {
            return;
        }

        const colocadas = [];
        const fora = [];

        for (const foto of fotosCache) {
            const p = noEcra(foto);
            const b = limitesFoto(foto, 7);

            if (
                p.x < b.minX - 0.5 ||
                p.x > b.maxX + 0.5 ||
                p.y < b.minY - 0.5 ||
                p.y > b.maxY + 0.5
            ) {
                fora.push(foto);
            } else {
                colocadas.push(foto);
            }
        }

        const ajustes = fora.map(foto => {
            const destino = escolherPosicao(foto, colocadas);
            colocadas.push({ ...foto, ...destino });

            return {
                foto,
                left: foto.left,
                top: foto.top,
                destino
            };
        });

        if (!ajustes.length) return;

        if (movimentoReduzido.matches) {
            for (const a of ajustes) {
                Object.assign(a.foto, a.destino);
                memorizarPosicaoFoto(a.foto);
            }

            aplicarTransform();
        } else {
            regresso = { inicio: null, ajustes };
            iniciarVisual();
        }
    }

    function iniciarVisual() {
        if (
            !paginaAtiva ||
            document.hidden ||
            sobreposto() ||
            !fotosCache.length ||
            visualFrame !== null ||
            (movimentoReduzido.matches && !regresso)
        ) {
            return;
        }

        visualFrame = requestAnimationFrame(animarVisual);
    }

    function animarVisual(now) {
        visualFrame = null;

        if (!paginaAtiva || document.hidden || sobreposto()) {
            ultimoFrame = 0;
            return;
        }

        if (ultimoFrame && now - ultimoFrame < 1000 / 30 - 1) {
            iniciarVisual();
            return;
        }

        const dt = ultimoFrame
            ? Math.min((now - ultimoFrame) / 1000, 0.05)
            : 1 / 30;

        ultimoFrame = now;
        tempoVisual += dt;

        if (regresso) {
            if (regresso.inicio === null) regresso.inicio = now;

            const t = clamp((now - regresso.inicio) / 300, 0, 1);
            const ease = 1 - Math.pow(1 - t, 3);

            for (const a of regresso.ajustes) {
                a.foto.left = a.left + (a.destino.left - a.left) * ease;
                a.foto.top = a.top + (a.destino.top - a.top) * ease;
            }

            if (t === 1) {
                for (const a of regresso.ajustes) {
                    memorizarPosicaoFoto(a.foto);
                }

                regresso = null;
            }
        }

        const movimento = emMovimento();

        for (const foto of fotosCache) {
            if (foto === fotoEmArrasto || foto === fotoEmInercia) continue;

            foto.vx += (-foto.reacaoX * 45 - foto.vx * 12) * dt;
            foto.vy += (-foto.reacaoY * 45 - foto.vy * 12) * dt;
            foto.reacaoX = clamp(foto.reacaoX + foto.vx * dt, -22, 22);
            foto.reacaoY = clamp(foto.reacaoY + foto.vy * dt, -22, 22);

            if (!movimento && !movimentoReduzido.matches) {
                const t = tempoVisual * foto.ritmo;

                const x = 3 * Math.sin(t + foto.fase) +
                    1.5 * Math.sin(t * 0.61 + foto.fase * 2);

                const y = 3 * Math.cos(t * 0.83 + foto.fase) +
                    1.5 * Math.sin(t * 0.47 + foto.fase);

                foto.oscX += (x - foto.oscX) * Math.min(1, dt * 3);
                foto.oscY += (y - foto.oscY) * Math.min(1, dt * 3);
            }
        }

        aplicarTransform();
        iniciarVisual();
    }

    function absorverDeslocamento(foto) {
        if (!foto) return;

        const p = noEcra(foto);
        const destino = noMapa(p.x + foto.visualX, p.y + foto.visualY);

        Object.assign(foto, destino);

        foto.oscX = foto.oscY = foto.reacaoX = foto.reacaoY = 0;
        foto.visualX = foto.visualY = foto.vx = foto.vy = 0;
    }

    function memorizarPosicaoFoto(foto) {
        if (!foto || !foto.elemento) return;

        foto.elemento.setAttribute('data-left', String(foto.left));
        foto.elemento.setAttribute('data-top', String(foto.top));

        window.dispatchEvent(
            new CustomEvent('margot:photo-position-changed', {
                detail: {
                    id: String(
                        foto.elemento.getAttribute('data-membro-id') ||
                        foto.elemento.id ||
                        ''
                    ),
                    left: foto.left,
                    top: foto.top
                }
            })
        );
    }

    function inicializarFotos() {
        atualizarArea();
        regresso = null;

        const anteriores = new Map(
            fotosCache.map(foto => [foto.elemento, foto])
        );

        fotosCache = Array.from(document.querySelectorAll('.foto')).map(el => {
            el.style.position = 'absolute';
            el.style.top = el.style.left = '0px';
            el.style.transformOrigin = 'center center';

            const foto = anteriores.get(el) || {
                elemento: el,
                top: Number(el.getAttribute('data-top')) || 0,
                left: Number(el.getAttribute('data-left')) || 0,
                fase: Math.random() * Math.PI * 2,
                ritmo: 0.45 + Math.random() * 0.25,
                oscX: 0,
                oscY: 0,
                reacaoX: 0,
                reacaoY: 0,
                visualX: 0,
                visualY: 0,
                vx: 0,
                vy: 0
            };

            foto.largura = el.offsetWidth || 60;
            foto.altura = el.offsetHeight || 60;

            return foto;
        });

        const colocadas = fotosCache.filter(
            foto => anteriores.has(foto.elemento)
        );

        for (const foto of fotosCache) {
            if (!anteriores.has(foto.elemento)) {
                Object.assign(foto, escolherPosicao(foto, colocadas));
                colocadas.push(foto);
                memorizarPosicaoFoto(foto);
            }
        }

        if (fotoEmInercia && !fotosCache.includes(fotoEmInercia)) {
            cancelAnimationFrame(inerciaAnimId);
            inerciaAnimId = null;
            fotoEmInercia = null;
        }

        if (fotoEmArrasto && !fotosCache.includes(fotoEmArrasto)) {
            fotoEmArrasto = null;
        }

        for (const [el, foto] of anteriores) {
            if (!el.isConnected) {
                reagir(
                    foto,
                    Math.cos(foto.fase) * 16,
                    Math.sin(foto.fase) * 16
                );
            }
        }

        aplicarTransform();
        garantirVisiveis();
        iniciarVisual();

        if (!fotosCache.length) {
            cancelAnimationFrame(visualFrame);
            visualFrame = null;
        }
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

    function getTargetPan() {
        if (fotosCache.length === 0) {
            return { x: panX, y: panY };
        }

        let minLeft = Infinity;
        let maxLeft = -Infinity;
        let minTop = Infinity;
        let maxTop = -Infinity;

        const cosR = Math.cos(globalRotation);
        const sinR = Math.sin(globalRotation);

        for (const foto of fotosCache) {
            const ox = foto.left * scale;
            const oy = foto.top * scale;
            const rx = ox * cosR - oy * sinR;
            const ry = ox * sinR + oy * cosR;

            minLeft = Math.min(minLeft, rx);
            maxLeft = Math.max(maxLeft, rx);
            minTop = Math.min(minTop, ry);
            maxTop = Math.max(maxTop, ry);
        }

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const maxAllowedPanX = SAFE_LEFT - minLeft;
        const minAllowedPanX = screenW - SAFE_RIGHT - maxLeft;
        const maxAllowedPanY = SAFE_TOP - minTop;
        const minAllowedPanY = screenH - SAFE_BOTTOM - maxTop;

        let targetX = panX;
        let targetY = panY;

        if (minAllowedPanX < maxAllowedPanX) {
            targetX = Math.max(
                minAllowedPanX,
                Math.min(panX, maxAllowedPanX)
            );
        } else {
            targetX = (minAllowedPanX + maxAllowedPanX) / 2;
        }

        if (minAllowedPanY < maxAllowedPanY) {
            targetY = Math.max(
                minAllowedPanY,
                Math.min(panY, maxAllowedPanY)
            );
        } else {
            targetY = (minAllowedPanY + maxAllowedPanY) / 2;
        }

        return { x: targetX, y: targetY };
    }

    function aplicarTransform() {
        const cosR = Math.cos(globalRotation);
        const sinR = Math.sin(globalRotation);

        const fotoScale = scale < 1
            ? Math.max(MIN_FOTO_SCALE, 1 + (scale - 1) * 0.8)
            : 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;

        for (const foto of fotosCache) {
            const ox = foto.left * scale;
            const oy = foto.top * scale;

            foto.rx = ox * cosR - oy * sinR;
            foto.ry = ox * sinR + oy * cosR;

            const baseX = foto.rx + panX;
            const baseY = foto.ry + panY;

            let posX = baseX + foto.oscX + foto.reacaoX;
            let posY = baseY + foto.oscY + foto.reacaoY;

            if (!emMovimento() && !regresso && area) {
                const b = limitesFoto(foto);

                if (baseX >= b.minX && baseX <= b.maxX) {
                    posX = clamp(posX, b.minX, b.maxX);
                }

                if (baseY >= b.minY && baseY <= b.maxY) {
                    posY = clamp(posY, b.minY, b.maxY);
                }
            }

            foto.visualX = posX - baseX;
            foto.visualY = posY - baseY;

            foto.elemento.style.transform =
                `translate3d(${posX}px, ${posY}px, 0) scale(${fotoScale})`;
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
            ultimaDistancia = distancia(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );
            ultimoAngulo = angulo(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );
        }
    }

    function iniciarInerciaFoto(foto, vx, vy) {
        fotoEmInercia = foto;

        function animar() {
            vx *= 0.92;
            vy *= 0.92;

            if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
                memorizarPosicaoFoto(foto);
                fotoEmInercia = null;
                inerciaAnimId = null;
                garantirVisiveis();
                return;
            }

            foto.left += vx;
            foto.top += vy;
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
                zoomNoPonto(
                    lastZoomCX,
                    lastZoomCY,
                    1 + mapVelScale
                );
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

            aplicarTransform();

            if (moving) {
                mapInerciaAnimId = requestAnimationFrame(animar);
            } else {
                mapInerciaAnimId = null;
                garantirVisiveis();
            }
        }

        animar();
    }

    function limparGestosMapa() {
        cancelAnimationFrame(inerciaAnimId);
        cancelAnimationFrame(mapInerciaAnimId);

        if (fotoEmInercia) {
            memorizarPosicaoFoto(fotoEmInercia);
        }

        if (fotoEmArrasto && fotoEmArrasto !== fotoEmInercia) {
            memorizarPosicaoFoto(fotoEmArrasto);
        }

        ativos = {};
        fotoEmArrasto = fotoEmInercia = null;
        inerciaAnimId = mapInerciaAnimId = null;
        refX = refY = ultimaDistancia = ultimoAngulo = 0;
        velX = velY = mapVelX = mapVelY = mapVelScale = mapVelRotation = 0;
        regresso = null;

        // Conserva o zoom, a rotação e as posições atuais.
    }

    function mapaBloqueado() {
        return Boolean(document.querySelector('dialog[open]'));
    }

    function temToqueDoMapa(e) {
        return Array.from(e.changedTouches).some(
            touch => ativos[touch.identifier]
        );
    }

    function touchStart(e) {
        const alvo = e.target instanceof Element
            ? e.target
            : e.target.parentElement;

        if (
            mapaBloqueado() ||
            !alvo ||
            alvo.closest(
                'dialog, .mini-menu, #menuPrincipal, ' +
                '#estado-ligacao, #ativar-notificacoes'
            )
        ) {
            limparGestosMapa();
            return;
        }

        regresso = null;

        const presentes = new Set(
            Array.from(e.touches, touch => String(touch.identifier))
        );

        if (Object.keys(ativos).some(id => !presentes.has(id))) {
            limparGestosMapa();
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
        inerciaAnimId = mapInerciaAnimId = null;

        if (fotoEmInercia) {
            memorizarPosicaoFoto(fotoEmInercia);
            fotoEmInercia = null;
        }

        velX = 0;
        velY = 0;
        mapVelX = 0;
        mapVelY = 0;
        mapVelScale = 0;
        mapVelRotation = 0;

        for (const touch of e.changedTouches) {
            ativos[touch.identifier] = {
                x: touch.clientX,
                y: touch.clientY
            };
        }

        const chaves = Object.keys(ativos);

        if (chaves.length === 1) {
            const alvoFoto = e.target.closest('.foto');

            if (alvoFoto) {
                fotoEmArrasto = fotosCache.find(
                    foto => foto.elemento === alvoFoto
                ) || null;

                absorverDeslocamento(fotoEmArrasto);
            } else {
                fotoEmArrasto = null;
            }
        } else {
            fotoEmArrasto = null;
        }

        atualizarReferencias();
    }

    function touchMove(e) {
        if (mapaBloqueado()) {
            limparGestosMapa();
            return;
        }

        if (!temToqueDoMapa(e)) return;

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

                reagir(fotoEmArrasto, deltaX, deltaY);

                velX = velX * 0.4 + mapDx * 0.6;
                velY = velY * 0.4 + mapDy * 0.6;
            } else {
                const target = getTargetPan();

                let resX = 1;
                let resY = 1;

                if (
                    (panX < target.x && deltaX < 0) ||
                    (panX > target.x && deltaX > 0)
                ) {
                    resX = 0.3;
                }

                if (
                    (panY < target.y && deltaY < 0) ||
                    (panY > target.y && deltaY > 0)
                ) {
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
            const dAtual = distancia(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );
            const aAtual = angulo(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );

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
        if (mapaBloqueado()) {
            limparGestosMapa();
            return;
        }

        if (!temToqueDoMapa(e)) return;

        for (const touch of e.changedTouches) {
            delete ativos[touch.identifier];
        }

        if (Object.keys(ativos).length === 0) {
            if (fotoEmArrasto) {
                if (Math.abs(velX) > 0.5 || Math.abs(velY) > 0.5) {
                    iniciarInerciaFoto(fotoEmArrasto, velX, velY);
                } else {
                    memorizarPosicaoFoto(fotoEmArrasto);
                }
            }

            iniciarInerciaMapa();
            fotoEmArrasto = null;
        }

        atualizarReferencias();
        garantirVisiveis();
    }

    function suspenderVisual() {
        cancelAnimationFrame(visualFrame);
        visualFrame = null;
        ultimoFrame = 0;
    }

    function atualizarSobreposicoes() {
        limparGestosMapa();
        suspenderVisual();

        if (!document.hidden && !sobreposto()) {
            atualizarArea();
            garantirVisiveis();
            iniciarVisual();
        }
    }

    function cancelarToques() {
        limparGestosMapa();
        garantirVisiveis();
    }

    function redimensionar() {
        limparGestosMapa();
        atualizarArea();
        garantirVisiveis();
        iniciarVisual();
    }

    function mudarPreferencia() {
        suspenderVisual();

        for (const foto of fotosCache) {
            absorverDeslocamento(foto);
        }

        regresso = null;
        garantirVisiveis();
        aplicarTransform();
        iniciarVisual();
    }

    document.addEventListener('touchstart', touchStart, { passive: false });
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd, { passive: false });
    document.addEventListener('touchcancel', cancelarToques, { passive: true });
    document.addEventListener('margot:daylie-visibility', limparGestosMapa);
    document.addEventListener('visibilitychange', atualizarSobreposicoes);

    window.addEventListener('blur', atualizarSobreposicoes);
    window.addEventListener('resize', redimensionar, { passive: true });

    viewport?.addEventListener('resize', redimensionar, { passive: true });
    movimentoReduzido.addEventListener('change', mudarPreferencia);

    const dialogObserver = new MutationObserver(atualizarSobreposicoes);

    document.querySelectorAll('dialog').forEach(dialog => {
        dialogObserver.observe(dialog, {
            attributes: true,
            attributeFilter: ['open']
        });
    });

    if (miniMenu) {
        dialogObserver.observe(miniMenu, {
            attributes: true,
            attributeFilter: ['aria-hidden']
        });
    }

    // O WebSocket insere as fotos no body. Posiciona-as antes da primeira pintura.
    const fotosObserver = new MutationObserver(records => {
        if (!paginaAtiva) return;

        const mudou = records.some(record =>
            [...record.addedNodes, ...record.removedNodes].some(
                node => node.nodeType === 1 && node.matches('.foto')
            )
        );

        if (mudou) inicializarFotos();
    });

    fotosObserver.observe(document.body, { childList: true });

    window.inicializarFotos = inicializarFotos;
    inicializarFotos();

    function desativarPagina() {
        paginaAtiva = false;

        suspenderVisual();
        limparGestosMapa();
        fotosCache.forEach(memorizarPosicaoFoto);

        document.removeEventListener('touchstart', touchStart);
        document.removeEventListener('touchmove', touchMove);
        document.removeEventListener('touchend', touchEnd);
        document.removeEventListener('touchcancel', cancelarToques);
        document.removeEventListener('margot:daylie-visibility', limparGestosMapa);
        document.removeEventListener('visibilitychange', atualizarSobreposicoes);

        window.removeEventListener('blur', atualizarSobreposicoes);
        window.removeEventListener('resize', redimensionar);

        viewport?.removeEventListener('resize', redimensionar);
        movimentoReduzido.removeEventListener('change', mudarPreferencia);

        dialogObserver.disconnect();
        fotosObserver.disconnect();
        safeArea.remove();

        document.removeEventListener('margot:page-leave', desativarPagina);

        if (window.inicializarFotos === inicializarFotos) {
            delete window.inicializarFotos;
        }

        document.querySelectorAll('.foto').forEach(foto => foto.remove());
        fotosCache = [];
    }

    document.addEventListener('margot:page-leave', desativarPagina);
})();