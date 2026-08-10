(function (window, document) {
    'use strict';

    if (window.MargotNavigation) return;

    var seletorPagina = '[data-margot-pagina]';
    var aNavegar = false;
    var posicaoHistorico = 0;
    var controlador = null;
    var urlRenderizada = window.location.href;

    function caminhoNormalizado(url) {
        var caminho = new URL(url, window.location.href).pathname.replace(/\/+$/, '') || '/';
        return caminho === '/index' ? '/' : caminho;
    }

    function ePaginaAtual(url) {
        return caminhoNormalizado(url) === caminhoNormalizado(urlRenderizada);
    }

    function indiceMenu(url) {
        var caminho = caminhoNormalizado(url);
        if (caminho === '/') return 0;
        if (caminho === '/messages') return 1;
        if (caminho.indexOf('/profile/') === 0) return 2;
        return null;
    }

    function atualizarMenu(url) {
        var caminho = caminhoNormalizado(url);
        document.querySelectorAll('#menuPrincipal a[href]').forEach(function (link) {
            var ativo = caminhoNormalizado(link.href) === caminho;
            link.classList.toggle('active', ativo);
            if (ativo) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
    }

    function aguardarEstilo(link) {
        return new Promise(function (resolver) {
            if (link.sheet) {
                resolver();
                return;
            }

            link.addEventListener('load', resolver, { once: true });
            link.addEventListener('error', resolver, { once: true });
            window.setTimeout(resolver, 2500);
        });
    }

    async function sincronizarEstilos(documentoNovo) {
        var atuais = Array.from(document.head.querySelectorAll('link[data-margot-page-style]'));
        var novos = Array.from(documentoNovo.head.querySelectorAll('link[data-margot-page-style]'));
        var hrefsNovos = novos.map(function (link) {
            return new URL(link.getAttribute('href'), window.location.href).href;
        });
        var promessas = [];

        novos.forEach(function (origem) {
            var href = new URL(origem.getAttribute('href'), window.location.href).href;

            if (atuais.some(function (link) {
                return link.href === href;
            })) {
                return;
            }

            var link = document.createElement('link');

            Array.from(origem.attributes).forEach(function (atributo) {
                link.setAttribute(atributo.name, atributo.value);
            });

            link.href = href;
            document.head.appendChild(link);
            promessas.push(aguardarEstilo(link));
        });

        await Promise.all(promessas);

        atuais.forEach(function (link) {
            if (!hrefsNovos.includes(link.href)) link.remove();
        });
    }

    function retirarScripts(pagina) {
        var scripts = Array.from(pagina.querySelectorAll('script'));

        scripts.forEach(function (script) {
            script.remove();
        });

        return scripts;
    }

    function executarScript(origem) {
        return new Promise(function (resolver, rejeitar) {
            var script = document.createElement('script');

            Array.from(origem.attributes).forEach(function (atributo) {
                script.setAttribute(atributo.name, atributo.value);
            });

            script.async = false;

            if (origem.src) {
                script.src = new URL(origem.getAttribute('src'), window.location.href).href;

                script.addEventListener('load', function () {
                    script.remove();
                    resolver();
                }, { once: true });

                script.addEventListener('error', function () {
                    script.remove();
                    rejeitar(new Error('Não foi possível carregar ' + script.src));
                }, { once: true });
            } else {
                script.textContent = origem.textContent;
            }

            document.body.appendChild(script);

            if (!origem.src) {
                script.remove();
                resolver();
            }
        });
    }

    async function executarScripts(scripts) {
        for (var indice = 0; indice < scripts.length; indice += 1) {
            await executarScript(scripts[indice]);
        }
    }

    function animar(pagina, quadros, duracao) {
        if (!pagina.animate || duracao === 0) {
            pagina.style.transform = quadros[quadros.length - 1].transform;
            pagina.style.opacity = quadros[quadros.length - 1].opacity;
            return Promise.resolve(null);
        }

        var animacao = pagina.animate(quadros, {
            duration: duracao,
            easing: 'cubic-bezier(.22,.8,.28,1)',
            fill: 'forwards'
        });

        return animacao.finished
            .catch(function () {})
            .then(function () {
                return animacao;
            });
    }

    async function trocarPagina(url, opcoes) {
        if (aNavegar || ePaginaAtual(url)) {
            atualizarMenu(window.location.href);
            return;
        }

        aNavegar = true;
        controlador = new AbortController();
        document.body.setAttribute('aria-busy', 'true');

        try {
            var resposta = await fetch(url, {
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                signal: controlador.signal
            });

            if (!resposta.ok) {
                throw new Error('HTTP ' + resposta.status);
            }

            if (new URL(resposta.url).origin !== window.location.origin) {
                throw new Error('Destino externo');
            }

            var html = await resposta.text();
            var documentoNovo = new DOMParser().parseFromString(html, 'text/html');
            var paginaNova = documentoNovo.querySelector(seletorPagina);
            var paginaAtual = document.querySelector(seletorPagina);

            if (!paginaNova || !paginaAtual) {
                throw new Error('Página incompatível');
            }

            if (caminhoNormalizado(resposta.url) === '/login') {
                window.location.assign(resposta.url);
                return;
            }

            var scripts = retirarScripts(paginaNova);

            await sincronizarEstilos(documentoNovo);
            document.dispatchEvent(new CustomEvent('margot:page-leave'));

            var direcao = opcoes.direcao;

            if (!direcao) {
                var atual = indiceMenu(window.location.href);
                var seguinte = indiceMenu(resposta.url);

                direcao = atual !== null && seguinte !== null && seguinte < atual
                    ? -1
                    : 1;
            }

            paginaNova.style.transform = direcao > 0
                ? 'translate3d(100%,0,0)'
                : 'translate3d(-28%,0,0)';

            paginaNova.style.opacity = direcao > 0 ? '1' : '.94';
            paginaAtual.insertAdjacentElement('afterend', paginaNova);
            document.body.classList.add('margot-a-navegar');

            var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var duracao = reduzido ? 0 : 300;

            var animacoes = await Promise.all([
                animar(paginaAtual, [
                    {
                        transform: 'translate3d(0,0,0)',
                        opacity: '1'
                    },
                    {
                        transform: direcao > 0
                            ? 'translate3d(-28%,0,0)'
                            : 'translate3d(100%,0,0)',
                        opacity: direcao > 0 ? '.94' : '1'
                    }
                ], duracao),
                animar(paginaNova, [
                    {
                        transform: direcao > 0
                            ? 'translate3d(100%,0,0)'
                            : 'translate3d(-28%,0,0)',
                        opacity: direcao > 0 ? '1' : '.94'
                    },
                    {
                        transform: 'translate3d(0,0,0)',
                        opacity: '1'
                    }
                ], duracao)
            ]);

            animacoes.forEach(function (animacao) {
                if (animacao) animacao.cancel();
            });

            paginaAtual.remove();
            paginaNova.removeAttribute('style');
            document.body.classList.remove('margot-a-navegar');
            document.title = documentoNovo.title || document.title;

            if (opcoes.historico === 'push') {
                posicaoHistorico += 1;

                history.pushState({
                    margotPosition: posicaoHistorico
                }, '', resposta.url);
            } else if (opcoes.historico === 'replace') {
                history.replaceState({
                    margotPosition: posicaoHistorico
                }, '', resposta.url);
            }

            urlRenderizada = resposta.url;
            atualizarMenu(resposta.url);
            await executarScripts(scripts);

            if (
                window.AppWebSocket &&
                typeof window.AppWebSocket.refreshMap === 'function'
            ) {
                window.AppWebSocket.refreshMap();
            }

            window.scrollTo(0, 0);
            document.dispatchEvent(new CustomEvent('margot:page-ready'));
        } catch (erro) {
            document.body.classList.remove('margot-a-navegar');

            if (erro.name !== 'AbortError') {
                window.location.assign(url);
            }
        } finally {
            controlador = null;
            aNavegar = false;
            document.body.removeAttribute('aria-busy');
        }
    }

    function voltarPagina(urlAlternativo) {
        if (aNavegar) return;

        if (posicaoHistorico > 0) {
            history.back();
            return;
        }

        trocarPagina(urlAlternativo, {
            historico: 'replace',
            direcao: -1
        });
    }

    document.addEventListener('click', function (evento) {
        var linkVoltar = evento.target.closest('[data-margot-voltar][href]');

        if (
            linkVoltar &&
            !evento.defaultPrevented &&
            evento.button === 0 &&
            !evento.metaKey &&
            !evento.ctrlKey &&
            !evento.shiftKey &&
            !evento.altKey
        ) {
            var urlVoltar = new URL(linkVoltar.href, window.location.href);

            if (urlVoltar.origin === window.location.origin) {
                evento.preventDefault();
                voltarPagina(urlVoltar.href);
                return;
            }
        }

        var link = evento.target.closest('#menuPrincipal a[href]');

        if (
            !link ||
            evento.defaultPrevented ||
            evento.button !== 0 ||
            evento.metaKey ||
            evento.ctrlKey ||
            evento.shiftKey ||
            evento.altKey
        ) {
            return;
        }

        var url = new URL(link.href, window.location.href);

        if (url.origin !== window.location.origin) return;

        evento.preventDefault();

        if (ePaginaAtual(url.href)) {
            atualizarMenu(url.href);
            return;
        }

        trocarPagina(url.href, {
            historico: 'push'
        });
    });

    window.addEventListener('popstate', function (evento) {
        var proximaPosicao =
            evento.state &&
            Number.isFinite(evento.state.margotPosition)
                ? evento.state.margotPosition
                : posicaoHistorico - 1;

        var indiceAtual = indiceMenu(urlRenderizada);
        var indiceSeguinte = indiceMenu(window.location.href);

        var direcao =
            indiceAtual !== null &&
            indiceSeguinte !== null &&
            indiceAtual !== indiceSeguinte
                ? (indiceSeguinte < indiceAtual ? -1 : 1)
                : (proximaPosicao < posicaoHistorico ? -1 : 1);

        posicaoHistorico = proximaPosicao;

        trocarPagina(window.location.href, {
            historico: 'pop',
            direcao: direcao
        });
    });

    history.replaceState({
        margotPosition: posicaoHistorico
    }, '', window.location.href);

    atualizarMenu(window.location.href);

    window.MargotNavigation = {
        navigate: trocarPagina,
        back: voltarPagina
    };
})(window, document);