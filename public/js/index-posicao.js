document.addEventListener("touchmove", e => {

    for (const touch of e.touches) {
        console.log(
            touch.identifier,
            touch.clientX,
            touch.clientY
        );
    }

});