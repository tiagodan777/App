(function () {
    'use strict';

    var CHAVE_TRANSICAO = 'margot:navegacao-pendente';
    var DURACAO_ENTRADA = 300;
    var DURACAO_SAIDA = 170;
    var navegacaoEmCurso = false;

    function caminhoNormalizado(valor) {
        try {
            var caminho = new URL(valor, window.location.href).pathname;
            caminho = caminho.replace(/\/index\.php$/i, '/index');
            caminho = caminho.replace(/\/+$/, '');
            return caminho || '/';
        } catch (erro) {
            return '/';
        }
    }

    function indiceDaPagina(valor) {
        var caminho = caminhoNormalizado(valor);

        if (/\/messages(?:\/|$)/i.test(caminho)) return 1;
        if (/\/profile(?:\/|$)/i.test(caminho)) return 2;
        if (caminho === '/' || /\/index$/i.test(caminho)) return 0;

        return null;
    }

    function conteudoDaPagina() {
        return document.getElementById('conteudoPagina') ||
            document.querySelector('[data-conteudo-pagina]') ||
            document.querySelector('body > main');
    }

    function movimentoReduzido() {
        return window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function limparAnimacao(elemento) {
        if (!elemento) return;

        elemento.getAnimations().forEach(function (animacao) {
            animacao.cancel();
        });

        elemento.style.removeProperty('transform');
        elemento.style.removeProperty('opacity');
        elemento.style.removeProperty('will-change');
        elemento.style.removeProperty('pointer-events');
        document.documentElement.classList.remove('margot-transicao-ativa');
    }

    function guardarTransicao(direcao) {
        try {
            sessionStorage.setItem(CHAVE_TRANSICAO, JSON.stringify({
                direcao: direcao,
                instante: Date.now()
            }));
        } catch (erro) {
            /* A navegação continua mesmo sem sessionStorage. */
        }
    }

    function obterTransicao() {
        try {
            var valor = sessionStorage.getItem(CHAVE_TRANSICAO);
            sessionStorage.removeItem(CHAVE_TRANSICAO);

            if (!valor) return null;

            var transicao = JSON.parse(valor);

            if (
                !transicao ||
                Date.now() - Number(transicao.instante) > 10000
            ) {
                return null;
            }

            return transicao;
        } catch (erro) {
            return null;
        }
    }

    function animarEntrada() {
        var transicao = obterTransicao();
        var conteudo = conteudoDaPagina();

        if (!transicao || !conteudo || movimentoReduzido()) return;

        var origem = transicao.direcao === 'direita'
            ? '-100vw'
            : '100vw';

        document.documentElement.classList.add('margot-transicao-ativa');
        conteudo.style.willChange = 'transform, opacity';

        var animacao = conteudo.animate([
            {
                transform: 'translate3d(' + origem + ', 0, 0)',
                opacity: 0.92
            },
            {
                transform: 'translate3d(0, 0, 0)',
                opacity: 1
            }
        ], {
            duration: DURACAO_ENTRADA,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both'
        });

        animacao.addEventListener('finish', function () {
            limparAnimacao(conteudo);
        }, { once: true });
    }

    function navegar(url, direcao) {
        if (navegacaoEmCurso) return;

        navegacaoEmCurso = true;
        guardarTransicao(direcao);

        var conteudo = conteudoDaPagina();

        if (!conteudo || movimentoReduzido()) {
            window.location.assign(url);
            return;
        }

        var destino = direcao === 'direita' ? '32vw' : '-32vw';

        document.documentElement.classList.add('margot-transicao-ativa');
        conteudo.style.pointerEvents = 'none';
        conteudo.style.willChange = 'transform, opacity';

        var animacao = conteudo.animate([
            {
                transform: 'translate3d(0, 0, 0)',
                opacity: 1
            },
            {
                transform: 'translate3d(' + destino + ', 0, 0)',
                opacity: 0.86
            }
        ], {
            duration: DURACAO_SAIDA,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'forwards'
        });

        var concluida = false;

        function concluir() {
            if (concluida) return;

            concluida = true;
            window.location.assign(url);
        }

        animacao.addEventListener('finish', concluir, { once: true });
        window.setTimeout(concluir, DURACAO_SAIDA + 80);
    }

    function atualizarPaginaAtiva() {
        var indiceAtual = indiceDaPagina(window.location.href);
        var links = document.querySelectorAll(
            '#menuPrincipal > nav > ul > li > a'
        );

        links.forEach(function (link) {
            var ativo =
                indiceAtual !== null &&
                indiceDaPagina(link.href) === indiceAtual;

            link.classList.toggle('active', ativo);

            if (ativo) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function tratarClique(evento) {
        var alvo = evento.target;

        if (!(alvo instanceof Element)) return;

        var link = alvo.closest(
            '#menuPrincipal > nav > ul > li > a'
        );

        if (
            !link ||
            evento.defaultPrevented ||
            evento.button !== 0
        ) {
            return;
        }

        if (
            evento.metaKey ||
            evento.ctrlKey ||
            evento.shiftKey ||
            evento.altKey
        ) {
            return;
        }

        if (link.target && link.target !== '_self') return;

        var url = new URL(link.href, window.location.href);

        if (url.origin !== window.location.origin) return;

        var atual = indiceDaPagina(window.location.href);
        var destino = indiceDaPagina(url.href);

        if (atual === null || destino === null) return;

        evento.preventDefault();

        if (atual === destino) {
            atualizarPaginaAtiva();
            return;
        }

        navegar(
            url.href,
            destino > atual ? 'esquerda' : 'direita'
        );
    }

    document.addEventListener('click', tratarClique);

    function iniciar() {
        atualizarPaginaAtiva();

        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(animarEntrada);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }

    window.addEventListener('pageshow', function (evento) {
        navegacaoEmCurso = false;
        atualizarPaginaAtiva();

        if (evento.persisted) {
            limparAnimacao(conteudoDaPagina());
        }
    });
}());