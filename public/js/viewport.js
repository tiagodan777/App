(function (window, document) {
    'use strict';

    var resizeFrame = null;
    var lastWidth = 0;
    var lastHeight = 0;

    function isStandalone() {
        return Boolean(
            window.navigator.standalone === true ||
            window.matchMedia(
                '(display-mode: standalone)'
            ).matches
        );
    }

    function getViewportWidth() {
        var values = [
            window.innerWidth || 0,
            document.documentElement.clientWidth || 0
        ];

        if (window.visualViewport) {
            values.push(
                window.visualViewport.width || 0
            );
        }

        return Math.ceil(
            Math.max.apply(null, values)
        );
    }

    function getViewportHeight() {
        var values = [
            window.innerHeight || 0,
            document.documentElement.clientHeight || 0
        ];

        if (window.visualViewport) {
            values.push(
                (
                    window.visualViewport.height || 0
                ) +
                (
                    window.visualViewport.offsetTop || 0
                )
            );
        }

        /*
         * No modo instalado do iPhone, o WebKit pode devolver
         * uma altura inferior à área real disponível.
         */
        if (isStandalone()) {
            values.push(
                window.screen.height || 0
            );

            if (
                window.screen.availHeight &&
                window.screen.availHeight > 0
            ) {
                values.push(
                    window.screen.availHeight
                );
            }
        }

        return Math.ceil(
            Math.max.apply(null, values)
        );
    }

    function applyViewportSize() {
        resizeFrame = null;

        var width = getViewportWidth();
        var height = getViewportHeight();

        if (width <= 0 || height <= 0) {
            return;
        }

        var root =
            document.documentElement;

        root.style.setProperty(
            '--app-width',
            width + 'px'
        );

        root.style.setProperty(
            '--app-height',
            height + 'px'
        );

        /*
         * Margem extra para evitar que o WebKit deixe a faixa
         * inferior sem desenho durante alterações do viewport.
         */
        root.style.setProperty(
            '--canvas-overscan',
            '160px'
        );

        if (
            width !== lastWidth ||
            height !== lastHeight
        ) {
            lastWidth = width;
            lastHeight = height;

            window.dispatchEvent(
                new CustomEvent(
                    'appviewportchange',
                    {
                        detail: {
                            width: width,
                            height: height,
                            standalone:
                                isStandalone()
                        }
                    }
                )
            );
        }
    }

    function scheduleViewportUpdate() {
        if (resizeFrame !== null) {
            window.cancelAnimationFrame(
                resizeFrame
            );
        }

        resizeFrame =
            window.requestAnimationFrame(
                applyViewportSize
            );
    }

    /*
     * NOVO: no arranque a partir do ícone do ecrã principal
     * (modo standalone), o iOS por vezes só reporta a altura
     * real do viewport passado algum tempo. Forçamos várias
     * re-medições nos primeiros instantes para apanhar esse
     * valor tardio, mesmo que nenhum evento de resize dispare.
     */
    var RETRY_DELAYS = [0, 50, 150, 300, 600, 1000, 1600];

    RETRY_DELAYS.forEach(function (delay) {
        window.setTimeout(applyViewportSize, delay);
    });

    /*
     * É executado logo no head para reduzir o aparecimento
     * momentâneo da zona branca.
     */
    applyViewportSize();

    window.addEventListener(
        'load',
        function () {
            RETRY_DELAYS.forEach(function (delay) {
                window.setTimeout(applyViewportSize, delay);
            });
        },
        { passive: true }
    );

    window.addEventListener(
        'resize',
        scheduleViewportUpdate,
        { passive: true }
    );

    window.addEventListener(
        'orientationchange',
        function () {
            scheduleViewportUpdate();

            window.setTimeout(
                scheduleViewportUpdate,
                100
            );

            window.setTimeout(
                scheduleViewportUpdate,
                300
            );
        },
        { passive: true }
    );

    window.addEventListener(
        'pageshow',
        function () {
            RETRY_DELAYS.forEach(function (delay) {
                window.setTimeout(applyViewportSize, delay);
            });
        },
        { passive: true }
    );

    window.addEventListener(
        'focus',
        scheduleViewportUpdate,
        { passive: true }
    );

    document.addEventListener(
        'visibilitychange',
        function () {
            if (
                document.visibilityState ===
                'visible'
            ) {
                scheduleViewportUpdate();
            }
        }
    );

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            scheduleViewportUpdate,
            { passive: true }
        );

        window.visualViewport.addEventListener(
            'scroll',
            scheduleViewportUpdate,
            { passive: true }
        );
    }

    window.AppViewport = {
        update: scheduleViewportUpdate,

        getWidth: getViewportWidth,

        getHeight: getViewportHeight,

        isStandalone: isStandalone
    };
})(
    window,
    document
);