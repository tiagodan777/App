(function (window, document) {
    'use strict';

    var DURACAO_TRANSICAO = 260;
    var LIMITE_GESTO = 28;
    var navegacaoEmCurso = false;

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

        if (
            resultado === '' ||
            resultado === '/index' ||
            resultado === '/index.php'
        ) {
            return '/';
        }

        return resultado;
    }

    function paginaAtual() {
        return document.getElementById('conteudoPagina');
    }

    function limparAnimacao() {
        var pagina = paginaAtual();

        if (!pagina) {
            return;
        }

        pagina.style.pointerEvents = '';
        pagina.style.transition = '';
        pagina.style.transform = '';
        pagina.style.opacity = '';

        document.body.classList.remove(
            'margot-entrada',
            'margot-entrada-esquerda',
            'margot-entrada-direita',
            'margot-entrada-pronta'
        );
    }

    function atualizarMenu() {
        var atual = normalizarCaminho(window.location.pathname);
        var links = document.querySelectorAll(
            '#menuPrincipal > nav > ul > li > a[href]'
        );

        links.forEach(function (link) {
            var destino = normalizarCaminho(
                new URL(link.href, window.location.href).pathname
            );

            var ativo =
                atual === destino ||
                (
                    destino !== '/' &&
                    atual.indexOf(destino + '/') === 0
                );

            link.classList.toggle('active', ativo);

            if (ativo) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function prepararHistorico() {
        var pendente = Number(
            window.sessionStorage.getItem('margot-indice-pendente')
        );

        var contador = Number(
            window.sessionStorage.getItem('margot-contador-historico')
        ) || 0;

        if (
            !window.history.state ||
            typeof window.history.state.margotIndice !== 'number'
        ) {
            var indice =
                Number.isFinite(pendente) && pendente > 0
                    ? pendente
                    : contador + 1;

            window.history.replaceState(
                { margotIndice: indice },
                '',
                window.location.href
            );

            contador = Math.max(contador, indice);

            window.sessionStorage.setItem(
                'margot-contador-historico',
                String(contador)
            );
        }

        window.sessionStorage.removeItem('margot-indice-pendente');
    }

    function direcaoEntrada() {
        var explicita = window.sessionStorage.getItem(
            'margot-direcao-entrada'
        );

        window.sessionStorage.removeItem('margot-direcao-entrada');

        if (
            explicita === 'frente' ||
            explicita === 'voltar'
        ) {
            return explicita;
        }

        var anterior = Number(
            window.sessionStorage.getItem('margot-indice-saida')
        );

        var atual = Number(
            window.history.state &&
            window.history.state.margotIndice
        );

        if (
            !Number.isFinite(anterior) ||
            !Number.isFinite(atual) ||
            anterior === atual
        ) {
            return '';
        }

        return atual < anterior
            ? 'voltar'
            : 'frente';
    }

    function animarEntrada() {
        var direcao = direcaoEntrada();
        var pagina = paginaAtual();

        if (
            !pagina ||
            !direcao ||
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        ) {
            return;
        }

        document.body.classList.add(
            'margot-entrada',
            direcao === 'voltar'
                ? 'margot-entrada-esquerda'
                : 'margot-entrada-direita'
        );

        pagina.getBoundingClientRect();

        window.requestAnimationFrame(function () {
            document.body.classList.add(
                'margot-entrada-pronta'
            );

            window.setTimeout(
                limparAnimacao,
                DURACAO_TRANSICAO + 60
            );
        });
    }

    function urlsIguais(urlA, urlB) {
        var a = new URL(urlA, window.location.href);
        var b = new URL(urlB, window.location.href);

        return (
            normalizarCaminho(a.pathname) ===
                normalizarCaminho(b.pathname) &&
            a.search === b.search
        );
    }

    function linkElegivel(link, evento) {
        if (
            !link ||
            navegacaoEmCurso ||
            evento.defaultPrevented
        ) {
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
            link.hasAttribute('data-sem-transicao') ||
            link.hasAttribute('data-sem-ajax')
        ) {
            return false;
        }

        if (
            link.target &&
            link.target !== '_self'
        ) {
            return false;
        }

        var destino;

        try {
            destino = new URL(
                link.href,
                window.location.href
            );
        } catch (erro) {
            return false;
        }

        if (
            destino.origin !== window.location.origin ||
            !/^https?:$/.test(destino.protocol)
        ) {
            return false;
        }

        if (
            destino.hash &&
            urlsIguais(
                destino.href,
                window.location.href
            )
        ) {
            return false;
        }

        return true;
    }

    function guardarSaida() {
        var indice = Number(
            window.history.state &&
            window.history.state.margotIndice
        );

        if (Number.isFinite(indice)) {
            window.sessionStorage.setItem(
                'margot-indice-saida',
                String(indice)
            );
        }
    }

    function navegar(url, direcao) {
        if (navegacaoEmCurso) {
            return;
        }

        navegacaoEmCurso = true;
        guardarSaida();

        window.sessionStorage.setItem(
            'margot-direcao-entrada',
            direcao
        );

        if (direcao === 'frente') {
            var atual = Number(
                window.history.state &&
                window.history.state.margotIndice
            ) || 0;

            window.sessionStorage.setItem(
                'margot-indice-pendente',
                String(atual + 1)
            );
        }

        var pagina = paginaAtual();

        function concluir() {
            window.location.assign(url);
        }

        if (
            !pagina ||
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        ) {
            concluir();
            return;
        }

        pagina.style.pointerEvents = 'none';

        pagina.style.transition =
            'transform ' +
            DURACAO_TRANSICAO +
            'ms cubic-bezier(.32,.72,0,1), opacity ' +
            DURACAO_TRANSICAO +
            'ms ease';

        pagina.style.transform =
            direcao === 'voltar'
                ? 'translate3d(100vw,0,0)'
                : 'translate3d(-100vw,0,0)';

        pagina.style.opacity = '0.96';

        window.setTimeout(
            concluir,
            DURACAO_TRANSICAO
        );
    }

    function aoClicar(evento) {
        var origem = evento.target;

        var link =
            origem && origem.closest
                ? origem.closest('a[href]')
                : null;

        if (!linkElegivel(link, evento)) {
            return;
        }

        var destino = new URL(
            link.href,
            window.location.href
        );

        if (
            urlsIguais(
                destino.href,
                window.location.href
            ) &&
            !destino.hash
        ) {
            evento.preventDefault();
            atualizarMenu();
            return;
        }

        evento.preventDefault();
        navegar(link.href, 'frente');
    }

    function alvoImpedeGesto(alvo) {
        return Boolean(
            alvo &&
            alvo.closest &&
            alvo.closest(
                'input, textarea, select, video, ' +
                '[contenteditable="true"], ' +
                '.mini-menu, .heys-area, ' +
                '[data-sem-gesto]'
            )
        );
    }

    function podeVoltar() {
        return window.history.length > 1;
    }

    function iniciarGesto(evento) {
        if (
            navegacaoEmCurso ||
            !podeVoltar() ||
            evento.touches.length !== 1 ||
            alvoImpedeGesto(evento.target)
        ) {
            return;
        }

        var toque = evento.touches[0];

        if (toque.clientX > LIMITE_GESTO) {
            return;
        }

        gesto.ativo = true;
        gesto.horizontal = false;
        gesto.inicioX = toque.clientX;
        gesto.inicioY = toque.clientY;
        gesto.atualX = toque.clientX;
        gesto.inicioTempo = Date.now();
    }

    function moverGesto(evento) {
        if (
            !gesto.ativo ||
            evento.touches.length !== 1
        ) {
            return;
        }

        var toque = evento.touches[0];
        var distanciaX = Math.max(
            0,
            toque.clientX - gesto.inicioX
        );

        var distanciaY = Math.abs(
            toque.clientY - gesto.inicioY
        );

        gesto.atualX = toque.clientX;

        if (!gesto.horizontal) {
            if (distanciaX < 8) {
                return;
            }

            if (distanciaY > distanciaX) {
                gesto.ativo = false;
                return;
            }

            gesto.horizontal = true;
        }

        evento.preventDefault();

        var pagina = paginaAtual();

        if (!pagina) {
            return;
        }

        pagina.style.transition = 'none';

        pagina.style.transform =
            'translate3d(' +
            distanciaX +
            'px,0,0)';
    }

    function terminarGesto() {
        if (!gesto.ativo) {
            return;
        }

        var pagina = paginaAtual();

        var distancia = Math.max(
            0,
            gesto.atualX - gesto.inicioX
        );

        var duracao = Math.max(
            1,
            Date.now() - gesto.inicioTempo
        );

        var velocidade = distancia / duracao;

        var concluir =
            gesto.horizontal &&
            (
                distancia > window.innerWidth * 0.28 ||
                velocidade > 0.55
            );

        gesto.ativo = false;
        gesto.horizontal = false;

        if (concluir) {
            navegacaoEmCurso = true;
            guardarSaida();

            window.sessionStorage.setItem(
                'margot-direcao-entrada',
                'voltar'
            );

            if (pagina) {
                pagina.style.transition =
                    'transform 180ms ' +
                    'cubic-bezier(.32,.72,0,1)';

                pagina.style.transform =
                    'translate3d(100vw,0,0)';
            }

            window.setTimeout(function () {
                window.history.back();
            }, 170);

            return;
        }

        if (pagina) {
            pagina.style.transition =
                'transform 220ms ' +
                'cubic-bezier(.32,.72,0,1)';

            pagina.style.transform =
                'translate3d(0,0,0)';
        }
    }

    prepararHistorico();
    atualizarMenu();
    animarEntrada();

    document.addEventListener(
        'click',
        aoClicar
    );

    document.addEventListener(
        'touchstart',
        iniciarGesto,
        { passive: true }
    );

    document.addEventListener(
        'touchmove',
        moverGesto,
        { passive: false }
    );

    document.addEventListener(
        'touchend',
        terminarGesto,
        { passive: true }
    );

    document.addEventListener(
        'touchcancel',
        terminarGesto,
        { passive: true }
    );

    window.addEventListener(
        'pagehide',
        guardarSaida
    );

    window.addEventListener(
        'pageshow',
        function () {
            navegacaoEmCurso = false;
            limparAnimacao();
            atualizarMenu();
        }
    );
}(window, document));