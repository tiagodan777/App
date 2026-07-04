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
            primeira_posicao[touch.identifier] = {
                x: touch.clientX,
                y: touch.clientY
            }
            c++;
        }
    }

    console.log('PRIMERIA POSIÇÃO');
    console.log(primeira_posicao);
    console.log('ATUAL');
    console.log(dedos);
}

function resetPrimeiraPos() {
    c = 0;
    primeira_posicao = {};
}

document.addEventListener("touchstart", atualizarDedos, { passive: false });
document.addEventListener("touchmove", atualizarDedos, { passive: false });
document.addEventListener("touchend", atualizarDedos, { passive: false });
document.addEventListener("touchend", resetPrimeiraPos, { passive: false });
document.addEventListener("touchcancel", atualizarDedos, { passive: false });