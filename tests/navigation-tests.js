// Testes do navegador interno com rede e animações simuladas. Não contactam a app real.
globalThis.runMargotNavigationTests = async function (createWindow, source) {
    let checks = 0;
    function check(condition, message) {
        if (!condition) throw new Error(message);
        checks++;
    }
    async function waitFor(condition, message) {
        const deadline = Date.now() + 2500;
        while (!condition()) {
            if (Date.now() > deadline) throw new Error('Timeout: ' + message);
            await new Promise((resolve) => setTimeout(resolve, 2));
        }
    }
    async function environment(options = {}) {
        const host = await createWindow();
        const w = host.window,
            d = w.document;
        const trace = [],
            animations = [],
            starts = [],
            errors = [];
        w.history.replaceState({}, '', '/');
        d.head.innerHTML =
            '<title>Início</title><link data-margot-page-style rel="margot-test" href="/assets/home.css">';
        d.body.innerHTML =
            '<div data-margot-pagina><main id="route-content" data-route="/">Início</main></div>' +
            '<nav id="menuPrincipal"><a href="/index">Início</a><a href="/messages">Mensagens</a><a href="/profile/me">Perfil</a></nav>';
        w.requestIdleCallback = () => 1;
        w.requestAnimationFrame = (callback) => w.setTimeout(() => callback(Date.now()), 1);
        w.matchMedia = () => ({ matches: Boolean(options.reduced) });
        w.scrollTo = () => {};
        w.initialized = '/';
        w.routeAtInit = '/';
        function current() {
            return d.querySelector('#route-content').dataset.route;
        }
        const page = (route) =>
            '<html><head><title>' +
            route +
            '</title>' +
            '<link data-margot-page-style rel="stylesheet" href="/assets/' +
            route.replace(/\W/g, '') +
            '.css"></head>' +
            '<body><div data-margot-pagina>' +
            (route.startsWith('/profile') ? '<svg aria-hidden="true"></svg>' : '') +
            '<main id="route-content" data-route="' +
            route +
            '">Destino</main>' +
            '<script>window.routeAtInit = window.location.pathname; window.searchAtInit = window.location.search;</script>' +
            '<script src="/assets/helper.js"></script><script src="/assets/init.js"></script></div></body></html>';
        w.fetch = (url, request = {}) =>
            new Promise((resolve, reject) => {
                const route = new URL(url).pathname;
                trace.push('fetch:' + route);
                const timer = w.setTimeout(() => {
                    request.signal?.removeEventListener('abort', cancel);
                    resolve({ ok: true, url: String(url), text: async () => page(route) });
                }, options.fetchDelay || 2);
                function cancel() {
                    w.clearTimeout(timer);
                    reject(new w.DOMException('Cancelado', 'AbortError'));
                }
                request.signal?.addEventListener('abort', cancel, { once: true });
                if (request.signal?.aborted) cancel();
            });
        const appendHead = d.head.appendChild.bind(d.head);
        d.head.appendChild = (node) => {
            if (node.tagName !== 'LINK') return appendHead(node);
            const rel = node.rel;
            node.rel = 'margot-test'; // Os eventos abaixo substituem os pedidos de rede.
            starts.push({ rel, href: node.href, current: current() });
            if (rel === 'stylesheet') check(node.media === 'not all', 'CSS novo fica inativo durante a preparação');
            const result = appendHead(node);
            w.setTimeout(() => {
                if (rel === 'preload') trace.push('download:' + node.href);
                node.dispatchEvent(new w.Event('load'));
            }, options.resourceDelay || 4);
            return result;
        };
        const appendBody = d.body.appendChild.bind(d.body);
        d.body.appendChild = (node) => {
            if (node.tagName !== 'SCRIPT') return appendBody(node);
            node.type = 'text/margot-test';
            const result = appendBody(node);
            if (!node.src) w.eval(node.textContent);
            else
                w.setTimeout(() => {
                    check(d.querySelectorAll('#route-content').length === 1, 'Scripts encontram um único DOM');
                    check(
                        d.querySelector('[data-margot-pagina]').style.visibility === 'hidden',
                        'Página preparada antes de aparecer'
                    );
                    if (node.src.endsWith('/helper.js')) {
                        w.helperReady = true;
                        trace.push('helper:' + current());
                    } else {
                        check(w.helperReady, 'Dependência executada antes do inicializador');
                        w.initialized = current();
                        trace.push('init:' + current());
                    }
                    node.dispatchEvent(new w.Event('load'));
                }, options.scriptDelay || 2);
            return result;
        };
        w.Element.prototype.animate = function (frames, settings) {
            check(w.initialized === current(), 'Animação só começa depois da inicialização');
            check(w.routeAtInit === current(), 'Inicializador lê o URL de destino');
            animations.push({ frames, settings, route: current() });
            let finish;
            const finished = new Promise((resolve) => {
                finish = resolve;
            });
            const timer = w.setTimeout(finish, options.animationDelay || 5);
            return {
                finished,
                cancel() {
                    w.clearTimeout(timer);
                    finish();
                }
            };
        };
        d.addEventListener('margot:page-leave', () => trace.push('leave:' + current()));
        d.addEventListener('margot:page-ready', () => {
            check(w.initialized === current(), 'page-ready só chega depois da inicialização');
            trace.push('ready:' + current());
        });
        w.addEventListener('error', (event) => errors.push(event.message));
        w.eval(source);
        return {
            w,
            d,
            host,
            trace,
            animations,
            starts,
            current,
            async idle(route) {
                await waitFor(() => current() === route && !d.body.hasAttribute('aria-busy'), route);
                check(w.initialized === route, 'Destino final inicializado');
                check(d.querySelectorAll('[data-margot-pagina]').length === 1, 'Só fica uma página');
                check(d.querySelector('[data-margot-pagina]').style.visibility !== 'hidden', 'Destino final visível');
                check(errors.length === 0, 'Sem erros JavaScript: ' + errors.join(', '));
            }
        };
    }
    const envs = [];
    try {
        const e = await environment();
        envs.push(e);
        await e.w.MargotNavigation.navigate('/messages', { historico: 'push', aba: true });
        await e.idle('/messages');
        check(e.animations[0].settings.duration === 100, 'Aba usa transição de 100 ms');
        check(
            e.animations[0].frames.every((frame) => !frame.transform),
            'Aba não desloca o ecrã horizontalmente'
        );
        check(
            e.starts.filter((item) => item.rel === 'preload').every((item) => item.current === '/'),
            'Recursos descarregam com página atual presente'
        );
        check(
            e.trace.findIndex((item) => item.startsWith('download:')) < e.trace.indexOf('leave:/'),
            'Download antes de desmontar'
        );
        e.d.querySelector('#route-content').scrollTop = 240;
        await e.w.MargotNavigation.navigate('/profile/me', { historico: 'push', aba: true });
        await e.idle('/profile/me');
        e.d.querySelector('#route-content').scrollTop = 320;
        await e.w.MargotNavigation.navigate('/messages', { historico: 'push', aba: true });
        await e.idle('/messages');
        check(e.d.querySelector('#route-content').scrollTop === 240, 'Aba repõe a posição de leitura');
        await e.w.MargotNavigation.navigate('/profile/me', { historico: 'push', aba: true });
        await e.idle('/profile/me');
        check(
            e.d.querySelector('#route-content').scrollTop === 320,
            'Perfil repõe posição mesmo com SVG antes do main'
        );
        await e.w.MargotNavigation.navigate('/create-account?etapa=fotos', { historico: 'push' });
        await e.idle('/create-account');
        check(e.w.location.search === '?etapa=fotos', 'Parâmetros do destino preservados');
        check(e.w.searchAtInit === '?etapa=fotos', 'Inicializador recebe parâmetros do destino');
        check(e.animations.at(-1).frames[0].transform.includes('18px'), 'Página interna mantém indicação de direção');

        const rapid = await environment({ fetchDelay: 25 });
        envs.push(rapid);
        rapid.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        rapid.w.MargotNavigation.navigate('/profile/me', { historico: 'push' });
        await rapid.idle('/profile/me');
        check(!rapid.trace.includes('init:/messages'), 'Toque ultrapassado durante fetch não monta página intermédia');
        check(rapid.w.location.pathname === '/profile/me', 'URL acompanha o último toque');

        const prepare = await environment({ resourceDelay: 40 });
        envs.push(prepare);
        prepare.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await waitFor(() => prepare.starts.length > 0, 'preparação');
        prepare.w.MargotNavigation.navigate('/profile/me', { historico: 'push' });
        await prepare.idle('/profile/me');
        check(
            !prepare.trace.includes('init:/messages'),
            'Toque ultrapassado durante preload não monta página intermédia'
        );
        check(
            !Array.from(prepare.d.querySelectorAll('[data-margot-page-style]')).some(
                (link) => link.media === 'not all'
            ),
            'Não sobram estilos por aplicar'
        );

        const styles = await environment({ resourceDelay: 20 });
        envs.push(styles);
        styles.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await waitFor(() => styles.starts.some((item) => item.rel === 'stylesheet'), 'preparação de CSS');
        styles.w.MargotNavigation.navigate('/index', { historico: 'push' });
        await styles.idle('/');
        check(!styles.trace.includes('leave:/'), 'Cancelar CSS mantém a página original ativa');
        check(
            styles.d.querySelector('[data-margot-page-style]').href.endsWith('/assets/home.css'),
            'Cancelar CSS preserva estilos originais'
        );
        check(styles.d.querySelectorAll('[data-margot-page-style]').length === 1, 'CSS cancelado é retirado');

        const mounting = await environment({ scriptDelay: 25 });
        envs.push(mounting);
        mounting.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await waitFor(() => mounting.current() === '/messages', 'montagem');
        mounting.w.MargotNavigation.navigate('/profile/me', { historico: 'push' });
        mounting.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await mounting.idle('/messages');
        check(mounting.w.location.pathname === '/messages', 'Voltar a tocar no destino não deixa URL intermédio');

        const animated = await environment({ animationDelay: 400 });
        envs.push(animated);
        animated.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await waitFor(() => animated.animations.length > 0, 'animação');
        animated.w.MargotNavigation.navigate('/profile/me', { historico: 'push' });
        await animated.idle('/profile/me');
        check(
            animated.d.querySelector('#menuPrincipal a[aria-current]').pathname === '/profile/me',
            'Menu acompanha último toque durante animação'
        );

        const back = await environment();
        envs.push(back);
        await back.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await back.w.MargotNavigation.navigate('/profile/me', { historico: 'push' });
        back.w.history.back();
        await back.idle('/messages');
        check(back.w.location.pathname === '/messages', 'Voltar repõe URL e conteúdo');
        back.w.history.forward();
        await back.idle('/profile/me');
        check(back.w.location.pathname === '/profile/me', 'Avançar repõe URL e conteúdo');

        const reduced = await environment({ reduced: true });
        envs.push(reduced);
        await reduced.w.MargotNavigation.navigate('/messages', { historico: 'push' });
        await reduced.idle('/messages');
        check(reduced.animations.length === 0, 'Respeita redução de movimento');
        return checks;
    } finally {
        envs.forEach((env) => env.host.close());
    }
};
