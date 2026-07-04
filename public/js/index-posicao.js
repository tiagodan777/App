var dedos = {};

window.document.addEventListener('pointerdown', function(e) {
    dedos[e.pointerId] = {
        x: e.clientX,
        y: e.clientY
    };

    console.log(dedos);
});

window.document.addEventListener('pointerup', function(e) {
    delete dedos[e.pointerId]
});