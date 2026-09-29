(function (window, document) {
    'use strict';

    if (window.MargotDocumentNavigation) {
        return;
    }

    // Uma só transição: evita sobrepor a animação CSS entre documentos.
    var motionStyle = document.createElement('style');
    motionStyle.textContent = '@view-transition { navigation: none; }';
    document.head.append(motionStyle);

    var DURACAO_ENTRADA = 360;
    var DURACAO_SAIDA = 240;
    var CHAVE_ENTRADA = 'margot-document-navigation-entry';
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
            valor =
                window.sessionStorage.getItem(CHAVE_ENTRADA) ||
                '';

            window.sessionStorage.removeItem(CHAVE_ENTRADA);
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

        return idade >= 0 && idade <= TEMPO_MAXIMO_ENTRADA;
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
        document.body.style.removeProperty('filter');
        document.body.style.removeProperty('pointer-events');
    }

    function animarEntrada() {
        /*
         * Num cold start não existe esta flag.
         * Só animamos a entrada quando a navegação
         * foi iniciada pela própria Margot.
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
                        opacity: 0,
                        filter: 'blur(6px)'
                    },
                    {
                        transform: 'translate3d(0, 0, 0)',
                        opacity: 1,
                        filter: 'blur(0)'
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
                        opacity: 1,
                        filter: 'blur(0)'
                    },
                    {
                        transform: voltar
                            ? 'translate3d(16px, 0, 0)'
                            : 'translate3d(-16px, 0, 0)',
                        opacity: 0,
                        filter: 'blur(6px)'
                    }
                ],
                {
                    duration: DURACAO_SAIDA,
                    easing: 'cubic-bezier(.22, .8, .28, 1)',
                    fill: 'forwards'
                }
            );

            await animacaoAtual.finished.catch(function () {});
        } catch (erro) {
            /*
             * A navegação real tem sempre prioridade.
             */
        }

        return true;
    }

    async function sair(url, voltar) {
        var podeNavegar = await animarSaida(Boolean(voltar));

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

    document.addEventListener('click', function (evento) {
        var link = evento.target.closest('a[href]');

        if (
            !link ||
            evento.defaultPrevented ||
            (evento.button !== undefined && evento.button !== 0) ||
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

        if (!href || href.charAt(0) === '#') {
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

        var atual = new URL(window.location.href);

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
    });

    /*
     * Ao regressar através do BFCache, remove o estado
     * visual deixado pela animação de saída.
     *
     * O pageshow inicial não deve cancelar a entrada.
     */
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            restaurarPagina();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            animarEntrada,
            { once: true }
        );
    } else {
        animarEntrada();
    }

    window.MargotDocumentNavigation = {
        navigate: sair,
        back: voltar
    };
})(window, document);