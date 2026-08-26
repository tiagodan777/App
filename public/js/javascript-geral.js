(function (window, document) {
    'use strict';

    if (window.MargotNavigation) return;

    var seletorPagina = '[data-margot-pagina]';

    var aNavegar = false;
    var faseNavegacao = 'idle';
    var urlEmNavegacao = null;
    var navegacaoPendente = null;

    var posicaoHistorico = 0;
    var controlador = null;
    var urlRenderizada = window.location.href;

    var preAquecimentos = new Map();
    var preAquecimentoAgendado = false;

    var ESPERA_MAXIMA_ESTILO = 180;
    var DURACAO_NAVEGACAO = 220;
    var TEMPO_REAQUECER = 30000;

    /*
     * Swipe para voltar em praticamente qualquer ponto do ecrã.
     * A margem esquerda fica reservada ao gesto nativo do iOS
     * para evitar que o mesmo gesto dispare dois backs.
     */
    var SWIPE_BACK_MARGEM_NATIVA = 24;
    var SWIPE_BACK_DISTANCIA_MINIMA = 70;
    var SWIPE_BACK_MOVIMENTO_INICIAL = 12;
    var SWIPE_BACK_RAZAO_HORIZONTAL = 1.2;
    var SWIPE_BACK_VELOCIDADE_MINIMA = 0.45;

    var swipeBack = {
        ativo: false,
        horizontal: false,
        ignorar: false,
        inicioX: 0,
        inicioY: 0,
        ultimoX: 0,
        ultimoY: 0,
        inicioTempo: 0
    };

    function urlAbsoluta(url) {
        return new URL(
            url,
            window.location.href
        ).href;
    }

    function caminhoNormalizado(url) {
        var caminho = new URL(
            url,
            window.location.href
        ).pathname.replace(
            /\/+$/,
            ''
        ) || '/';

        return caminho === '/index'
            ? '/'
            : caminho;
    }

    function chavePagina(url) {
        var destino = new URL(
            url,
            window.location.href
        );

        return (
            caminhoNormalizado(
                destino.href
            ) +
            destino.search
        );
    }

    function ePaginaAtual(url) {
        return (
            chavePagina(url) ===
            chavePagina(urlRenderizada)
        );
    }

    function indiceMenu(url) {
        var caminho =
            caminhoNormalizado(url);

        if (caminho === '/') {
            return 0;
        }

        if (caminho === '/messages') {
            return 1;
        }

        if (
            caminho.indexOf(
                '/profile/'
            ) === 0
        ) {
            return 2;
        }

        return null;
    }

    function atualizarMenu(url) {
        var caminho =
            caminhoNormalizado(url);

        document
            .querySelectorAll(
                '#menuPrincipal a[href]'
            )
            .forEach(
                function (link) {
                    var ativo =
                        caminhoNormalizado(
                            link.href
                        ) ===
                        caminho;

                    link.classList.toggle(
                        'active',
                        ativo
                    );

                    if (ativo) {
                        link.setAttribute(
                            'aria-current',
                            'page'
                        );
                    } else {
                        link.removeAttribute(
                            'aria-current'
                        );
                    }
                }
            );
    }

    /*
     * Antes esperávamos até 2500 ms pelo CSS.
     *
     * Isso era uma das principais causas
     * dos atrasos de vários segundos.
     *
     * Agora damos ao stylesheet apenas uma
     * pequena janela para ficar disponível.
     */
    function aguardarEstilo(link) {
        return new Promise(
            function (resolver) {
                if (link.sheet) {
                    resolver();
                    return;
                }

                var terminado = false;
                var temporizador = null;

                function terminar() {
                    if (terminado) {
                        return;
                    }

                    terminado = true;

                    if (
                        temporizador !==
                        null
                    ) {
                        window.clearTimeout(
                            temporizador
                        );
                    }

                    link.removeEventListener(
                        'load',
                        terminar
                    );

                    link.removeEventListener(
                        'error',
                        terminar
                    );

                    resolver();
                }

                link.addEventListener(
                    'load',
                    terminar
                );

                link.addEventListener(
                    'error',
                    terminar
                );

                temporizador =
                    window.setTimeout(
                        terminar,
                        ESPERA_MAXIMA_ESTILO
                    );
            }
        );
    }

    function hrefJaCarregado(
        href,
        tipo
    ) {
        var links =
            Array.from(
                document.querySelectorAll(
                    'link[href]'
                )
            );

        if (
            links.some(
                function (link) {
                    return (
                        link.href ===
                        href
                    );
                }
            )
        ) {
            return true;
        }

        if (
            tipo ===
            'script'
        ) {
            return Array.from(
                document.querySelectorAll(
                    'script[src]'
                )
            ).some(
                function (script) {
                    return (
                        script.src ===
                        href
                    );
                }
            );
        }

        return false;
    }

    function adicionarPreload(
        href,
        tipo
    ) {
        href =
            urlAbsoluta(
                href
            );

        if (
            hrefJaCarregado(
                href,
                tipo
            )
        ) {
            return;
        }

        var preload =
            document.createElement(
                'link'
            );

        preload.rel =
            'preload';

        preload.href =
            href;

        preload.as =
            tipo;

        preload.setAttribute(
            'data-margot-preload',
            ''
        );

        document.head.appendChild(
            preload
        );
    }

    /*
     * Quando descarregamos uma página em
     * background, aproveitamos para aquecer
     * os seus CSS e JS.
     *
     * Assim, quando o utilizador toca no menu,
     * esses ficheiros normalmente já estão
     * na cache do WebView.
     */
    function preAquecerRecursos(
        documentoNovo
    ) {
        Array.from(
            documentoNovo
                .head
                .querySelectorAll(
                    'link[data-margot-page-style][href]'
                )
        ).forEach(
            function (link) {
                adicionarPreload(
                    link.getAttribute(
                        'href'
                    ),
                    'style'
                );
            }
        );

        var pagina =
            documentoNovo.querySelector(
                seletorPagina
            );

        if (!pagina) {
            return;
        }

        Array.from(
            pagina.querySelectorAll(
                'script[src]'
            )
        ).forEach(
            function (script) {
                adicionarPreload(
                    script.getAttribute(
                        'src'
                    ),
                    'script'
                );
            }
        );
    }

    async function preAquecerPagina(
        url
    ) {
        var href =
            urlAbsoluta(
                url
            );

        var destino =
            new URL(
                href
            );

        if (
            destino.origin !==
            window.location.origin ||
            ePaginaAtual(
                href
            )
        ) {
            return;
        }

        var ultimo =
            preAquecimentos.get(
                href
            );

        if (
            ultimo &&
            (
                Date.now() -
                ultimo
            ) <
            TEMPO_REAQUECER
        ) {
            return;
        }

        preAquecimentos.set(
            href,
            Date.now()
        );

        try {
            var resposta =
                await fetch(
                    href,
                    {
                        credentials:
                            'same-origin',

                        headers: {
                            'X-Requested-With':
                                'XMLHttpRequest'
                        }
                    }
                );

            if (
                !resposta.ok ||
                new URL(
                    resposta.url
                ).origin !==
                window.location.origin ||
                caminhoNormalizado(
                    resposta.url
                ) ===
                '/login'
            ) {
                return;
            }

            var html =
                await resposta.text();

            var documentoNovo =
                new DOMParser()
                    .parseFromString(
                        html,
                        'text/html'
                    );

            preAquecerRecursos(
                documentoNovo
            );
        } catch (erro) {
            /*
             * É apenas otimização.
             * Uma falha aqui nunca deve
             * interferir com a app.
             */
        }
    }

    function preAquecerMenu() {
        if (
            preAquecimentoAgendado
        ) {
            return;
        }

        preAquecimentoAgendado =
            true;

        function executar() {
            preAquecimentoAgendado =
                false;

            document
                .querySelectorAll(
                    '#menuPrincipal a[href]'
                )
                .forEach(
                    function (link) {
                        preAquecerPagina(
                            link.href
                        );
                    }
                );
        }

        if (
            typeof window
                .requestIdleCallback ===
            'function'
        ) {
            window.requestIdleCallback(
                executar,
                {
                    timeout:
                        800
                }
            );

            return;
        }

        window.setTimeout(
            executar,
            350
        );
    }

    async function prepararEstilos(
        documentoNovo
    ) {
        var atuais =
            Array.from(
                document.head
                    .querySelectorAll(
                        'link[data-margot-page-style]'
                    )
            );

        var novos =
            Array.from(
                documentoNovo.head
                    .querySelectorAll(
                        'link[data-margot-page-style]'
                    )
            );

        var hrefsNovos =
            novos.map(
                function (link) {
                    return urlAbsoluta(
                        link.getAttribute(
                            'href'
                        )
                    );
                }
            );

        var promessas = [];

        novos.forEach(
            function (origem) {
                var href =
                    urlAbsoluta(
                        origem.getAttribute(
                            'href'
                        )
                    );

                if (
                    atuais.some(
                        function (link) {
                            return (
                                link.href ===
                                href
                            );
                        }
                    )
                ) {
                    return;
                }

                var link =
                    document.createElement(
                        'link'
                    );

                Array.from(
                    origem.attributes
                ).forEach(
                    function (atributo) {
                        link.setAttribute(
                            atributo.name,
                            atributo.value
                        );
                    }
                );

                link.href =
                    href;

                document.head.appendChild(
                    link
                );

                promessas.push(
                    aguardarEstilo(
                        link
                    )
                );
            }
        );

        await Promise.all(
            promessas
        );

        return function limparEstilosAntigos() {
            Array.from(
                document.head
                    .querySelectorAll(
                        'link[data-margot-page-style]'
                    )
            ).forEach(
                function (link) {
                    if (
                        !hrefsNovos.includes(
                            link.href
                        )
                    ) {
                        link.remove();
                    }
                }
            );
        };
    }

    function retirarScripts(
        pagina
    ) {
        var scripts =
            Array.from(
                pagina.querySelectorAll(
                    'script'
                )
            );

        scripts.forEach(
            function (script) {
                script.remove();
            }
        );

        return scripts;
    }

    function executarScript(
        origem
    ) {
        return new Promise(
            function (
                resolver,
                rejeitar
            ) {
                var script =
                    document.createElement(
                        'script'
                    );

                Array.from(
                    origem.attributes
                ).forEach(
                    function (atributo) {
                        script.setAttribute(
                            atributo.name,
                            atributo.value
                        );
                    }
                );

                script.async =
                    false;

                if (origem.src) {
                    script.src =
                        urlAbsoluta(
                            origem.getAttribute(
                                'src'
                            )
                        );

                    script.addEventListener(
                        'load',
                        function () {
                            script.remove();
                            resolver();
                        },
                        {
                            once:
                                true
                        }
                    );

                    script.addEventListener(
                        'error',
                        function () {
                            var src =
                                script.src;

                            script.remove();

                            rejeitar(
                                new Error(
                                    'Não foi possível carregar ' +
                                    src
                                )
                            );
                        },
                        {
                            once:
                                true
                        }
                    );
                } else {
                    script.textContent =
                        origem.textContent;
                }

                document.body
                    .appendChild(
                        script
                    );

                if (!origem.src) {
                    script.remove();
                    resolver();
                }
            }
        );
    }

    async function executarScripts(
        scripts
    ) {
        for (
            var indice = 0;
            indice <
            scripts.length;
            indice += 1
        ) {
            await executarScript(
                scripts[indice]
            );
        }
    }

    function animar(
        pagina,
        quadros,
        duracao
    ) {
        if (
            !pagina.animate ||
            duracao ===
            0
        ) {
            pagina.style.transform =
                quadros[
                    quadros.length -
                    1
                ].transform;

            pagina.style.opacity =
                quadros[
                    quadros.length -
                    1
                ].opacity;

            return Promise.resolve(
                null
            );
        }

        var animacao =
            pagina.animate(
                quadros,
                {
                    duration:
                        duracao,

                    easing:
                        'cubic-bezier(.22,.8,.28,1)',

                    fill:
                        'forwards'
                }
            );

        return animacao.finished
            .catch(
                function () {}
            )
            .then(
                function () {
                    return animacao;
                }
            );
    }

    async function navegarDocumentoComAnimacao(
        url,
        direcao
    ) {
        var paginaAtual =
            document.querySelector(
                seletorPagina
            );

        if (!paginaAtual) {
            window.location.assign(url);
            return;
        }

        var reduzido =
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches;

        var duracao =
            reduzido
                ? 0
                : 160;

        document.body.classList.add(
            'margot-a-navegar'
        );

        try {
            var animacao =
                await animar(
                    paginaAtual,
                    [
                        {
                            transform:
                                'translate3d(0,0,0)',

                            opacity:
                                '1'
                        },
                        {
                            transform:
                                direcao < 0
                                    ? 'translate3d(18%,0,0)'
                                    : 'translate3d(-18%,0,0)',

                            opacity:
                                '.82'
                        }
                    ],
                    duracao
                );

            if (animacao) {
                animacao.cancel();
            }
        } catch (erro) {
            /*
             * Uma falha da animação nunca pode
             * impedir a navegação real.
             */
        }

        window.location.assign(url);
    }

    function colocarNavegacaoPendente(
        url,
        opcoes
    ) {
        navegacaoPendente = {
            url:
                urlAbsoluta(
                    url
                ),

            opcoes:
                Object.assign(
                    {},
                    opcoes ||
                    {}
                )
        };

        atualizarMenu(
            navegacaoPendente.url
        );

        if (
            faseNavegacao ===
                'fetch' &&
            controlador
        ) {
            controlador.abort();
        }
    }

    async function trocarPagina(
        url,
        opcoes
    ) {
        opcoes =
            opcoes ||
            {};

        url =
            urlAbsoluta(
                url
            );

        if (aNavegar) {
            if (
                url ===
                urlEmNavegacao
            ) {
                atualizarMenu(
                    url
                );

                return;
            }

            colocarNavegacaoPendente(
                url,
                opcoes
            );

            return;
        }

        if (
            ePaginaAtual(
                url
            )
        ) {
            atualizarMenu(
                url
            );

            return;
        }

        aNavegar =
            true;

        faseNavegacao =
            'fetch';

        urlEmNavegacao =
            url;

        controlador =
            new AbortController();

        atualizarMenu(
            url
        );

        document.body.setAttribute(
            'aria-busy',
            'true'
        );

        try {
            var resposta =
                await fetch(
                    url,
                    {
                        credentials:
                            'same-origin',

                        headers: {
                            'X-Requested-With':
                                'XMLHttpRequest'
                        },

                        signal:
                            controlador.signal
                    }
                );

            if (!resposta.ok) {
                throw new Error(
                    'HTTP ' +
                    resposta.status
                );
            }

            if (
                new URL(
                    resposta.url
                ).origin !==
                window.location.origin
            ) {
                throw new Error(
                    'Destino externo'
                );
            }

            var html =
                await resposta.text();

            var documentoNovo =
                new DOMParser()
                    .parseFromString(
                        html,
                        'text/html'
                    );

            var paginaNova =
                documentoNovo.querySelector(
                    seletorPagina
                );

            var paginaAtual =
                document.querySelector(
                    seletorPagina
                );

            if (
                !paginaNova ||
                !paginaAtual
            ) {
                throw new Error(
                    'Página incompatível'
                );
            }

            if (
                caminhoNormalizado(
                    resposta.url
                ) ===
                '/login'
            ) {
                await navegarDocumentoComAnimacao(
                    resposta.url,
                    opcoes.direcao || -1
                );

                return;
            }

            faseNavegacao =
                'render';

            var scripts =
                retirarScripts(
                    paginaNova
                );

            var limparEstilosAntigos =
                await prepararEstilos(
                    documentoNovo
                );

            document.dispatchEvent(
                new CustomEvent(
                    'margot:page-leave'
                )
            );

            var direcao =
                opcoes.direcao;

            if (!direcao) {
                var atual =
                    indiceMenu(
                        urlRenderizada
                    );

                var seguinte =
                    indiceMenu(
                        resposta.url
                    );

                direcao =
                    atual !== null &&
                    seguinte !== null &&
                    seguinte < atual
                        ? -1
                        : 1;
            }

            paginaNova.style.transform =
                direcao > 0
                    ? 'translate3d(100%,0,0)'
                    : 'translate3d(-28%,0,0)';

            paginaNova.style.opacity =
                direcao > 0
                    ? '1'
                    : '.94';

            paginaAtual.insertAdjacentElement(
                'afterend',
                paginaNova
            );

            document.body.classList.add(
                'margot-a-navegar'
            );

            var reduzido =
                window.matchMedia(
                    '(prefers-reduced-motion: reduce)'
                ).matches;

            var duracao =
                reduzido
                    ? 0
                    : DURACAO_NAVEGACAO;

            var animacoes =
                await Promise.all([
                    animar(
                        paginaAtual,
                        [
                            {
                                transform:
                                    'translate3d(0,0,0)',

                                opacity:
                                    '1'
                            },
                            {
                                transform:
                                    direcao > 0
                                        ? 'translate3d(-28%,0,0)'
                                        : 'translate3d(100%,0,0)',

                                opacity:
                                    direcao > 0
                                        ? '.94'
                                        : '1'
                            }
                        ],
                        duracao
                    ),

                    animar(
                        paginaNova,
                        [
                            {
                                transform:
                                    direcao > 0
                                        ? 'translate3d(100%,0,0)'
                                        : 'translate3d(-28%,0,0)',

                                opacity:
                                    direcao > 0
                                        ? '1'
                                        : '.94'
                            },
                            {
                                transform:
                                    'translate3d(0,0,0)',

                                opacity:
                                    '1'
                            }
                        ],
                        duracao
                    )
                ]);

            animacoes.forEach(
                function (animacao) {
                    if (animacao) {
                        animacao.cancel();
                    }
                }
            );

            paginaAtual.remove();

            limparEstilosAntigos();

            paginaNova.removeAttribute(
                'style'
            );

            document.body.classList.remove(
                'margot-a-navegar'
            );

            document.title =
                documentoNovo.title ||
                document.title;

            if (
                !navegacaoPendente
            ) {
                if (
                    opcoes.historico ===
                    'push'
                ) {
                    posicaoHistorico +=
                        1;

                    history.pushState(
                        {
                            margotPosition:
                                posicaoHistorico
                        },
                        '',
                        resposta.url
                    );
                } else if (
                    opcoes.historico ===
                    'replace'
                ) {
                    history.replaceState(
                        {
                            margotPosition:
                                posicaoHistorico
                        },
                        '',
                        resposta.url
                    );
                }
            }

            urlRenderizada =
                resposta.url;

            if (
                !navegacaoPendente
            ) {
                atualizarMenu(
                    resposta.url
                );

                await executarScripts(
                    scripts
                );

                if (
                    window.AppWebSocket &&
                    typeof window
                        .AppWebSocket
                        .refreshMap ===
                        'function'
                ) {
                    window
                        .AppWebSocket
                        .refreshMap();
                }

                window.scrollTo(
                    0,
                    0
                );

                document.dispatchEvent(
                    new CustomEvent(
                        'margot:page-ready'
                    )
                );

                preAquecerMenu();
            }
        } catch (erro) {
            document.body.classList.remove(
                'margot-a-navegar'
            );

            if (
                erro.name !==
                'AbortError'
            ) {
                await navegarDocumentoComAnimacao(
                    url,
                    opcoes.direcao || 1
                );

                return;
            }
        } finally {
            controlador =
                null;

            urlEmNavegacao =
                null;

            faseNavegacao =
                'idle';

            aNavegar =
                false;

            document.body.removeAttribute(
                'aria-busy'
            );

            if (
                navegacaoPendente
            ) {
                var pendente =
                    navegacaoPendente;

                navegacaoPendente =
                    null;

                window.requestAnimationFrame(
                    function () {
                        trocarPagina(
                            pendente.url,
                            pendente.opcoes
                        );
                    }
                );
            }
        }
    }

    function voltarPagina(
        urlAlternativo
    ) {
        if (aNavegar) {
            colocarNavegacaoPendente(
                urlAlternativo,
                {
                    historico:
                        'replace',

                    direcao:
                        -1
                }
            );

            return;
        }

        if (
            posicaoHistorico >
            0
        ) {
            history.back();
            return;
        }

        trocarPagina(
            urlAlternativo,
            {
                historico:
                    'replace',

                direcao:
                    -1
            }
        );
    }

    /*
     * Swipe horizontal para voltar.
     *
     * Pode começar praticamente em qualquer ponto do ecrã.
     * Não interfere com a galeria do perfil nem com elementos
     * marcados manualmente com data-margot-no-back-swipe.
     */
    function elementoBloqueiaSwipeBack(elemento) {
        if (!(elemento instanceof Element)) {
            return false;
        }

        return Boolean(
            elemento.closest(
                '#perfil-galeria, ' +
                '[data-margot-no-back-swipe]'
            )
        );
    }

    function limparSwipeBack() {
        swipeBack.ativo = false;
        swipeBack.horizontal = false;
        swipeBack.ignorar = false;
        swipeBack.inicioX = 0;
        swipeBack.inicioY = 0;
        swipeBack.ultimoX = 0;
        swipeBack.ultimoY = 0;
        swipeBack.inicioTempo = 0;
    }

    function urlAlternativoParaVoltar() {
        var link =
            document.querySelector(
                '[data-margot-voltar][href]'
            );

        if (link && link.href) {
            return link.href;
        }

        return '/';
    }

    function iniciarSwipeBack(evento) {
        if (
            aNavegar ||
            !evento.touches ||
            evento.touches.length !== 1
        ) {
            limparSwipeBack();
            return;
        }

        var toque =
            evento.touches[0];

        if (
            elementoBloqueiaSwipeBack(
                evento.target
            )
        ) {
            limparSwipeBack();
            swipeBack.ignorar = true;
            return;
        }

        if (
            toque.clientX <=
            SWIPE_BACK_MARGEM_NATIVA
        ) {
            limparSwipeBack();
            swipeBack.ignorar = true;
            return;
        }

        swipeBack.ativo = true;
        swipeBack.horizontal = false;
        swipeBack.ignorar = false;

        swipeBack.inicioX =
            toque.clientX;

        swipeBack.inicioY =
            toque.clientY;

        swipeBack.ultimoX =
            toque.clientX;

        swipeBack.ultimoY =
            toque.clientY;

        swipeBack.inicioTempo =
            performance.now();
    }

    function moverSwipeBack(evento) {
        if (
            !swipeBack.ativo ||
            swipeBack.ignorar ||
            !evento.touches ||
            evento.touches.length !== 1
        ) {
            return;
        }

        var toque =
            evento.touches[0];

        var diferencaX =
            toque.clientX -
            swipeBack.inicioX;

        var diferencaY =
            toque.clientY -
            swipeBack.inicioY;

        swipeBack.ultimoX =
            toque.clientX;

        swipeBack.ultimoY =
            toque.clientY;

        if (diferencaX <= 0) {
            if (
                Math.abs(diferencaX) >
                SWIPE_BACK_MOVIMENTO_INICIAL
            ) {
                limparSwipeBack();
            }

            return;
        }

        if (!swipeBack.horizontal) {
            var horizontal =
                Math.abs(diferencaX);

            var vertical =
                Math.abs(diferencaY);

            if (
                horizontal <
                    SWIPE_BACK_MOVIMENTO_INICIAL &&
                vertical <
                    SWIPE_BACK_MOVIMENTO_INICIAL
            ) {
                return;
            }

            if (vertical > horizontal) {
                limparSwipeBack();
                return;
            }

            if (
                horizontal <
                vertical *
                    SWIPE_BACK_RAZAO_HORIZONTAL
            ) {
                return;
            }

            swipeBack.horizontal = true;
        }

        if (swipeBack.horizontal) {
            evento.preventDefault();
        }
    }

    function terminarSwipeBack() {
        if (
            !swipeBack.ativo ||
            swipeBack.ignorar
        ) {
            limparSwipeBack();
            return;
        }

        var diferencaX =
            swipeBack.ultimoX -
            swipeBack.inicioX;

        var diferencaY =
            swipeBack.ultimoY -
            swipeBack.inicioY;

        var duracao =
            Math.max(
                1,
                performance.now() -
                    swipeBack.inicioTempo
            );

        var velocidade =
            diferencaX /
            duracao;

        var gestoHorizontal =
            swipeBack.horizontal &&
            diferencaX > 0 &&
            Math.abs(diferencaX) >
                Math.abs(diferencaY) *
                SWIPE_BACK_RAZAO_HORIZONTAL;

        var distanciaSuficiente =
            diferencaX >=
            SWIPE_BACK_DISTANCIA_MINIMA;

        var velocidadeSuficiente =
            diferencaX >= 35 &&
            velocidade >=
                SWIPE_BACK_VELOCIDADE_MINIMA;

        limparSwipeBack();

        if (
            !gestoHorizontal ||
            (
                !distanciaSuficiente &&
                !velocidadeSuficiente
            )
        ) {
            return;
        }

        voltarPagina(
            urlAlternativoParaVoltar()
        );
    }

    function cancelarSwipeBack() {
        limparSwipeBack();
    }

    document.addEventListener(
        'touchstart',
        iniciarSwipeBack,
        {
            passive: true
        }
    );

    document.addEventListener(
        'touchmove',
        moverSwipeBack,
        {
            passive: false
        }
    );

    document.addEventListener(
        'touchend',
        terminarSwipeBack,
        {
            passive: true
        }
    );

    document.addEventListener(
        'touchcancel',
        cancelarSwipeBack,
        {
            passive: true
        }
    );

    /*
     * Navegação por links internos.
     *
     * Antes só o menu principal e os links com
     * data-margot-voltar usavam a transição. Isso fazia
     * conversa -> chat, chat -> perfil, perfil -> definições
     * e outros links internos abrirem com um reload seco.
     *
     * Agora qualquer <a> interno elegível passa pela mesma
     * navegação animada. Links externos, downloads, novas
     * janelas e âncoras da própria página continuam nativos.
     */
    document.addEventListener(
        'click',
        function (evento) {
            var link =
                evento.target.closest(
                    'a[href]'
                );

            if (
                !link ||
                evento.defaultPrevented ||
                (
                    evento.button !==
                        undefined &&
                    evento.button !==
                        0
                ) ||
                evento.metaKey ||
                evento.ctrlKey ||
                evento.shiftKey ||
                evento.altKey ||
                link.hasAttribute('download') ||
                link.hasAttribute(
                    'data-margot-sem-animacao'
                )
            ) {
                return;
            }

            var alvo =
                String(
                    link.getAttribute('target') ||
                    ''
                ).toLowerCase();

            if (
                alvo &&
                alvo !== '_self' &&
                alvo !== '_top'
            ) {
                return;
            }

            var hrefOriginal =
                String(
                    link.getAttribute('href') ||
                    ''
                ).trim();

            if (
                !hrefOriginal ||
                hrefOriginal.charAt(0) === '#'
            ) {
                return;
            }

            var url;

            try {
                url = new URL(
                    link.href,
                    window.location.href
                );
            } catch (erro) {
                return;
            }

            if (
                (
                    url.protocol !== 'http:' &&
                    url.protocol !== 'https:'
                ) ||
                url.origin !==
                    window.location.origin
            ) {
                return;
            }

            var atual =
                new URL(
                    window.location.href
                );

            if (
                chavePagina(url.href) ===
                    chavePagina(atual.href) &&
                url.hash &&
                url.hash !== atual.hash
            ) {
                return;
            }

            if (
                link.matches(
                    '[data-margot-voltar]'
                )
            ) {
                evento.preventDefault();

                voltarPagina(
                    url.href
                );

                return;
            }

            evento.preventDefault();

            trocarPagina(
                url.href,
                {
                    historico:
                        'push'
                }
            );
        }
    );

    window.addEventListener(
        'popstate',
        function (evento) {
            var proximaPosicao =
                evento.state &&
                Number.isFinite(
                    evento.state
                        .margotPosition
                )
                    ? evento.state
                        .margotPosition
                    : posicaoHistorico -
                        1;

            var indiceAtual =
                indiceMenu(
                    urlRenderizada
                );

            var indiceSeguinte =
                indiceMenu(
                    window.location.href
                );

            var direcao =
                indiceAtual !==
                    null &&
                indiceSeguinte !==
                    null &&
                indiceAtual !==
                    indiceSeguinte
                    ? (
                        indiceSeguinte <
                        indiceAtual
                            ? -1
                            : 1
                    )
                    : (
                        proximaPosicao <
                        posicaoHistorico
                            ? -1
                            : 1
                    );

            posicaoHistorico =
                proximaPosicao;

            trocarPagina(
                window.location.href,
                {
                    historico:
                        'pop',

                    direcao:
                        direcao
                }
            );
        }
    );

    history.replaceState(
        {
            margotPosition:
                posicaoHistorico
        },
        '',
        window.location.href
    );

    atualizarMenu(
        window.location.href
    );

    preAquecerMenu();

    window.MargotNavigation = {
        navigate:
            trocarPagina,

        back:
            voltarPagina,

        prefetch:
            preAquecerPagina
    };
})(
    window,
    document
);