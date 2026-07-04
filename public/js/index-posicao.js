let dedos = {};

let scale = 1;
let panX = 0;
let panY = 0;

let ultimaDistancia = null;
let ultimoCentro = null;

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

function aplicarTransform() {
    $('.foto').css({
        transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
        transformOrigin: '0 0'
    });
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

    // 1 dedo = pan
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
            const zoomFactor = dAtual / ultimaDistancia;

            const antesScale = scale;
            scale *= zoomFactor;

            // limitar zoom
            scale = Math.max(0.3, Math.min(scale, 5));

            const realZoomFactor = scale / antesScale;

            // pan normal pelo movimento do centro dos dedos
            panX += cAtual.x - ultimoCentro.x;
            panY += cAtual.y - ultimoCentro.y;

            // corrigir para o zoom acontecer no centro dos dedos
            panX = cAtual.x - (cAtual.x - panX) * realZoomFactor;
            panY = cAtual.y - (cAtual.y - panY) * realZoomFactor;

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

    if (lista.length < 2) {
        ultimaDistancia = null;
        ultimoCentro = null;
    }

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