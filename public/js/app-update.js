(() => {
    'use strict';

    if (window.MargotWebUpdate) return;
    const script = document.currentScript;
    const current = script?.dataset.release;
    const valid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
    if (!valid(current) || !script?.src) return;

    const endpoint = new URL('../app-version.json', script.src);
    if (endpoint.origin !== location.origin) return;

    const storageKey = 'margot-web-update-v1';
    const submitted = new Set();
    let available = '';
    let checking = false;
    let reloading = false;
    let navigating = false;
    let active = !window.Capacitor?.isNativePlatform?.();
    let lastCheck = -Infinity;
    let lastActivity = Date.now();
    let verifiedAt = 0;
    let status = 'waiting';
    let nativeEvents = 0;

    const foreground = () => active && !document.hidden && navigator.onLine !== false;
    const touch = () => { lastActivity = Date.now(); };

    function hasDrafts() {
        for (const drafts of [window.MargotChatDrafts, window.MargotMiniDrafts]) {
            if (!drafts) continue;
            if (typeof drafts.values !== 'function') return true;
            for (const draft of drafts.values()) {
                if (draft && (draft.text || draft.file || draft.files?.length || draft.reply)) return true;
            }
        }
        return Array.from(document.querySelectorAll('textarea, input, [contenteditable]')).some(el => {
            if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return !!el.textContent;
            if (el.type === 'file') return !!el.files?.length;
            if (el.tagName === 'TEXTAREA') return !!el.value;
            return ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(el.type) && !!el.value;
        });
    }

    function visible(el) {
        for (let node = el; node instanceof Element; node = node.parentElement) {
            if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
            const css = getComputedStyle(node);
            if (css.display === 'none' || css.visibility === 'hidden') return false;
        }
        return true;
    }

    function safeToReload() {
        if (!foreground() || navigating || Date.now() - lastActivity < 5000) return false;
        const canvas = document.getElementById('gridCanvas');
        if (!canvas || !visible(canvas)) return false;
        if (document.activeElement?.matches('input, textarea, select, [contenteditable]')) return false;
        if (document.querySelector('[aria-busy="true"], .mini-compose-recording, .mini-compose-preparing')) return false;
        if (document.querySelector('dialog[open]')) return false;
        if (Array.from(document.querySelectorAll('[role="dialog"], .mini-menu')).some(visible)) return false;
        for (const form of submitted) {
            // Keep detached forms too: an upload may outlive SPA navigation.
            if (form.matches('[aria-busy="true"]') || form.querySelector('[aria-busy="true"]')) return false;
            submitted.delete(form);
        }
        if (Array.from(document.querySelectorAll('audio, video')).some(el => !el.paused && !el.ended)) return false;
        return !hasDrafts();
    }

    function applyWhenSafe() {
        if (!available || reloading || checking || Date.now() - verifiedAt > 90000) return;
        if (!safeToReload()) { status = 'deferred'; return; }
        try {
            const previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
            if (previous && (previous.version === available || Date.now() - previous.at < 600000)) {
                status = 'reload-limited';
                return;
            }
            // If storage is unavailable, do not risk a reload loop.
            sessionStorage.setItem(storageKey, JSON.stringify({version: available, at: Date.now()}));
        } catch (_) { status = 'storage-unavailable'; return; }

        const target = new URL(location.href);
        target.searchParams.set('_margot_release', available);
        target.searchParams.set('_margot_reload', String(Date.now()));
        reloading = true;
        status = 'reloading';
        location.replace(target.href);
    }

    async function check() {
        if (!foreground() || checking || reloading || Date.now() - lastCheck < 15000) return;
        checking = true;
        lastCheck = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const url = new URL(endpoint);
            url.searchParams.set('_', String(Date.now()));
            const response = await fetch(url.href, {
                cache: 'no-store', credentials: 'omit', redirect: 'error',
                headers: {Accept: 'application/json'}, signal: controller.signal
            });
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Invalid manifest');
            const text = await response.text();
            if (text.length > 2048) throw Error('Manifest too large');
            const manifest = JSON.parse(text);
            if (!valid(manifest.version) || typeof manifest.enabled !== 'boolean') throw Error('Invalid version');
            available = manifest.enabled && manifest.version !== current ? manifest.version : '';
            verifiedAt = Date.now();
            status = manifest.enabled ? (available ? 'available' : 'current') : 'disabled';
        } catch (_) {
            available = '';
            status = 'check-failed';
        } finally {
            clearTimeout(timeout);
            checking = false;
        }
        applyWhenSafe();
    }

    function resume() {
        touch();
        available = '';
        // Coalesce native and DOM resume events; check again on the regular tick.
        check();
    }

    window.MargotWebUpdate = {
        check,
        getState: () => ({current, available, status})
    };

    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'scroll', 'keydown', 'input', 'change']) {
        document.addEventListener(event, touch, {capture: true, passive: true});
    }
    document.addEventListener('submit', event => {
        touch();
        if (event.target instanceof HTMLFormElement) submitted.add(event.target);
    }, true);
    document.addEventListener('margot:page-leave', () => { navigating = true; touch(); });
    document.addEventListener('margot:page-ready', () => { navigating = false; touch(); check(); });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resume();
    });
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', resume);

    if (window.Capacitor?.isNativePlatform?.()) {
        try {
            const app = window.Capacitor.Plugins?.App || window.Capacitor.registerPlugin?.('App');
            Promise.resolve(app?.addListener('appStateChange', state => {
                nativeEvents++;
                active = state.isActive === true;
                if (active) resume();
            })).catch(() => {});
            const sequence = nativeEvents;
            Promise.resolve(app?.getState()).then(state => {
                if (sequence !== nativeEvents) return;
                active = state?.isActive === true;
                if (active) resume();
            }).catch(() => {});
        } catch (_) {}
    } else {
        resume();
    }

    setInterval(check, 60000);
    setInterval(() => { if (foreground()) applyWhenSafe(); }, 2000);
})();