let dedos = {};

function atualizarDedos(e) {
    dedos = {};

    for (const touch of e.touches) {
        dedos[touch.identifier] = {
            x: touch.clientX,
            y: touch.clientY
        };
    }

    console.log(dedos);
}

document.addEventListener("touchstart", atualizarDedos, { passive: false });
document.addEventListener("touchmove", atualizarDedos, { passive: false });
document.addEventListener("touchend", atualizarDedos, { passive: false });
document.addEventListener("touchcancel", atualizarDedos, { passive: false });