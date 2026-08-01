(function (window, document) {
    'use strict';

    var DURACAO_TRANSICAO = 260;
    var LIMITE_GESTO = 28;
    var navegacaoEmCurso = false;
    var pedidoAtual = null;
    var indiceHistoricoAtual = 0;
    var gesto = {
        ativo: false,
        horizontal: false,
        inicioX: 0,
        inicioY: 0,
        atualX: 0,
        inicioTempo: 0
    };

    function normalizarCaminho(caminho) {
        var resultado = String(caminho || '/').replace(/\/+$/, '');
        return resultado === '' ? '/' : resultado;
    }

    function conteudoPagina() {
        return document.getElementById('conteudoPagina');
    }

    function atualizarMenu() {
        var atual = normalizarCaminho(window.location.pathname);
        var links = document.querySelectorAll('#menuPrincipal > nav > ul > li > a');

        links.forEach(function (link) {
            var destino = normalizarCaminho(new URL(link.href, window.location.href).pathname);
            var ativo = atual === destino || atual.indexOf(destino + '/') === 0;

            if (destino === '/index' && atual === '/') ativo = true;

            link.classList.toggle('active', ativo);

            if (ativo) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function prepararHistorico() {
        var estado = window.history.state;

        if (!estado || typeof estado.margotIndice !== 'number') {
            window.history.replaceState(
                { margotIndice: 0 },
                '',
                window.location.href
            );
        }

        indiceHistoricoAtual = Number(window.history.state.margotIndice) || 0;
    }

    function prepararEntrada() {
        var direcao = window.sessionStorage.getItem('margot-direcao-entrada');
        var pagina = conteudoPagina();

        window.sessionStorage.removeItem('margot-direcao-entrada');

        if (!pagina || (direcao !== 'frente' && direcao !== 'voltar')) return;

        document.body.classList.add(
            'margot-entrada',
            direcao === 'voltar' ? 'margot-entrada-esquerda' : 'margot-entrada-direita'
        );

        pagina.getBoundingClientRect();

        window.requestAnimationFrame(function () {
            document.body.classList.add('margot-entrada-pronta');

            window.setTimeout(function () {
                document.body.classList.remove(
                    'margot-entrada',
                    'margot-entrada-esquerda',
                    'margot-entrada-direita',
                    'margot-entrada-pronta'
                );
            }, DURACAO_TRANSICAO + 60);
        });
    }

    function linkElegivel(link, evento) {
        if (!link || navegacaoEmCurso) return false;
        if (evento.defaultPrevented || evento.button !== 0) return false;
        if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;
        if (link.hasAttribute('download') || link.dataset.semAjax !== undefined) return false;
        if (link.target && link.target !== '_self') return false;

        var destino;

        try {
            destino = new URL(link.href, window.location.href);
        } catch (erro) {
            return false;
        }

        if (destino.origin !== window.location.origin) return false;
        if (!/^https?:$/.test(destino.protocol)) return false;

        var atualSemHash = window.location.href.split('#')[0];
        var destinoSemHash = destino.href.split('#')[0];

        if (destinoSemHash === atualSemHash && destino.hash) return false;

        return true;
    }

    async function obterDocumento(url) {
        if (pedidoAtual) pedidoAtual.abort();

        pedidoAtual = new AbortController();

        var resposta = await window.fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            redirect: 'follow',
            headers: {
                Accept: 'text/html',
                'X-Margot-Navigation': 'ajax'
            },
            signal: pedidoAtual.signal
        });

        var tipo = resposta.headers.get('content-type') || '';

        if (!resposta.ok || tipo.indexOf('text/html') === -1) {
            throw new Error('A página não pôde ser carregada.');
        }

        var destinoFinal = new URL(resposta.url, window.location.href);

        if (destinoFinal.origin !== window.location.origin) {
            throw new Error('O destino não pertence à Margot.');
        }

        return {
            html: await resposta.text(),
            url: destinoFinal.href
        };
    }

    function escreverDocumento(html, direcao) {
        var pagina = conteudoPagina();

        window.sessionStorage.setItem('margot-direcao-entrada', direcao);

        function substituir() {
            document.open();
            document.write(html);
            document.close();
        }

        if (!pagina || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            substituir();
            return;
        }

        pagina.style.pointerEvents = 'none';
        pagina.style.transition = 'transform ' + DURACAO_TRANSICAO + 'ms cubic-bezier(.32,.72,0,1), opacity ' + DURACAO_TRANSICAO + 'ms ease';
        pagina.style.transform = direcao === 'voltar'
            ? 'translate3d(100vw,0,0)'
            : 'translate3d(-100vw,0,0)';
        pagina.style.opacity = '0.96';

        window.setTimeout(substituir, DURACAO_TRANSICAO);
    }

    async function navegar(url, opcoes) {
        if (navegacaoEmCurso) return;

        navegacaoEmCurso = true;
        document.documentElement.setAttribute('aria-busy', 'true');

        try {
            var documento = await obterDocumento(url);
            var direcao = opcoes && opcoes.direcao === 'voltar' ? 'voltar' : 'frente';

            if (!opcoes || !opcoes.historico) {
                indiceHistoricoAtual += 1;

                window.history.pushState(
                    { margotIndice: indiceHistoricoAtual },
                    '',
                    documento.url
                );
            } else if (documento.url !== window.location.href) {
                window.history.replaceState(
                    window.history.state,
                    '',
                    documento.url
                );
            }

            escreverDocumento(documento.html, direcao);
        } catch (erro) {
            if (erro && erro.name === 'AbortError') return;

            if (opcoes && opcoes.historico) {
                window.location.reload();
            } else {
                window.location.assign(url);
            }
        } finally {
            document.documentElement.removeAttribute('aria-busy');
        }
    }

    function aoClicar(evento) {
        var origem = evento.target;
        var link = origem && origem.closest ? origem.closest('a[href]') : null;

        if (!linkElegivel(link, evento)) return;

        evento.preventDefault();
        navegar(link.href, { direcao: 'frente' });
    }

    function aoMudarHistorico(evento) {
        var novoIndice = Number(evento.state && evento.state.margotIndice) || 0;
        var direcao = novoIndice < indiceHistoricoAtual ? 'voltar' : 'frente';

        indiceHistoricoAtual = novoIndice;

        navegar(window.location.href, {
            historico: true,
            direcao: direcao
        });
    }

    function podeVoltar() {
        return Number(window.history.state && window.history.state.margotIndice) > 0;
    }

    function iniciarGesto(evento) {
        if (navegacaoEmCurso || !podeVoltar() || evento.touches.length !== 1) return;

        var toque = evento.touches[0];

        if (toque.clientX > LIMITE_GESTO) return;

        gesto.ativo = true;
        gesto.horizontal = false;
        gesto.inicioX = toque.clientX;
        gesto.inicioY = toque.clientY;
        gesto.atualX = toque.clientX;
        gesto.inicioTempo = Date.now();
    }

    function moverGesto(evento) {
        if (!gesto.ativo || evento.touches.length !== 1) return;

        var toque = evento.touches[0];
        var distanciaX = Math.max(0, toque.clientX - gesto.inicioX);
        var distanciaY = Math.abs(toque.clientY - gesto.inicioY);

        gesto.atualX = toque.clientX;

        if (!gesto.horizontal) {
            if (distanciaX < 8) return;

            if (distanciaY > distanciaX) {
                gesto.ativo = false;
                return;
            }

            gesto.horizontal = true;
        }

        evento.preventDefault();

        var pagina = conteudoPagina();

        if (!pagina) return;

        pagina.style.transition = 'none';
        pagina.style.transform = 'translate3d(' + distanciaX + 'px,0,0)';
    }

    function terminarGesto() {
        if (!gesto.ativo) return;

        var pagina = conteudoPagina();
        var distancia = Math.max(0, gesto.atualX - gesto.inicioX);
        var duracao = Math.max(1, Date.now() - gesto.inicioTempo);
        var velocidade = distancia / duracao;
        var concluir = gesto.horizontal && (
            distancia > window.innerWidth * 0.28 ||
            velocidade > 0.55
        );

        gesto.ativo = false;
        gesto.horizontal = false;

        if (concluir) {
            if (pagina) {
                pagina.style.transition = 'transform 180ms cubic-bezier(.32,.72,0,1)';
                pagina.style.transform = 'translate3d(100vw,0,0)';
            }

            window.history.back();
            return;
        }

        if (pagina) {
            pagina.style.transition = 'transform 220ms cubic-bezier(.32,.72,0,1)';
            pagina.style.transform = 'translate3d(0,0,0)';
        }
    }

    prepararHistorico();
    atualizarMenu();
    prepararEntrada();

    document.addEventListener('click', aoClicar);
    window.addEventListener('popstate', aoMudarHistorico);
    document.addEventListener('touchstart', iniciarGesto, { passive: true });
    document.addEventListener('touchmove', moverGesto, { passive: false });
    document.addEventListener('touchend', terminarGesto, { passive: true });
    document.addEventListener('touchcancel', terminarGesto, { passive: true });
})(window, document);