(function (window, document, $) {
    'use strict';

    $(function () {
        var $menu = $('.mini-menu');

        if ($menu.length === 0) return;

        $(document).off('.margotTapFoto');
        $menu.off('.margotMiniMenuSwipe');

        var aberto = false;

        var fotoInicioX = 0;
        var fotoInicioY = 0;
        var fotoInicioTempo = 0;
        var fotoSelecionada = null;

        var gestoMenuAtivo = false;
        var aArrastarMenu = false;

        var menuInicioX = 0;
        var menuInicioY = 0;
        var menuAtualY = 0;
        var menuInicioTempo = 0;

        var ponteiroMenu = null;
        var bloquearCliqueAte = 0;

        var acoesAbertas = false;

        var estiloFotosId =
            'margot-mini-menu-fotos-estilo';

        var menuElemento = $menu[0];

        function prepararTransicaoFotos() {
            var estiloAnterior =
                document.getElementById(
                    estiloFotosId
                );

            if (estiloAnterior) {
                estiloAnterior.remove();
            }

            var estilo =
                document.createElement(
                    'style'
                );

            estilo.id =
                estiloFotosId;

            estilo.textContent = [
                '.foto {',
                '    transition: opacity 560ms cubic-bezier(.22, 1, .36, 1) !important;',
                '}',
                'body.margot-mini-menu-aberto .foto {',
                '    display: block !important;',
                '    visibility: visible !important;',
                '    opacity: 0 !important;',
                '    pointer-events: none !important;',
                '}'
            ].join('\n');

            document.head.appendChild(
                estilo
            );
        }

        prepararTransicaoFotos();

        function posicaoBaseMenu() {
            return acoesAbertas
                ? '0%'
                : '15%';
        }

        function colocarMenuNaPosicaoBase() {
            $menu.css({
                transform:
                    'translate3d(0, ' +
                    posicaoBaseMenu() +
                    ', 0)',

                transition:
                    'transform 0.3s cubic-bezier(.22,1,.36,1)'
            });
        }

        function definirMiniMenuAcoes(
            abertas
        ) {
            acoesAbertas =
                Boolean(abertas);

            $menu.toggleClass(
                'mini-menu-acoes-abertas',
                acoesAbertas
            );

            if (aberto) {
                colocarMenuNaPosicaoBase();
            }
        }

        /*
         * Só impedimos o swipe onde existe
         * uma interação nativa que realmente
         * precisa do gesto.
         *
         * Botões, links, fotografia, Hey,
         * labels, etc. podem iniciar o swipe.
         */
        function eCampoComInteracaoNativa(
            alvo
        ) {
            return Boolean(
                $(alvo).closest(
                    'input, textarea, select, option, [contenteditable="true"]'
                ).length
            );
        }

        function prepararFoto(elemento) {
            if (
                typeof window
                    .prepararMiniMenuDaFoto ===
                'function'
            ) {
                return window
                    .prepararMiniMenuDaFoto(
                        elemento
                    );
            }

            return true;
        }

        function libertarCapturaPonteiro(
            evento
        ) {
            if (
                !menuElemento
                    .releasePointerCapture ||
                ponteiroMenu === null
            ) {
                return;
            }

            try {
                menuElemento
                    .releasePointerCapture(
                        evento &&
                        evento.pointerId !==
                            undefined
                            ? evento.pointerId
                            : ponteiroMenu
                    );
            } catch (erro) {
                /*
                 * O ponteiro pode já ter
                 * sido libertado.
                 */
            }
        }

        function limparGestoMenu(
            evento
        ) {
            libertarCapturaPonteiro(
                evento
            );

            gestoMenuAtivo = false;
            aArrastarMenu = false;
            ponteiroMenu = null;
        }

        function abrirMenu(elemento) {
            if (
                !prepararFoto(elemento)
            ) {
                return;
            }

            aberto = true;
            acoesAbertas = false;

            gestoMenuAtivo = false;
            aArrastarMenu = false;
            ponteiroMenu = null;

            document.body
                .classList.add(
                    'margot-mini-menu-aberto'
                );

            $menu
                .removeClass(
                    'mini-menu-acoes-abertas'
                )
                .attr(
                    'aria-hidden',
                    'false'
                )
                .css({
                    pointerEvents:
                        'auto',

                    transform:
                        'translate3d(0, ' +
                        posicaoBaseMenu() +
                        ', 0)',

                    transition:
                        'transform 0.3s cubic-bezier(.2,.8,.2,1)'
                });
        }

        function fecharMenu() {
            aberto = false;
            acoesAbertas = false;

            gestoMenuAtivo = false;
            aArrastarMenu = false;
            ponteiroMenu = null;

            document.body
                .classList.remove(
                    'margot-mini-menu-aberto'
                );

            $menu
                .removeClass(
                    'mini-menu-acoes-abertas'
                )
                .attr(
                    'aria-hidden',
                    'true'
                )
                .css({
                    pointerEvents:
                        'none',

                    transform:
                        'translate3d(0, calc(100% + 96px + env(safe-area-inset-bottom, 0px)), 0)',

                    transition:
                        'transform 0.3s cubic-bezier(.4,0,1,1)'
                });
        }

        function voltarMenu() {
            colocarMenuNaPosicaoBase();
        }

        /*
         * Quando o gesto começou em cima
         * de um botão/link mas acabou por
         * ser um swipe, impedimos o click
         * que o browser enviaria a seguir.
         */
        function bloquearCliqueDepoisDeArrasto(
            evento
        ) {
            if (
                Date.now() >=
                bloquearCliqueAte
            ) {
                return;
            }

            evento.preventDefault();
            evento.stopPropagation();

            if (
                typeof evento
                    .stopImmediatePropagation ===
                'function'
            ) {
                evento
                    .stopImmediatePropagation();
            }
        }

        /*
         * Capture phase:
         * bloqueia o click antes de chegar
         * ao botão/link original.
         */
        menuElemento.addEventListener(
            'click',
            bloquearCliqueDepoisDeArrasto,
            true
        );

        /*
         * TAP nas fotografias do mapa.
         */

        $(document).on(
            'pointerdown.margotTapFoto',
            '.foto',
            function (evento) {
                fotoSelecionada =
                    this;

                fotoInicioX =
                    evento.clientX;

                fotoInicioY =
                    evento.clientY;

                fotoInicioTempo =
                    Date.now();

                prepararFoto(this);

                evento
                    .stopPropagation();
            }
        );

        $(document).on(
            'pointerup.margotTapFoto',
            '.foto',
            function (evento) {
                if (
                    !fotoSelecionada ||
                    fotoSelecionada !==
                        this
                ) {
                    return;
                }

                var distanciaX =
                    Math.abs(
                        evento.clientX -
                        fotoInicioX
                    );

                var distanciaY =
                    Math.abs(
                        evento.clientY -
                        fotoInicioY
                    );

                var duracao =
                    Date.now() -
                    fotoInicioTempo;

                fotoSelecionada =
                    null;

                var foiToque =
                    distanciaX < 14 &&
                    distanciaY < 14 &&
                    duracao < 450;

                if (!foiToque) {
                    return;
                }

                evento
                    .stopPropagation();

                abrirMenu(this);
            }
        );

        $(document).on(
            'pointercancel.margotTapFoto',
            '.foto',
            function () {
                fotoSelecionada =
                    null;
            }
        );

        /*
         * SWIPE DO MINI-MENU
         *
         * Agora pode começar praticamente
         * em qualquer zona do menu.
         */

        $menu.on(
            'pointerdown.margotMiniMenuSwipe',
            function (evento) {
                if (
                    !aberto ||
                    evento.button > 0 ||
                    eCampoComInteracaoNativa(
                        evento.target
                    )
                ) {
                    gestoMenuAtivo =
                        false;

                    aArrastarMenu =
                        false;

                    ponteiroMenu =
                        null;

                    return;
                }

                /*
                 * Ainda não assumimos que
                 * é um swipe.
                 *
                 * Pode ser apenas um toque
                 * no Hey, fotografia, nome,
                 * botão, etc.
                 */
                gestoMenuAtivo =
                    true;

                aArrastarMenu =
                    false;

                menuInicioX =
                    evento.clientX;

                menuInicioY =
                    evento.clientY;

                menuAtualY =
                    evento.clientY;

                menuInicioTempo =
                    Date.now();

                ponteiroMenu =
                    evento.pointerId;
            }
        );

        $menu.on(
            'pointermove.margotMiniMenuSwipe',
            function (evento) {
                if (
                    !gestoMenuAtivo ||
                    evento.pointerId !==
                        ponteiroMenu
                ) {
                    return;
                }

                var distanciaX =
                    evento.clientX -
                    menuInicioX;

                var distanciaY =
                    evento.clientY -
                    menuInicioY;

                var absolutoX =
                    Math.abs(
                        distanciaX
                    );

                var absolutoY =
                    Math.abs(
                        distanciaY
                    );

                menuAtualY =
                    evento.clientY;

                /*
                 * Esperamos alguns pixels
                 * antes de decidir se foi
                 * tap ou gesto.
                 */
                if (!aArrastarMenu) {
                    if (
                        absolutoX < 7 &&
                        absolutoY < 7
                    ) {
                        return;
                    }

                    /*
                     * Movimento horizontal:
                     * não roubamos o gesto.
                     */
                    if (
                        absolutoX >
                        absolutoY
                    ) {
                        limparGestoMenu(
                            evento
                        );

                        return;
                    }

                    /*
                     * Movimento vertical:
                     * agora sim começa a
                     * sheet a seguir o dedo.
                     */
                    aArrastarMenu =
                        true;

                    $menu.css(
                        'transition',
                        'none'
                    );

                    if (
                        menuElemento
                            .setPointerCapture
                    ) {
                        try {
                            menuElemento
                                .setPointerCapture(
                                    evento.pointerId
                                );
                        } catch (erro) {
                            /*
                             * Safari pode
                             * recusar a
                             * captura.
                             */
                        }
                    }
                }

                var distancia =
                    menuAtualY -
                    menuInicioY;

                /*
                 * Para cima oferecemos
                 * resistência.
                 *
                 * Para baixo segue o dedo
                 * diretamente.
                 */
                if (
                    distancia < 0
                ) {
                    distancia *=
                        0.18;
                }

                $menu.css(
                    'transform',
                    'translate3d(0, calc(' +
                    posicaoBaseMenu() +
                    ' + ' +
                    distancia +
                    'px), 0)'
                );

                evento.preventDefault();
                evento.stopPropagation();
            }
        );

        $menu.on(
            'pointerup.margotMiniMenuSwipe pointercancel.margotMiniMenuSwipe',
            function (evento) {
                if (
                    !gestoMenuAtivo ||
                    evento.pointerId !==
                        ponteiroMenu
                ) {
                    return;
                }

                var estavaAArrastar =
                    aArrastarMenu;

                var distancia =
                    menuAtualY -
                    menuInicioY;

                var duracao =
                    Math.max(
                        1,
                        Date.now() -
                        menuInicioTempo
                    );

                var velocidade =
                    distancia /
                    duracao;

                /*
                 * Foi apenas um toque.
                 * Não interferimos com o
                 * botão/link.
                 */
                if (
                    !estavaAArrastar
                ) {
                    limparGestoMenu(
                        evento
                    );

                    return;
                }

                /*
                 * Evita que um Hey/link/
                 * botão seja acionado
                 * depois do swipe.
                 */
                bloquearCliqueAte =
                    Date.now() + 350;

                limparGestoMenu(
                    evento
                );

                /*
                 * Mais permissivo que antes:
                 *
                 * - 90 px de distância
                 * OU
                 * - gesto rápido.
                 */
                if (
                    distancia > 90 ||
                    velocidade > 0.5
                ) {
                    fecharMenu();
                } else {
                    voltarMenu();
                }

                evento.preventDefault();
                evento.stopPropagation();
            }
        );

        /*
         * Tocar fora continua a fechar.
         */

        $(document).on(
            'pointerup.margotTapFoto',
            function (evento) {
                if (!aberto) {
                    return;
                }

                if (
                    !$(evento.target)
                        .closest(
                            '.mini-menu, .foto'
                        )
                        .length
                ) {
                    fecharMenu();
                }
            }
        );

        window.fecharMiniMenu =
            fecharMenu;

        window.definirMiniMenuAcoes =
            definirMiniMenuAcoes;

        function desativarPagina() {
            $(document)
                .off(
                    '.margotTapFoto'
                );

            $menu
                .off(
                    '.margotMiniMenuSwipe'
                );

            document
                .removeEventListener(
                    'margot:page-leave',
                    desativarPagina
                );

            document.body
                .classList.remove(
                    'margot-mini-menu-aberto'
                );

            menuElemento
                .removeEventListener(
                    'click',
                    bloquearCliqueDepoisDeArrasto,
                    true
                );

            var estilo =
                document
                    .getElementById(
                        estiloFotosId
                    );

            if (estilo) {
                estilo.remove();
            }

            if (
                window.fecharMiniMenu ===
                fecharMenu
            ) {
                delete window
                    .fecharMiniMenu;
            }

            if (
                window
                    .definirMiniMenuAcoes ===
                definirMiniMenuAcoes
            ) {
                delete window
                    .definirMiniMenuAcoes;
            }
        }

        document
            .addEventListener(
                'margot:page-leave',
                desativarPagina
            );
    });
})(
    window,
    document,
    jQuery
);