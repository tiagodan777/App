$(function () {
    'use strict';

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
            transform: 'translateY(15%)',
            transition:
                'transform 0.5s cubic-bezier(.2,.8,.2,1)'
        });
    }

    function fecharMenu() {
        aberto = false;
        draggingMenu = false;

        $menu.css({
            transform: 'translateY(100%)',
            transition:
                'transform 0.3s cubic-bezier(.4,0,1,1)'
        });
    }

    function voltarMenu() {
        $menu.css({
            transform: 'translateY(15%)',
            transition:
                'transform 0.3s cubic-bezier(.2,.8,.2,1)'
        });
    }

    function preencherMenu($foto) {
        const membroId = String(
            $foto.attr('data-membro-id') || ''
        ).trim();

        const nome = String(
            $foto.attr('data-nome') || ''
        ).trim();

        const src = String(
            $foto.attr('src') || ''
        ).trim();

        $menu.attr(
            'data-destinatario-id',
            membroId
        );

        $menu.find('header img').attr({
            src:
                src ||
                '/imagens/fotos-perfil/default.webp',

            alt:
                nome ||
                'Foto de perfil'
        });

        $menu
            .find('header h1')
            .text(nome);

        if (window.messagesUrl) {
            $menu
                .find('form')
                .attr(
                    'action',
                    window.messagesUrl +
                        '?sendTo=' +
                        encodeURIComponent(
                            membroId
                        )
                );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Detetar toque numa fotografia
    |--------------------------------------------------------------------------
    */

    $(document).on(
        'pointerdown',
        '.foto',
        function (event) {
            fotoStartX = event.clientX;
            fotoStartY = event.clientY;
            fotoStartTime = Date.now();

            event.stopPropagation();
        }
    );

    $(document).on(
        'pointerup',
        '.foto',
        function (event) {
            const diffX = Math.abs(
                event.clientX - fotoStartX
            );

            const diffY = Math.abs(
                event.clientY - fotoStartY
            );

            const tempo =
                Date.now() - fotoStartTime;

            const foiTap =
                diffX < 12 &&
                diffY < 12 &&
                tempo < 350;

            if (!foiTap) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            preencherMenu($(this));
            abrirMenu();
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Arrastar o mini-menu
    |--------------------------------------------------------------------------
    |
    | Botões, inputs e formulários ficam excluídos.
    | Assim, tocar em "Hey" não inicia um arrasto.
    |--------------------------------------------------------------------------
    */

    $menu.on(
        'pointerdown',
        function (event) {
            if (!aberto) {
                return;
            }

            const $alvo = $(event.target);

            if (
                $alvo.closest(
                    'button, input, textarea, select, form, a'
                ).length
            ) {
                draggingMenu = false;
                return;
            }

            draggingMenu = true;

            startY = event.clientY;
            currentY = event.clientY;
            startTime = Date.now();

            $menu.css(
                'transition',
                'none'
            );

            event.stopPropagation();

            const pointerId =
                event.originalEvent &&
                event.originalEvent.pointerId;

            if (
                pointerId !== undefined &&
                this.setPointerCapture
            ) {
                try {
                    this.setPointerCapture(
                        pointerId
                    );
                } catch (error) {
                    console.warn(
                        'Não foi possível capturar o pointer:',
                        error
                    );
                }
            }
        }
    );

    $menu.on(
        'pointermove',
        function (event) {
            if (!draggingMenu) {
                return;
            }

            currentY = event.clientY;

            let diffY =
                currentY - startY;

            if (diffY < 0) {
                diffY *= 0.25;
            }

            $menu.css({
                transform:
                    'translateY(calc(15% + ' +
                    diffY +
                    'px))'
            });

            event.preventDefault();
        }
    );

    $menu.on(
        'pointerup pointercancel',
        function (event) {
            if (!draggingMenu) {
                return;
            }

            draggingMenu = false;

            const distancia =
                currentY - startY;

            const tempo = Math.max(
                Date.now() - startTime,
                1
            );

            const velocidade =
                distancia / tempo;

            if (
                distancia > 120 ||
                velocidade > 0.7
            ) {
                fecharMenu();
            } else {
                voltarMenu();
            }

            event.stopPropagation();
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Não deixar os controlos do menu iniciarem gestos
    |--------------------------------------------------------------------------
    */

    $menu.on(
        'pointerdown pointerup',
        'button, input, textarea, select, form, a',
        function (event) {
            event.stopPropagation();
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Fechar ao tocar fora
    |--------------------------------------------------------------------------
    */

    $(document).on(
        'pointerup',
        function (event) {
            if (!aberto) {
                return;
            }

            if (
                $(event.target)
                    .closest(
                        '.mini-menu, .foto'
                    )
                    .length
            ) {
                return;
            }

            fecharMenu();
        }
    );
});