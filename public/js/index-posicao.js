let dedos = {};
let primeira_posicao = {}
let c = 0;

function atualizarDedos(e) {
    dedos = {};

    for (const touch of e.touches) {
        dedos[touch.identifier] = {
            x: touch.clientX,
            y: touch.clientY
        };
        if (c == 0) {
            primeira_posicao = {
                x: touch.clientX,
                y: touch.clientY
            }
        }
    }

    console.log(primeira_posicao);
    console.log(dedos);
}

function reloadVarC() {
    c = 0;
}

document.addEventListener("touchstart", atualizarDedos, { passive: false });
document.addEventListener("touchmove", atualizarDedos, { passive: false });
document.addEventListener("touchend", atualizarDedos, { passive: false });
document.addEventListener("touchend", reloadVarC, { passive: false });
document.addEventListener("touchcancel", atualizarDedos, { passive: false });