let dedos = {};

let scale = 1;
let panX = 0;
let panY = 0;

let ultimaDistancia = null;
let ultimoCentro = null;

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const FOTO_ZOOM_INTENSIDADE = 0.25;

function getDedosArray() {
    return Object.values(dedos);
}

function distancia(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.sqrt(dx * dx + dy * dy);
}

function centro(a, b) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
    };
}

function limitarScale(valor) {
    return Math.max(MIN_SCALE, Math.min(valor, MAX_SCALE));
}

function aplicarTransform() {
    $('.foto').each(function() {
        const topOriginal = Number($(this).attr('data-top'));
        const leftOriginal = Number($(this).attr('data-left'));

        const fotoScale = 1 + (scale - 1) * FOTO_ZOOM_INTENSIDADE;

        $(this).css({
            position: 'absolute',

            left: (leftOriginal * scale + panX) + 'px',
            top: (topOriginal * scale + panY) + 'px',

            transform: `scale(${fotoScale})`,
            transformOrigin: 'center center'
        });
    });
}

function zoomNoPonto(screenX, screenY, zoomFactor) {
    const scaleAntes = scale;

    const novoScale = limitarScale(scale * zoomFactor);
    const realZoomFactor = novoScale / scaleAntes;

    scale = novoScale;

    panX = screenX - (screenX - panX) * realZoomFactor;
    panY = screenY - (screenY - panY) * realZoomFactor;
}

function touchStart(e) {
    e.preventDefault();

    for (const touch of e.changedTouches) {
        dedos[touch.identifier] = {
            x: touch.clientX,
            y: touch.clientY
        };
    }

    const lista = getDedosArray();

    if (lista.length === 2) {
        ultimaDistancia = distancia(lista[0], lista[1]);
        ultimoCentro = centro(lista[0], lista[1]);
    }
}

function touchMove(e) {
    e.preventDefault();

    const dedosAntes = JSON.parse(JSON.stringify(dedos));

    for (const touch of e.changedTouches) {
        dedos[touch.identifier] = {
            x: touch.clientX,
            y: touch.clientY
        };
    }

    const lista = getDedosArray();

    // 1 dedo = arrastar / pan
    if (lista.length === 1) {
        const id = Object.keys(dedos)[0];

        if (!dedosAntes[id]) return;

        const dx = dedos[id].x - dedosAntes[id].x;
        const dy = dedos[id].y - dedosAntes[id].y;

        panX += dx;
        panY += dy;

        aplicarTransform();
    }

    // 2 dedos = pinch zoom + pan
    if (lista.length === 2) {
        const dAtual = distancia(lista[0], lista[1]);
        const cAtual = centro(lista[0], lista[1]);

        if (ultimaDistancia !== null && ultimoCentro !== null) {
            const dxCentro = cAtual.x - ultimoCentro.x;
            const dyCentro = cAtual.y - ultimoCentro.y;

            // Primeiro: pan pelo movimento do centro dos dedos
            panX += dxCentro;
            panY += dyCentro;

            // Segundo: zoom no ponto médio atual dos dedos
            const zoomFactor = dAtual / ultimaDistancia;
            zoomNoPonto(cAtual.x, cAtual.y, zoomFactor);

            aplicarTransform();
        }

        ultimaDistancia = dAtual;
        ultimoCentro = cAtual;
    }
}

function touchEnd(e) {
    for (const touch of e.changedTouches) {
        delete dedos[touch.identifier];
    }

    const lista = getDedosArray();

    ultimaDistancia = null;
    ultimoCentro = null;

    if (lista.length === 2) {
        ultimaDistancia = distancia(lista[0], lista[1]);
        ultimoCentro = centro(lista[0], lista[1]);
    }
}

function touchCancel(e) {
    dedos = {};
    ultimaDistancia = null;
    ultimoCentro = null;
}

document.addEventListener("touchstart", touchStart, { passive: false });
document.addEventListener("touchmove", touchMove, { passive: false });
document.addEventListener("touchend", touchEnd, { passive: false });
document.addEventListener("touchcancel", touchCancel, { passive: false });