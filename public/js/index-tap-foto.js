(function (window, document, $) {
    'use strict';

    $(function () {
        var $menu = $('.mini-menu');

        if ($menu.length === 0) return;

        var aberto = false;
        var fotoInicioX = 0;
        var fotoInicioY = 0;
        var fotoInicioTempo = 0;
        var fotoSelecionada = null;
        var aArrastarMenu = false;
        var menuInicioY = 0;
        var menuAtualY = 0;
        var menuInicioTempo = 0;
        var ponteiroMenu = null;

        function eInterativo(alvo) {
            return Boolean($(alvo).closest('button, a, input, textarea, select, label, form').length);
        }

        function prepararFoto(elemento) {
            if (typeof window.prepararMiniMenuDaFoto === 'function') {
                return window.prepararMiniMenuDaFoto(elemento);
            }

            return true;
        }

        function abrirMenu(elemento) {
            if (!prepararFoto(elemento)) return;

            aberto = true;

            $menu.attr('aria-hidden', 'false').css({
                pointerEvents: 'auto',
                transform: 'translate3d(0, 15%, 0)',
                transition: 'transform 0.3s cubic-bezier(.2,.8,.2,1)'
            });
        }

        function fecharMenu() {
            aberto = false;
            aArrastarMenu = false;
            ponteiroMenu = null;

            $menu.attr('aria-hidden', 'true').css({
                pointerEvents: 'none',
                transform: 'translate3d(0, calc(100% + 96px + env(safe-area-inset-bottom, 0px)), 0)',
                transition: 'transform 0.3s cubic-bezier(.4,0,1,1)'
            });
        }

        function voltarMenu() {
            $menu.css({
                transform: 'translate3d(0, 15%, 0)',
                transition: 'transform 0.3s cubic-bezier(.2,.8,.2,1)'
            });
        }

        $(document).on('pointerdown', '.foto', function (evento) {
            fotoSelecionada = this;
            fotoInicioX = evento.clientX;
            fotoInicioY = evento.clientY;
            fotoInicioTempo = Date.now();

            prepararFoto(this);
            evento.stopPropagation();
        });

        $(document).on('pointerup', '.foto', function (evento) {
            if (!fotoSelecionada || fotoSelecionada !== this) return;

            var distanciaX = Math.abs(evento.clientX - fotoInicioX);
            var distanciaY = Math.abs(evento.clientY - fotoInicioY);
            var duracao = Date.now() - fotoInicioTempo;

            fotoSelecionada = null;

            var foiToque = distanciaX < 14 && distanciaY < 14 && duracao < 450;

            if (!foiToque) return;

            evento.stopPropagation();
            abrirMenu(this);
        });

        $(document).on('pointercancel', '.foto', function () {
            fotoSelecionada = null;
        });

        $menu.on('pointerdown', function (evento) {
            if (!aberto || eInterativo(evento.target)) {
                aArrastarMenu = false;
                return;
            }

            aArrastarMenu = true;
            menuInicioY = evento.clientY;
            menuAtualY = evento.clientY;
            menuInicioTempo = Date.now();
            ponteiroMenu = evento.pointerId;

            $menu.css('transition', 'none');
            evento.stopPropagation();

            if (this.setPointerCapture) {
                try {
                    this.setPointerCapture(evento.pointerId);
                } catch (erro) {
                    /* O Safari pode recusar a captura. */
                }
            }
        });

        $menu.on('pointermove', function (evento) {
            if (!aArrastarMenu || evento.pointerId !== ponteiroMenu) return;

            menuAtualY = evento.clientY;

            var distancia = menuAtualY - menuInicioY;

            if (distancia < 0) distancia *= 0.22;

            $menu.css('transform', 'translate3d(0, calc(15% + ' + distancia + 'px), 0)');

            evento.preventDefault();
            evento.stopPropagation();
        });

        $menu.on('pointerup pointercancel', function (evento) {
            if (!aArrastarMenu || evento.pointerId !== ponteiroMenu) return;

            aArrastarMenu = false;

            var distancia = menuAtualY - menuInicioY;
            var duracao = Math.max(1, Date.now() - menuInicioTempo);
            var velocidade = distancia / duracao;

            if (this.releasePointerCapture) {
                try {
                    this.releasePointerCapture(evento.pointerId);
                } catch (erro) {
                    /* O ponteiro pode já ter sido libertado. */
                }
            }

            ponteiroMenu = null;

            if (distancia > 110 || velocidade > 0.65) {
                fecharMenu();
            } else {
                voltarMenu();
            }

            evento.stopPropagation();
        });

        $(document).on('pointerup', function (evento) {
            if (!aberto) return;

            if (!$(evento.target).closest('.mini-menu, .foto').length) {
                fecharMenu();
            }
        });

        window.fecharMiniMenu = fecharMenu;
    });
})(window, document, jQuery);