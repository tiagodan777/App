$(function () {

    let dragging = false;
    let startY = 0;
    let currentY = 0;
    let startTime = 0;

    const $menu = $('.mini-menu');

    function abrirMenu() {
        $menu
            .stop(true, true)
            .css({
                transition: 'bottom 0.5s ease, transform 0s',
                transform: 'translateY(0)'
            })
            .animate({
                bottom: '-25%'
            }, 500);
    }

    function fecharMenu() {
        $menu
            .stop(true, true)
            .css({
                transition: 'bottom 0.5s ease, transform 0s',
                transform: 'translateY(0)'
            })
            .animate({
                bottom: '-100%'
            }, 500);
    }

    function voltarAoLugar() {
        $menu.css({
            transition: 'transform 0.25s ease',
            transform: 'translateY(0)'
        });
    }

    $(document).on('pointerdown', '.foto', function (e) {
        e.stopPropagation();
        abrirMenu();
    });

    $(document).on('pointerdown', function (e) {
        if (!$(e.target).closest('.mini-menu, .foto').length) {
            fecharMenu();
        }
    });

    $menu.on('pointerdown', function (e) {
        dragging = true;
        startY = e.clientY;
        currentY = e.clientY;
        startTime = Date.now();

        $menu.css('transition', 'none');

        e.stopPropagation();
    });

    $(document).on('pointermove', function (e) {
        if (!dragging) return;

        currentY = e.clientY;

        let diffY = currentY - startY;

        // Só deixa arrastar para baixo
        if (diffY < 0) diffY = 0;

        $menu.css({
            transform: `translateY(${diffY}px)`
        });
    });

    $(document).on('pointerup pointercancel', function () {
        if (!dragging) return;

        dragging = false;

        let distance = currentY - startY;
        let time = Date.now() - startTime;
        let velocity = distance / time;

        // fecha se desceu muito ou se foi rápido
        if (distance > 120 || velocity > 0.7) {
            fecharMenu();
        } else {
            voltarAoLugar();
        }
    });

});