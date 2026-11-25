(() => {
    'use strict';

    if (document.currentScript?.dataset.entradaPublica === '1' &&
        window.Capacitor?.isNativePlatform?.()) return;

    const url = window.location.href;
    let sent = false;

    function countVisit() {
        if (sent || document.visibilityState !== 'visible' || document.prerendering) {
            return;
        }

        sent = true;
        fetch(url, {
            method: 'POST',
            headers: { 'X-Margot-Campaign-Visit': '1' },
            mode: 'same-origin',
            credentials: 'omit',
            keepalive: true
        }).catch(() => {});
    }

    document.addEventListener('visibilitychange', countVisit);
    document.addEventListener('prerenderingchange', countVisit);
    window.addEventListener('pageshow', countVisit);
    countVisit();
})();
