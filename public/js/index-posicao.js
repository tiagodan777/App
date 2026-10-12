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
                    avaliar(bounds.minX + (bounds.maxX -