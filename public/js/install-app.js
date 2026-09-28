(() => {
    'use strict';

    const native = Boolean(window.Capacitor?.isNativePlatform?.());
    const ua = navigator.userAgent || '';
    const android = /Android/i.test(ua)
        || navigator.userAgentData?.platform === 'Android';
    const ios = /iPhone|iPad|iPod/i.test(ua)
        || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

    document.querySelectorAll('[data-app-install]').forEach((section) => {
        section.hidden = native;
        if (native) return;

        section.querySelector('[data-install-ios]').hidden = android;
        section.querySelector('[data-install-android]').hidden = ios;
        section.querySelector('[data-open-installed]').hidden = android;

        const help = section.querySelector('.margot-install-help');
        help.hidden = android;
    });

    document.querySelectorAll('[data-android-notice]').forEach((notice) => {
        notice.hidden = native || !android;
    });

    document.querySelectorAll('[data-open-existing-app]').forEach((link) => {
        link.hidden = native || android;
    });

    document.querySelectorAll('[data-invite-steps]').forEach((text) => {
        if (native) {
            text.textContent = 'Cria a tua conta e confirma o email. O convite fica associado automaticamente durante o registo.';
        } else if (android) {
            text.textContent = 'Cria a tua conta aqui e confirma o email. O convite fica associado durante o registo; quando a app chegar ao Android, usa a mesma conta.';
        }
    });
})();
