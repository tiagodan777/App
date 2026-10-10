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
    let noticeStatusPending = false;
    let settingsGuide;
    let closeSettingsGuide;
    let openingNoticeSettings = false;

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

    const noticeText = (pt, en) =>
        window.MargotI18n?.language === 'en' ? en : pt;

    function needsBackgroundNotice() {
        return ios &&
            authorization(lastState) === 'when_in_use' &&
            granted(lastState) &&
            !disabled() &&
            window.MargotPreferencias?.obter('invisivel') !== true;
    }

    function explainLocationSettings() {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'margot-location-settings-guide';
            dialog.setAttribute('aria-labelledby', 'margot-location-settings-title');
            dialog.setAttribute('aria-describedby', 'margot-location-settings-description');
            dialog.innerHTML =
                '<h2 id="margot-location-settings-title"></h2>' +
                '<p id="margot-location-settings-description"></p>' +
                '<ol class="margot-location-settings-steps">' +
                '<li><p data-step-one></p>' +
                '<div class="margot-location-settings-example" aria-hidden="true">' +
                '<b class="margot-location-settings-pin">↗</b>' +
                '<strong data-location-label></strong><b class="margot-location-settings-chevron">›</b>' +
                '</div></li>' +
                '<li><p data-step-two></p>' +
                '<div class="margot-location-settings-example is-selected" aria-hidden="true">' +
                '<strong data-always-label></strong><b class="margot-location-settings-check">✓</b>' +
                '</div></li></ol>' +
                '<p class="margot-location-settings-footnote" data-return></p>' +
                '<button type="button" data-open-settings></button>' +
                '<button type="button" data-guide-cancel autofocus></button>';

            const text = (selector, pt, en) => {
                dialog.querySelector(selector).textContent = noticeText(pt, en);
            };
            text('h2', 'São só dois passos.', 'Just two steps.');
            text('#margot-location-settings-description', 'Nas definições da Margot:', 'In Margot settings:');
            text('[data-step-one]', 'Toca em “Localização”.', 'Tap “Location”.');
            text('[data-location-label]', 'Localização', 'Location');
            text('[data-step-two]', 'Escolhe “Sempre”.', 'Choose “Always”.');
            text('[data-always-label]', 'Sempre', 'Always');
            text('[data-return]', 'Depois, volta à Margot.', 'Then return to Margot.');
            text('[data-open-settings]', 'Abrir definições', 'Open Settings');
            text('[data-guide-cancel]', 'Agora não', 'Not now');

            let finished = false;
            const finish = accepted => {
                if (finished) return;
                finished = true;
                if (dialog.open) dialog.close();
                dialog.remove();
                settingsGuide = null;
                closeSettingsGuide = null;
                resolve(accepted);
            };
            settingsGuide = dialog;
            closeSettingsGuide = () => finish(false);
            dialog.querySelector('[data-open-settings]').onclick = () => finish(true);
            dialog.querySelector('[data-guide-cancel]').onclick = () => finish(false);
            dialog.addEventListener('cancel', event => {
                event.preventDefault();
                finish(false);
            });
            dialog.addEventListener('close', () => finish(false));
            document.body.append(dialog);
            try {
                dialog.showModal();
            } catch (_) {
                finish(false);
                pill.querySelector('[data-description]').textContent = noticeText(
                    'Nas definições da Margot, toca em Localização e escolhe Sempre.',
                    'In Margot settings, tap Location and choose Always.'
                );
            }
        });
    }

    function showNotice() {
        if (!native) return;

        if (!pill) {
            pill = document.createElement('aside');

            pill.className = 'margot-location-pill';
            pill.setAttribute('aria-label', 'Localização');

            pill.innerHTML =
                '<strong data-title></strong>' +
                '<span data-description></span>' +
                '<div class="margot-location-pill-actions">' +
                '<small data-guidance></small>' +
                '<button type="button" data-settings>Abrir definições</button>' +
                '</div>' +
                '<button type="button" data-close aria-label="Fechar aviso">×</button>';

            pill.querySelector('[data-settings]').onclick = async () => {
                if (
                    (disabled() && granted(lastState)) ||
                    pending(lastState)
                ) {
                    return check(true);
                }

                if (openingNoticeSettings) return;
                openingNoticeSettings = true;

                try {
                    if (needsBackgroundNotice() && !await explainLocationSettings()) {
                        return;
                    }
                    const result = await bg().openSettings();
                    if (result === false || result?.opened === false) {
                        throw new Error('Settings were not opened');
                    }
                } catch (_) {
                    pill.querySelector('span').textContent = ios
                        ? noticeText('Abre Definições → Margot → Localização → Sempre.', 'Open Settings → Margot → Location → Always.')
                        : noticeText('Abre as definições da Margot → Permissões → Localização.', 'Open Margot settings → Permissions → Location.');
                } finally {
                    openingNoticeSettings = false;
                }
            };

            pill.querySelector('[data-close]').onclick = () => {
                dismissed = true;
                pill.hidden = true;
            };

            document.body.append(pill);
        }

        const backgroundNotice = needsBackgroundNotice();
        if (!backgroundNotice && settingsGuide) closeSettingsGuide?.();
        pill.querySelector('[data-title]').textContent = backgroundNotice
            ? noticeText('Não percas um olá.', 'Don’t miss a hello.')
            : noticeText('Descobre quem está perto.', 'Discover people nearby.');

        const guidance = pill.querySelector('[data-guidance]');
        guidance.textContent = backgroundNotice
            ? noticeText('Nas definições: Localização → Sempre', 'In Settings: Location → Always')
            : '';
        guidance.hidden = true;
        pill.querySelector('span').textContent = backgroundNotice
            ? noticeText('Sem “Sempre”, podes desaparecer ao sair da app.', 'Without “Always”, you may disappear when you leave the app.')
            : 'Sem localização ativa, não conseguimos descobrir quem está perto de ti.';

        pill.querySelector('[data-settings]').textContent =
            disabled() && granted(lastState)
                ? 'Alterar na Margot'
                : pending(lastState)
                  ? 'Continuar'
                  : backgroundNotice
                    ? noticeText('Ver como ativar', 'Show me how')
                    : 'Abrir definições';

        pill.hidden =
            checking ||
            document.hidden ||
            dismissed ||
            !discovery() ||
            !lastState ||
            lastState.available === false ||
            (granted(lastState) && !disabled() && !backgroundNotice);
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
            if (authorization(state) !== authorization(lastState)) {
                dismissed = false;
            }
            lastState = state;

            if (!checking) {
                showNotice();
            }
        }
    };

    document.addEventListener('margot:page-leave', () => {
        cancelled = true;
        closeSettingsGuide?.();

        if (pill) pill.hidden = true;
    });

    const start = () => {
        if (discovery()) dismissed = false;
        return check();
    };

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

    // Read permission only: no GPS request, network request or tracking restart.
    async function refreshNoticePermission() {
        if (
            !native || !ios || document.hidden || !discovery() ||
            checking || noticeStatusPending || !bg()?.status
        ) {
            return;
        }

        noticeStatusPending = true;

        try {
            const state = await bg().status();

            if (!document.hidden && discovery() && !checking) {
                window.MargotLocationOnboarding.authorizationChanged(state);
            }
        } catch (_) {
            // A later foreground check retries transient bridge failures.
        } finally {
            noticeStatusPending = false;
        }
    }

    function resume() {
        dismissed = false;
        return refresh();
    }

    if (native && ios) {
        // Fallback if a resume event is missed or the first status read fails.
        // Hidden pages and other screens do not call the native bridge.
        window.setInterval(refreshNoticePermission, 3000);
        window.addEventListener('focus', refreshNoticePermission);
        window.addEventListener('pageshow', refreshNoticePermission);
    }

    document.addEventListener(
        'margot:permissions-resume',
        resume
    );

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            resume();
        } else if (pill) {
            closeSettingsGuide?.();
            pill.hidden = true;
        }
    });

    window.addEventListener(
        'margot:preferencias-alteradas',
        showNotice
    );
})();