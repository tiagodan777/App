(function (window, document) {
    'use strict';

    const CHAVE_POSICOES = 'margot-mapa-posicoes-v1';
    const MIN_SCALE = 0.45;
    const MAX_SCALE = 3.5;
    const ZOOM_SENSIBILIDADE = 0.82;
    const ROTACAO_SENSIBILIDADE = 0.65;
    const ROTACAO_ZONA_MORTA = 0.035;
    const FOTO_ZOOM_INTENSIDADE = 0.25;
    const MIN_FOTO_SCALE = 0.45;
    const LIMITE_ARRASTO = 14;
    const ATRITO_MAPA = 0.955;
    const ATRITO_FOTO = 0.95;
    const SAFE_TOP = 10;
    const SAFE_LEFT = 10;
    const SAFE_RIGHT = 20;
    const SAFE_BOTTOM = 100;

    const ativos = new Map();
    const posicoes = carregarPosicoes();

    let fotosCache = [];
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let globalRotation = 0;
    let gesto = 'nenhum';
    let fotoEmArrasto = null;
    let arrastoConfirmado = false;
    let inicioX = 0;
    let inicioY = 0;
    let refX = 0;
    let refY = 0;
    let refTempo = 0;
    let velX = 0;
    let velY = 0;
    let pinch = null;
    let inerciaFotoId = 0;
    let inerciaMapaId = 0;

    function numero(valor, fallback = 0) {
        const resultado = Number(valor);
        return Number.isFinite(resultado) ? resultado : fallback;
    }

    function limitar(valor, minimo, maximo) {
        return Math.max(minimo, Math.min(valor, maximo));
    }

    function normalizarAngulo(valor) {
        while (valor > Math.PI) valor -= Math.PI * 2;
        while (valor < -Math.PI) valor += Math.PI * 2;
        return valor;
    }

    function distancia(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function angulo(a, b) {
        return Math.atan2(b.y - a.y, b.x - a.x);
    }

    function idDaFoto(elemento) {
        return String(elemento.dataset.membroId || elemento.id || '').trim();
    }

    function carregarPosicoes() {
        try {
            const guardadas = JSON.parse(localStorage.getItem(CHAVE_POSICOES) || '{}');
            return guardadas && typeof guardadas === 'object' ? guardadas : {};
        } catch (erro) {
            return {};
        }
    }

    function guardarPosicoes() {
        try {
            localStorage.setItem(CHAVE_POSICOES, JSON.stringify(posicoes));
        } catch (erro) {
            /* O mapa continua a funcionar mesmo se o armazenamento estiver bloqueado. */
        }
    }

    function guardarPosicao(foto) {
        if (!foto || !foto.id) return;
        posicoes[foto.id] = { top: foto.top, left: foto.left };
        foto.elemento.dataset.top = String(foto.top);
        foto.elemento.dataset.left = String(foto.left);
        guardarPosicoes();
    }

    function inicializarFotos() {
        const anteriores = new Map(fotosCache.map(function (foto) {
            return [foto.id, foto];
        }));

        let alterouPosicoes = false;
        fotosCache = Array.from(document.querySelectorAll('.foto')).map(function (elemento) {
            const id = idDaFoto(elemento);
            let foto = anteriores.get(id);

            if (!foto) {
                const guardada = posicoes[id];
                const top = guardada ? numero(guardada.top) : numero(elemento.dataset.top);
                const left = guardada ? numero(guardada.left) : numero(elemento.dataset.left);
                foto = { id: id, elemento: elemento, top: top, left: left };

                if (id && !guardada) {
                    posicoes[id] = { top: top, left: left };
                    alterouPosicoes = true;
                }
            } else {
                foto.elemento = elemento;
            }

            elemento.style.position = 'absolute';
            elemento.style.top = '0';
            elemento.style.left = '0';
            elemento.style.transformOrigin = 'center center';
            elemento.dataset.top = String(foto.top);
            elemento.dataset.left = String(foto.left);
            return foto;
        });

        if (alterouPosicoes) guardarPosicoes();
        aplicarTransform();
    }

    function aplicarTransform() {
        const cosR = Math.cos(globalRotation);
        const sinR = Math.sin(globalRotation);
        const fotoScale = scale < 1 ? Math.max(MIN_FOTO_SCALE, 1 + (scale - 1) * 0.8) : 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;

        fotosCache.forEach(function (foto) {
            const x = foto.left * scale;
            const y = foto.top * scale;
            const posX = x * cosR - y * sinR + panX;
            const posY = x * sinR + y * cosR + panY;
            foto.elemento.style.transform = 'translate3d(' + posX + 'px,' + posY + 'px,0) scale(' + fotoScale + ')';
        });
    }

    function targetPan() {
        if (!fotosCache.length) return { x: panX, y: panY };

        const cosR = Math.cos(globalRotation);
        const sinR = Math.sin(globalRotation);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        fotosCache.forEach(function (foto) {
            const x = foto.left * scale;
            const y = foto.top * scale;
            const rx = x * cosR - y * sinR;
            const ry = x * sinR + y * cosR;
            minX = Math.min(minX, rx);
            maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry);
            maxY = Math.max(maxY, ry);
        });

        const larguraDisponivel = window.innerWidth - SAFE_LEFT - SAFE_RIGHT;
        const alturaDisponivel = window.innerHeight - SAFE_TOP - SAFE_BOTTOM;
        let x = panX;
        let y = panY;

        if (maxX - minX > larguraDisponivel) x = limitar(panX, window.innerWidth - SAFE_RIGHT - maxX, SAFE_LEFT - minX);
        if (maxY - minY > alturaDisponivel) y = limitar(panY, window.innerHeight - SAFE_BOTTOM - maxY, SAFE_TOP - minY);
        return { x: x, y: y };
    }

    function resistenciaMapa(deltaX, deltaY) {
        const alvo = targetPan();
        const foraX = Math.abs(alvo.x - panX) > 0.5;
        const foraY = Math.abs(alvo.y - panY) > 0.5;
        return {
            x: deltaX * (foraX ? 0.35 : 1),
            y: deltaY * (foraY ? 0.35 : 1)
        };
    }

    function cancelarInercias() {
        cancelAnimationFrame(inerciaFotoId);
        cancelAnimationFrame(inerciaMapaId);
        inerciaFotoId = 0;
        inerciaMapaId = 0;
    }

    function velocidadeSuave(atual, delta, tempo) {
        const frameDelta = delta * 16.667 / limitar(tempo, 8, 40);
        return atual * 0.68 + frameDelta * 0.32;
    }

    function iniciarInerciaFoto(foto, velocidadeX, velocidadeY) {
        let anterior = performance.now();

        function animar(agora) {
            const frames = limitar((agora - anterior) / 16.667, 0.5, 2);
            anterior = agora;
            velocidadeX *= Math.pow(ATRITO_FOTO, frames);
            velocidadeY *= Math.pow(ATRITO_FOTO, frames);

            if (Math.hypot(velocidadeX, velocidadeY) < 0.08) {
                guardarPosicao(foto);
                return;
            }

            foto.left += velocidadeX * frames;
            foto.top += velocidadeY * frames;
            aplicarTransform();
            inerciaFotoId = requestAnimationFrame(animar);
        }

        inerciaFotoId = requestAnimationFrame(animar);
    }

    function iniciarInerciaMapa(velocidadeX, velocidadeY) {
        let anterior = performance.now();

        function animar(agora) {
            const frames = limitar((agora - anterior) / 16.667, 0.5, 2);
            anterior = agora;
            velocidadeX *= Math.pow(ATRITO_MAPA, frames);
            velocidadeY *= Math.pow(ATRITO_MAPA, frames);
            panX += velocidadeX * frames;
            panY += velocidadeY * frames;

            const alvo = targetPan();
            panX += (alvo.x - panX) * 0.12;
            panY += (alvo.y - panY) * 0.12;
            aplicarTransform();

            if (Math.hypot(velocidadeX, velocidadeY) > 0.08 || Math.abs(alvo.x - panX) > 0.5 || Math.abs(alvo.y - panY) > 0.5) {
                inerciaMapaId = requestAnimationFrame(animar);
            }
        }

        inerciaMapaId = requestAnimationFrame(animar);
    }

    function iniciarPinch() {
        const ids = Array.from(ativos.keys()).slice(0, 2);
        const a = ativos.get(ids[0]);
        const b = ativos.get(ids[1]);
        const centroX = (a.x + b.x) / 2;
        const centroY = (a.y + b.y) / 2;
        const cosR = Math.cos(-globalRotation);
        const sinR = Math.sin(-globalRotation);
        const dx = centroX - panX;
        const dy = centroY - panY;

        pinch = {
            ids: ids,
            distancia: Math.max(1, distancia(a, b)),
            angulo: angulo(a, b),
            scale: scale,
            rotacao: globalRotation,
            mundoX: (dx * cosR - dy * sinR) / scale,
            mundoY: (dx * sinR + dy * cosR) / scale
        };

        gesto = 'pinch';
        fotoEmArrasto = null;
        arrastoConfirmado = false;
        velX = 0;
        velY = 0;
    }

    function atualizarPinch() {
        if (!pinch) return;

        const a = ativos.get(pinch.ids[0]);
        const b = ativos.get(pinch.ids[1]);
        if (!a || !b) {
            iniciarPinch();
            return;
        }

        const centroX = (a.x + b.x) / 2;
        const centroY = (a.y + b.y) / 2;
        const proporcao = Math.pow(Math.max(0.01, distancia(a, b) / pinch.distancia), ZOOM_SENSIBILIDADE);
        let deltaAngulo = normalizarAngulo(angulo(a, b) - pinch.angulo);

        if (Math.abs(deltaAngulo) < ROTACAO_ZONA_MORTA) {
            deltaAngulo = 0;
        } else {
            deltaAngulo = Math.sign(deltaAngulo) * (Math.abs(deltaAngulo) - ROTACAO_ZONA_MORTA) * ROTACAO_SENSIBILIDADE;
        }

        scale = limitar(pinch.scale * proporcao, MIN_SCALE, MAX_SCALE);
        globalRotation = pinch.rotacao + deltaAngulo;

        const cosR = Math.cos(globalRotation);
        const sinR = Math.sin(globalRotation);
        const x = pinch.mundoX * scale;
        const y = pinch.mundoY * scale;
        panX = centroX - (x * cosR - y * sinR);
        panY = centroY - (x * sinR + y * cosR);
        aplicarTransform();
    }

    function prepararGestoUmToque(toque, alvo) {
        inicioX = toque.x;
        inicioY = toque.y;
        refX = toque.x;
        refY = toque.y;
        refTempo = performance.now();
        velX = 0;
        velY = 0;
        arrastoConfirmado = false;
        fotoEmArrasto = alvo ? fotosCache.find(function (foto) {
            return foto.elemento === alvo;
        }) || null : null;
        gesto = fotoEmArrasto ? 'foto' : 'mapa';
    }

    function alvoIgnorado(elemento) {
        return elemento.closest('.mini-menu, #menuPrincipal, #estado-ligacao, #ativar-notificacoes, .heys-area, .heys-abrir');
    }

    function touchStart(evento) {
        if (alvoIgnorado(evento.target)) return;
        cancelarInercias();

        Array.from(evento.changedTouches).forEach(function (toque) {
            ativos.set(toque.identifier, { x: toque.clientX, y: toque.clientY });
        });

        if (ativos.size >= 2) {
            iniciarPinch();
        } else {
            const toque = ativos.values().next().value;
            prepararGestoUmToque(toque, evento.target.closest('.foto'));
        }
    }

    function touchMove(evento) {
        if (!ativos.size || alvoIgnorado(evento.target)) return;

        Array.from(evento.changedTouches).forEach(function (toque) {
            if (ativos.has(toque.identifier)) ativos.set(toque.identifier, { x: toque.clientX, y: toque.clientY });
        });

        if (ativos.size >= 2) {
            evento.preventDefault();
            if (gesto !== 'pinch') iniciarPinch();
            atualizarPinch();
            return;
        }

        const toque = ativos.values().next().value;
        const totalX = toque.x - inicioX;
        const totalY = toque.y - inicioY;

        if (!arrastoConfirmado && Math.hypot(totalX, totalY) < LIMITE_ARRASTO) return;
        evento.preventDefault();

        if (!arrastoConfirmado) {
            arrastoConfirmado = true;
            refX = toque.x;
            refY = toque.y;
            refTempo = performance.now();
            return;
        }

        const agora = performance.now();
        const deltaX = toque.x - refX;
        const deltaY = toque.y - refY;
        const tempo = agora - refTempo;

        if (gesto === 'foto' && fotoEmArrasto) {
            const cosR = Math.cos(-globalRotation);
            const sinR = Math.sin(-globalRotation);
            const mapX = (deltaX * cosR - deltaY * sinR) / scale;
            const mapY = (deltaX * sinR + deltaY * cosR) / scale;
            fotoEmArrasto.left += mapX;
            fotoEmArrasto.top += mapY;
            velX = velocidadeSuave(velX, mapX, tempo);
            velY = velocidadeSuave(velY, mapY, tempo);
        } else {
            const delta = resistenciaMapa(deltaX, deltaY);
            panX += delta.x;
            panY += delta.y;
            velX = velocidadeSuave(velX, delta.x, tempo);
            velY = velocidadeSuave(velY, delta.y, tempo);
        }

        refX = toque.x;
        refY = toque.y;
        refTempo = agora;
        aplicarTransform();
    }

    function terminarToque(evento, cancelado) {
        Array.from(evento.changedTouches).forEach(function (toque) {
            ativos.delete(toque.identifier);
        });

        if (ativos.size >= 2) {
            iniciarPinch();
            return;
        }

        if (ativos.size === 1) {
            prepararGestoUmToque(ativos.values().next().value, null);
            return;
        }

        if (!cancelado && arrastoConfirmado && gesto === 'foto' && fotoEmArrasto) {
            if (Math.hypot(velX, velY) > 0.35) {
                iniciarInerciaFoto(fotoEmArrasto, limitar(velX, -24, 24), limitar(velY, -24, 24));
            } else {
                guardarPosicao(fotoEmArrasto);
            }
        } else if (!cancelado && arrastoConfirmado && gesto === 'mapa' && Math.hypot(velX, velY) > 0.35) {
            iniciarInerciaMapa(limitar(velX, -30, 30), limitar(velY, -30, 30));
        } else if (fotoEmArrasto && arrastoConfirmado) {
            guardarPosicao(fotoEmArrasto);
        }

        gesto = 'nenhum';
        fotoEmArrasto = null;
        arrastoConfirmado = false;
        pinch = null;
        velX = 0;
        velY = 0;
    }

    function wheel(evento) {
        if (alvoIgnorado(evento.target)) return;
        evento.preventDefault();
        cancelarInercias();

        const fator = Math.exp(-evento.deltaY * 0.0012);
        const novoScale = limitar(scale * fator, MIN_SCALE, MAX_SCALE);
        const fatorReal = novoScale / scale;
        scale = novoScale;
        panX = evento.clientX - (evento.clientX - panX) * fatorReal;
        panY = evento.clientY - (evento.clientY - panY) * fatorReal;
        aplicarTransform();
    }

    window.inicializarFotos = inicializarFotos;
    document.addEventListener('touchstart', touchStart, { passive: true });
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', function (evento) {
        terminarToque(evento, false);
    }, { passive: true });
    document.addEventListener('touchcancel', function (evento) {
        terminarToque(evento, true);
    }, { passive: true });
    document.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('resize', aplicarTransform, { passive: true });
    inicializarFotos();
})(window, document);