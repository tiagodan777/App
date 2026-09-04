(function (window, document) {
    'use strict';

    /*
     * Limpa uma instância anterior.
     * Importante porque a Margot pode navegar entre páginas
     * sem destruir totalmente o contexto JavaScript.
     */
    if (
        typeof window.__margotProfileRubberBandCleanup ===
        'function'
    ) {
        window.__margotProfileRubberBandCleanup();
    }

    var perfil =
        document.getElementById('perfil');

    if (!perfil) {
        return;
    }

    var pagina =
        perfil.querySelector('.perfil-page');

    if (!pagina) {
        return;
    }

    var suportaTouch =
        'ontouchstart' in window ||
        (
            window.navigator &&
            window.navigator.maxTouchPoints > 0
        );

    if (!suportaTouch) {
        return;
    }

    var scroller =
        document.scrollingElement ||
        document.documentElement;

    var ativo = false;
    var eixo = null;
    var limiteInicial = null;

    var inicioX = 0;
    var inicioY = 0;

    var deslocamentoAtual = 0;

    var LIMITE_MAXIMO = 86;
    var LIMIAR_DIRECAO = 7;

    var prefereMovimentoReduzido =
        Boolean(
            window.matchMedia &&
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        );

    function modalAberta() {
        return (
            document.documentElement.classList.contains(
                'perfil-modal-aberta'
            ) ||
            document.body.classList.contains(
                'perfil-modal-aberta'
            )
        );
    }

    function noTopo() {
        return scroller.scrollTop <= 1;
    }

    function noFundo() {
        var maximo =
            Math.max(
                0,
                scroller.scrollHeight -
                scroller.clientHeight
            );

        return (
            scroller.scrollTop >=
            maximo - 1
        );
    }

    /*
     * Curva de resistência.
     *
     * Quanto mais puxas, mais difícil fica deslocar a página.
     * Nunca passa aproximadamente dos 86 px.
     */
    function aplicarResistencia(distancia) {
        var sinal =
            distancia < 0
                ? -1
                : 1;

        var absoluto =
            Math.abs(distancia);

        var resultado =
            LIMITE_MAXIMO *
            (
                1 -
                Math.exp(
                    -absoluto / 175
                )
            );

        return (
            sinal *
            Math.min(
                LIMITE_MAXIMO,
                resultado
            )
        );
    }

    function aplicarDeslocamento(valor) {
        deslocamentoAtual =
            valor;

        pagina.style.transition =
            'none';

        pagina.style.willChange =
            'transform';

        pagina.style.transform =
            'translate3d(0, ' +
            valor +
            'px, 0)';
    }

    function soltar() {
        if (
            Math.abs(
                deslocamentoAtual
            ) < 0.1
        ) {
            deslocamentoAtual = 0;

            pagina.style.transform = '';
            pagina.style.transition = '';
            pagina.style.willChange = '';

            return;
        }

        pagina.style.transition =
            prefereMovimentoReduzido
                ? 'transform 1ms linear'
                : (
                    'transform 460ms ' +
                    'cubic-bezier(0.22, 1, 0.36, 1)'
                );

        pagina.style.transform =
            'translate3d(0, 0, 0)';

        deslocamentoAtual = 0;

        window.setTimeout(
            function () {
                pagina.style.transform = '';
                pagina.style.transition = '';
                pagina.style.willChange = '';
            },
            prefereMovimentoReduzido
                ? 10
                : 480
        );
    }

    function touchStart(evento) {
        if (
            modalAberta() ||
            !evento.touches ||
            evento.touches.length !== 1
        ) {
            ativo = false;
            return;
        }

        var toque =
            evento.touches[0];

        inicioX =
            toque.clientX;

        inicioY =
            toque.clientY;

        eixo = null;

        /*
         * O rubber band começa apenas se o gesto
         * for iniciado num dos limites da página.
         */
        if (noTopo()) {
            limiteInicial = 'topo';
        } else if (noFundo()) {
            limiteInicial = 'fundo';
        } else {
            limiteInicial = null;
        }

        ativo =
            limiteInicial !== null;

        if (ativo) {
            pagina.style.transition = 'none';
        }
    }

    function touchMove(evento) {
        if (
            !ativo ||
            modalAberta() ||
            !evento.touches ||
            evento.touches.length !== 1
        ) {
            return;
        }

        var toque =
            evento.touches[0];

        var deltaX =
            toque.clientX -
            inicioX;

        var deltaY =
            toque.clientY -
            inicioY;

        if (
            eixo === null &&
            (
                Math.abs(deltaX) >=
                    LIMIAR_DIRECAO ||
                Math.abs(deltaY) >=
                    LIMIAR_DIRECAO
            )
        ) {
            eixo =
                Math.abs(deltaY) >
                Math.abs(deltaX)
                    ? 'vertical'
                    : 'horizontal';
        }

        /*
         * Não interferir com o swipe horizontal
         * das fotografias.
         */
        if (eixo !== 'vertical') {
            return;
        }

        var puxarTopo =
            limiteInicial === 'topo' &&
            deltaY > 0;

        var puxarFundo =
            limiteInicial === 'fundo' &&
            deltaY < 0;

        if (
            !puxarTopo &&
            !puxarFundo
        ) {
            return;
        }

        if (evento.cancelable) {
            evento.preventDefault();
        }

        aplicarDeslocamento(
            aplicarResistencia(
                deltaY
            )
        );
    }

    function touchEnd() {
        if (!ativo) {
            return;
        }

        ativo = false;
        eixo = null;
        limiteInicial = null;

        soltar();
    }

    perfil.addEventListener(
        'touchstart',
        touchStart,
        {
            passive: true
        }
    );

    perfil.addEventListener(
        'touchmove',
        touchMove,
        {
            passive: false
        }
    );

    perfil.addEventListener(
        'touchend',
        touchEnd,
        {
            passive: true
        }
    );

    perfil.addEventListener(
        'touchcancel',
        touchEnd,
        {
            passive: true
        }
    );

    function cleanup() {
        perfil.removeEventListener(
            'touchstart',
            touchStart
        );

        perfil.removeEventListener(
            'touchmove',
            touchMove
        );

        perfil.removeEventListener(
            'touchend',
            touchEnd
        );

        perfil.removeEventListener(
            'touchcancel',
            touchEnd
        );

        pagina.style.transform = '';
        pagina.style.transition = '';
        pagina.style.willChange = '';

        ativo = false;
        eixo = null;
        limiteInicial = null;
        deslocamentoAtual = 0;
    }

    window.__margotProfileRubberBandCleanup =
        cleanup;

})(
    window,
    document
);