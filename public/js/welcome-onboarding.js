(() => {
    'use strict';
    if (window.MargotWelcome) return;

    const script = document.currentScript;
    const base = new URL('../', script.src);
    const portrait = script.dataset.photo;
    const fallback = new URL('imagens/fotos-perfil/default.webp', base).href;
    const sprite = new URL('media/location-demo-young.jpg', base).href;
    const say = (pt, en) => window.MargotI18n?.language === 'en' ? en : pt;
    const ios = () => window.Capacitor?.getPlatform?.() === 'ios';
    const auth = s => s?.authorization ?? s?.permission;
    const granted = s => (ios() ? ['when_in_use', 'always'] : ['granted', 'precise', 'approximate'])
        .includes(auth(s)) && s?.services_enabled !== false;
    const pending = s => ['not_determined', 'prompt', 'prompt-with-rationale'].includes(auth(s));
    const pref = name => window.MargotPreferencias?.obter(name);
    const setPref = (name, value) => window.MargotPreferencias?.definir(name, value);
    const canvas = () => Boolean(document.getElementById('gridCanvas'));
    const gateOpen = () => !window.MargotNativeVersion || window.MargotNativeVersion.getState() === 'allowed';
    const memory = new Set();
    const key = (id, name) => 'margot-welcome-v1:' + id + ':' + name;

    function seen(id, name) {
        const k = key(id, name);
        try { return memory.has(k) || localStorage.getItem(k) === '1'; }
        catch (_) { return memory.has(k); }
    }

    function save(id, name) {
        const k = key(id, name);
        memory.add(k);
        try { localStorage.setItem(k, '1'); } catch (_) {}
    }

    function feedbackHaptic(ok) {
        try {
            Promise.resolve(window.MargotHaptics?.feedback(ok ? 'interaction' : 'heySent')).catch(() => {});
        } catch (_) {}
    }

    function setPhoto(img) {
        let url = fallback;
        try {
            const candidate = new URL(portrait || fallback, location.href);
            if (candidate.origin === location.origin) url = candidate.href;
        } catch (_) {}
        img.alt = say('Tu', 'You');
        img.onerror = () => { img.onerror = null; img.src = fallback; };
        img.src = url;
    }

    const css = [
        ':host{--red:#ff3347;font-family:system-ui,-apple-system,sans-serif;color:#242329;color-scheme:light}',
        '*{box-sizing:border-box}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit;cursor:pointer}',
        '.shell{flex:1;min-height:100%;display:flex;flex-direction:column;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom));background:#fff}',
        '.brand{font-size:19px;font-weight:800;letter-spacing:-.8px;color:var(--red);text-align:center;padding:8px 0 20px}',
        'main{margin:auto 0;width:100%;text-align:center}h1{font-size:clamp(25px,7vw,34px);line-height:1.13;letter-spacing:-1.1px;margin:0 0 16px;font-weight:750}',
        'p{font-size:16px;line-height:1.55;color:#66616a;margin:0 auto 22px;max-width:34ch}h1:focus{outline:none}',
        '.actions{display:grid;gap:10px;padding-top:24px}.action{border:0;border-radius:18px;min-height:52px;padding:14px 18px;background:var(--red);color:#fff;font-size:19px;font-weight:700}',
        '.action.secondary{background:#f6f4f5;color:#665d65;font-weight:500}button:focus-visible,a:focus-visible{outline:3px solid #25212b;outline-offset:4px}',
        '.art{position:relative;margin:20px auto 0;max-width:360px}.stage{height:275px;border-radius:28px;overflow:hidden;background-color:#fff9fb;background-image:radial-gradient(#ff8bad 1px,transparent 1px),radial-gradient(#b3a8ec 1px,transparent 1px);background-size:23px 23px,31px 31px}',
        '.avatar{width:70px;height:70px;border:4px solid white;border-radius:50%;box-shadow:0 5px 20px #40203919;object-fit:cover;background-size:300% 100%;background-repeat:no-repeat}',
        '.stage .avatar{position:absolute}.self{left:calc(50% - 35px);top:150px}.p1{left:17%;top:32px;animation:invite 2.5s ease-in-out infinite}.p2{right:12%;top:70px}.p3{left:12%;top:162px;width:52px;height:52px}',
        '.demo-label{position:absolute;top:12px;right:12px;font-size:11px;border-radius:99px;padding:5px 9px;background:white;color:#766974}',
        '.hint{position:absolute;bottom:14px;width:100%;font-size:12px;color:#7f6574}.profile{padding:24px;background:#fff4f7;border-radius:28px}.profile .avatar{display:block;margin:0 auto 14px;width:100px;height:100px}',
        '.profile strong{display:block;font-size:21px}.profile small{display:block;margin-top:8px;color:#776471}.symbol{width:112px;height:112px;display:grid;place-items:center;border-radius:38px;background:#fff0f4;color:var(--red);font-size:64px;margin:30px auto;animation:pop .4s ease-out}',
        '.symbol.no{background:#f3f1f4;color:#817585}.permission{padding:22px;background:#fff5f8;border-radius:24px;font-size:15px;line-height:1.6;color:#7a4f60}',
        '.pocket-scene{height:235px;overflow:hidden;border-radius:28px;background:#fff5f8;position:relative}.phone{position:absolute;left:calc(50% - 38px);top:18px;width:76px;height:143px;border:5px solid #34303b;border-radius:18px;background:white;animation:pocket 6s ease-in-out infinite;display:grid;place-items:center}',
        '.phone img{width:46px;height:46px;border-radius:50%;object-fit:cover}.pocket{position:absolute;top:124px;left:calc(50% - 92px);width:184px;height:150px;background:#8899b0;border:2px dashed #d6e0e9;border-radius:9px 9px 65px 65px;box-shadow:0 4px 0 8px #8899b0}',
        '.small-note{font-size:12px;color:#8b7480;text-align:center;margin-top:14px}.tip{position:fixed;z-index:2147483000;top:max(16px,env(safe-area-inset-top));left:16px;right:16px;max-width:420px;margin:auto;background:#fff;box-shadow:0 8px 40px #30202a30;border:1px solid #ffd8e2;border-radius:22px;padding:20px 48px 20px 20px}',
        '.tip strong{font-size:17px}.tip p{font-size:14px;margin:8px 0 14px}.tip a{display:inline-block;color:#cf173b;font-weight:700;text-decoration:none}.tip button{position:absolute;right:10px;top:10px;border:0;background:#fff0f4;border-radius:50%;width:32px;height:32px;color:#70525e}',
        '@keyframes invite{50%{transform:scale(1.09);box-shadow:0 0 0 10px #ff334714}}@keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}',
        '@keyframes pocket{0%,20%,100%{transform:translateY(0) rotate(-8deg)}45%,80%{transform:translateY(110px) rotate(0)}}',
        ':host([data-paused]) *{animation-play-state:paused!important}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
    ].join('\n');

    let active = null;
    let tipTimer = null;
    let tipHost = null;

    function inviteLater(id) {
        clearInterval(tipTimer);
        if (seen(id, 'invite')) return;

        let elapsed = 0;

        tipTimer = setInterval(() => {
            if (String(window.membroId) !== id) {
                clearInterval(tipTimer);
                return;
            }

            const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

            if (
                document.hidden ||
                !canvas() ||
                active ||
                !gateOpen() ||
                editing ||
                window.MargotPermissionUI?.busy ||
                document.body.matches('.perfil-modal-aberta, .heys-abertos, .margot-mini-menu-aberto') ||
                document.querySelector('dialog[open], [aria-modal="true"]')
            ) return;

            elapsed += 1;
            if (elapsed < 40) return;

            clearInterval(tipTimer);
            tipHost?.remove();
            tipHost = document.createElement('div');

            const root = tipHost.attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + css + '</style><aside class="tip" role="status"><strong></strong><p></p><a></a><button type="button">×</button></aside>';

            root.querySelector('strong').textContent = say(
                'A Margot também é para os teus amigos.',
                'Bring your friends to Margot.'
            );

            root.querySelector('p').textContent = say(
                'Tens um código, um QR e um contador de convites na tua página de convites.',
                'Your invite page has your code, QR and invitation counter.'
            );

            const link = root.querySelector('a');
            link.textContent = say('Ver os meus convites →', 'See my invites →');
            link.href = new URL('invite', base).href;

            const close = root.querySelector('button');
            close.setAttribute('aria-label', say('Fechar', 'Close'));
            close.onclick = () => tipHost?.remove();

            document.body.append(tipHost);
            save(id, 'invite');
        }, 1000);
    }

    async function launch({ state, force = false, preview = false } = {}) {
        const id = String(window.membroId || '');
        if (!id || !canvas()) return false;

        if (!preview) {
            if (!window.Capacitor?.isNativePlatform?.() || state?.available === false) return false;
            if (!force && pref('localizacao') === false) return false;

            if (!force && seen(id, 'complete')) {
                inviteLater(id);
                return granted(state);
            }

            if (!force && granted(state) && (!ios() || auth(state) === 'always')) return false;
        }

        const bg = window.MargotBackgroundLocation;
        const ui = window.MargotPermissionUI;
        const controller = new AbortController();
        const signal = controller.signal;
        const abort = () => controller.abort();

        const valid = () => {
            if (signal.aborted || String(window.membroId) !== id || !canvas()) {
                throw new DOMException('Onboarding interrupted', 'AbortError');
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

        const visible = async () => {
            valid();
            while (document.hidden) {
                await wait(200);
                valid();
            }
        };

        const host = document.createElement('dialog');
        host.setAttribute('aria-label', say('Bem-vindo à Margot', 'Welcome to Margot'));
        host.style.cssText = 'padding:0;border:0;margin:auto;width:min(100%,480px);max-width:100%;height:100%;height:100dvh;max-height:100%;background:white;overflow:auto;color:#242329;';

        const content = document.createElement('div');
        content.style.cssText = 'min-height:100%;display:flex;flex-direction:column;';
        host.append(content);

        const root = content.attachShadow({ mode: 'open' });
        root.innerHTML = '<style>' + css + '</style><div class="shell"><header class="brand">margot</header><main><h1 tabindex="-1"></h1><p></p><div class="art"></div></main><footer class="actions"></footer></div>';

        const title = root.querySelector('h1');
        const copy = root.querySelector('main > p');
        const art = root.querySelector('.art');
        const actions = root.querySelector('.actions');

        function draw(heading, description, html = '') {
            valid();

            title.textContent = heading;
            copy.textContent = description;
            art.innerHTML = html;
            actions.replaceChildren();

            root.querySelectorAll('[data-own]').forEach(setPhoto);
            root.querySelectorAll('[data-peer]').forEach(el => {
                el.style.backgroundImage = 'url("' + sprite + '")';
                el.style.backgroundPosition = el.dataset.peer + '% 50%';
            });

            title.focus({ preventScroll: true });

            if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                root.querySelector('main').animate?.(
                    [
                        { opacity: 0, transform: 'translateY(10px)' },
                        { opacity: 1, transform: 'none' }
                    ],
                    { duration: 250 }
                );
            }
        }

        function choose(options) {
            valid();

            options.forEach(([value, label, secondary]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'action' + (secondary ? ' secondary' : '');
                button.dataset.choice = value;
                button.textContent = label;
                actions.append(button);
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
                    const button = e.target.closest?.('[data-choice]');
                    if (!button || button.disabled) return;

                    e.preventDefault();
                    e.stopPropagation();

                    const value = button.dataset.choice;
                    cleanup();

                    root.querySelectorAll('button').forEach(b => {
                        b.disabled = true;
                    });

                    resolve(value);
                };

                root.addEventListener('click', click);
                signal.addEventListener('abort', stop, { once: true });
            });
        }

        const next = () => choose([['next', say('Continuar', 'Continue')]]);

        async function feedback(ok, heading, description) {
            await visible();
            feedbackHaptic(ok);

            draw(
                heading,
                description,
                '<div aria-hidden="true" class="symbol' + (ok ? '' : ' no') + '">' + (ok ? '♥' : '×') + '</div>'
            );

            await wait(950);
            await visible();
        }

        async function demonstration() {
            draw(
                say('O próximo olá está perto.', 'Your next hello is nearby.'),
                say(
                    'Quem usa a Margot perto de ti pode aparecer aqui. Experimenta tocar numa foto.',
                    'People using Margot nearby can appear here. Try tapping a photo.'
                ),
                '<div class="stage"><span class="demo-label">' +
                say('Demonstração', 'Demo') +
                '</span><img class="avatar self" data-own><button type="button" class="avatar p1" data-peer="0" data-choice="sofia" aria-label="Sofia"></button><button type="button" class="avatar p2" data-peer="50" data-choice="alex" aria-label="Alex"></button><button type="button" class="avatar p3" data-peer="100" data-choice="lara" aria-label="Lara"></button><span class="hint">' +
                say('↑ Toca numa das fotos', '↑ Tap a photo') +
                '</span></div>'
            );

            const selected = await choose([
                ['skip', say('Saltar demonstração', 'Skip demo'), true]
            ]);

            if (selected !== 'skip') {
                const person = {
                    sofia: ['Sofia', 0],
                    alex: ['Alex', 50],
                    lara: ['Lara', 100]
                }[selected] || ['Sofia', 0];

                draw(
                    say('Um Hey pode ser o início.', 'It can start with a Hey.'),
                    say(
                        'Envia um Hey para dizer olá, ou começa uma conversa. Aqui é só uma demonstração.',
                        'Send a Hey to say hello, or start a conversation. This is only a demo.'
                    ),
                    '<div class="profile"><span class="avatar" data-peer="' +
                    person[1] +
                    '"></span><strong>' +
                    person[0] +
                    '</strong><small>' +
                    say('Perfil de exemplo', 'Example profile') +
                    '</small></div>'
                );

                const action = await choose([
                    ['hey', say('Enviar Hey 👋', 'Send Hey 👋')],
                    ['message', say('Enviar mensagem', 'Send a message'), true]
                ]);

                await feedback(
                    true,
                    action === 'hey'
                        ? say('Hey enviado! 👋', 'Hey sent! 👋')
                        : say('E a conversa começa.', 'And the conversation starts.'),
                    say(
                        'Foi só um ensaio. Não enviámos nada a ninguém.',
                        'Just a practice run. Nothing was sent to anyone.'
                    )
                );
            }

            draw(
                say('É assim que a Margot funciona.', 'That is how Margot works.'),
                say(
                    'Viste alguém com quem gostavas de falar? Abre a Margot, encontra essa pessoa e dá o primeiro olá. Se ainda não aparecer ninguém, volta a experimentar quando houver pessoas por perto.',
                    'See someone you would like to talk to? Open Margot, find them and say hello. If nobody appears yet, try again when people are nearby.'
                )
            );

            await next();
        }

        async function request(kind, fn) {
            valid();

            await ui.run(() => {
                valid();
                return ui.guide(kind, fn);
            });

            await visible();
        }

        async function settings() {
            valid();

            const opened = await bg.openSettings();
            valid();

            if (opened === false) throw new Error('Settings unavailable');

            draw(
                say('Volta depois de escolheres.', 'Come back after choosing.'),
                ios()
                    ? say(
                        'Nas Definições → Margot → Localização, escolhe a autorização pretendida. Depois volta aqui para a confirmar.',
                        'In Settings → Margot → Location, choose your permission. Then return here to confirm it.'
                    )
                    : say(
                        'Nas definições da Margot, abre Permissões → Localização. Depois volta aqui para confirmar.',
                        'In Margot settings, open Permissions → Location. Then return here to confirm.'
                    )
            );

            await choose([
                ['check', say('Já alterei — verificar', 'I changed it — check')],
                ['later', say('Agora não', 'Not now'), true]
            ]);

            await visible();
        }

        document.addEventListener('margot:page-leave', abort, { signal });

        document.addEventListener(
            'visibilitychange',
            () => content.toggleAttribute('data-paused', document.hidden),
            { signal }
        );

        host.addEventListener('cancel', e => {
            e.preventDefault();
            abort();
        }, { signal });

        host.addEventListener('close', abort, { signal });

        let watcher;
        let complete = false;

        try {
            while (!gateOpen()) {
                await wait(200);
                valid();
            }

            await visible();

            if (!preview) ui.deferNotifications();

            document.body.append(host);
            host.showModal();

            watcher = setInterval(() => {
                if (String(window.membroId) !== id || !canvas() || !gateOpen()) abort();
            }, 500);

            if (preview || !seen(id, 'demo')) {
                await demonstration();
                if (!preview) save(id, 'demo');
            }

            if (preview) return true;

            state = await bg.status();
            valid();

            if (!granted(state) || pref('localizacao') === false) {
                const canAsk = pending(state) && state.services_enabled !== false;

                draw(
                    say('Agora, vamos encontrar quem está perto.', 'Now, find people nearby.'),
                    say(
                        'A Margot precisa da tua localização para te mostrar pessoas próximas. A tua posição exata não é mostrada às outras pessoas.',
                        'Margot needs your location to show people nearby. Your exact position is not shown to other people.'
                    ),
                    '<div class="permission">' +
                    (ios() && canAsk
                        ? say(
                            'No próximo ecrã, escolhe “Permitir durante a utilização”.',
                            'On the next screen, choose “Allow While Using App”.'
                        )
                        : say(
                            'Escolhes a autorização nas definições do sistema e podes mudá-la depois.',
                            'You choose the permission in system settings and can change it later.'
                        )) +
                    '</div>'
                );

                const choice = await choose([
                    ['allow', say('Permitir localização', 'Allow location')],
                    ['later', say('Agora não', 'Not now'), true]
                ]);

                if (choice === 'allow') {
                    if (!granted(state)) {
                        if (canAsk) await request('location', () => bg.requestPermission(false));
                        else await settings();
                    }

                    state = await bg.status();
                    valid();

                    const ok = granted(state);
                    if (ok) setPref('localizacao', true);

                    await feedback(
                        ok,
                        ok ? say('Obrigado! ♥', 'Thank you! ♥') : say('Fica para mais tarde.', 'Maybe later.'),
                        ok
                            ? say(
                                'A localização durante a utilização está disponível.',
                                'Location while using the app is available.'
                            )
                            : say(
                                'Podes ativar a localização depois. Sem ela, não conseguimos mostrar os encontros por perto.',
                                'You can enable location later. Without it, we cannot show nearby encounters.'
                            )
                    );
                } else {
                    await feedback(
                        false,
                        say('Fica para mais tarde.', 'Maybe later.'),
                        say('Podes ativar a localização depois.', 'You can enable location later.')
                    );
                }
            }

            if (
                ios() &&
                granted(state) &&
                auth(state) === 'when_in_use' &&
                pref('localizacao') !== false
            ) {
                draw(
                    say('E quando guardas o telemóvel?', 'What about when you put your phone away?'),
                    say(
                        'A opção “Sempre” permite à Margot tentar atualizar os encontros em segundo plano. Sem atualizações recentes, podes deixar de aparecer. Podes mudar esta escolha quando quiseres.',
                        '“Always” lets Margot try to update encounters in the background. Without recent updates, you may stop appearing. You can change this choice at any time.'
                    ),
                    '<div class="pocket-scene" aria-hidden="true"><div class="phone"><img data-own></div><div class="pocket"></div></div>'
                );

                const choice = await choose([
                    ['always', say('Permitir Sempre', 'Allow Always')],
                    ['later', say('Continuar por agora', 'Continue for now'), true]
                ]);

                if (choice === 'always') {
                    let attempted = false;

                    try {
                        attempted = Boolean(localStorage.getItem('margot-location-always-attempt-v1'));
                    } catch (_) {}

                    const modern = state.permission_flow_version === 2;
                    const canAsk = !attempted && (
                        state.always_requested === false ||
                        (!modern && state.always_requested === undefined)
                    );

                    if (canAsk) {
                        await request('always', async () => {
                            const result = await (
                                modern
                                    ? bg.requestPermission(true)
                                    : bg.requestAlways()
                            );

                            if (result?.authenticated !== false && !result?.cancelled) {
                                try {
                                    localStorage.setItem('margot-location-always-attempt-v1', '1');
                                } catch (_) {}
                            }

                            return result;
                        });
                    } else {
                        await settings();
                    }

                    state = await bg.status();
                    valid();

                    const ok = granted(state) && auth(state) === 'always';

                    await feedback(
                        ok,
                        ok ? say('Obrigado! ♥', 'Thank you! ♥') : say('Mantemos a tua escolha.', 'Your choice is saved.'),
                        ok
                            ? say(
                                'A localização em segundo plano está autorizada.',
                                'Background location is authorised.'
                            )
                            : say(
                                '“Sempre” ainda não está ativo. Podes alterá-lo nas Definições.',
                                '“Always” is not enabled yet. You can change it in Settings.'
                            )
                    );
                } else {
                    await feedback(
                        false,
                        say('Mantemos a tua escolha.', 'Your choice is saved.'),
                        say(
                            'Podes permitir “Sempre” mais tarde nas Definições.',
                            'You can allow “Always” later in Settings.'
                        )
                    );
                }
            }

            const push = window.MargotPushNotifications;
            const notifications = await push?.permissionState?.();
            valid();

            if (
                ['prompt', 'prompt-with-rationale'].includes(notifications) ||
                (notifications === 'granted' && pref('notificacoes') === false)
            ) {
                draw(
                    say('Não deixes um olá à espera.', 'Do not leave a hello waiting.'),
                    say(
                        'Ativa as notificações para saberes quando recebes um Hey ou uma mensagem.',
                        'Enable notifications to know when you receive a Hey or a message.'
                    ),
                    '<div class="symbol" aria-hidden="true">♡</div>'
                );

                const choice = await choose([
                    ['allow', say('Permitir notificações', 'Allow notifications')],
                    ['later', say('Agora não', 'Not now'), true]
                ]);

                if (choice === 'allow') {
                    const result = await push.requestPermission();
                    await visible();

                    if (['granted', 'denied'].includes(result)) {
                        setPref('notificacoes', result === 'granted');

                        try {
                            localStorage.setItem('margot-notification-intro-v2', result);
                        } catch (_) {}
                    }

                    await feedback(
                        result === 'granted',
                        result === 'granted'
                            ? say('Obrigado! ♥', 'Thank you! ♥')
                            : say('Fica para mais tarde.', 'Maybe later.'),
                        result === 'granted'
                            ? say('Já podes receber os teus avisos.', 'You can now receive alerts.')
                            : say(
                                'Podes ativar as notificações nas Definições quando quiseres.',
                                'You can enable notifications in Settings at any time.'
                            )
                    );
                } else {
                    await feedback(
                        false,
                        say('Fica para mais tarde.', 'Maybe later.'),
                        say('Podes ativar as notificações depois.', 'You can enable notifications later.')
                    );
                }
            }

            draw(
                say('Agora é contigo.', 'Now it is your turn.'),
                say(
                    'O próximo ecrã já é a Margot a sério. Os perfis da demonstração não vão aparecer lá.',
                    'The next screen is the real Margot. The demo profiles will not appear there.'
                )
            );

            await choose([
                ['finish', say('Entrar na Margot', 'Enter Margot')]
            ]);

            save(id, 'complete');
            complete = true;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('Margot onboarding:', error);

                try {
                    draw(
                        say('Vamos continuar.', 'Let us continue.'),
                        say(
                            'Não conseguimos concluir este passo. Podes voltar a tentar nas definições da Margot.',
                            'We could not finish this step. You can try again in Margot settings.'
                        )
                    );

                    await next();
                } catch (_) {}
            }
        } finally {
            abort();
            clearInterval(watcher);
            host.close();
            host.remove();

            if (complete) inviteLater(id);
        }

        return true;
    }

    function run(options) {
        if (active) return active;
        active = launch(options).finally(() => { active = null; });
        return active;
    }

    document.addEventListener('margot:page-leave', () => {
        tipHost?.remove();
    });

    window.MargotWelcome = {
        run,
        preview: () => run({ preview: true }),
        get busy() { return Boolean(active); }
    };
})();