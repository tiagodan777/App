(function (window, document) {
    'use strict';

    var DURACAO_TRANSICAO = 460;
    var navegacaoEmCurso = false;

    function normalizarCaminho(caminho) {
        var resultado = String(caminho || '/').replace(/\/+$/, '');

        if (
            resultado === '' ||
            resultado === '/index' ||
            resultado === '/index.php'
        ) {
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

    function indiceAtual() {
        return indicePeloCaminho(window.location.pathname);
    }

    function atualizarMenu(links, indiceAtivo) {
        links.forEach(function (link, indice) {
            var ativo = indice === indiceAtivo;

            link.classList.toggle('active', ativo);

            if (ativo) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function linkElegivel(evento, link) {
        if (!link || navegacaoEmCurso || evento.defaultPrevented) {
            return false;
        }

        if (
            typeof evento.button === 'number' &&
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
            return new URL(
                link.href,
                window.location.href
            ).origin === window.location.origin;
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
        var cortina = document.createElement('div');
        var inicio = direcao === 'esquerda' ? '-100%' : '100%';

        cortina.id = 'margot-transicao-cortina';
        cortina.setAttribute('aria-hidden', 'true');
        cortina.style.position = 'fixed';
        cortina.style.inset = '0';
        cortina.style.zIndex = '1090';
        cortina.style.backgroundColor = '#ffffff';
        cortina.style.pointerEvents = 'auto';
        cortina.style.transform =
            'translate3d(' + inicio + ',0,0)';
        cortina.style.willChange = 'transform';
        cortina.style.backfaceVisibility = 'hidden';
        cortina.style.webkitBackfaceVisibility = 'hidden';
        cortina.style.boxShadow =
            direcao === 'esquerda'
                ? '12px 0 28px rgba(0,0,0,.055)'
                : '-12px 0 28px rgba(0,0,0,.055)';

        document.body.appendChild(cortina);

        return cortina;
    }

    function navegar(destino, direcao) {
        if (
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        ) {
            window.location.assign(destino.href);
            return;
        }

        removerCortina();

        var cortina = criarCortina(direcao);
        var terminou = false;

        navegacaoEmCurso = true;

        document.documentElement.classList.add(
            'margot-transicao-ativa'
        );
        document.documentElement.setAttribute(
            'aria-busy',
            'true'
        );

        function concluir() {
            if (terminou) {
                return;
            }

            terminou = true;
            cortina.style.transition = 'none';
            cortina.style.transform = 'translate3d(0,0,0)';

            window.requestAnimationFrame(function () {
                window.location.assign(destino.href);
            });
        }

        cortina.getBoundingClientRect();

        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                cortina.style.transition =
                    'transform ' +
                    DURACAO_TRANSICAO +
                    'ms cubic-bezier(.22,1,.36,1)';

                cortina.style.transform =
                    'translate3d(0,0,0)';
            });
        });

        cortina.addEventListener(
            'transitionend',
            function (evento) {
                if (
                    evento.target === cortina &&
                    evento.propertyName === 'transform'
                ) {
                    concluir();
                }
            },
            { once: true }
        );

        window.setTimeout(
            concluir,
            DURACAO_TRANSICAO + 160
        );
    }

    function aoClicar(evento) {
        var elemento = evento.target;
        var link =
            elemento && elemento.closest
                ? elemento.closest(
                    '#menuPrincipal > nav > ul > li > a[href]'
                )
                : null;

        if (!linkElegivel(evento, link)) {
            return;
        }

        var links = obterLinks();
        var origem = indiceAtual();
        var chegada = links.indexOf(link);

        if (chegada < 0) {
            return;
        }

        evento.preventDefault();
        evento.stopPropagation();
        evento.stopImmediatePropagation();

        if (chegada === origem) {
            atualizarMenu(links, origem);
            return;
        }

        atualizarMenu(links, chegada);

        navegar(
            new URL(link.href, window.location.href),
            chegada < origem ? 'esquerda' : 'direita'
        );
    }

    function iniciar() {
        removerCortina();
        atualizarMenu(obterLinks(), indiceAtual());
        document.addEventListener('click', aoClicar, true);
    }

    window.addEventListener('pageshow', function () {
        removerCortina();
        atualizarMenu(obterLinks(), indiceAtual());
    });

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