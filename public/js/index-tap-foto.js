$(function () {

    const $menu = $('.mini-menu');

    let aberto = false;
    let dragging = false;

    let startY = 0;
    let currentY = 0;
    let startTime = 0;

    function abrirMenu() {
        aberto = true;
        dragging = false;

        $menu
            .stop(true, true)
            .css({
                position: 'fixed',
                left: '0',
                bottom: '0',
                transform: 'translateY(25%)',
                transition: 'transform 0.35s cubic-bezier(.2,.8,.2,1)'
            });
    }

    function fecharMenu() {
        aberto = false;
        dragging = false;

        $menu.css({
            transform: 'translateY(100%)',
            transition: 'transform 0.30s cubic-bezier(.4,0,1,1)'
        });
    }

    function voltarMenu() {
        $menu.css({
            transform: 'translateY(25%)',
            transition: 'transform 0.25s cubic-bezier(.2,.8,.2,1)'
        });
    }

    $(document).on('pointerdown', '.foto', function (e) {
        e.preventDefault();
        e.stopPropagation();

        abrirMenu();
    });

    $menu.on('pointerdown', function (e) {
        if (!aberto) return;

        dragging = true;
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
        if (!dragging) return;

        currentY = e.clientY;

        let diffY = currentY - startY;

        if (diffY < 0) {
            diffY = diffY * 0.25;
        }

        $menu.css({
            transform: `translateY(calc(25% + ${diffY}px))`
        });
    });

    $menu.on('pointerup pointercancel', function (e) {
        if (!dragging) return;

        dragging = false;

        let distance = currentY - startY;
        let time = Date.now() - startTime;
        let velocity = distance / time;

        if (distance > 120 || velocity > 0.7) {
            fecharMenu();
        } else {
            voltarMenu();
        }

        e.stopPropagation();
    });

    $(document).on('pointerdown', function (e) {
        if (!aberto) return;

        if (!$(e.target).closest('.mini-menu, .foto').length) {
            fecharMenu();
        }
    });
});