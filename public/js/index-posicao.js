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

let fotosCache = [];
let inicializacaoPendente = null;
let observerFotos = null;

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;

const FOTO_ZOOM_INTENSIDADE = 0.25;
const MIN_FOTO_SCALE = 0.45;

const SAFE_TOP = 10;
const SAFE_LEFT = 10;
const SAFE_RIGHT = 20;
const SAFE_BOTTOM = 120;

function obterNumeroAtributo(elemento, nome, valorPadrao) {
    const valor = Number(
        elemento.getAttribute(nome)
    );

    return Number.isFinite(valor)
        ? valor
        : valorPadrao;
}

function inicializarFotos() {
    if (inicializacaoPendente !== null) {
        cancelAnimationFrame(
            inicializacaoPendente
        );
    }

    inicializacaoPendente = requestAnimationFrame(
        function () {
            inicializacaoPendente = null;

            const elementos =
                document.querySelectorAll('.foto');

            fotosCache = Array.from(elementos).map(
                function (elemento) {
                    const top = obterNumeroAtributo(
                        elemento,
                        'data-top',
                        100
                    );

                    const left = obterNumeroAtributo(
                        elemento,
                        'data-left',
                        100
                    );

                    elemento.style.position = 'absolute';
                    elemento.style.top = '0px';
                    elemento.style.left = '0px';
                    elemento.style.margin = '0';
                    elemento.style.transformOrigin =
                        'center center';

                    return {
                        elemento: elemento,
                        top: top,
                        left: left,
                        rx: 0,
                        ry: 0
                    };
                }
            );

            aplicarTransform();
        }
    );
}

/*
 * O websocket.js chama esta função sempre que cria,
 * atualiza ou remove fotografias.
 */
window.inicializarFotos =
    inicializarFotos;

function distancia(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.sqrt(
        dx * dx + dy * dy
    );
}

function angulo(a, b) {
    return Math.atan2(
        b.y - a.y,
        b.x - a.x
    );
}

function limitarScale(valor) {
    return Math.max(
        MIN_SCALE,
        Math.min(valor, MAX_SCALE)
    );
}

function obterEscalaFoto() {
    if (scale < 1) {
        return Math.max(
            MIN_FOTO_SCALE,
            1 + (scale - 1) * 0.8
        );
    }

    return (
        1 +
        (scale - 1) *
        FOTO_ZOOM_INTENSIDADE
    );
}

function getTargetPan() {
    if (fotosCache.length === 0) {
        return {
            x: panX,
            y: panY
        };
    }

    let minLeft = Infinity;
    let maxLeft = -Infinity;
    let minTop = Infinity;
    let maxTop = -Infinity;

    const cosR =
        Math.cos(globalRotation);

    const sinR =
        Math.sin(globalRotation);

    for (const foto of fotosCache) {
        const ox =
            foto.left * scale;

        const oy =
            foto.top * scale;

        const rx =
            ox * cosR -
            oy * sinR;

        const ry =
            ox * sinR +
            oy * cosR;

        minLeft = Math.min(
            minLeft,
            rx
        );

        maxLeft = Math.max(
            maxLeft,
            rx
        );

        minTop = Math.min(
            minTop,
            ry
        );

        maxTop = Math.max(
            maxTop,
            ry
        );
    }

    const screenW =
        window.innerWidth;

    const screenH =
        window.innerHeight;

    const maxAllowedPanX =
        SAFE_LEFT - minLeft;

    const minAllowedPanX =
        (
            screenW -
            SAFE_RIGHT
        ) - maxLeft;

    const maxAllowedPanY =
        SAFE_TOP - minTop;

    const minAllowedPanY =
        (
            screenH -
            SAFE_BOTTOM
        ) - maxTop;

    let targetX = panX;
    let targetY = panY;

    if (
        minAllowedPanX <
        maxAllowedPanX
    ) {
        targetX = Math.max(
            minAllowedPanX,
            Math.min(
                panX,
                maxAllowedPanX
            )
        );
    } else {
        targetX =
            (
                minAllowedPanX +
                maxAllowedPanX
            ) / 2;
    }

    if (
        minAllowedPanY <
        maxAllowedPanY
    ) {
        targetY = Math.max(
            minAllowedPanY,
            Math.min(
                panY,
                maxAllowedPanY
            )
        );
    } else {
        targetY =
            (
                minAllowedPanY +
                maxAllowedPanY
            ) / 2;
    }

    return {
        x: targetX,
        y: targetY
    };
}

function aplicarTransform() {
    const cosR =
        Math.cos(globalRotation);

    const sinR =
        Math.sin(globalRotation);

    const fotoScale =
        obterEscalaFoto();

    for (const foto of fotosCache) {
        if (
            !foto.elemento ||
            !foto.elemento.isConnected
        ) {
            continue;
        }

        const ox =
            foto.left * scale;

        const oy =
            foto.top * scale;

        foto.rx =
            ox * cosR -
            oy * sinR;

        foto.ry =
            ox * sinR +
            oy * cosR;

        const posX =
            foto.rx + panX;

        const posY =
            foto.ry + panY;

        foto.elemento.style.transform =
            'translate3d(' +
            posX +
            'px, ' +
            posY +
            'px, 0) scale(' +
            fotoScale +
            ')';
    }
}

function zoomNoPonto(
    screenX,
    screenY,
    zoomFactor
) {
    const novoScale =
        limitarScale(
            scale * zoomFactor
        );

    const realZoomFactor =
        novoScale / scale;

    scale = novoScale;

    panX =
        screenX -
        (
            screenX -
            panX
        ) *
        realZoomFactor;

    panY =
        screenY -
        (
            screenY -
            panY
        ) *
        realZoomFactor;
}

function atualizarReferencias() {
    const chaves =
        Object.keys(ativos);

    if (chaves.length === 1) {
        refX =
            ativos[chaves[0]].x;

        refY =
            ativos[chaves[0]].y;

        return;
    }

    if (chaves.length === 2) {
        refX =
            (
                ativos[chaves[0]].x +
                ativos[chaves[1]].x
            ) / 2;

        refY =
            (
                ativos[chaves[0]].y +
                ativos[chaves[1]].y
            ) / 2;

        ultimaDistancia =
            distancia(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );

        ultimoAngulo =
            angulo(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );
    }
}

function guardarPosicaoFoto(foto) {
    if (
        !foto ||
        !foto.elemento
    ) {
        return;
    }

    foto.elemento.setAttribute(
        'data-left',
        String(foto.left)
    );

    foto.elemento.setAttribute(
        'data-top',
        String(foto.top)
    );
}

function enviarMovimentoFoto(
    deltaTop,
    deltaLeft
) {
    if (
        !window.AppWebSocket ||
        !window.AppWebSocket.isConnected()
    ) {
        return;
    }

    if (
        Math.abs(deltaTop) < 0.01 &&
        Math.abs(deltaLeft) < 0.01
    ) {
        return;
    }

    window.AppWebSocket.send({
        type: 'move',
        top: Math.round(deltaTop),
        left: Math.round(deltaLeft)
    });
}

function iniciarInerciaFoto(
    foto,
    velocidadeX,
    velocidadeY
) {
    cancelAnimationFrame(
        inerciaAnimId
    );

    const leftInicial =
        foto.left;

    const topInicial =
        foto.top;

    function animar() {
        velocidadeX *= 0.92;
        velocidadeY *= 0.92;

        if (
            Math.abs(velocidadeX) < 0.1 &&
            Math.abs(velocidadeY) < 0.1
        ) {
            guardarPosicaoFoto(
                foto
            );

            enviarMovimentoFoto(
                foto.top - topInicial,
                foto.left - leftInicial
            );

            return;
        }

        foto.left +=
            velocidadeX;

        foto.top +=
            velocidadeY;

        aplicarTransform();

        inerciaAnimId =
            requestAnimationFrame(
                animar
            );
    }

    animar();
}

function iniciarInerciaMapa() {
    cancelAnimationFrame(
        mapInerciaAnimId
    );

    function animar() {
        let moving = false;

        mapVelX *= 0.92;
        mapVelY *= 0.92;
        mapVelScale *= 0.88;
        mapVelRotation *= 0.88;

        panX += mapVelX;
        panY += mapVelY;
        globalRotation +=
            mapVelRotation;

        if (
            Math.abs(mapVelScale) >
            0.0001
        ) {
            zoomNoPonto(
                lastZoomCX,
                lastZoomCY,
                1 + mapVelScale
            );
        }

        if (
            Math.abs(mapVelRotation) >
            0.0001
        ) {
            const cosA =
                Math.cos(
                    mapVelRotation
                );

            const sinA =
                Math.sin(
                    mapVelRotation
                );

            const dx =
                panX -
                lastZoomCX;

            const dy =
                panY -
                lastZoomCY;

            panX =
                lastZoomCX +
                dx * cosA -
                dy * sinA;

            panY =
                lastZoomCY +
                dx * sinA +
                dy * cosA;
        }

        const target =
            getTargetPan();

        const dx =
            target.x - panX;

        const dy =
            target.y - panY;

        if (
            Math.abs(dx) > 0.5 ||
            Math.abs(dy) > 0.5
        ) {
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
            mapInerciaAnimId =
                requestAnimationFrame(
                    animar
                );
        }
    }

    animar();
}

function touchStart(evento) {
    const alvoInterativo =
        evento.target.closest(
            '.mini-menu, #menuPrincipal, #ativar-notificacoes, .notificacao-interna'
        );

    if (alvoInterativo) {
        return;
    }

    if (
        evento.target.closest('.foto') ||
        evento.target.id ===
            'mapa-container' ||
        evento.target.tagName
            .toLowerCase() ===
            'canvas'
    ) {
        evento.preventDefault();
    }

    cancelAnimationFrame(
        inerciaAnimId
    );

    cancelAnimationFrame(
        mapInerciaAnimId
    );

    velX = 0;
    velY = 0;

    mapVelX = 0;
    mapVelY = 0;
    mapVelScale = 0;
    mapVelRotation = 0;

    for (
        const touch of
        evento.changedTouches
    ) {
        ativos[touch.identifier] = {
            x: touch.clientX,
            y: touch.clientY
        };
    }

    const chaves =
        Object.keys(ativos);

    if (chaves.length === 1) {
        const alvoFoto =
            evento.target.closest(
                '.foto'
            );

        if (alvoFoto) {
            fotoEmArrasto =
                fotosCache.find(
                    function (foto) {
                        return (
                            foto.elemento ===
                            alvoFoto
                        );
                    }
                ) || null;
        } else {
            fotoEmArrasto = null;
        }
    } else {
        fotoEmArrasto = null;
    }

    atualizarReferencias();
}

function touchMove(evento) {
    if (
        Object.keys(ativos).length ===
        0
    ) {
        return;
    }

    evento.preventDefault();

    for (
        const touch of
        evento.changedTouches
    ) {
        if (
            ativos[
                touch.identifier
            ]
        ) {
            ativos[
                touch.identifier
            ].x = touch.clientX;

            ativos[
                touch.identifier
            ].y = touch.clientY;
        }
    }

    const chaves =
        Object.keys(ativos);

    if (chaves.length === 1) {
        const currX =
            ativos[chaves[0]].x;

        const currY =
            ativos[chaves[0]].y;

        const deltaX =
            currX - refX;

        const deltaY =
            currY - refY;

        if (fotoEmArrasto) {
            const invCos =
                Math.cos(
                    -globalRotation
                );

            const invSin =
                Math.sin(
                    -globalRotation
                );

            const mapDx =
                (
                    deltaX * invCos -
                    deltaY * invSin
                ) / scale;

            const mapDy =
                (
                    deltaX * invSin +
                    deltaY * invCos
                ) / scale;

            fotoEmArrasto.left +=
                mapDx;

            fotoEmArrasto.top +=
                mapDy;

            velX =
                velX * 0.4 +
                mapDx * 0.6;

            velY =
                velY * 0.4 +
                mapDy * 0.6;
        } else {
            const target =
                getTargetPan();

            let resistenciaX = 1;
            let resistenciaY = 1;

            if (
                (
                    panX < target.x &&
                    deltaX < 0
                ) ||
                (
                    panX > target.x &&
                    deltaX > 0
                )
            ) {
                resistenciaX = 0.3;
            }

            if (
                (
                    panY < target.y &&
                    deltaY < 0
                ) ||
                (
                    panY > target.y &&
                    deltaY > 0
                )
            ) {
                resistenciaY = 0.3;
            }

            panX +=
                deltaX *
                resistenciaX;

            panY +=
                deltaY *
                resistenciaY;

            mapVelX =
                mapVelX * 0.4 +
                deltaX * 0.6;

            mapVelY =
                mapVelY * 0.4 +
                deltaY * 0.6;
        }

        refX = currX;
        refY = currY;

        aplicarTransform();

        return;
    }

    if (chaves.length === 2) {
        fotoEmArrasto = null;

        const currX =
            (
                ativos[chaves[0]].x +
                ativos[chaves[1]].x
            ) / 2;

        const currY =
            (
                ativos[chaves[0]].y +
                ativos[chaves[1]].y
            ) / 2;

        const distanciaAtual =
            distancia(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );

        const anguloAtual =
            angulo(
                ativos[chaves[0]],
                ativos[chaves[1]]
            );

        const deltaX =
            currX - refX;

        const deltaY =
            currY - refY;

        panX += deltaX;
        panY += deltaY;

        mapVelX =
            mapVelX * 0.4 +
            deltaX * 0.6;

        mapVelY =
            mapVelY * 0.4 +
            deltaY * 0.6;

        if (ultimaDistancia > 0) {
            const zoomFactor =
                distanciaAtual /
                ultimaDistancia;

            zoomNoPonto(
                currX,
                currY,
                zoomFactor
            );

            mapVelScale =
                mapVelScale * 0.4 +
                (
                    zoomFactor - 1
                ) * 0.6;

            lastZoomCX = currX;
            lastZoomCY = currY;
        }

        let deltaAngle =
            anguloAtual -
            ultimoAngulo;

        if (deltaAngle > Math.PI) {
            deltaAngle -=
                Math.PI * 2;
        }

        if (deltaAngle < -Math.PI) {
            deltaAngle +=
                Math.PI * 2;
        }

        globalRotation +=
            deltaAngle;

        mapVelRotation =
            mapVelRotation * 0.4 +
            deltaAngle * 0.6;

        const cosA =
            Math.cos(deltaAngle);

        const sinA =
            Math.sin(deltaAngle);

        const dx =
            panX - currX;

        const dy =
            panY - currY;

        panX =
            currX +
            dx * cosA -
            dy * sinA;

        panY =
            currY +
            dx * sinA +
            dy * cosA;

        refX = currX;
        refY = currY;

        ultimaDistancia =
            distanciaAtual;

        ultimoAngulo =
            anguloAtual;

        aplicarTransform();
    }
}

function touchEnd(evento) {
    for (
        const touch of
        evento.changedTouches
    ) {
        delete ativos[
            touch.identifier
        ];
    }

    if (
        Object.keys(ativos).length ===
        0
    ) {
        if (fotoEmArrasto) {
            if (
                Math.abs(velX) > 0.5 ||
                Math.abs(velY) > 0.5
            ) {
                iniciarInerciaFoto(
                    fotoEmArrasto,
                    velX,
                    velY
                );
            } else {
                guardarPosicaoFoto(
                    fotoEmArrasto
                );
            }
        }

        iniciarInerciaMapa();

        fotoEmArrasto = null;
    }

    atualizarReferencias();
}

function observarNovasFotografias() {
    if (
        observerFotos ||
        !document.body
    ) {
        return;
    }

    observerFotos =
        new MutationObserver(
            function (mutacoes) {
                let encontrouAlteracao =
                    false;

                for (
                    const mutacao of
                    mutacoes
                ) {
                    if (
                        mutacao.type !==
                        'childList'
                    ) {
                        continue;
                    }

                    for (
                        const node of
                        mutacao.addedNodes
                    ) {
                        if (
                            node.nodeType !==
                            Node.ELEMENT_NODE
                        ) {
                            continue;
                        }

                        if (
                            node.matches?.('.foto') ||
                            node.querySelector?.('.foto')
                        ) {
                            encontrouAlteracao =
                                true;

                            break;
                        }
                    }

                    for (
                        const node of
                        mutacao.removedNodes
                    ) {
                        if (
                            node.nodeType !==
                            Node.ELEMENT_NODE
                        ) {
                            continue;
                        }

                        if (
                            node.matches?.('.foto') ||
                            node.querySelector?.('.foto')
                        ) {
                            encontrouAlteracao =
                                true;

                            break;
                        }
                    }

                    if (encontrouAlteracao) {
                        break;
                    }
                }

                if (encontrouAlteracao) {
                    inicializarFotos();
                }
            }
        );

    observerFotos.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );
}

document.addEventListener(
    'touchstart',
    touchStart,
    {
        passive: false
    }
);

document.addEventListener(
    'touchmove',
    touchMove,
    {
        passive: false
    }
);

document.addEventListener(
    'touchend',
    touchEnd,
    {
        passive: false
    }
);

document.addEventListener(
    'touchcancel',
    touchEnd,
    {
        passive: false
    }
);

window.addEventListener(
    'resize',
    function () {
        aplicarTransform();
    }
);

window.addEventListener(
    'pageshow',
    function () {
        inicializarFotos();
    }
);

document.addEventListener(
    'visibilitychange',
    function () {
        if (
            document.visibilityState ===
            'visible'
        ) {
            inicializarFotos();
        }
    }
);

if (
    document.readyState ===
    'loading'
) {
    document.addEventListener(
        'DOMContentLoaded',
        function () {
            observarNovasFotografias();
            inicializarFotos();
        }
    );
} else {
    observarNovasFotografias();
    inicializarFotos();
}