(() => {
    'use strict';
    if (window.MargotWelcome) return;

    const script = document.currentScript;
    const base = new URL('../', script.src);
    const sprite = new URL('media/location-demo-young.jpg', base).href;
    const fallback = new URL('imagens/fotos-perfil/default.webp', base).href;
    const text = (pt, en) => window.MargotI18n?.language === 'en' ? en : pt;
    const member = () => String(window.membroId || '');
    const home = () => document.getElementById('gridCanvas');
    const gate = () => !window.MargotNativeVersion || window.MargotNativeVersion.getState() === 'allowed';
    const auth = s => s?.authorization ?? s?.permission;
    const pending = s => ['not_determined', 'prompt', 'prompt-with-rationale'].includes(auth(s));
    const pref = k => window.MargotPreferencias?.obter(k);
    const memory = new Set();

    let active, cancelActive, inviteTimer, inviteHost;

    function read(id, name) {
        const key = 'margot-welcome-v2:' + id + ':' + name;
        try {
            return memory.has(key) || localStorage.getItem(key) === '1';
        } catch (_) {
            return memory.has(key);
        }
    }

    function save(id, name) {
        const key = 'margot-welcome-v2:' + id + ':' + name;
        memory.add(key);
        try {
            localStorage.setItem(key, '1');
        } catch (_) {}
    }

    function ownPhoto(img) {
        let src = fallback;
        try {
            const url = new URL(script.dataset.photo || fallback, location.href);
            if (url.origin === location.origin) src = url.href;
        } catch (_) {}

        img.alt = text('Tu', 'You');
        img.onerror = () => {
            img.onerror = null;
            img.src = fallback;
        };
        img.src = src;
    }

    const css = [
        ':host{font-family:Helvetica,Arial,sans-serif;color:#17171b;--red:#e12346;display:block;height:100%;color-scheme:light}',
        '*{box-sizing:border-box}[hidden]{display:none!important}button,input{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #17171b;outline-offset:4px}',
        '.view{position:relative;isolation:isolate;display:flex;flex-direction:column;height:100%;overflow:auto;background:#fdfcf9}',
        '.background{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}.instruction{flex:none;padding:max(22px,env(safe-area-inset-top)) 24px 14px;text-align:center;background:linear-gradient(#fdfcf9 75%,#fdfcf900)}',
        '.label{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#796f72;margin-bottom:16px}h1{font-size:clamp(27px,7vw,35px);line-height:1.12;letter-spacing:-.035em;margin:0 auto 14px;max-width:18ch}h1:focus{outline:none}',
        'p{font-size:20px;line-height:1.4;margin:0 auto;max-width:30ch}.content{position:relative;flex:1;min-height:235px}.actions{display:grid;gap:12px;padding:18px 24px max(24px,env(safe-area-inset-bottom));flex:none}',
        '.action{width:100%;min-height:56px;padding:15px 22px;border:0;border-radius:999px;background:var(--red);color:#fff7ee;font-size:20px;font-weight:700;letter-spacing:-.025em}.secondary{background:#f0eeec;color:#615a5c;font-weight:500}',
        '.nav{flex:none;min-height:78px;position:relative;pointer-events:none}.nav>*{position:relative!important;inset:auto!important;transform:none!important;margin:0 auto!important;width:90%!important;opacity:1!important}',
        '.peer,.self{position:absolute;width:60px;height:60px;border-radius:50%;border:1.5px solid #ffffffeb;box-shadow:0 5px 18px #2017201c;background-size:300% 100%;object-fit:cover;transform:translate(-50%,-50%)}',
        '.peer{padding:0;background-color:#f4efed}.peer.first{animation:hint 3s ease-in-out infinite}.self{left:49%;top:70%}.small{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:13px;color:#73676b}',
        '.menu .content{min-height:320px}.menu .instruction{padding-bottom:20px}.menu .content>section{position:absolute!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:100%!important;height:100%!important;max-height:none!important;transform:none!important;overflow:auto!important;pointer-events:auto!important;padding-bottom:20px!important}',
        '.paper .background{display:none}.paper .instruction{margin-top:auto;padding-bottom:26px;background:none}.paper .content{flex:0 0 auto;min-height:0}.paper .actions{margin-top:auto;padding-top:32px}',
        '.pocket-scene{height:210px;position:relative;overflow:hidden;width:230px;margin:0 auto}.phone{position:absolute;left:80px;top:12px;width:70px;height:132px;border:5px solid #33313a;border-radius:17px;background:#fff;display:grid;place-items:center;animation:pocket 8s ease-in-out infinite}.phone img{width:44px;height:44px;border-radius:50%;object-fit:cover}',
        '.pocket{position:absolute;top:115px;left:30px;width:170px;height:150px;background:#899aae;border:2px dashed #e1e5ec;border-radius:5px 5px 60px 60px;box-shadow:0 0 0 7px #899aae}',
        '@keyframes pocket{0%,22%,100%{transform:translateY(0) rotate(-8deg)}45%,80%{transform:translateY(105px)}}@keyframes hint{50%{box-shadow:0 0 0 12px #e1234614}}',
        ':host([data-paused]) *{animation-play-state:paused!important}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}',
        '.tip{position:fixed;z-index:2147483000;top:max(18px,env(safe-area-inset-top));left:16px;right:16px;max-width:420px;margin:auto;padding:22px 48px 22px 22px;background:#fdfcf9;box-shadow:0 8px 35px #21151c24;border-radius:24px}.tip strong{font-size:19px}.tip p{font-size:16px;margin:10px 0}.tip a{color:#c91d3e;font-weight:700}.tip button{position:absolute;right:10px;top:10px;width:32px;height:32px;border:0;border-radius:50%;background:#eee9e9}'
    ].join('\n');

    // Copia apenas o aspeto. Não copia eventos dos componentes reais.
    function styledCopy(source) {
        const clone = source.cloneNode(true);
        const originals = [source, ...source.querySelectorAll('*')];
        const copies = [clone, ...clone.querySelectorAll('*')];

        originals.forEach((node, i) => {
            const style = getComputedStyle(node);

            for (let j = 0; j < style.length; j++) {
                const property = style[j];

                if (property !== 'pointer-events') {
                    copies[i].style.setProperty(
                        property,
                        style.getPropertyValue(property)
                    );
                }
            }

            copies[i].style.removeProperty('pointer-events');
        });

        return clone;
    }

    function isolate(node) {
        node.querySelectorAll('script,iframe,video,audio,object,embed')
            .forEach(n => n.remove());

        [node, ...node.querySelectorAll('*')].forEach(n => {
            for (const attr of [...n.attributes]) {
                if (
                    /^on/i.test(attr.name) ||
                    ['id', 'name', 'href', 'action', 'formaction', 'srcset'].includes(attr.name)
                ) {
                    n.removeAttribute(attr.name);
                }
            }

            if (n.tagName === 'BUTTON') n.type = 'button';
            if (n.tagName === 'A') n.tabIndex = -1;
        });
    }

    function inviteLater(id) {
        clearInterval(inviteTimer);
        if (read(id, 'invite')) return;

        let seconds = 0;

        inviteTimer = setInterval(() => {
            if (member() !== id) {
                clearInterval(inviteTimer);
                return;
            }

            if (
                document.hidden ||
                !home() ||
                active ||
                !gate() ||
                window.MargotPermissionUI?.busy ||
                document.querySelector('dialog[open],[aria-modal="true"]') ||
                document.body.matches('.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto') ||
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
            ) return;

            if (++seconds < 40) return;

            clearInterval(inviteTimer);
            inviteHost?.remove();
            inviteHost = document.createElement('div');

            const root = inviteHost.attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + css + '</style><aside class="tip" role="status"><strong></strong><p></p><a></a><button type="button">×</button></aside>';

            root.querySelector('strong').textContent = text(
                'Traz os teus amigos.',
                'Bring your friends.'
            );

            root.querySelector('p').textContent = text(
                'Na página de convites tens o teu código, QR e contador.',
                'Your invite page has your code, QR and counter.'
            );

            const link = root.querySelector('a');
            link.href = new URL('invite', base).href;
            link.textContent = text('Ver os meus convites', 'See my invites');

            root.querySelector('button').setAttribute(
                'aria-label',
                text('Fechar', 'Close')
            );
            root.querySelector('button').onclick = () => inviteHost?.remove();

            document.body.append(inviteHost);
            save(id, 'invite');
        }, 1000);
    }

    async function launch({
        state,
        force = false,
        preview = false,
        platform
    } = {}) {
        const id = member();
        if (!id || !home()) return false;

        const native = Boolean(window.Capacitor?.isNativePlatform?.());
        const system = preview
            ? (platform || 'ios')
            : window.Capacitor?.getPlatform?.();
        const ios = system === 'ios';

        const granted = s => (
            ios
                ? ['when_in_use', 'always']
                : ['granted', 'precise', 'approximate']
        ).includes(auth(s)) && s?.services_enabled !== false;

        if (
            !preview &&
            (
                !native ||
                state?.available === false ||
                (!force && pref('localizacao') === false)
            )
        ) return false;

        if (!preview && !force && read(id, 'complete') && !pending(state)) {
            inviteLater(id);
            return true;
        }

        const bg = window.MargotBackgroundLocation;
        const ui = window.MargotPermissionUI;

        let simulated = {
            authorization: 'not_determined',
            permission_flow_version: 2,
            always_requested: false
        };

        const status = async () => preview ? { ...simulated } : bg.status();
        const controller = new AbortController();
        const signal = controller.signal;
        const abort = () => controller.abort();

        cancelActive = abort;

        const valid = () => {
            if (signal.aborted || member() !== id || !home()) {
                throw new DOMException('Interrupted', 'AbortError');
            }
        };

        const wait = ms => new Promise((resolve, reject) => {
            valid();

            const stop = () => {
                clearTimeout(timer);
                reject(new DOMException('Interrupted', 'AbortError'));
            };

            const timer = setTimeout(() => {
                signal.removeEventListener('abort', stop);
                resolve();
            }, ms);

            signal.addEventListener('abort', stop, { once: true });
        });

        async function visible() {
            valid();

            while (document.hidden) {
                await wait(200);
                valid();
            }
        }

        const host = document.createElement('dialog');
        host.setAttribute(
            'aria-label',
            text('Tutorial da Margot', 'Margot tutorial')
        );
        host.style.cssText = 'padding:0;border:0;margin:0;inset:0;width:100%;max-width:none;height:100%;height:100dvh;max-height:none;background:#fdfcf9;overflow:auto;';

        const container = document.createElement('div');
        container.style.height = '100%';
        host.append(container);

        const root = container.attachShadow({ mode: 'open' });
        root.innerHTML = '<style>' + css + '</style><div class="view"><canvas class="background" aria-hidden="true"></canvas><header class="instruction"><div class="label"></div><h1 tabindex="-1"></h1><p></p></header><div class="content"></div><footer class="actions"></footer><div class="nav" hidden></div></div>';

        const view = root.querySelector('.view');
        const title = root.querySelector('h1');
        const description = root.querySelector('p');
        const content = root.querySelector('.content');
        const actions = root.querySelector('.actions');
        const nav = root.querySelector('.nav');
        const background = root.querySelector('canvas');
        const context = background.getContext('2d');

        let frame, lastFrame = 0, watcher, complete = false;

        function mirror(now) {
            if (signal.aborted) return;

            if (
                !document.hidden &&
                context &&
                now - lastFrame > 33 &&
                !view.classList.contains('paper')
            ) {
                lastFrame = now;
                const source = home();

                if (source?.width && source?.height) {
                    if (
                        background.width !== source.width ||
                        background.height !== source.height
                    ) {
                        background.width = source.width;
                        background.height = source.height;
                    }

                    context.clearRect(
                        0,
                        0,
                        background.width,
                        background.height
                    );
                    context.drawImage(source, 0, 0);
                }
            }

            frame = requestAnimationFrame(mirror);
        }

        function heading(a, b) {
            title.textContent = a;
            description.textContent = b;
            title.focus({ preventScroll: true });
        }

        function screen(mode, a, b) {
            valid();

            view.className = 'view ' + mode;
            content.replaceChildren();
            actions.replaceChildren();
            nav.replaceChildren();
            nav.hidden = true;

            root.querySelector('.label').textContent = preview
                ? text(
                    'Pré-visualização • sem pedidos reais • ',
                    'Preview • no real requests • '
                ) + (ios ? 'iPhone' : 'Android')
                : text('Tutorial da Margot', 'Margot tutorial');

            heading(a, b);
        }

        function choose(options) {
            valid();

            options.forEach(([value, label, secondary]) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.dataset.choice = value;
                b.className = 'action' + (secondary ? ' secondary' : '');
                b.textContent = label;
                actions.append(b);
            });

            return new Promise((resolve, reject) => {
                const cleanup = () => {
                    root.removeEventListener('click', click);
                    signal.removeEventListener('abort', stop);
                };

                const stop = () => {
                    cleanup();
                    reject(new DOMException('Interrupted', 'AbortError'));
                };

                const click = e => {
                    const b = e.target.closest?.('[data-choice]');
                    if (!b || b.disabled) return;

                    e.preventDefault();
                    e.stopPropagation();
                    cleanup();

                    root.querySelectorAll('button').forEach(n => {
                        n.disabled = true;
                    });

                    resolve(b.dataset.choice);
                };

                root.addEventListener('click', click);
                signal.addEventListener('abort', stop, { once: true });
            });
        }

        const next = () => choose([
            ['next', text('Continuar', 'Continue')]
        ]);

        async function result(ok, a, b) {
            await visible();

            if (!preview) {
                try {
                    Promise.resolve(
                        window.MargotHaptics?.feedback(
                            ok ? 'interaction' : 'heySent'
                        )
                    ).catch(() => {});
                } catch (_) {}
            }

            screen('paper', a, b);
            await next();
        }

        function person(position, name, left, top, first) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'peer' + (first ? ' first' : '');
            b.dataset.choice = name;
            b.setAttribute('aria-label', name);
            b.style.cssText = 'left:' + left + '%;top:' + top +
                '%;background-image:url("' + sprite +
                '");background-position:' + position + '% 50%;';

            content.append(b);
        }

        function showMenu(name) {
            const source = document.querySelector('.mini-menu');
            if (!source) throw new Error('Mini-menu unavailable');

            const copy = styledCopy(source);
            copy.classList.remove('perfil-proprio');
            copy.removeAttribute('aria-hidden');

            copy.querySelectorAll(
                '#acoes-perfil,#mini-menu-hoje,.mais-opcoes,' +
                '[data-daylies-mini],.mini-menu-daylies-slot,[hidden]'
            ).forEach(n => n.remove());

            const img = copy.querySelector('header img');

            if (img) {
                const face = document.createElement('span');
                face.style.cssText = img.style.cssText;
                face.style.display = 'block';
                face.style.backgroundImage = 'url("' + sprite + '")';
                face.style.backgroundSize = '300% 100%';
                face.style.backgroundPosition = (
                    { Sofia: 0, Alex: 50, Lara: 100 }[name] || 0
                ) + '% 50%';
                face.setAttribute('role', 'img');
                face.setAttribute('aria-label', name);
                img.replaceWith(face);
            }

            const nameNode = copy.querySelector('header h1');
            if (nameNode) nameNode.textContent = name;

            const hey = copy.querySelector('#enviar-hey');
            const form = copy.querySelector('.mini-menu-mensagem');
            const input = form?.querySelector('input[type="text"]');
            const send = form?.querySelector('.mini-compose-send');

            if (!hey || !input || !send) {
                throw new Error('Mini-menu controls unavailable');
            }

            copy.querySelectorAll('button').forEach(b => {
                b.disabled = true;
            });

            hey.disabled = false;
            hey.dataset.choice = 'hey';
            hey.textContent = 'Hey';
            hey.style.setProperty('display', 'flex', 'important');
            hey.style.opacity = '1';

            form.style.setProperty('display', 'flex', 'important');
            form.style.width = 'calc(100% - 32px)';

            input.value = text('Olá!', 'Hi!');
            input.readOnly = true;

            send.disabled = false;
            send.dataset.choice = 'message';
            send.style.opacity = '1';
            send.setAttribute(
                'aria-label',
                text('Experimentar mensagem', 'Try a message')
            );

            isolate(copy);

            const wrap = document.createElement('section');
            wrap.style.cssText = copy.style.cssText;
            wrap.style.borderRadius = getComputedStyle(source).borderRadius;

            while (copy.firstChild) {
                wrap.append(copy.firstChild);
            }

            content.append(wrap);

            if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                content.animate?.(
                    [
                        { transform: 'translateY(100%)' },
                        { transform: 'translateY(0)' }
                    ],
                    {
                        duration: 650,
                        easing: 'cubic-bezier(.2,.8,.2,1)'
                    }
                );
            }
        }

        async function demo() {
            screen(
                'demo',
                text('Quem está perto aparece aqui.', 'People nearby appear here.'),
                text('Toca numa foto para experimentar.', 'Tap a photo to try it.')
            );

            const own = document.createElement('img');
            own.className = 'self';
            ownPhoto(own);
            content.append(own);

            person(0, 'Sofia', 27, 30, true);
            person(50, 'Alex', 73, 20, false);
            person(100, 'Lara', 80, 73, false);

            const note = document.createElement('span');
            note.className = 'small';
            note.textContent = text('Perfis de exemplo', 'Example profiles');
            content.append(note);

            const menu = document.getElementById('menuPrincipal');

            if (menu) {
                const copy = styledCopy(menu);
                isolate(copy);
                copy.inert = true;
                nav.append(copy);
                nav.hidden = false;
            }

            const selected = await choose([
                ['skip', text('Saltar tutorial', 'Skip tutorial'), true]
            ]);

            if (selected !== 'skip') {
                const name = ['Sofia', 'Alex', 'Lara'].includes(selected)
                    ? selected
                    : 'Sofia';

                screen(
                    'menu',
                    text('Dá o primeiro olá.', 'Say the first hello.'),
                    text(
                        'Experimenta o Hey ou a seta da mensagem.',
                        'Try Hey or the message arrow.'
                    )
                );

                showMenu(name);

                const action = await choose([]);

                heading(
                    action === 'hey'
                        ? text('Hey enviado.', 'Hey sent.')
                        : text('Mensagem enviada.', 'Message sent.'),
                    text(
                        'Foi só um exemplo. Ninguém recebeu nada.',
                        'Just an example. Nobody received anything.'
                    )
                );

                await next();
            }

            screen(
                'paper',
                text('Viste alguém? Abre a Margot.', 'See someone? Open Margot.'),
                text(
                    'Encontra essa pessoa e começa uma conversa.',
                    'Find them and start a conversation.'
                )
            );

            await next();
        }

        async function requestLocation(always) {
            valid();

            if (preview) {
                simulated.authorization = always
                    ? 'always'
                    : ios ? 'when_in_use' : 'granted';
                return;
            }

            const fresh = await status();
            valid();

            await ui.run(() => {
                valid();

                return ui.guide(
                    always ? 'always' : 'location',
                    () => always && fresh.permission_flow_version !== 2
                        ? bg.requestAlways()
                        : bg.requestPermission(always)
                );
            });

            await visible();
        }

        async function settings() {
            if (preview) {
                simulated.authorization = ios ? 'always' : 'granted';
                return;
            }

            valid();

            const opened = await bg.openSettings();
            valid();

            if (opened === false || opened?.opened === false) {
                throw new Error('Settings unavailable');
            }

            screen(
                'paper',
                text('Depois, volta aqui.', 'Then come back here.'),
                ios
                    ? text(
                        'Definições → Margot → Localização.',
                        'Settings → Margot → Location.'
                    )
                    : text(
                        'Margot → Permissões → Localização.',
                        'Margot → Permissions → Location.'
                    )
            );

            await choose([
                ['check', text('Já alterei — verificar', 'I changed it — check')],
                ['later', text('Agora não', 'Not now'), true]
            ]);

            await visible();
        }

        root.addEventListener('submit', e => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('margot:page-leave', abort, { signal });

        document.addEventListener(
            'visibilitychange',
            () => container.toggleAttribute('data-paused', document.hidden),
            { signal }
        );

        host.addEventListener('cancel', e => {
            e.preventDefault();
            abort();
        }, { signal });

        host.addEventListener('close', abort, { signal });

        try {
            while (!gate()) {
                await wait(200);
                valid();
            }

            await visible();

            if (!preview) ui.deferNotifications();

            document.body.append(host);
            host.showModal();
            frame = requestAnimationFrame(mirror);

            watcher = setInterval(() => {
                if (member() !== id || !home() || !gate()) abort();
            }, 500);

            if (preview || force || !read(id, 'demo')) {
                await demo();
                if (!preview) save(id, 'demo');
            }

            state = await status();
            valid();

            if (!granted(state) || (!preview && pref('localizacao') === false)) {
                screen(
                    'paper',
                    text('Primeiro, a tua localização.', 'First, your location.'),
                    ios
                        ? text(
                            'Escolhe “Durante a utilização” no próximo pedido.',
                            'Choose “While Using the App” in the next request.'
                        )
                        : text(
                            'Permite a localização para veres quem está perto.',
                            'Allow location to see people nearby.'
                        )
                );

                const choice = await choose([
                    ['allow', text('Continuar', 'Continue')],
                    ['later', text('Agora não', 'Not now'), true]
                ]);

                if (choice === 'allow') {
                    if (!granted(state)) {
                        if (pending(state) && state.services_enabled !== false) {
                            await requestLocation(false);
                        } else {
                            await settings();
                        }
                    }

                    state = await status();
                    valid();

                    if (granted(state) && !preview) {
                        window.MargotPreferencias?.definir('localizacao', true);
                    }

                    await result(
                        granted(state),
                        granted(state)
                            ? text('Localização ativa.', 'Location enabled.')
                            : text(
                                'A localização ainda está desligada.',
                                'Location is still off.'
                            ),
                        granted(state)
                            ? text(
                                'Já podemos encontrar pessoas por perto.',
                                'We can now find people nearby.'
                            )
                            : text(
                                'Podes ativá-la nas Definições.',
                                'You can enable it in Settings.'
                            )
                    );
                }
            }

            state = await status();
            valid();

            if (
                ios &&
                granted(state) &&
                auth(state) !== 'always' &&
                (preview || pref('localizacao') !== false)
            ) {
                screen(
                    'paper',
                    text(
                        'E com o telemóvel no bolso?',
                        'And with your phone in your pocket?'
                    ),
                    text(
                        'Escolhe “Sempre” para permitir atualizações quando sais da Margot.',
                        'Choose “Always” to allow updates when you leave Margot.'
                    )
                );

                content.innerHTML = '<div class="pocket-scene" aria-hidden="true"><div class="phone"><img></div><div class="pocket"></div></div>';
                ownPhoto(content.querySelector('img'));

                const choice = await choose([
                    ['always', text('Permitir Sempre', 'Allow Always')],
                    ['later', text('Agora não', 'Not now'), true]
                ]);

                if (choice === 'always') {
                    state = await status();
                    valid();

                    // O estado nativo atual tem prioridade sobre marcadores antigos do JavaScript.
                    if (state.always_requested !== true) {
                        await requestLocation(true);
                    } else {
                        await settings();
                    }

                    state = await status();
                    valid();

                    if (auth(state) !== 'always') {
                        screen(
                            'paper',
                            text(
                                '“Sempre” ainda não está ativo.',
                                '“Always” is not enabled yet.'
                            ),
                            text(
                                'Podes escolhê-lo nas Definições. Sem atualizações, podes deixar de aparecer.',
                                'You can choose it in Settings. Without updates, you may stop appearing.'
                            )
                        );

                        const fallbackChoice = await choose([
                            ['settings', text('Abrir Definições', 'Open Settings')],
                            [
                                'later',
                                text(
                                    'Continuar sem Sempre',
                                    'Continue without Always'
                                ),
                                true
                            ]
                        ]);

                        if (fallbackChoice === 'settings') {
                            await settings();
                            state = await status();
                            valid();
                        }
                    }

                    if (granted(state) && auth(state) === 'always') {
                        await result(
                            true,
                            text('“Sempre” está ativo.', '“Always” is enabled.'),
                            text(
                                'A localização em segundo plano está autorizada.',
                                'Background location is authorised.'
                            )
                        );
                    }
                }
            }

            const push = window.MargotPushNotifications;
            const notification = preview
                ? 'prompt'
                : await push?.permissionState?.();

            valid();

            if (
                ['prompt', 'prompt-with-rationale'].includes(notification) ||
                (notification === 'granted' && pref('notificacoes') === false)
            ) {
                screen(
                    'paper',
                    text('Recebe os teus olás.', 'Receive your hellos.'),
                    text(
                        'As notificações avisam-te quando recebes um Hey ou uma mensagem.',
                        'Notifications let you know when you receive a Hey or a message.'
                    )
                );

                const choice = await choose([
                    [
                        'notifications',
                        text('Permitir notificações', 'Allow notifications')
                    ],
                    ['later', text('Agora não', 'Not now'), true]
                ]);

                if (choice === 'notifications') {
                    // Este método já usa a fila de permissões: não criar uma fila dentro da outra.
                    const value = preview
                        ? 'granted'
                        : await push.requestPermission();

                    await visible();

                    if (!preview && ['granted', 'denied'].includes(value)) {
                        window.MargotPreferencias?.definir(
                            'notificacoes',
                            value === 'granted'
                        );

                        try {
                            localStorage.setItem(
                                'margot-notification-intro-v2',
                                value
                            );
                        } catch (_) {}
                    }

                    await result(
                        value === 'granted',
                        value === 'granted'
                            ? text('Notificações ativas.', 'Notifications enabled.')
                            : text('Notificações desligadas.', 'Notifications are off.'),
                        value === 'granted'
                            ? text(
                                'Já podes receber os teus avisos.',
                                'You can now receive your alerts.'
                            )
                            : text(
                                'Podes ativá-las mais tarde.',
                                'You can enable them later.'
                            )
                    );
                }
            }

            screen(
                'paper',
                text('Agora é contigo.', 'Now it is your turn.'),
                text(
                    'Se ainda não aparecer ninguém, volta quando houver mais pessoas por perto.',
                    'If nobody appears yet, try again when more people are nearby.'
                )
            );

            await choose([
                ['finish', text('Entrar na Margot', 'Enter Margot')]
            ]);

            if (!preview) {
                save(id, 'complete');
                complete = true;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('Margot tutorial:', error);

                try {
                    screen(
                        'paper',
                        text(
                            'Não foi possível concluir este passo.',
                            'We could not finish this step.'
                        ),
                        text(
                            'Podes continuar e voltar a tentar nas definições da Margot.',
                            'You can continue and try again in Margot settings.'
                        )
                    );

                    await next();
                } catch (_) {}
            }
        } finally {
            abort();
            clearInterval(watcher);
            cancelAnimationFrame(frame);
            host.close();
            host.remove();
            cancelActive = null;

            if (complete) inviteLater(id);
        }

        return true;
    }

    function run(options) {
        if (active) return active;
        active = launch(options).finally(() => {
            active = null;
        });
        return active;
    }

    document.addEventListener('margot:page-leave', () => {
        inviteHost?.remove();
    });

    window.MargotWelcome = {
        run,
        preview: platform => run({ preview: true, platform }),
        cancel: () => cancelActive?.(),
        get busy() {
            return Boolean(active);
        }
    };
})();