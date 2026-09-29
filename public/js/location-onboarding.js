(() => {
    'use strict';

    if (window.MargotLocationOnboarding) return;

    let release;

    window.MargotLocationReady = new Promise((resolve) => {
        release = resolve;
    });

    const native = Boolean(
        window.Capacitor?.isNativePlatform?.()
    );

    const ios =
        window.Capacitor?.getPlatform?.() === 'ios';

    let checking = false;
    let lastState;
    let pill;
    let dismissed = false;

    const authorization = (state) =>
        state?.authorization ?? state?.permission;

    const granted = (state) =>
        ios
            ? ['when_in_use', 'always'].includes(
                  authorization(state)
              ) && state?.services_enabled !== false
            : ['granted', 'precise', 'approximate'].includes(
                  authorization(state)
              ) && state?.services_enabled !== false;

    const status = () =>
        window.MargotBackgroundLocation.status();

    const disabled = () =>
        window.MargotPreferencias?.obter('localizacao') === false;

    function showNotice() {
        if (!native) return;

        if (!pill) {
            pill = document.createElement('aside');

            pill.className = 'margot-location-pill';
            pill.setAttribute('aria-label', 'Localização');

            pill.innerHTML =
                '<span>📍 Sem localização ativa, não conseguimos descobrir quem está perto de ti.</span>' +
                '<button type="button" data-settings>Abrir definições</button>' +
                '<button type="button" data-close aria-label="Fechar aviso">×</button>';

            pill.querySelector('[data-settings]').onclick = async () => {
                const pending = [
                    'not_determined',
                    'prompt',
                    'prompt-with-rationale'
                ].includes(authorization(lastState));

                if (
                    (disabled() && granted(lastState)) ||
                    pending
                ) {
                    await check(true);
                    return;
                }

                try {
                    await window.MargotBackgroundLocation.openSettings();
                } catch (_) {
                    pill.querySelector('span').textContent =
                        'Abre Definições → Margot → Localização no iPhone.';
                }
            };

            pill.querySelector('[data-close]').onclick = () => {
                dismissed = true;
                pill.hidden = true;
            };

            document.body.append(pill);
        }

        pill.querySelector('[data-settings]').textContent =
            disabled() && granted(lastState)
                ? 'Alterar na Margot'
                : [
                      'not_determined',
                      'prompt',
                      'prompt-with-rationale'
                  ].includes(authorization(lastState))
                  ? 'Continuar'
                  : 'Abrir definições';

        pill.hidden =
            dismissed ||
            !document.getElementById('gridCanvas') ||
            !lastState ||
            lastState.available === false ||
            (granted(lastState) && !disabled());
    }

    async function check(force = false) {
        if (!native || !window.MargotPermissionUI) {
            release();
            return;
        }

        if (checking) return;

        checking = true;

        try {
            lastState = await status();

            if (lastState.available === false) return;
            if (!force && disabled()) return;

            const auth = authorization(lastState);

            if (
                ['denied', 'restricted'].includes(auth) ||
                lastState.services_enabled === false
            ) {
                return;
            }

            const wasDisabled = disabled();

            const first = [
                'not_determined',
                'prompt',
                'prompt-with-rationale'
            ].includes(auth);

            const needsAlways =
                ios &&
                auth === 'when_in_use' &&
                lastState.always_requested === false;

            if (!force && !first && !needsAlways) {
                return;
            }

            window.MargotPermissionUI.deferNotifications();

            await window.MargotPermissionUI.run(async () => {
                const ui = window.MargotPermissionUI;

                if (
                    force &&
                    granted(lastState) &&
                    disabled()
                ) {
                    const accepted = await ui.explain({
                        title: 'Descobre quem está perto.',
                        text:
                            'A Margot vai usar a localização que já autorizaste neste dispositivo.',
                        detail:
                            'A tua posição exata não é mostrada às outras pessoas.'
                    });

                    if (!accepted) return;

                    window.MargotPreferencias?.definir(
                        'localizacao',
                        true
                    );
                }

                if (first) {
                    const accepted = await ui.explain({
                        title: 'O próximo olá está perto.',
                        text:
                            'A localização permite descobrir pessoas que estão perto de ti.',
                        detail:
                            'A tua posição exata não é mostrada às outras pessoas. Escolhes a autorização no próximo ecrã.'
                    });

                    if (!accepted) return;

                    lastState = await ui.guide(
                        'location',
                        () =>
                            window.MargotBackgroundLocation.requestPermission(
                                false
                            )
                    );

                    /*
                     * No Android, o resultado da permissão vem
                     * embrulhado num objeto do Capacitor.
                     */
                    if (!ios) {
                        lastState = await status();
                    }

                    if (lastState.update_required) {
                        throw new Error(
                            'Atualiza a Margot para concluir este pedido.'
                        );
                    }

                    if (!granted(lastState)) {
                        return;
                    }

                    window.MargotPreferencias?.definir(
                        'localizacao',
                        true
                    );
                }

                if (
                    ios &&
                    authorization(lastState) === 'when_in_use' &&
                    lastState.always_requested === false
                ) {
                    const accepted = await ui.explain({
                        title: 'E quando guardas o telemóvel?',
                        text:
                            'A localização em segundo plano permite atualizar os encontros mesmo quando sais da Margot.',
                        detail:
                            'Pode consumir bateria. Podes mudar esta escolha nas definições quando quiseres.'
                    });

                    if (!accepted) return;

                    lastState = await ui.guide(
                        'always',
                        () =>
                            window.MargotBackgroundLocation.requestPermission(
                                true
                            )
                    );
                }

                if (
                    force &&
                    ios &&
                    authorization(lastState) === 'when_in_use' &&
                    !needsAlways &&
                    !first &&
                    !wasDisabled
                ) {
                    const accepted = await ui.explain({
                        title: 'Localização em segundo plano',
                        text:
                            'Podes permitir a localização Sempre nas definições da Margot.',
                        detail:
                            'A localização durante a utilização já está disponível.',
                        action: 'Abrir definições'
                    });

                    if (accepted) {
                        await window.MargotBackgroundLocation.openSettings();
                    }
                }

                /*
                 * Recusar não abre outra mensagem de persuasão
                 * nem encaminha automaticamente para as definições.
                 */
            });
        } catch (error) {
            console.warn(
                'Não foi possível concluir o pedido de localização.',
                error
            );
        } finally {
            checking = false;

            release();
            showNotice();
        }
    }

    async function refresh() {
        if (!native || checking) return;

        try {
            lastState = await status();

            showNotice();

            if (granted(lastState) && !disabled()) {
                window.MargotBackgroundLocation.start();
            }
        } catch (_) {
            /*
             * Mantém o último estado conhecido.
             * Regressar à app nunca abre outro pedido automaticamente.
             */
        }
    }

    window.MargotLocationOnboarding = {
        open: () => check(true),

        close: () => {
            release();
        },

        authorizationChanged: (state) => {
            lastState = state;

            if (!checking) {
                showNotice();
            }
        }
    };

    const start = () => check();

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            start,
            { once: true }
        );
    } else {
        queueMicrotask(start);
    }

    document.addEventListener(
        'margot:permissions-resume',
        refresh
    );

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refresh();
        }
    });

    document.addEventListener(
        'margot:page-ready',
        showNotice
    );

    window.addEventListener(
        'margot:preferencias-alteradas',
        showNotice
    );
})();