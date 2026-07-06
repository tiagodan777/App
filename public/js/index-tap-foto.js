$(function () {

    const $menu = $('.mini-menu');

    let aberto = false;
    let dragging = false;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    function abrirMenu() {
        aberto = true;

        $menu
            .removeClass('dragging')
            .css('transition', 'transform 0.35s cubic-bezier(.2,.8,.2,1)')
            .addClass('aberto');
    }

    function fecharMenu() {
        aberto = false;

        $menu
            .css('transition', 'transform 0.32s cubic-bezier(.4,0,1,1)')
            .removeClass('aberto')
            .css('transform', '');
    }

    function voltarMenu() {
        $menu
            .css('transition', 'transform 0.25s cubic-bezier(.2,.8,.2,1)')
            .css('transform', 'translateY(25%)');
    }

    $(document).on('pointerdown', '.foto', function (e) {
        e.stopPropagation();
        abrirMenu();
    });

    $(document).on('pointerdown', function (e) {
        if (!$(e.target).closest('.mini-menu, .foto').length && aberto) {
            fecharMenu();
        }
    });

    $menu.on('pointerdown', function (e) {
        if (!aberto) return;

        dragging = true;
        startY = e.clientY;
        lastY = e.clientY;
        lastTime = performance.now();
        velocity = 0;

        $menu.css('transition', 'none');

        this.setPointerCapture(e.originalEvent.pointerId);

        e.stopPropagation();
    });

    $menu.on('pointermove', function (e) {
        if (!dragging) return;

        const y = e.clientY;
        const now = performance.now();

        let diff = y - startY;

        if (diff < 0) {
            diff = diff * 0.25;
        }

        const dt = now - lastTime;
        if (dt > 0) {
            velocity = (y - lastY) / dt;
        }

        lastY = y;
        lastTime = now;

        $menu.css('transform', `translateY(calc(25% + ${diff}px))`);
    });

    $menu.on('pointerup pointercancel', function (e) {
        if (!dragging) return;

        dragging = false;

        const distance = lastY - startY;

        if (distance > 120 || velocity > 0.8) {
            fecharMenu();
        } else {
            voltarMenu();
        }

        e.stopPropagation();
    });

});