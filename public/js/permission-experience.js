(() => {
    'use strict';

    if (window.MargotPermissionUI) return;

    let tail = Promise.resolve();
    let active = false;
    let visit = 0;
    let locationVisit = -1;

    document.addEventListener('margot:page-ready', () => {
        visit++;
    });

    const native = () =>
        Boolean(window.Capacitor?.isNativePlatform?.());

    const plugin = (name) =>
        window.Capacitor?.Plugins?.[name] ||
        window.Capacitor?.registerPlugin?.(name);

    const arrow =
        '<svg viewBox="0 0 100 100" aria-hidden="true">' +
        '<path d="M12 88Q24 42 83 17M51 13L85 15L78 49"/>' +
        '</svg>';

    function run(task) {
        const result = tail.then(async () => {
            active = true;

            try {
                return await task();
            } finally {
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
        return new Promise((resolve) => {
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

            function finish(value) {
                if (done) return;

                done = true;

                dialog.close();
                dialog.remove();

                document.removeEventListener(
                    'margot:page-leave',
                    cancel
                );

                resolve(value);
            }

            const cancel = () => finish(false);

            dialog.addEventListener('cancel', (event) => {
                event.preventDefault();
                cancel();
            });

            dialog.querySelector('button').onclick = () => {
                finish(true);
            };

            document.addEventListener(
                'margot:page-leave',
                cancel,
                { once: true }
            );

            document.body.append(dialog);

            dialog.showModal();
        });
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

        /*
         * Este é apenas o fundo da Margot.
         * O alerta apresentado por cima é o verdadeiro alerta do iOS.
         */
        dialog.innerHTML =
            '<p class="permission-brand">Margot</p>' +
            '<h2></h2>' +
            '<span class="permission-arrow permission-arrow-left">' +
            arrow +
            '</span>' +
            '<span class="permission-arrow permission-arrow-right">' +
            arrow +
            '</span>';

        dialog.querySelector('h2').textContent =
            kind === 'notifications'
                ? 'Fica a par dos próximos olás.'
                : kind === 'always'
                  ? 'Os encontros continuam lá fora.'
                  : 'Descobre quem está por perto.';

        dialog.setAttribute(
            'aria-label',
            'Responde ao pedido do iPhone.'
        );

        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
        });

        document.body.append(dialog);

        dialog.showModal();

        try {
            return await request();
        } finally {
            dialog.close();
            dialog.remove();
        }
    }

    window.MargotPermissionUI = {
        run,
        explain,
        guide,

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

        try {
            await window.MargotLocationReady;

            const state = await push.permissionState();

            if (
                !messagesVisible() ||
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
            } catch (_) {
                // A proteção desta sessão continua disponível.
            }

            notificationShown = true;

            const accepted = await run(async () => {
                if (!messagesVisible()) {
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

            if (!accepted) {
                notificationShown = false;
                return;
            }

            const result = await push.requestPermission();

            if (['granted', 'denied'].includes(result)) {
                try {
                    localStorage.setItem(
                        notificationKey,
                        result
                    );
                } catch (_) {
                    // O armazenamento não é obrigatório.
                }

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
                'Não foi possível preparar o pedido de notificações.',
                error
            );
        } finally {
            notificationChecking = false;
        }
    }

    document.addEventListener(
        'margot:page-ready',
        offerNotifications
    );

    document.addEventListener(
        'margot:permission-idle',
        offerNotifications
    );

    document.addEventListener(
        'DOMContentLoaded',
        offerNotifications,
        { once: true }
    );

    document.addEventListener(
        'margot:permissions-resume',
        async () => {
            const push = window.MargotPushNotifications;

            if (!push || !window.membroId) {
                return;
            }

            try {
                if (await push.permissionState() === 'granted') {
                    if (
                        localStorage.getItem(notificationKey) === 'denied'
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

                    await push.register();
                }
            } catch (_) {
                // O registo volta a ser tentado no próximo regresso à app.
            }
        }
    );

    /*
     * Voltar das Definições consulta o estado e regista o dispositivo.
     * Não abre automaticamente outro pedido de autorização.
     */
    if (native()) {
        plugin('App')
            ?.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    document.dispatchEvent(
                        new Event('margot:permissions-resume')
                    );
                }
            })
            .catch(() => {});
    }
})();