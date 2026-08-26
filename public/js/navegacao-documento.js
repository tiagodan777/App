(function (window, document) {
    'use strict';

    if (window.MargotDocumentNavigation) return;

    var DURACAO_ENTRADA = 170;
    var DURACAO_SAIDA = 150;
    var aNavegar = false;

    function movimentoReduzido() {
        return window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches;
    }

    function animarEntrada() {
        if (
            movimentoReduzido() ||
            !document.body ||
            !document.body.animate
        ) {
            return;
        }

        document.body.animate(
            [
                {
                    transform: 'translate3d(14px,0,0)',
                    opacity: 0.86
                },
                {
                    transform: 'translate3d(0,0,0)',
                    opacity: 1
                }
            ],
            {
                duration: DURACAO_ENTRADA,
                easing: 'cubic-bezier(.22,.8,.28,1)'
            }
        );
    }

    async function animarSaida(voltar) {
        if (aNavegar) return false;
        aNavegar = true;

        if (
            movimentoReduzido() ||
            !document.body ||
            !document.body.animate
        ) {
            return true;
        }

        try {
            var animacao = document.body.animate(
                [
                    {
                        transform: 'translate3d(0,0,0)',
                        opacity: 1
                    },
                    {
                        transform: voltar
                            ? 'translate3d(16px,0,0)'
                            : 'translate3d(-16px,0,0)',
                        opacity: 0.82
                    }
                ],
                {
                    duration: DURACAO_SAIDA,
                    easing: 'cubic-bezier(.22,.8,.28,1)',
                    fill: 'forwards'
                }
            );

            await animacao.finished.catch(function () {});
        } catch (erro) {
            /* A navegação real tem sempre prioridade. */
        }

        return true;
    }

    async function sair(url, voltar) {
        var podeNavegar = await animarSaida(Boolean(voltar));
        if (!podeNavegar) return;

        window.location.assign(url);
    }

    async function voltar() {
        var podeNavegar = await animarSaida(true);
        if (!podeNavegar) return;

        window.history.back();
    }

    /*
     * Navegação documental para ecrãs que não usam o contentor
     * [data-margot-pagina]. Mantém a mesma linguagem de movimento
     * tanto ao avançar como ao regressar no histórico.
     */

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

        var alvo = String(link.getAttribute('target') || '').toLowerCase();
        if (alvo && alvo !== '_self' && alvo !== '_top') return;

        var href = String(link.getAttribute('href') || '').trim();
        if (!href || href.charAt(0) === '#') return;

        var destino;

        try {
            destino = new URL(link.href, window.location.href);
        } catch (erro) {
            return;
        }

        if (
            (destino.protocol !== 'http:' && destino.protocol !== 'https:') ||
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