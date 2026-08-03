(function (window, document) {
    'use strict';

    var DURACAO_TRANSICAO = 280;
    var navegacaoEmCurso = false;

    function normalizarCaminho(caminho) {
        var resultado = String(caminho || '/').replace(/\/+$/, '');

        if (resultado === '' || resultado === '/index' || resultado === '/index.php') {
            return '/';
        }

        return resultado;
    }

    function indicePeloCaminho(caminho) {
        var normalizado = normalizarCaminho(caminho);

        if (
            normalizado === '/messages' ||
            normalizado.indexOf('/messages/') === 0 ||
            normalizado === '/chat' ||
            normalizado.indexOf('/chat/') === 0
        ) {
            return 1;
        }

        if (
            normalizado === '/profile' ||
            normalizado.indexOf('/profile/') === 0 ||
            normalizado === '/settings' ||
            normalizado.indexOf('/settings/') === 0
        ) {
            return 2;
        }

        return 0;
    }

    function obterLinks() {
        return Array.prototype.slice.call(
            document.querySelectorAll(
                '#menuPrincipal > nav > ul > li > a[href]'
            )
        );
    }

    function indiceAtual(links) {
        var ativo = links.findIndex(function (link) {
            return (
                link.classList.contains('active') ||
                link.getAttribute('aria-current') === 'page'
            );
        });

        return ativo >= 0
            ? ativo
            : indicePeloCaminho(window.location.pathname);
    }

    function atualizarLinkAtivo(links, linkAtivo) {
        links.forEach(function (link) {
            var ativo = link === linkAtivo;

            link.classList.toggle('active', ativo);

            if (ativo) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function mesmoDestino(destino) {
        var atual = new URL(window.location.href);
        var atualCaminho = normalizarCaminho(atual.pathname);
        var destinoCaminho = normalizarCaminho(destino.pathname);

        return (
            atualCaminho === destinoCaminho &&
            atual.search === destino.search
        );
    }

    function linkElegivel(evento, link) {
        if (
            !link ||
            navegacaoEmCurso ||
            evento.defaultPrevented ||
            evento.button !== 0
        ) {
            return false;
        }

        if (
            evento.metaKey ||
            evento.ctrlKey ||
            evento.shiftKey ||
            evento.altKey
        ) {
            return false;
        }

        if (
            link.hasAttribute('download') ||
            link.hasAttribute('data-sem-transicao')
        ) {
            return false;
        }

        if (link.target && link.target !== '_self') {
            return false;
        }

        try {
            return (
                new URL(link.href, window.location.href).origin ===
                window.location.origin
            );
        } catch (erro) {
            return false;
        }
    }

    function removerCortina() {
        var cortina = document.getElementById(
            'margot-transicao-cortina'
        );

        if (cortina) {
            cortina.remove();
        }

        document.documentElement.classList.remove(
            'margot-transicao-ativa'
        );
        document.documentElement.removeAttribute('aria-busy');
        navegacaoEmCurso = false;
    }

    function criarCortina(direcao) {
        removerCortina();

        var cortina = document.createElement('div');
        var inicio = direcao === 'esquerda' ? '-100%' : '100%';

        cortina.id = 'margot-transicao-cortina';
        cortina.setAttribute('aria-hidden', 'true');
        cortina.style.position = 'fixed';
        cortina.style.inset = '0';
        cortina.style.zIndex = '1090';
        cortina.style.background = '#ffffff';
        cortina.style.pointerEvents = 'auto';
        cortina.style.transform =
            'translate3d(' + inicio + ', 0, 0)';
        cortina.style.willChange = 'transform';
        cortina.style.backfaceVisibility = 'hidden';
        cortina.style.webkitBackfaceVisibility = 'hidden';
        cortina.style.boxShadow =
            direcao === 'esquerda'
                ? '12px 0 28px rgba(0, 0, 0, 0.06)'
                : '-12px 0 28px rgba(0, 0, 0, 0.06)';

        document.body.appendChild(cortina);

        return cortina;
    }

    function navegar(destino, direcao) {
        if (
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        ) {
            navegacaoEmCurso = true;
            window.location.assign(destino.href);
            return;
        }

        var cortina = criarCortina(direcao);
        var terminou = false;

        navegacaoEmCurso = true;
        document.documentElement.classList.add(
            'margot-transicao-ativa'
        );
        document.documentElement.setAttribute('aria-busy', 'true');

        function concluir() {
            if (terminou) {
                return;
            }

            terminou = true;
            window.location.assign(destino.href);
        }

        cortina.getBoundingClientRect();

        window.requestAnimationFrame(function () {
            cortina.style.transition =
                'transform ' +
                DURACAO_TRANSICAO +
                'ms cubic-bezier(.32,.72,0,1)';
            cortina.style.transform = 'translate3d(0, 0, 0)';
        });

        cortina.addEventListener('transitionend', concluir, {
            once: true
        });

        window.setTimeout(
            concluir,
            DURACAO_TRANSICAO + 120
        );
    }

    function aoClicar(evento) {
        var link = evento.currentTarget;

        if (!linkElegivel(evento, link)) {
            return;
        }

        var destino = new URL(
            link.href,
            window.location.href
        );

        if (mesmoDestino(destino)) {
            evento.preventDefault();
            return;
        }

        evento.preventDefault();

        var links = obterLinks();
        var origem = indiceAtual(links);
        var chegada = links.indexOf(link);
        var direcao =
            chegada < origem ? 'esquerda' : 'direita';

        atualizarLinkAtivo(links, link);
        navegar(destino, direcao);
    }

    function iniciar() {
        removerCortina();

        obterLinks().forEach(function (link) {
            link.addEventListener('click', aoClicar);
        });
    }

    window.addEventListener('pageshow', removerCortina);

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }
})(window, document);