(function () {
    'use strict';

    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform?.() || window.MargotNativeVersion) return;
    const platform = cap.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return;

    const endpoint = new URL('../native-version-policy.json', document.currentScript.src);
    const storeUrl = platform === 'ios'
        ? 'https://apps.apple.com/app/id6803648498'
        : 'https://play.google.com/store/apps/details?id=com.margot.app';
    const root = document.documentElement;
    let mode = 'checking';
    let pending = null;
    let lastCheck = -Infinity;
    let active = !document.hidden;
    let resumeTimer;
    let repeatAfterCheck = false;
    let painted = false;
    let bodyState = null;
    let app = null;

    const coverStyle = document.createElement('style');
    coverStyle.textContent = 'html.margot-version-locked body{visibility:hidden!important;pointer-events:none!important}';
    document.head.appendChild(coverStyle);

    const host = document.createElement('div');
    host.id = 'margot-native-version';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <style>
            :host {
                all: initial;
                position: fixed; inset: 0; z-index: 2147483647;
                display: grid; place-items: center;
                box-sizing: border-box; overflow: auto;
                padding: max(32px, env(safe-area-inset-top))
                         max(24px, env(safe-area-inset-right))
                         max(32px, env(safe-area-inset-bottom))
                         max(24px, env(safe-area-inset-left));
                background: #fff; color: #19191e; color-scheme: light;
                font: 17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            :host([hidden]) { display: none !important; }
            section { width: 100%; max-width: 420px; text-align: center; }
            h1 { margin: 0 0 16px; font-size: 30px; line-height: 1.15; letter-spacing: -0.8px; }
            .brand { margin: 0 0 28px; color: #f3153c; font-weight: 700; }
            .symbol {
                display: grid; place-items: center; width: 72px; height: 72px;
                margin: 0 auto 24px; border-radius: 24px; background: #fff0f3;
                color: #f3153c;
            }
            p { margin: 0 0 28px; color: #66636b; }
            a, button {
                display: block; box-sizing: border-box; width: 100%;
                min-height: 52px; padding: 14px 20px; border-radius: 16px;
                font: inherit; font-weight: 600; cursor: pointer;
                text-align: center; text-decoration: none;
            }
            a { background: #f3153c; color: white; border: 1px solid #f3153c; }
            a:active { background: #d91235; }
            button { margin-top: 12px; background: white; color: #66636b; border: 1px solid #e8e5eb; }
            [hidden] { display: none !important; }
            :focus-visible { outline: 3px solid #f3153c; outline-offset: 4px; }
        </style>
        <section role="dialog" aria-modal="true" aria-labelledby="title" aria-describedby="message">
            <p class="brand">Margot</p>
            <div class="symbol" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>
                </svg>
            </div>
            <h1 id="title" tabindex="-1"></h1>
            <p id="message" aria-live="polite"></p>
            <a id="update" rel="noopener noreferrer">Atualizar</a>
            <button id="retry" type="button">Verificar novamente</button>
        </section>`;
    root.appendChild(host);
    const title = shadow.getElementById('title');
    const message = shadow.getElementById('message');
    const update = shadow.getElementById('update');
    const retry = shadow.getElementById('retry');
    update.href = storeUrl;

    function syncBody() {
        if (!document.body) return;
        if (mode !== 'allowed' && !bodyState) {
            bodyState = {
                element: document.body,
                inert: document.body.inert,
                aria: document.body.getAttribute('aria-hidden'),
                focus: document.activeElement
            };
            document.body.inert = true;
            document.body.setAttribute('aria-hidden', 'true');
        } else if (mode === 'allowed' && bodyState) {
            const previous = bodyState;
            bodyState = null;
            previous.element.inert = previous.inert;
            if (previous.aria === null) previous.element.removeAttribute('aria-hidden');
            else previous.element.setAttribute('aria-hidden', previous.aria);
            if (previous.focus?.isConnected && previous.focus !== host) {
                previous.focus.focus?.({ preventScroll: true });
            }
        }
    }

    function render(next) {
        if (painted && next === mode) return;
        painted = true;
        mode = next;
        root.classList.toggle('margot-version-locked', next !== 'allowed');
        host.hidden = next === 'allowed';
        syncBody();
        if (next === 'allowed') return;
        const checking = next === 'checking';
        title.textContent = checking
            ? 'A verificar a versão…'
            : next === 'update'
                ? 'Há uma atualização nova disponível'
                : 'Não foi possível verificar a versão';
        message.textContent = checking
            ? 'Só um momento.'
            : next === 'update'
                ? 'Para continuares a usar a Margot, atualiza a app na loja.'
                : 'Verifica a ligação à Internet e tenta novamente.';
        update.hidden = checking;
        retry.hidden = checking;
        retry.textContent = next === 'error' ? 'Tentar novamente' : 'Verificar novamente';
        title.focus({ preventScroll: true });
    }

    function parts(value) {
        if (typeof value !== 'string' || !/^\d{1,9}(\.\d{1,9}){0,2}$/.test(value)) {
            throw new Error('invalid_version');
        }
        return value.split('.').map(Number);
    }

    function compare(left, right) {
        const a = parts(left);
        const b = parts(right);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const difference = (a[i] || 0) - (b[i] || 0);
            if (difference) return Math.sign(difference);
        }
        return 0;
    }

    function buildNumber(value) {
        if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) {
            throw new Error('invalid_build');
        }
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 1) throw new Error('invalid_build');
        return number;
    }

    function getApp() {
        if (!app) app = cap.Plugins?.App || cap.registerPlugin('App');
        return app;
    }

    async function timeout(promise, milliseconds) {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('timeout')), milliseconds);
                })
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    async function policy() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const url = new URL(endpoint.href);
            url.searchParams.set('_', String(Date.now()));
            const response = await fetch(url.href, {
                cache: 'no-store', credentials: 'omit', signal: controller.signal
            });
            if (!response.ok) throw new Error('policy_unavailable');
            const text = await response.text();
            if (text.length > 4096) throw new Error('invalid_policy');
            const data = JSON.parse(text);
            const rule = data?.[platform];
            if (data?.schema !== 1 || typeof rule?.enabled !== 'boolean') {
                throw new Error('invalid_policy');
            }
            if (rule.enabled) {
                if (platform === 'ios') {
                    parts(rule.minimumVersion);
                    parts(rule.minimumBuild);
                } else {
                    buildNumber(rule.minimumBuild);
                }
            }
            return rule;
        } finally {
            clearTimeout(timer);
        }
    }

    function check(force = false) {
        if (pending) {
            if (force) repeatAfterCheck = true;
            return pending;
        }
        if (!force && Date.now() - lastCheck < 3000) return Promise.resolve();
        lastCheck = Date.now();
        const previous = mode;
        if (!painted || previous === 'error') render('checking');
        pending = (async () => {
            try {
                const rule = await policy();
                if (!rule.enabled) {
                    render('allowed');
                    return;
                }
                const info = await timeout(getApp().getInfo(), 4000);
                if (info?.id !== 'com.margot.app') throw new Error('unknown_app');
                let outdated;
                if (platform === 'android') {
                    outdated = buildNumber(info.build) < buildNumber(rule.minimumBuild);
                } else {
                    const version = compare(info.version, rule.minimumVersion);
                    outdated = version < 0
                        || (version === 0 && compare(info.build, rule.minimumBuild) < 0);
                }
                render(outdated ? 'update' : 'allowed');
            } catch (_) {
                render(previous === 'update' ? 'update' : previous === 'allowed' ? 'allowed' : 'error');
            } finally {
                pending = null;
                if (repeatAfterCheck) {
                    repeatAfterCheck = false;
                    scheduleResumeCheck();
                }
            }
        })();
        return pending;
    }

    function foreground() {
        return active && !document.hidden;
    }

    function scheduleResumeCheck() {
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            if (foreground()) check(true);
        }, 150);
    }

    function resume() {
        active = true;
        scheduleResumeCheck();
    }

    window.MargotNativeVersion = { check: () => check(true), getState: () => mode };
    retry.addEventListener('click', () => check(true));
    host.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('DOMContentLoaded', syncBody, { once: true });
    document.addEventListener('focusin', event => {
        if (mode !== 'allowed' && !event.composedPath().includes(host)) {
            title.focus({ preventScroll: true });
        }
    }, true);

    document.addEventListener('margot:permissions-resume', resume);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resume();
    });
    document.addEventListener('margot:page-ready', () => {
        if (foreground()) check();
    });
    window.addEventListener('focus', scheduleResumeCheck);
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', scheduleResumeCheck);

    try {
        const nativeApp = getApp();
        Promise.resolve(nativeApp.addListener('appStateChange', state => {
            active = state.isActive === true;
            if (active) scheduleResumeCheck();
        })).catch(() => {});
        Promise.resolve(nativeApp.addListener('resume', resume)).catch(() => {});
    } catch (_) {}

    setInterval(() => {
        if (foreground()) check();
    }, 60000);
    check(true);
})();