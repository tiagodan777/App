(() => {
    'use strict';

    if (window.MargotPrivacyNotice) return;
    if (!window.Capacitor?.isNativePlatform?.()) return;

    const script = document.currentScript;

    const policyUrl = new URL(
        '../privacy#localizacao',
        script.src
    ).href;

    const revision = '20261021-invisible-location';
    const shown = new Set();

    const text = (pt, en) =>
        window.MargotI18n?.language === 'en' ? en : pt;

    const member = () => String(window.membroId || '');

    const key = id =>
        'margot-privacy-notice:' + revision + ':' + id;

    let host;
    let owner = '';
    let eligibleSince = null;
    let visibleSince = null;
    let readyPromise;
    let locationReady = false;

    function wasShown(id) {
        if (shown.has(id)) return true;

        try {
            return localStorage.getItem(key(id)) === '1';
        } catch (_) {
            return false;
        }
    }

    function remember(id) {
        shown.add(id);

        try {
            localStorage.setItem(key(id), '1');
        } catch (_) {}
    }

    function remove() {
        host?.remove();
        host = null;
        owner = '';
        visibleSince = null;
        eligibleSince = null;
    }

    function followLocationReady() {
        const current = window.MargotLocationReady;

        if (current === readyPromise) return;

        readyPromise = current;
        locationReady = false;

        if (!current || typeof current.then !== 'function') {
            return;
        }

        Promise.resolve(current).then(() => {
            if (readyPromise === current) {
                locationReady = true;
            }
        }).catch(() => {});
    }

    function canShow() {
        const canvas = document.getElementById('gridCanvas');

        if (
            document.hidden ||
            !canvas ||
            !canvas.getClientRects().length ||
            document.body?.getAttribute('aria-busy') === 'true' ||
            document.documentElement.classList.contains(
                'margot-version-locked'
            ) ||
            (
                window.MargotNativeVersion &&
                window.MargotNativeVersion.getState() !== 'allowed'
            ) ||
            !locationReady ||
            window.MargotWelcome?.busy ||
            window.MargotPermissionUI?.busy ||
            document.querySelector('dialog[open]') ||
            document.getElementById('heys-area')
                ?.getAttribute('aria-hidden') === 'false' ||
            document.querySelector(
                '.mini-menu[aria-hidden="false"]'
            ) ||
            document.body?.matches(
                '.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto'
            ) ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(
                document.activeElement?.tagName
            )
        ) {
            return false;
        }

        return true;
    }

    function show(id) {
        owner = id;
        host = document.createElement('aside');

        host.setAttribute(
            'aria-label',
            text('Atualização de privacidade', 'Privacy update')
        );

        host.style.cssText =
            'position:fixed;' +
            'left:16px;' +
            'right:16px;' +
            'bottom:110px;' +
            'max-width:420px;' +
            'margin:0 auto;' +
            'z-index:10000;';

        const root = host.attachShadow({ mode: 'open' });

        root.innerHTML = `
            <style>
                :host {
                    color-scheme: light dark;
                }

                * {
                    box-sizing: border-box;
                }

                [hidden] {
                    display: none !important;
                }

                .card {
                    padding: 18px 20px 15px;
                    border: 1px solid rgba(52, 28, 36, .06);
                    border-radius: 26px;
                    background: #fffdfa;
                    color: #252126;
                    box-shadow: 0 12px 40px rgba(51, 27, 36, .11);
                    font: 14px/1.45 -apple-system, BlinkMacSystemFont,
                        'Helvetica Neue', Arial, sans-serif;
                    max-height: 42dvh;
                    overflow: auto;
                }

                .eyebrow {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    margin: 0 0 7px;
                    color: #7d7075;
                    font-size: 11px;
                    font-weight: 500;
                }

                .eyebrow::before {
                    content: '';
                    width: 6px;
                    height: 6px;
                    flex: 0 0 6px;
                    border-radius: 50%;
                    background: #e12346;
                }

                h2 {
                    margin: 0 0 7px;
                    font-size: 19px;
                    font-weight: 650;
                    letter-spacing: -.45px;
                    line-height: 1.2;
                }

                p {
                    margin: 0;
                }

                .message {
                    color: #625960;
                }

                .more {
                    margin-top: 12px;
                    padding: 12px 14px;
                    border-radius: 16px;
                    background: #f5f1ef;
                    color: #625960;
                    font-size: 13px;
                }

                a {
                    display: inline-block;
                    margin-top: 8px;
                    color: #b51c3a;
                    text-underline-offset: 3px;
                }

                .actions {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-top: 13px;
                }

                button {
                    min-height: 38px;
                    border: 0;
                    cursor: pointer;
                    font: inherit;
                    font-size: 13px;
                    font-weight: 600;
                    -webkit-tap-highlight-color: transparent;
                }

                .expand {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 0;
                    background: transparent;
                    color: #796c72;
                }

                .expand svg {
                    width: 13px;
                    height: 13px;
                    transition: transform .2s ease;
                }

                .expand[aria-expanded="true"] svg {
                    transform: rotate(180deg);
                }

                .done {
                    padding: 9px 21px;
                    border-radius: 999px;
                    background: #e12346;
                    color: #fff;
                    white-space: nowrap;
                }

                .done:active {
                    background: #c91d3e;
                }

                button:focus-visible,
                a:focus-visible {
                    outline: 2px solid #e12346;
                    outline-offset: 3px;
                }

                @media (prefers-color-scheme: dark) {
                    .card {
                        background: #252126;
                        color: #faf5f6;
                        border-color: #ffffff0d;
                        box-shadow: 0 12px 40px #0005;
                    }

                    .eyebrow,
                    .expand {
                        color: #c1b3ba;
                    }

                    .message,
                    .more {
                        color: #dfd4d9;
                    }

                    .more {
                        background: #312b30;
                    }

                    a {
                        color: #ff9caf;
                    }
                }

                @media (max-height: 560px) {
                    .card {
                        max-height: 35dvh;
                        padding: 14px 17px;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .expand svg {
                        transition: none;
                    }
                }
            </style>

            <section class="card">
                <p class="eyebrow"></p>
                <h2></h2>
                <p class="message"></p>

                <div class="more" id="privacy-explanation" hidden>
                    <p></p>
                    <a></a>
                </div>

                <div class="actions">
                    <button
                        class="expand"
                        type="button"
                        aria-expanded="false"
                        aria-controls="privacy-explanation"
                    >
                        <span></span>

                        <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="m4 6 4 4 4-4"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </button>

                    <button class="done" type="button"></button>
                </div>
            </section>
        `;

        root.querySelector('.eyebrow').textContent = text(
            'Política de Privacidade atualizada',
            'Privacy Policy updated'
        );

        root.querySelector('h2').textContent = text(
            'Sobre o modo invisível',
            'About invisible mode'
        );

        root.querySelector('.message').textContent = text(
            'Em modo invisível, o teu perfil fica escondido e ninguém te vê entre as pessoas por perto. Se autorizaste a localização, a Margot continua a recebê-la para te avisar de pessoas próximas.',
            'In invisible mode, your profile is hidden and you do not appear among people nearby. If you allowed location access, Margot continues to receive it to let you know about people near you.'
        );

        root.querySelector('.more p').textContent = text(
            'Estar invisível muda quem te vê. Podes desligar a localização nas preferências da Margot ou retirar a permissão nas definições do dispositivo. As tuas coordenadas exatas não são mostradas aos outros membros.',
            'Being invisible changes who can see you. You can turn location off in Margot preferences or revoke permission in your device settings. Your exact coordinates are not shown to other members.'
        );

        const link = root.querySelector('a');

        link.href = policyUrl;

        link.textContent = text(
            'Ler a política de privacidade',
            'Read the privacy policy'
        );

        link.addEventListener('click', () => remember(id));

        const expand = root.querySelector('.expand');
        const more = root.querySelector('.more');
        const label = expand.querySelector('span');

        label.textContent = text('Saber mais', 'Learn more');

        expand.addEventListener('click', () => {
            const open =
                expand.getAttribute('aria-expanded') !== 'true';

            expand.setAttribute('aria-expanded', String(open));
            more.hidden = !open;

            label.textContent = open
                ? text('Mostrar menos', 'Show less')
                : text('Saber mais', 'Learn more');
        });

        const done = root.querySelector('.done');

        done.textContent = text('Percebi', 'Got it');

        done.addEventListener('click', () => {
            remember(id);
            remove();
        });

        document.body.append(host);

        position();

        visibleSince = Date.now();
    }

    function position() {
        if (!host) return;

        const menu = document.getElementById('menuPrincipal');
        const rect = menu?.getBoundingClientRect();

        const bottom = rect && rect.height > 0
            ? Math.max(16, window.innerHeight - rect.top + 12)
            : 110;

        host.style.bottom = bottom + 'px';
    }

    function tick() {
        followLocationReady();

        const id = member();

        if (
            !id ||
            (owner && owner !== id) ||
            !canShow()
        ) {
            remove();
            return;
        }

        if (host) {
            position();

            if (Date.now() - visibleSince >= 1000) {
                remember(id);
            }

            return;
        }

        if (wasShown(id)) {
            eligibleSince = null;
            return;
        }

        if (eligibleSince === null) {
            eligibleSince = Date.now();
        }

        if (Date.now() - eligibleSince >= 2000) {
            show(id);
        }
    }

    document.addEventListener(
        'margot:page-leave',
        remove
    );

    document.addEventListener('margot:page-ready', () => {
        eligibleSince = null;
        tick();
    });

    document.addEventListener(
        'visibilitychange',
        tick
    );

    window.addEventListener(
        'resize',
        position
    );

    window.setInterval(tick, 500);

    window.MargotPrivacyNotice = {
        refresh: tick
    };

    tick();
})();