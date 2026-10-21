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
            text(
                'Atualização de privacidade',
                'Privacy update'
            )
        );

        host.style.cssText =
            'position:fixed;' +
            'left:12px;' +
            'right:12px;' +
            'bottom:110px;' +
            'max-width:400px;' +
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

                .card {
                    position: relative;
                    padding: 15px 42px 14px 16px;
                    border: 1px solid #e4dddf;
                    border-left: 3px solid #e12346;
                    border-radius: 18px;
                    background: #fffdfa;
                    color: #242126;
                    box-shadow: 0 5px 24px #2516201c;
                    font: 14px/1.4 Helvetica, Arial, sans-serif;
                    max-height: 38dvh;
                    overflow: auto;
                }

                strong {
                    display: block;
                    font-size: 14px;
                    margin-bottom: 5px;
                }

                p {
                    margin: 0;
                }

                details {
                    margin-top: 9px;
                }

                summary {
                    cursor: pointer;
                    color: #a71935;
                    font-weight: 600;
                    min-height: 26px;
                }

                .more {
                    margin-top: 8px;
                }

                a {
                    display: inline-block;
                    color: #a71935;
                    margin-top: 8px;
                    text-underline-offset: 3px;
                }

                button {
                    position: absolute;
                    right: 5px;
                    top: 5px;
                    width: 34px;
                    height: 34px;
                    border: 0;
                    border-radius: 50%;
                    background: transparent;
                    color: inherit;
                    font: 24px/1 Helvetica, Arial, sans-serif;
                    cursor: pointer;
                }

                button:focus-visible,
                summary:focus-visible,
                a:focus-visible {
                    outline: 2px solid #e12346;
                    outline-offset: 3px;
                }

                @media (prefers-color-scheme: dark) {
                    .card {
                        background: #211e22;
                        color: #f8f4f4;
                        border-color: #4e4348;
                        border-left-color: #f35a77;
                    }

                    summary,
                    a {
                        color: #ff94aa;
                    }
                }

                @media (max-height: 560px) {
                    .card {
                        max-height: 32dvh;
                    }
                }
            </style>

            <section class="card">
                <strong></strong>
                <p class="message"></p>

                <details>
                    <summary></summary>
                    <p class="more"></p>
                    <a></a>
                </details>

                <button type="button">×</button>
            </section>
        `;

        root.querySelector('strong').textContent = text(
            'Uma nota sobre o modo invisível',
            'A note about invisible mode'
        );

        root.querySelector('.message').textContent = text(
            'Atualizámos a Política de Privacidade: o modo invisível oculta o teu perfil. A localização continua ativa, se a autorizaste.',
            'We updated our Privacy Policy: invisible mode hides your profile. Location remains active if you allowed it.'
        );

        root.querySelector('summary').textContent = text(
            'Porquê e como desligar?',
            'Why, and how can I turn it off?'
        );

        root.querySelector('.more').textContent = text(
            'A Margot recebe a localização para te avisar de pessoas visíveis por perto, mesmo estando invisível. Podes desligá-la nas preferências da Margot ou retirar a permissão nas definições do dispositivo. As tuas coordenadas exatas não são mostradas aos outros membros.',
            'Margot receives your location to notify you about visible people nearby, even while you are invisible. You can turn it off in Margot preferences or revoke permission in your device settings. Your exact coordinates are not shown to other members.'
        );

        const link = root.querySelector('a');

        link.href = policyUrl;

        link.textContent = text(
            'Ler a Política de Privacidade',
            'Read the Privacy Policy'
        );

        link.addEventListener('click', () => remember(id));

        const close = root.querySelector('button');

        close.setAttribute(
            'aria-label',
            text('Fechar aviso', 'Dismiss notice')
        );

        close.addEventListener('click', () => {
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