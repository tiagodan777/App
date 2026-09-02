(function (window, document) {
    'use strict';

    if (window.MargotDocumentNavigation) {
        return;
    }

    var DURACAO_ENTRADA = 170;
    var DURACAO_SAIDA = 150;

    var CHAVE_ENTRADA =
        'margot-document-navigation-entry';

    var TEMPO_MAXIMO_ENTRADA = 3000;

    var aNavegar = false;
    var animacaoAtual = null;

    function movimentoReduzido() {
        return window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches;
    }

    function guardarEntradaPendente() {
        try {
            window.sessionStorage.setItem(
                CHAVE_ENTRADA,
                String(Date.now())
            );
        } catch (erro) {
            /* sessionStorage não é essencial. */
        }
    }

    function consumirEntradaPendente() {
        var valor = '';

        try {
            valor = window.sessionStorage.getItem(
                CHAVE_ENTRADA
            ) || '';

            window.sessionStorage.removeItem(
                CHAVE_ENTRADA
            );
        } catch (erro) {
            return false;
        }

        if (!valor) {
            return false;
        }

        var instante = Number(valor);

        if (!Number.isFinite(instante)) {
            return false;
        }

        var idade = Date.now() - instante;

        return (
            idade >= 0 &&
            idade <= TEMPO_MAXIMO_ENTRADA
        );
    }

    function cancelarAnimacaoAtual() {
        if (!animacaoAtual) {
            return;
        }

        try {
            animacaoAtual.cancel();
        } catch (erro) {
            /* Nada a fazer. */
        }

        animacaoAtual = null;
    }

    function restaurarPagina() {
        aNavegar = false;

        cancelarAnimacaoAtual();

        if (!document.body) {
            return;
        }

        document.body.style.removeProperty('transform');
        document.body.style.removeProperty('opacity');
        document.body.style.removeProperty('pointer-events');
    }

    function animarEntrada() {
        /*
         * Esta é a alteração importante.
         *
         * Num cold start NÃO existe esta flag.
         * Portanto não aplicamos qualquer transform ao body.
         *
         * Só existe uma animação de entrada quando esta página
         * foi aberta por uma navegação iniciada pela própria Margot.
         */
        if (!consumirEntradaPendente()) {
            return;
        }

        if (
            movimentoReduzido() ||
            !document.body ||
            !document.body.animate
        ) {
            return;
        }

        cancelarAnimacaoAtual();

        try {
            animacaoAtual = document.body.animate(
                [
                    {
                        transform: 'translate3d(14px, 0, 0)',
                        opacity: 0.86
                    },
                    {
                        transform: 'translate3d(0, 0, 0)',
                        opacity: 1
                    }
                ],
                {
                    duration: DURACAO_ENTRADA,
                    easing: 'cubic-bezier(.22, .8, .28, 1)'
                }
            );

            animacaoAtual.finished
                .catch(function () {})
                .finally(function () {
                    animacaoAtual = null;
                });
        } catch (erro) {
            animacaoAtual = null;
        }
    }

    async function animarSaida(voltar) {
        if (aNavegar) {
            return false;
        }

        aNavegar = true;

        if (
            movimentoReduzido() ||
            !document.body ||
            !document.body.animate
        ) {
            return true;
        }

        cancelarAnimacaoAtual();

        try {
            animacaoAtual = document.body.animate(
                [
                    {
                        transform: 'translate3d(0, 0, 0)',
                        opacity: 1
                    },
                    {
                        transform: voltar
                            ? 'translate3d(16px, 0, 0)'
                            : 'translate3d(-16px, 0, 0)',
                        opacity: 0.82
                    }
                ],
                {
                    duration: DURACAO_SAIDA,
                    easing: 'cubic-bezier(.22, .8, .28, 1)',
                    fill: 'forwards'
                }
            );

            await animacaoAtual.finished.catch(
                function () {}
            );
        } catch (erro) {
            /*
             * A navegação real tem sempre prioridade.
             */
        }

        return true;
    }

    async function sair(url, voltar) {
        var podeNavegar = await animarSaida(
            Boolean(voltar)
        );

        if (!podeNavegar) {
            return;
        }

        guardarEntradaPendente();

        window.location.assign(url);
    }

    async function voltar() {
        var podeNavegar = await animarSaida(true);

        if (!podeNavegar) {
            return;
        }

        guardarEntradaPendente();

        window.history.back();
    }

    document.addEventListener(
        'click',
        function (evento) {
            var link = evento.target.closest('a[href]');

            if (
                !link ||
                evento.defaultPrevented ||
                (
                    evento.button !== undefined &&
                    evento.button !== 0
                ) ||
                evento.metaKey ||
                evento.ctrlKey ||
                evento.shiftKey ||
                evento.altKey ||
                link.hasAttribute('download') ||
                link.hasAttribute('data-margot-sem-animacao')
            ) {
                return;
            }

            var alvo = String(
                link.getAttribute('target') || ''
            ).toLowerCase();

            if (
                alvo &&
                alvo !== '_self' &&
                alvo !== '_top'
            ) {
                return;
            }

            var href = String(
                link.getAttribute('href') || ''
            ).trim();

            if (
                !href ||
                href.charAt(0) === '#'
            ) {
                return;
            }

            var destino;

            try {
                destino = new URL(
                    link.href,
                    window.location.href
                );
            } catch (erro) {
                return;
            }

            if (
                (
                    destino.protocol !== 'http:' &&
                    destino.protocol !== 'https:'
                ) ||
                destino.origin !== window.location.origin
            ) {
                return;
            }

            var atual = new URL(
                window.location.href
            );

            if (
                destino.pathname === atual.pathname &&
                destino.search === atual.search &&
                destino.hash &&
                destino.hash !== atual.hash
            ) {
                return;
            }

            evento.preventDefault();

            sair(
                destino.href,
                link.hasAttribute('data-margot-voltar')
            );
        }
    );

    /*
     * O pageshow também é disparado quando o Safari/WKWebView
     * restaura uma página através do BFCache.
     *
     * Assim nunca regressamos a uma página que ainda tenha
     * o estado visual da animação de saída.
     */
    window.addEventListener(
        'pageshow',
        function () {
            restaurarPagina();
        }
    );

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            animarEntrada,
            {
                once: true
            }
        );
    } else {
        animarEntrada();
    }

    window.MargotDocumentNavigation = {
        navigate: sair,
        back: voltar
    };
})(window, document);