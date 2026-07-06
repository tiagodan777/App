$(function () {

    const $menu = $('.mini-menu');

    let aberto = false;
    let draggingMenu = false;

    let startY = 0;
    let currentY = 0;
    let startTime = 0;

    let fotoStartX = 0;
    let fotoStartY = 0;
    let fotoStartTime = 0;

    function abrirMenu() {
        aberto = true;
        draggingMenu = false;

        $menu.css({
            position: 'fixed',
            left: '0',
            bottom: '0',
            transform: 'translateY(0%)',
            transition: 'transform 0.5s cubic-bezier(.2,.8,.2,1)'
        });
    }

    function fecharMenu() {
        aberto = false;
        draggingMenu = false;

        $menu.css({
            transform: 'translateY(100%)',
            transition: 'transform 0.3s cubic-bezier(.4,0,1,1)'
        });
    }

    function voltarMenu() {
        $menu.css({
            transform: 'translateY(0%)',
            transition: 'transform 0.3s cubic-bezier(.2,.8,.2,1)'
        });
    }

    // Guarda onde o dedo começou na foto
    $(document).on('pointerdown', '.foto', function (e) {
        fotoStartX = e.clientX;
        fotoStartY = e.clientY;
        fotoStartTime = Date.now();

        e.stopPropagation();
    });

    // Abre só se foi TAP, não arrasto
    $(document).on('pointerup', '.foto', function (e) {
        const diffX = Math.abs(e.clientX - fotoStartX);
        const diffY = Math.abs(e.clientY - fotoStartY);
        const time = Date.now() - fotoStartTime;

        const foiTap = diffX < 12 && diffY < 12 && time < 350;

        if (foiTap) {
            e.preventDefault();
            e.stopPropagation();
            abrirMenu();
        }
    });

    // Swipe dentro do menu
    $menu.on('pointerdown', function (e) {
        if (!aberto) return;

        draggingMenu = true;
        startY = e.clientY;
        currentY = e.clientY;
        startTime = Date.now();

        $menu.css('transition', 'none');

        e.stopPropagation();

        if (this.setPointerCapture) {
            this.setPointerCapture(e.originalEvent.pointerId);
        }
    });

    $menu.on('pointermove', function (e) {
        if (!draggingMenu) return;

        currentY = e.clientY;

        let diffY = currentY - startY;

        if (diffY < 0) {
            diffY = diffY * 0.25;
        }

        $menu.css({
            transform: `translateY(calc(25% + ${diffY}px))`
        });

        e.preventDefault();
    });

    $menu.on('pointerup pointercancel', function (e) {
        if (!draggingMenu) return;

        draggingMenu = false;

        const distance = currentY - startY;
        const time = Date.now() - startTime;
        const velocity = distance / time;

        if (distance > 120 || velocity > 0.7) {
            fecharMenu();
        } else {
            voltarMenu();
        }

        e.stopPropagation();
    });

    // Fecha ao tocar fora
    $(document).on('pointerup', function (e) {
        if (!aberto) return;

        if (!$(e.target).closest('.mini-menu, .foto').length) {
            fecharMenu();
        }
    });

});