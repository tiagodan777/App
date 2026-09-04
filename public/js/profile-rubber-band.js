(function (window, document) {
    'use strict';

    /*
     * Se esta página tiver sido montada anteriormente,
     * remove primeiro os listeners antigos.
     */
    if (
        typeof window.__margotProfileRubberBandCleanup ===
        'function'
    ) {
        window.__margotProfileRubberBandCleanup();
    }

    var perfil =
        document.getElementById(
            'perfil'
        );

    if (!perfil) {
        return;
    }

    var pagina =
        perfil.querySelector(
            '.perfil-page'
        );

    if (!pagina) {
        return;
    }

    var inicioX = 0;
    var inicioY = 0;

    var origemRubberY = 0;

    var eixo = null;
    var ativo = false;

    var deslocamento = 0;

    var timeoutReset = null;

    var LIMIAR_DIRECAO = 7;
    var LIMITE = 78;

    var movimentoReduzido =
        Boolean(
            window.matchMedia &&
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        );

    function scrollAtual() {
        return Math.max(
            window.pageYOffset || 0,
            document.documentElement
                .scrollTop || 0,
            document.body
                .scrollTop || 0
        );
    }

    function alturaDocumento() {
        return Math.max(
            document.documentElement
                .scrollHeight || 0,

            document.documentElement
                .offsetHeight || 0,

            document.body
                .scrollHeight || 0,

            document.body
                .offsetHeight || 0
        );
    }

    function scrollMaximo() {
        return Math.max(
            0,
            alturaDocumento() -
            window.innerHeight
        );
    }

    function estaNoTopo() {
        return (
            scrollAtual() <= 1
        );
    }

    function estaNoFundo() {
        return (
            scrollAtual() >=
            scrollMaximo() - 1
        );
    }

    function modalAberta() {
        return (
            document.documentElement
                .classList
                .contains(
                    'perfil-modal-aberta'
                ) ||

            document.body
                .classList
                .contains(
                    'perfil-modal-aberta'
                )
        );
    }

    /*
     * A distância física do dedo nunca é aplicada
     * diretamente.
     *
     * Quanto mais se puxa, maior é a resistência.
     */
    function resistencia(valor) {
        var sinal =
            valor < 0
                ? -1
                : 1;

        var absoluto =
            Math.abs(valor);

        var resultado =
            LIMITE *
            (
                1 -
                Math.exp(
                    -absoluto / 145
                )
            );

        return (
            sinal *
            Math.min(
                LIMITE,
                resultado
            )
        );
    }

    function aplicar(valor) {
        deslocamento =
            valor;

        pagina.style.transition =
            'none';

        pagina.style.willChange =
            'transform';

        pagina.style.transform =
            'translate3d(0,' +
            valor +
            'px,0)';
    }

    function limparEstilos() {
        pagina.style.transition =
            '';

        pagina.style.transform =
            '';

        pagina.style.willChange =
            '';
    }

    function voltar() {
        if (
            timeoutReset !==
            null
        ) {
            window.clearTimeout(
                timeoutReset
            );

            timeoutReset =
                null;
        }

        if (
            Math.abs(
                deslocamento
            ) < 0.1
        ) {
            deslocamento =
                0;

            limparEstilos();

            return;
        }

        if (movimentoReduzido) {
            deslocamento =
                0;

            limparEstilos();

            return;
        }

        pagina.style.transition =
            'transform 430ms ' +
            'cubic-bezier(0.22, 1, 0.36, 1)';

        pagina.style.transform =
            'translate3d(0,0,0)';

        deslocamento =
            0;

        timeoutReset =
            window.setTimeout(
                function () {
                    limparEstilos();

                    timeoutReset =
                        null;
                },
                460
            );
    }

    function aoComecar(evento) {
        if (
            modalAberta() ||
            !evento.touches ||
            evento.touches.length !== 1
        ) {
            ativo =
                false;

            eixo =
                null;

            return;
        }

        if (
            timeoutReset !==
            null
        ) {
            window.clearTimeout(
                timeoutReset
            );

            timeoutReset =
                null;

            limparEstilos();
        }

        var toque =
            evento.touches[0];

        inicioX =
            toque.clientX;

        inicioY =
            toque.clientY;

        origemRubberY =
            inicioY;

        eixo =
            null;

        ativo =
            false;

        deslocamento =
            0;
    }

    function aoMover(evento) {
        if (
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

        /*
         * Só decidimos se o gesto é vertical
         * depois de alguns píxeis.
         *
         * Isto impede conflitos com o swipe
         * horizontal das fotografias.
         */
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

        if (
            eixo !==
            'vertical'
        ) {
            return;
        }

        /*
         * O efeito só começa quando:
         *
         * - estamos no topo e puxamos para baixo;
         * - estamos no fundo e puxamos para cima.
         *
         * Scroll normal no meio da página
         * fica completamente intocado.
         */
        if (!ativo) {
            var puxarTopo =
                estaNoTopo() &&
                deltaY > 0;

            var puxarFundo =
                estaNoFundo() &&
                deltaY < 0;

            if (
                !puxarTopo &&
                !puxarFundo
            ) {
                return;
            }

            ativo =
                true;

            origemRubberY =
                toque.clientY;
        }

        var distancia =
            toque.clientY -
            origemRubberY;

        var validoTopo =
            estaNoTopo() &&
            distancia >= 0;

        var validoFundo =
            estaNoFundo() &&
            distancia <= 0;

        if (
            !validoTopo &&
            !validoFundo
        ) {
            aplicar(0);

            return;
        }

        /*
         * Impede que o browser tente fazer
         * outro overscroll ao mesmo tempo.
         */
        if (
            evento.cancelable
        ) {
            evento.preventDefault();
        }

        aplicar(
            resistencia(
                distancia
            )
        );
    }

    function aoTerminar() {
        eixo =
            null;

        if (!ativo) {
            return;
        }

        ativo =
            false;

        voltar();
    }

    perfil.addEventListener(
        'touchstart',
        aoComecar,
        {
            passive: true
        }
    );

    perfil.addEventListener(
        'touchmove',
        aoMover,
        {
            passive: false
        }
    );

    perfil.addEventListener(
        'touchend',
        aoTerminar,
        {
            passive: true
        }
    );

    perfil.addEventListener(
        'touchcancel',
        aoTerminar,
        {
            passive: true
        }
    );

    /*
     * Permite desmontar corretamente o efeito
     * se a Margot mudar de página sem destruir
     * completamente o contexto JavaScript.
     */
    window.__margotProfileRubberBandCleanup =
        function () {
            perfil.removeEventListener(
                'touchstart',
                aoComecar
            );

            perfil.removeEventListener(
                'touchmove',
                aoMover
            );

            perfil.removeEventListener(
                'touchend',
                aoTerminar
            );

            perfil.removeEventListener(
                'touchcancel',
                aoTerminar
            );

            if (
                timeoutReset !==
                null
            ) {
                window.clearTimeout(
                    timeoutReset
                );

                timeoutReset =
                    null;
            }

            ativo =
                false;

            eixo =
                null;

            deslocamento =
                0;

            limparEstilos();
        };

})(
    window,
    document
);