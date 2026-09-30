(() => {
    'use strict';

    if (window.MargotPermissionUI) return;

    let tail = Promise.resolve();
    let active = false;
    let visit = 0;
    let locationVisit = -1;

    const native = () =>
        Boolean(window.Capacitor?.isNativePlatform?.());

    const plugin = name =>
        window.Capacitor?.Plugins?.[name] ||
        window.Capacitor?.registerPlugin?.(name);

    const reduced = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const pause = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    document.addEventListener('margot:page-ready', () => {
        visit++;
    });

    // A pausa pertence à página atual. Sair ou ocultar cancela-a.
    function waitForContext(ms, visible) {
        if (document.hidden || !visible()) {
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            const finish = value => {
                clearTimeout(timer);

                document.removeEventListener(
                    'margot:page-leave',
                    cancel
                );

                document.removeEventListener(
                    'visibilitychange',
                    visibility
                );

                resolve(value);
            };

            const cancel = () => finish(false);

            const visibility = () => {
                if (document.hidden) cancel();
            };

            const timer = setTimeout(
                () => finish(!document.hidden && visible()),
                ms
            );

            document.addEventListener(
                'margot:page-leave',
                cancel,
                { once: true }
            );

            document.addEventListener(
                'visibilitychange',
                visibility
            );
        });
    }

    let scene;

    function ensureScene() {
        if (scene) return;

        scene = document.createElement('dialog');
        scene.className = 'margot-permission-scene';
        scene.setAttribute('aria-hidden', 'true');

        scene.addEventListener('cancel', event => {
            event.preventDefault();
        });

        document.body.append(scene);

        scene.showModal();
        scene.getBoundingClientRect();
        scene.classList.add('is-visible');
    }

    async function clearScene() {
        if (!scene) return;

        const old = scene;
        scene = null;

        old.classList.remove('is-visible');

        await pause(reduced() ? 0 : 340);

        old.close();
        old.remove();
    }

    async function present(dialog) {
        ensureScene();

        document.body.append(dialog);
        dialog.showModal();

        // Materializa o estado inicial antes da transição.
        dialog.getBoundingClientRect();
        dialog.classList.add('is-visible');

        await pause(reduced() ? 0 : 340);
    }

    async function dismiss(dialog) {
        dialog.classList.remove('is-visible');

        await pause(reduced() ? 0 : 220);

        if (dialog.open) dialog.close();

        dialog.remove();
    }

    function run(task) {
        const result = tail.then(async () => {
            active = true;

            try {
                return await task();
            } finally {
                await clearScene();

                active = false;

                document.dispatchEvent(
                    new Event('margot:permission-idle')
                );
            }
        });

        tail = result.catch(() => {});

        return result;
    }

    function explain({
        title,
        text,
        detail = '',
        icon = '📍',
        action = 'Continuar'
    }) {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');

            dialog.className = 'margot-permission-card';

            dialog.setAttribute(
                'aria-labelledby',
                'margot-permission-title'
            );

            dialog.innerHTML =
                '<div class="permission-art" aria-hidden="true"></div>' +
                '<h2 id="margot-permission-title"></h2>' +
                '<p data-copy></p>' +
                '<p class="permission-detail"></p>' +
                '<button type="button"></button>';

            dialog.querySelector('.permission-art').textContent = icon;
            dialog.querySelector('h2').textContent = title;
            dialog.querySelector('[data-copy]').textContent = text;
            dialog.querySelector('.permission-detail').textContent = detail;
            dialog.querySelector('button').textContent = action;

            let done = false;
            let enter;

            async function finish(value) {
                if (done) return;

                done = true;

                dialog.querySelector('button').disabled = true;

                document.removeEventListener(
                    'margot:page-leave',
                    cancel
                );

                await enter;
                await dismiss(dialog);

                resolve(value);
            }

            const cancel = () => finish(false);

            dialog.addEventListener('cancel', event => {
                // O aviso conduz ao pedido do sistema; Escape não o dispensa.
                event.preventDefault();
            });

            dialog.querySelector('button').onclick = () => {
                finish(true);
            };

            document.addEventListener(
                'margot:page-leave',
                cancel,
                { once: true }
            );

            enter = present(dialog);
        });
    }

    /*
     * A build antiga resolve start() antes de o alerta nativo fechar.
     * Observa o ciclo da app antes da chamada para não avançar
     * por cima do alerta.
     */
    async function nativeDecision(request) {
        let inactive = document.hidden;
        let handle;
        let changedAt = Date.now();

        const change = value => {
            inactive = value;
            changedAt = Date.now();
        };

        const visibility = () => change(document.hidden);

        document.addEventListener(
            'visibilitychange',
            visibility
        );

        try {
            try {
                handle = await plugin('App')?.addListener(
                    'appStateChange',
                    state => change(!state.isActive)
                );
            } catch (_) {
                // A promessa da API nativa continua a ser respeitada.
            }

            const result = await request();
            const start = Date.now();

            while (
                inactive ||
                Date.now() - changedAt < 450 ||
                Date.now() - start < 700
            ) {
                if (Date.now() - start > 120000) {
                    throw new Error(
                        'A app ainda não regressou do pedido do iPhone.'
                    );
                }

                await pause(100);
            }

            return result;
        } finally {
            document.removeEventListener(
                'visibilitychange',
                visibility
            );

            await handle?.remove();
        }
    }

    async function guide(kind, request) {
        if (
            !native() ||
            window.Capacitor.getPlatform() !== 'ios'
        ) {
            return request();
        }

        const dialog = document.createElement('dialog');

        dialog.className = 'margot-permission-guide';
        dialog.dataset.kind = kind;

        dialog.setAttribute(
            'aria-label',
            'Responde ao pedido do iPhone.'
        );

        // Fundo neutro: a escolha fica inteiramente no alerta do sistema.
        dialog.innerHTML = '<p class="permission-brand">Margot</p>';

        dialog.addEventListener('cancel', event => {
            event.preventDefault();
        });

        try {
            await present(dialog);

            return await nativeDecision(request);
        } finally {
            await dismiss(dialog);

            if (!active) {
                await clearScene();
            }
        }
    }

    window.MargotPermissionUI = {
        run,
        explain,
        guide,
        waitForContext,

        deferNotifications() {
            locationVisit = visit;
        },

        get busy() {
            return active;
        }
    };

    let notificationChecking = false;
    let notificationShown = false;

    const messagesVisible = () =>
        Boolean(
            document.getElementById('mensagens-pagina') ||
            document.getElementById('chat-pagina')
        );

    const notificationKey = 'margot-notification-intro-v2';

    async function offerNotifications() {
        const push = window.MargotPushNotifications;

        if (
            !native() ||
            !window.membroId ||
            !push ||
            notificationChecking ||
            notificationShown ||
            !messagesVisible() ||
            active
        ) {
            return;
        }

        notificationChecking = true;

        const thisVisit = visit;

        try {
            await window.MargotLocationReady;

            const state = await push.permissionState();

            if (
                active ||
                locationVisit === visit ||
                !['prompt', 'prompt-with-rationale'].includes(state) ||
                window.MargotPreferencias?.obter('notificacoes') === false
            ) {
                return;
            }

            try {
                if (localStorage.getItem(notificationKey)) {
                    return;
                }
            } catch (_) {}

            const contextReady = await waitForContext(
                900,
                () =>
                    messagesVisible() &&
                    visit === thisVisit &&
                    !active
            );

            if (!contextReady) return;

            notificationShown = true;

            const accepted = await run(() => {
                if (
                    !messagesVisible() ||
                    visit !== thisVisit ||
                    locationVisit === visit
                ) {
                    return false;
                }

                return explain({
                    icon: '👋',
                    title: 'Não percas um olá.',
                    text:
                        'Recebe um aviso quando alguém te enviar um Hey ou uma mensagem.',
                    detail:
                        'No próximo ecrã, escolhes se a Margot te pode enviar notificações.'
                });
            });

            if (
                !accepted ||
                !messagesVisible() ||
                visit !== thisVisit
            ) {
                notificationShown = false;
                return;
            }

            /*
             * push.requestPermission já entra na fila:
             * não criar uma fila dentro da outra.
             */
            const result = await push.requestPermission();

            if (['granted', 'denied'].includes(result)) {
                try {
                    localStorage.setItem(
                        notificationKey,
                        result
                    );
                } catch (_) {}

                window.MargotPreferencias?.definir(
                    'notificacoes',
                    result === 'granted'
                );
            } else {
                notificationShown = false;
            }
        } catch (error) {
            notificationShown = false;

            console.warn(
                'Não foi possível preparar as notificações.',
                error
            );
        } finally {
            notificationChecking = false;
        }
    }

    for (const name of [
        'DOMContentLoaded',
        'margot:page-ready',
        'margot:permission-idle'
    ]) {
        document.addEventListener(
            name,
            offerNotifications
        );
    }

    document.addEventListener(
        'margot:permissions-resume',
        async () => {
            const push = window.MargotPushNotifications;

            if (!push || !window.membroId) return;

            try {
                if (await push.permissionState() === 'granted') {
                    try {
                        if (
                            localStorage.getItem(notificationKey) ===
                            'denied'
                        ) {
                            localStorage.setItem(
                                notificationKey,
                                'granted'
                            );

                            window.MargotPreferencias?.definir(
                                'notificacoes',
                                true
                            );
                        }
                    } catch (_) {}

                    await push.register();
                }
            } catch (_) {}
        }
    );

    if (native()) {
        Promise.resolve(
            plugin('App')?.addListener(
                'appStateChange',
                ({ isActive }) => {
                    if (isActive) {
                        document.dispatchEvent(
                            new Event('margot:permissions-resume')
                        );
                    }
                }
            )
        ).catch(() => {});
    }
})();