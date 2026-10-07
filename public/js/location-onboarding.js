(() => {
    'use strict';

    if (window.MargotLocationOnboarding) return;

    let release;

    window.MargotLocationReady = new Promise(resolve => {
        release = resolve;
    });

    const native = Boolean(
        window.Capacitor?.isNativePlatform?.()
    );

    const ios =
        window.Capacitor?.getPlatform?.() === 'ios';

    const legacyKey = 'margot-location-always-attempt-v1';

    let checking = false;
    let lastState;
    let pill;
    let dismissed = false;
    let cancelled = false;
    let attemptedAlways = false;

    const authorization = state =>
        state?.authorization ?? state?.permission;

    const granted = state =>
        (
            ios
                ? ['when_in_use', 'always']
                : ['granted', 'precise', 'approximate']
        ).includes(authorization(state)) &&
        state?.services_enabled !== false;

    const pending = state =>
        [
            'not_determined',
            'prompt',
            'prompt-with-rationale'
        ].includes(authorization(state));

    const bg = () => window.MargotBackgroundLocation;

    const disabled = () =>
        window.MargotPreferencias?.obter('localizacao') === false;

    const discovery = () =>
        Boolean(document.getElementById('gridCanvas'));

    function needsAlways(state) {
        if (
            !ios ||
            authorization(state) !== 'when_in_use' ||
            attemptedAlways
        ) {
            return false;
        }

        try {
            if (localStorage.getItem(legacyKey)) {
                return false;
            }
        } catch (_) {}

        return (
            state.always_requested === false ||
            (
                state.permission_flow_version !== 2 &&
                state.always_requested === undefined
            )
        );
    }

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
                if (
                    (disabled() && granted(lastState)) ||
                    pending(lastState)
                ) {
                    return check(true);
                }

                try {
                    await bg().openSettings();
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
                : pending(lastState)
                  ? 'Continuar'
                  : 'Abrir definições';

        pill.hidden =
            checking ||
            dismissed ||
            !discovery() ||
            !lastState ||
            lastState.available === false ||
            (granted(lastState) && !disabled());
    }

    async function check(force = false) {
        const ui = window.MargotPermissionUI;

        if (!native || !ui) {
            release();
            return;
        }

        if (checking) return;

        checking = true;
        cancelled = false;

        if (pill) pill.hidden = true;

        try {
            lastState = await bg().status();

            if (
                lastState.available === false ||
                (!force && disabled()) ||
                ['denied', 'restricted'].includes(
                    authorization(lastState)
                ) ||
                lastState.services_enabled === false
            ) {
                return;
            }

            const first = pending(lastState);
            const wasDisabled = disabled();

            if (first) {
                attemptedAlways = false;

                try {
                    localStorage.removeItem(legacyKey);
                } catch (_) {}
            }

            const upgrade = needsAlways(lastState);

            if (!force && !first && !upgrade) {
                return;
            }

            if (
                !force &&
                !await ui.waitForContext(2000, discovery)
            ) {
                return;
            }

            if (cancelled) return;

            ui.deferNotifications();

            await ui.run(async () => {
                if (
                    cancelled ||
                    (!force && !discovery())
                ) {
                    return;
                }

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

                    if (!accepted || cancelled) return;

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

                    if (!accepted || cancelled) return;

                    await ui.guide(
                        'location',
                        () => bg().requestPermission(false)
                    );

                    lastState = await bg().status();

                    if (!granted(lastState) || cancelled) {
                        return;
                    }

                    window.MargotPreferencias?.definir(
                        'localizacao',
                        true
                    );
                }

                if (needsAlways(lastState) && !cancelled) {
                    const accepted = await ui.explain({
                        title: 'E quando guardas o telemóvel?',
                        text:
                            'A localização em segundo plano permite atualizar os encontros mesmo quando sais da Margot.',
                        detail:
                            'Podes mudar esta escolha nas definições quando quiseres.'
                    });

                    if (!accepted || cancelled) return;

                    const modern =
                        lastState.permission_flow_version === 2;

                    const result = await ui.guide(
                        'always',
                        () =>
                            modern
                                ? bg().requestPermission(true)
                                : bg().requestAlways()
                    );

                    if (
                        result?.authenticated !== false &&
                        !result?.cancelled
                    ) {
                        attemptedAlways = true;

                        try {
                            localStorage.setItem(
                                legacyKey,
                                '1'
                            );
                        } catch (_) {}
                    }

                    lastState = await bg().status();
                } else if (
                    force &&
                    ios &&
                    authorization(lastState) === 'when_in_use' &&
                    !upgrade &&
                    !first &&
                    !wasDisabled &&
                    !cancelled
                ) {
                    const accepted = await ui.explain({
                        title: 'Localização em segundo plano',
                        text:
                            'Podes permitir a localização Sempre nas definições da Margot.',
                        detail:
                            'A localização durante a utilização já está disponível.',
                        action: 'Abrir definições'
                    });

                    if (accepted && !cancelled) {
                        await bg().openSettings();
                    }
                }
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
            lastState = await bg().status();

            showNotice();

            if (granted(lastState) && !disabled()) {
                await bg().start();
            }
        } catch (_) {}
    }

    window.MargotLocationOnboarding = {
        open: () => check(true),

        close: () => {
            cancelled = true;
            release();
        },

        authorizationChanged: state => {
            lastState = state;

            if (!checking) {
                showNotice();
            }
        }
    };

    document.addEventListener('margot:page-leave', () => {
        cancelled = true;

        if (pill) pill.hidden = true;
    });

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
        'margot:page-ready',
        start
    );

    document.addEventListener(
        'margot:permissions-resume',
        refresh
    );

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refresh();
        }
    });

    window.addEventListener(
        'margot:preferencias-alteradas',
        showNotice
    );
})();