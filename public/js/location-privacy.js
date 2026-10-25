(function () {
    'use strict';
    if (window.MargotLocationState) return;
    let state = null;
    let intent = null;
    let intentRevision = null;
    let pending = null;
    let generation = 0;
    let refresh = true;
    let lastChoice;
    const member = String(window.membroId || '');
    const pendingKey = 'margot-location-pending-v2:' + member;

    const desired = () => ({
        active: window.MargotPreferencias?.obter('localizacao') !== false,
        visible: window.MargotPreferencias?.obter('localizacao') !== false &&
            window.MargotPreferencias?.obter('invisivel') !== true
    });
    const valid = value => value && typeof value.active === 'boolean' &&
        typeof value.visible === 'boolean' && Number.isSafeInteger(value.revision) && value.revision >= 0;

    function saveIntent() {
        try {
            if (intent) window.localStorage.setItem(pendingKey, JSON.stringify({...intent, revision: intentRevision}));
            else window.localStorage.removeItem(pendingKey);
        } catch (_) { console.warn('Não foi possível guardar a preferência pendente neste dispositivo.'); }
    }
    try {
        const saved = JSON.parse(window.localStorage.getItem(pendingKey) || 'null');
        if (saved && typeof saved.active === 'boolean' && typeof saved.visible === 'boolean' &&
            (saved.revision === null || Number.isSafeInteger(saved.revision) && saved.revision >= 0)) {
            intent = {active: saved.active, visible: saved.active && saved.visible};
            intentRevision = saved.revision;
        }
    } catch (_) {}

    async function request(body) {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
        if (!csrf) throw new Error('Sessão indisponível.');
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch('/location-state/', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf,
                    'X-Requested-With': 'XMLHttpRequest'},
                body: JSON.stringify({...body, member_id: String(window.membroId || '')}), signal: controller.signal
            });
            const result = await response.json();
            if (result.member_id !== String(window.membroId || '') ||
                (!response.ok && response.status !== 409) ||
                (response.status === 409 ? result.reason !== 'state_conflict' : result.success !== true) ||
                !valid(result.state)) {
                throw new Error('Não foi possível confirmar a preferência de localização.');
            }
            return {state: result.state, conflict: response.status === 409};
        } finally { window.clearTimeout(timer); }
    }

    function synchronize(forceRead) {
        if (forceRead) refresh = true;
        if (pending) return pending;
        pending = (async () => {
            if (!state || refresh) {
                refresh = false;
                const local = desired();
                state = (await request({action: 'read'})).state;
                // Um reconnect não transforma uma escolha antiga numa escolha nova.
                if (intent && intentRevision !== null && intentRevision !== state.revision) intent = null;
                if (!intent && state.revision === 0) intent = local;
                if (intent && intentRevision === null) intentRevision = state.revision;
                saveIntent();
            }
            for (let attempt = 0; intent && attempt < 5; attempt++) {
                const version = generation;
                const choice = {...intent};
                if (state.active === choice.active && state.visible === choice.visible && state.revision > 0) {
                    if (version === generation) intent = null;
                    saveIntent();
                    continue;
                }
                const result = await request({action: 'set', expected_revision: state.revision, ...choice});
                state = result.state;
                // Uma decisão concorrente já confirmada ganha a uma tentativa antiga.
                // Só uma escolha local mais recente, feita durante este pedido, volta a tentar.
                if (result.conflict || version === generation) intent = null;
                else intentRevision = state.revision; // A escolha seguinte sucede ao nosso próprio ACK.
                saveIntent();
            }
            if (intent) throw new Error('A preferência será sincronizada ao recuperar a ligação.');
            window.MargotPreferencias?.sincronizarLocalizacao(state.active, state.visible);
            lastChoice = desired();
            return {...state};
        })().catch(error => {
            refresh = true;
            console.warn(error.message);
            return null;
        }).finally(() => { pending = null; });
        return pending;
    }

    window.MargotLocationState = {
        sync: synchronize,
        current: () => state && {...state},
        ready: null
    };
    window.MargotLocationPrivacy = {
        allowsCollection: () => Boolean(state?.active && !intent &&
            (desired().visible || state.visible === false))
    };
    window.addEventListener('margot:preferencias-alteradas', () => {
        const choice = desired();
        if (lastChoice && choice.active === lastChoice.active && choice.visible === lastChoice.visible) return;
        lastChoice = choice;
        intent = choice;
        intentRevision = state?.revision ?? null;
        generation++;
        saveIntent();
        // Desligar ou ocultar offline não fica à espera de um pedido HTTP.
        if (!choice.active || !choice.visible) {
            window.MargotBackgroundLocation?.stop().catch(() => {});
        }
        synchronize().then(result => {
            if (result) window.MargotBackgroundLocation?.start();
        });
    });
    const resume = () => {
        if (document.visibilityState !== 'visible') return;
        synchronize(true).then(result => {
            if (result) window.MargotBackgroundLocation?.start();
        });
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    lastChoice = desired();
    window.MargotLocationState.ready = synchronize();
})();