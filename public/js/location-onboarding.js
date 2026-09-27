(() => {
    'use strict';
    if (window.MargotLocationOnboarding) return;
    let release;
    window.MargotLocationReady = new Promise((resolve) => {
        release = resolve;
    });
    const native = window.Capacitor?.isNativePlatform?.();
    const ios = window.Capacitor?.getPlatform?.() === 'ios';
    const key = 'margot-location-education:' + window.membroId;
    let dialog,
        busy = false,
        hiddenAt = 0,
        checked = false,
        checking = false,
        revision = 0;

    const read = () => {
        try {
            return JSON.parse(localStorage.getItem(key)) || { opens: 0 };
        } catch {
            return { opens: 0 };
        }
    };

    const save = (value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* Sem armazenamento, funciona nesta sessão. */
        }
    };

    // A permissão pertence ao dispositivo; o serviço pode estar parado após o logout.
    const authorization = (state) => state?.authorization ?? state?.permission;
    const complete = (state) => ios
        ? authorization(state) === 'always'
        : ['granted', 'precise', 'approximate'].includes(authorization(state));
    const status = () => window.MargotBackgroundLocation.status();

    function finish() {
        revision++;
        dialog?.close();
        release();
    }

    function render(confirm = false, settings = false) {
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'location-education';
            dialog.setAttribute('aria-labelledby', 'location-title');
            dialog.addEventListener('cancel', (event) => {
                event.preventDefault();
                render(true);
            });
            document.body.append(dialog);
        }

        dialog.innerHTML = `
            <div class="location-orbit" aria-hidden="true"><span>Tu</span><i>Hey</i><b>✦</b></div>
            <p class="location-eyebrow">A MARGOT CONTINUA POR PERTO</p>
            <h2 id="location-title"></h2><p data-explanation></p><p class="location-detail"></p>
            <p class="location-error" role="alert"></p>
            <button class="location-primary" type="button"></button>
            <button class="location-secondary" type="button"></button>`;

        dialog.querySelector('h2').textContent = confirm
            ? 'Continuar sem esta opção?'
            : 'Os encontros não esperam que abras a app.';

        dialog.querySelector('[data-explanation]').textContent = confirm
            ? 'Sem localização em segundo plano, a tua presença pode deixar de atualizar quando sais da Margot. Alguém que passe por ti pode não te encontrar.'
            : 'A localização em segundo plano permite atualizar quem está perto, mesmo quando tens o telemóvel no bolso. A tua posição exata não é mostrada às outras pessoas.';

        dialog.querySelector('.location-detail').textContent = settings
            ? 'No iPhone: Definições → Margot → Localização → Sempre. Podes mudar esta escolha quando quiseres.'
            : 'Pode consumir bateria. O consumo depende do movimento, do sinal e do dispositivo. Podes desligar esta opção nas definições.';

        const primary = dialog.querySelector('.location-primary');
        const secondary = dialog.querySelector('.location-secondary');

        primary.textContent = settings
            ? 'Abrir definições'
            : ios
              ? 'Ativar localização Sempre'
              : 'Ativar em segundo plano';

        secondary.textContent = confirm ? 'Continuar assim' : 'Agora não';

        primary.onclick = async () => {
            if (busy) return;
            busy = true;
            const current = revision;
            primary.disabled = secondary.disabled = true;

            try {
                const state = await status();
                if (current !== revision) return;

                if (complete(state)) {
                    finish();
                    return;
                }

                const needsSettings = settings || ['denied', 'restricted'].includes(authorization(state));

                if (needsSettings) {
                    await window.MargotBackgroundLocation.openSettings();
                } else {
                    dialog.close();
                    const result = await window.MargotBackgroundLocation.requestAlways();
                    if (current !== revision) return;

                    if (complete(result)) {
                        finish();
                        return;
                    }

                    const latest = await status();
                    if (current !== revision) return;

                    if (complete(latest)) finish();
                    else if (['denied', 'restricted'].includes(authorization(latest))) render(true, ios);
                    // O iOS pode concluir a passagem de "Ao usar" para "Sempre" depois.
                    // O evento nativo e o regresso à app voltam a consultar a permissão.
                    else finish();
                }
            } catch {
                if (current !== revision) return;
                render(false, settings);
                dialog.querySelector('.location-error').textContent =
                    'Não foi possível ativar agora. Podes tentar nas definições.';
            } finally {
                busy = false;
                dialog.querySelectorAll('button').forEach((button) => {
                    button.disabled = false;
                });
            }
        };

        secondary.onclick = () => (confirm ? finish() : render(true, settings));
        if (!dialog.open) dialog.showModal();
    }

    async function check(force = false) {
        if (!native || (!force && window.MargotPreferencias?.obter?.('localizacao') === false)) {
            release();
            return;
        }

        if (dialog?.open || busy || checking) return;
        checking = true;
        const current = revision;

        try {
            const state = await status();
            if (current !== revision) return;

            if (state?.available === false || !authorization(state)) {
                release();
                return;
            }

            if (complete(state)) {
                finish();
                return;
            }

            const saved = read();
            if (!force) saved.opens = (saved.opens || 0) + 1;
            const show = force || saved.opens === 1 || (saved.opens - 1) % 3 === 0;
            save(saved);

            if (show) render(false, ios && authorization(state) === 'when_in_use');
            else release();
        } catch {
            release();
        } finally {
            checking = false;
        }
    }

    window.MargotLocationOnboarding = {
        open: () => check(true),
        close: finish,
        authorizationChanged: (state) => {
            if (complete(state)) finish();
        }
    };

    const start = () => {
        if (!checked) {
            checked = true;
            check();
        }
    };

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', start, { once: true });
    else queueMicrotask(start);

    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            hiddenAt = Date.now();
            return;
        }

        if (dialog?.open) {
            try {
                if (complete(await status())) finish();
            } catch {
                /* Mantém a explicação disponível. */
            }
            return;
        }

        // Não conta abrir a câmara ou responder a um pedido de permissões como outra abertura da app.
        if (hiddenAt && Date.now() - hiddenAt >= 60000) check();
        hiddenAt = 0;
    });
})();