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
    var recursosPreCarregados = new Map();
    var posicoesAbas = new Map();
    var animacaoEmCurso = null;
    var ESPERA_MAXIMA_RECURSO = 5000;
    var DURACAO_NAVEGACAO = 160;
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
        return new URL(url, window.location.href).href;
    }

    function caminhoNormalizado(url) {
        var caminho = new URL(url, window.location.href).pathname.replace(/\/+$/, '') || '/';
        return caminho === '/index' ? '/' : caminho;
    }

    function chavePagina(url) {
        var destino = new URL(url, window.location.href);
        return caminhoNormalizado(destino.href) + destino.search;
    }

    function ePaginaAtual(url) {
        return chavePagina(url) === chavePagina(urlRenderizada);
    }

    function indiceMenu(url) {
        var caminho = caminhoNormalizado(url);
        if (caminho === '/') {
            return 0;
        }
        if (caminho === '/messages') {
            return 1;
        }
        if (caminho.indexOf('/profile/') === 0) {
            return 2;
        }
        return null;
    }

    function atualizarMenu(url) {
        var caminho = caminhoNormalizado(url);
        document.querySelectorAll('#menuPrincipal a[href]').forEach(function (link) {
            var ativo = caminhoNormalizado(link.href) === caminho;
            link.classList.toggle('active', ativo);
            if (ativo) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    // O ecrã atual continua utilizável enquanto os recursos do destino carregam.
    function aguardarRecurso(elemento, sinal) {
        return new Promise(function (resolver, rejeitar) {
            if (sinal && sinal.aborted) {
                rejeitar(new DOMException('Navegação substituída', 'AbortError'));
                return;
            }
            if (elemento.sheet) {
                resolver();
                return;
            }
            var temporizador = window.setTimeout(falhou, ESPERA_MAXIMA_RECURSO);
            function terminar(erro) {
                window.clearTimeout(temporizador);
                elemento.removeEventListener('load', carregou);
                elemento.removeEventListener('error', falhou);
                if (sinal) sinal.removeEventListener('abort', cancelar);
                if (erro) rejeitar(erro);
                else resolver();
            }
            function carregou() {
                terminar();
            }
            function falhou() {
                terminar(new Error('Não foi possível carregar ' + elemento.href));
            }
            function cancelar() {
                terminar(new DOMException('Navegação substituída', 'AbortError'));
            }
            elemento.addEventListener('load', carregou, { once: true });
            elemento.addEventListener('error', falhou, { once: true });
            if (sinal) sinal.addEventListener('abort', cancelar, { once: true });
        });
    }

    function adicionarPreload(href, tipo) {
        href = urlAbsoluta(href);
        if (
            tipo === 'script' &&
            Array.from(document.scripts).some(function (script) {
                return script.src === href;
            })
        ) {
            return Promise.resolve();
        }
        var chave = tipo + ':' + href;
        var anterior = recursosPreCarregados.get(chave);
        if (anterior && Date.now() - anterior.criadoEm < 1000) return anterior.promessa;
        if (anterior) anterior.link.remove();
        var preload = document.createElement('link');
        preload.rel = 'preload';
        preload.href = href;
        preload.as = tipo;
        preload.setAttribute('data-margot-preload', '');
        var promessa = aguardarRecurso(preload).catch(function (erro) {
            if (recursosPreCarregados.get(chave)?.link === preload) recursosPreCarregados.delete(chave);
            preload.remove();
            throw erro;
        });
        recursosPreCarregados.set(chave, { promessa: promessa, link: preload, criadoEm: Date.now() });
        document.head.appendChild(preload);
        return promessa;
    }

    function preAquecerRecursos(documentoNovo) {
        var recursos = [];
        documentoNovo.head.querySelectorAll('link[data-margot-page-style][href]').forEach(function (link) {
            recursos.push(adicionarPreload(link.getAttribute('href'), 'style'));
        });
        var pagina = documentoNovo.querySelector(seletorPagina);
        if (pagina)
            pagina.querySelectorAll('script[src]').forEach(function (script) {
                recursos.push(adicionarPreload(script.getAttribute('src'), 'script'));
            });
        return Promise.all(recursos);
    }

    function aguardarPreparacao(promessa, sinal) {
        return new Promise(function (resolver, rejeitar) {
            function cancelar() {
                rejeitar(new DOMException('Navegação substituída', 'AbortError'));
            }
            if (sinal.aborted) cancelar();
            else sinal.addEventListener('abort', cancelar, { once: true });
            promessa.then(resolver, rejeitar).finally(function () {
                sinal.removeEventListener('abort', cancelar);
            });
        });
    }

    async function preAquecerPagina(url) {
        var href = urlAbsoluta(url);
        var destino = new URL(href);
        if (destino.origin !== window.location.origin || ePaginaAtual(href)) {
            return;
        }
        var ultimo = preAquecimentos.get(href);
        if (ultimo && Date.now() - ultimo < TEMPO_REAQUECER) {
            return;
        }
        preAquecimentos.set(href, Date.now());
        try {
            var resposta = await fetch(href, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (
                !resposta.ok ||
                new URL(resposta.url).origin !== window.location.origin ||
                caminhoNormalizado(resposta.url) === '/login'
            ) {
                return;
            }
            var html = await resposta.text();
            var documentoNovo = new DOMParser().parseFromString(html, 'text/html');
            await preAquecerRecursos(documentoNovo);
        } catch (erro) {
            /*
             * É apenas otimização.
             * Uma falha aqui nunca deve
             * interferir com a app.
             */
        }
    }

    function preAquecerMenu() {
        if (preAquecimentoAgendado) {
            return;
        }
        preAquecimentoAgendado = true;
        function executar() {
            preAquecimentoAgendado = false;
            document.querySelectorAll('#menuPrincipal a[href]').forEach(function (link) {
                preAquecerPagina(link.href);
            });
        }
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(executar, { timeout: 800 });
            return;
        }
        window.setTimeout(executar, 350);
    }

    async function prepararEstilos(documentoNovo, sinal) {
        var atuais = Array.from(document.head.querySelectorAll('link[data-margot-page-style]'));
        var novos = Array.from(documentoNovo.head.querySelectorAll('link[data-margot-page-style]'));
        var preparados = [];
        var hrefs = novos.map(function (link) {
            return urlAbsoluta(link.getAttribute('href'));
        });
        try {
            await Promise.all(
                novos.map(function (origem) {
                    var href = urlAbsoluta(origem.getAttribute('href'));
                    if (
                        atuais.some(function (link) {
                            return link.href === href;
                        })
                    )
                        return;
                    var link = origem.cloneNode();
                    var media = origem.getAttribute('media');
                    link.href = href;
                    link.media = 'not all';
                    preparados.push({ link: link, media: media });
                    var carregamento = aguardarRecurso(link, sinal);
                    document.head.appendChild(link);
                    return carregamento;
                })
            );
        } catch (erro) {
            preparados.forEach(function (item) {
                item.link.remove();
            });
            throw erro;
        }
        return {
            aplicar: function () {
                preparados.forEach(function (item) {
                    if (item.media === null) item.link.removeAttribute('media');
                    else item.link.media = item.media;
                });
                atuais.forEach(function (link) {
                    if (!hrefs.includes(link.href)) link.remove();
                });
            },
            cancelar: function () {
                preparados.forEach(function (item) {
                    item.link.remove();
                });
            }
        };
    }

    function eAbaPrincipal(url) {
        return Array.from(document.querySelectorAll('#menuPrincipal a[href]')).some(function (link) {
            return chavePagina(link.href) === chavePagina(url);
        });
    }

    function guardarPosicaoAba(pagina) {
        if (!eAbaPrincipal(urlRenderizada)) return;
        var conteudo = pagina.querySelector('main') || pagina.firstElementChild;
        posicoesAbas.set(chavePagina(urlRenderizada), {
            janela: window.scrollY,
            pagina: pagina.scrollTop,
            conteudo: conteudo ? conteudo.scrollTop : 0
        });
    }

    function reporPosicaoAba(pagina, url) {
        var posicao = posicoesAbas.get(chavePagina(url));
        window.scrollTo(0, posicao ? posicao.janela : 0);
        pagina.scrollTop = posicao ? posicao.pagina : 0;
        var conteudo = pagina.querySelector('main') || pagina.firstElementChild;
        if (conteudo) conteudo.scrollTop = posicao ? posicao.conteudo : 0;
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
                script.src = urlAbsoluta(origem.getAttribute('src'));
                script.addEventListener(
                    'load',
                    function () {
                        script.remove();
                        resolver();
                    },
                    { once: true }
                );
                script.addEventListener(
                    'error',
                    function () {
                        var src = script.src;
                        script.remove();
                        rejeitar(new Error('Não foi possível carregar ' + src));
                    },
                    { once: true }
                );
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

    function colocarNavegacaoPendente(url, opcoes) {
        navegacaoPendente = { url: urlAbsoluta(url), opcoes: Object.assign({}, opcoes || {}) };
        atualizarMenu(navegacaoPendente.url);
        if ((faseNavegacao === 'fetch' || faseNavegacao === 'prepare') && controlador) controlador.abort();
        if (animacaoEmCurso) animacaoEmCurso.cancel();
    }

    async function trocarPagina(url, opcoes) {
        opcoes = opcoes || {};
        url = urlAbsoluta(url);
        if (aNavegar) {
            if (url === urlEmNavegacao && controlador && !controlador.signal.aborted) {
                navegacaoPendente = null;
                atualizarMenu(url);
                return;
            }
            colocarNavegacaoPendente(url, opcoes);
            return;
        }
        if (ePaginaAtual(url)) {
            atualizarMenu(url);
            return;
        }
        aNavegar = true;
        faseNavegacao = 'fetch';
        urlEmNavegacao = url;
        controlador = new AbortController();
        var estilos = null;
        var paginaNova = null;
        atualizarMenu(url);
        document.body.setAttribute('aria-busy', 'true');
        try {
            var resposta = await fetch(url, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: controlador.signal
            });
            if (!resposta.ok || new URL(resposta.url).origin !== window.location.origin) {
                throw new Error('Não foi possível abrir a página');
            }
            var html = await resposta.text();
            var documentoNovo = new DOMParser().parseFromString(html, 'text/html');
            paginaNova = documentoNovo.querySelector(seletorPagina);
            var paginaAtual = document.querySelector(seletorPagina);
            if (!paginaNova || !paginaAtual || caminhoNormalizado(resposta.url) === '/login') {
                window.location.assign(resposta.url);
                return;
            }
            faseNavegacao = 'prepare';
            // Descarrega em paralelo; só executa depois de existir um único DOM da página.
            await aguardarPreparacao(preAquecerRecursos(documentoNovo), controlador.signal);
            estilos = await prepararEstilos(documentoNovo, controlador.signal);
            if (controlador.signal.aborted) throw new DOMException('Navegação substituída', 'AbortError');
            var scripts = retirarScripts(paginaNova);
            var trocaDeAba = opcoes.aba || (eAbaPrincipal(urlRenderizada) && eAbaPrincipal(resposta.url));
            var direcao = opcoes.direcao || 1;
            faseNavegacao = 'render';
            guardarPosicaoAba(paginaAtual);
            document.dispatchEvent(new CustomEvent('margot:page-leave'));
            paginaNova.style.visibility = 'hidden';
            paginaNova.style.pointerEvents = 'none';
            paginaAtual.replaceWith(paginaNova);
            estilos.aplicar();
            estilos = null;
            window.scrollTo(0, 0);
            document.title = documentoNovo.title || document.title;
            urlRenderizada = resposta.url;
            if (!navegacaoPendente) {
                if (opcoes.historico === 'push') {
                    posicaoHistorico += 1;
                    history.pushState({ margotPosition: posicaoHistorico }, '', resposta.url);
                } else if (opcoes.historico === 'replace') {
                    history.replaceState({ margotPosition: posicaoHistorico }, '', resposta.url);
                }
            }
            // Os scripts veem o URL de destino e um único DOM, mesmo com outro toque pendente.
            await executarScripts(scripts);
            reporPosicaoAba(paginaNova, resposta.url);
            document.dispatchEvent(new CustomEvent('margot:page-ready'));
            await new Promise(function (resolver) {
                window.requestAnimationFrame(resolver);
            });
            paginaNova.style.removeProperty('visibility');
            var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var duracao = reduzido || navegacaoPendente ? 0 : trocaDeAba ? 100 : DURACAO_NAVEGACAO;
            if (duracao && paginaNova.animate) {
                faseNavegacao = 'animate';
                document.body.classList.add('margot-a-navegar');
                var inicio = trocaDeAba
                    ? { opacity: 0.8 }
                    : { opacity: 0.8, transform: 'translate3d(' + (direcao < 0 ? '-18px' : '18px') + ',0,0)' };
                var fim = trocaDeAba ? { opacity: 1 } : { opacity: 1, transform: 'translate3d(0,0,0)' };
                animacaoEmCurso = paginaNova.animate([inicio, fim], {
                    duration: duracao,
                    easing: 'ease-out',
                    fill: 'both'
                });
                await animacaoEmCurso.finished.catch(function () {});
                animacaoEmCurso.cancel();
                animacaoEmCurso = null;
            }
            if (!navegacaoPendente) {
                atualizarMenu(resposta.url);
                preAquecerMenu();
            }
        } catch (erro) {
            if (erro.name !== 'AbortError') {
                var destino = navegacaoPendente ? navegacaoPendente.url : url;
                navegacaoPendente = null;
                window.location.assign(destino);
            }
        } finally {
            if (estilos) estilos.cancelar();
            if (paginaNova) {
                paginaNova.style.removeProperty('visibility');
                paginaNova.style.removeProperty('pointer-events');
            }
            document.body.classList.remove('margot-a-navegar');
            document.body.removeAttribute('aria-busy');
            controlador = null;
            urlEmNavegacao = null;
            faseNavegacao = 'idle';
            aNavegar = false;
            if (navegacaoPendente) {
                var pendente = navegacaoPendente;
                navegacaoPendente = null;
                trocarPagina(pendente.url, pendente.opcoes);
            }
        }
    }

    function voltarPagina(urlAlternativo) {
        if (aNavegar) {
            colocarNavegacaoPendente(urlAlternativo, { historico: 'replace', direcao: -1 });
            return;
        }
        if (posicaoHistorico > 0) {
            history.back();
            return;
        }
        trocarPagina(urlAlternativo, { historico: 'replace', direcao: -1 });
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
        return Boolean(elemento.closest('#perfil-galeria, ' + '[data-margot-no-back-swipe]'));
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
        var link = document.querySelector('[data-margot-voltar][href]');
        if (link && link.href) {
            return link.href;
        }
        return '/';
    }

    function iniciarSwipeBack(evento) {
        if (aNavegar || !evento.touches || evento.touches.length !== 1) {
            limparSwipeBack();
            return;
        }
        var toque = evento.touches[0];
        if (elementoBloqueiaSwipeBack(evento.target)) {
            limparSwipeBack();
            swipeBack.ignorar = true;
            return;
        }
        if (toque.clientX <= SWIPE_BACK_MARGEM_NATIVA) {
            limparSwipeBack();
            swipeBack.ignorar = true;
            return;
        }
        swipeBack.ativo = true;
        swipeBack.horizontal = false;
        swipeBack.ignorar = false;
        swipeBack.inicioX = toque.clientX;
        swipeBack.inicioY = toque.clientY;
        swipeBack.ultimoX = toque.clientX;
        swipeBack.ultimoY = toque.clientY;
        swipeBack.inicioTempo = performance.now();
    }

    function moverSwipeBack(evento) {
        if (!swipeBack.ativo || swipeBack.ignorar || !evento.touches || evento.touches.length !== 1) {
            return;
        }
        var toque = evento.touches[0];
        var diferencaX = toque.clientX - swipeBack.inicioX;
        var diferencaY = toque.clientY - swipeBack.inicioY;
        swipeBack.ultimoX = toque.clientX;
        swipeBack.ultimoY = toque.clientY;
        if (diferencaX <= 0) {
            if (Math.abs(diferencaX) > SWIPE_BACK_MOVIMENTO_INICIAL) {
                limparSwipeBack();
            }
            return;
        }
        if (!swipeBack.horizontal) {
            var horizontal = Math.abs(diferencaX);
            var vertical = Math.abs(diferencaY);
            if (horizontal < SWIPE_BACK_MOVIMENTO_INICIAL && vertical < SWIPE_BACK_MOVIMENTO_INICIAL) {
                return;
            }
            if (vertical > horizontal) {
                limparSwipeBack();
                return;
            }
            if (horizontal < vertical * SWIPE_BACK_RAZAO_HORIZONTAL) {
                return;
            }
            swipeBack.horizontal = true;
        }
        if (swipeBack.horizontal) {
            evento.preventDefault();
        }
    }

    function terminarSwipeBack() {
        if (!swipeBack.ativo || swipeBack.ignorar) {
            limparSwipeBack();
            return;
        }
        var diferencaX = swipeBack.ultimoX - swipeBack.inicioX;
        var diferencaY = swipeBack.ultimoY - swipeBack.inicioY;
        var duracao = Math.max(1, performance.now() - swipeBack.inicioTempo);
        var velocidade = diferencaX / duracao;
        var gestoHorizontal =
            swipeBack.horizontal &&
            diferencaX > 0 &&
            Math.abs(diferencaX) > Math.abs(diferencaY) * SWIPE_BACK_RAZAO_HORIZONTAL;
        var distanciaSuficiente = diferencaX >= SWIPE_BACK_DISTANCIA_MINIMA;
        var velocidadeSuficiente = diferencaX >= 35 && velocidade >= SWIPE_BACK_VELOCIDADE_MINIMA;
        limparSwipeBack();
        if (!gestoHorizontal || (!distanciaSuficiente && !velocidadeSuficiente)) {
            return;
        }
        voltarPagina(urlAlternativoParaVoltar());
    }

    function cancelarSwipeBack() {
        limparSwipeBack();
    }
    document.addEventListener('touchstart', iniciarSwipeBack, { passive: true });
    document.addEventListener('touchmove', moverSwipeBack, { passive: false });
    document.addEventListener('touchend', terminarSwipeBack, { passive: true });
    document.addEventListener('touchcancel', cancelarSwipeBack, { passive: true });

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
        if (alvo && alvo !== '_self' && alvo !== '_top') {
            return;
        }
        var hrefOriginal = String(link.getAttribute('href') || '').trim();
        if (!hrefOriginal || hrefOriginal.charAt(0) === '#') {
            return;
        }
        var url;
        try {
            url = new URL(link.href, window.location.href);
        } catch (erro) {
            return;
        }
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== window.location.origin) {
            return;
        }
        var atual = new URL(window.location.href);
        if (chavePagina(url.href) === chavePagina(atual.href) && url.hash && url.hash !== atual.hash) {
            return;
        }
        if (link.matches('[data-margot-voltar]')) {
            evento.preventDefault();
            voltarPagina(url.href);
            return;
        }
        evento.preventDefault();
        trocarPagina(url.href, { historico: 'push', aba: Boolean(link.closest('#menuPrincipal')) });
    });
    window.addEventListener('popstate', function (evento) {
        var proximaPosicao =
            evento.state && Number.isFinite(evento.state.margotPosition)
                ? evento.state.margotPosition
                : posicaoHistorico - 1;
        var indiceAtual = indiceMenu(urlRenderizada);
        var indiceSeguinte = indiceMenu(window.location.href);
        var direcao =
            indiceAtual !== null && indiceSeguinte !== null && indiceAtual !== indiceSeguinte
                ? indiceSeguinte < indiceAtual
                    ? -1
                    : 1
                : proximaPosicao < posicaoHistorico
                  ? -1
                  : 1;
        posicaoHistorico = proximaPosicao;
        trocarPagina(window.location.href, { historico: 'pop', direcao: direcao });
    });
    history.replaceState({ margotPosition: posicaoHistorico }, '', window.location.href);
    atualizarMenu(window.location.href);
    preAquecerMenu();
    window.MargotNavigation = { navigate: trocarPagina, back: voltarPagina, prefetch: preAquecerPagina };
})(window, document);
