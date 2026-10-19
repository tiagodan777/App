(function () {
    'use strict';
    if (window.__margotLocationPrivacyLoaded) return;
    window.__margotLocationPrivacyLoaded = true;
    var pending = false;
    var repeat = false;
    var hiddenConfirmed = false;

    window.MargotLocationPrivacy = {
        allowsCollection: function () {
            return window.MargotPreferencias?.obter('invisivel') !== true || hiddenConfirmed;
        }
    };

    // Reforça o hide por HTTP se o WebSocket estiver indisponível.
    // Não existe polling, nem qualquer pedido de coordenadas neste módulo.
    async function synchronize() {
        if (window.MargotPreferencias?.obter('invisivel') !== true) {
            hiddenConfirmed = false;
            return;
        }
        if (document.visibilityState !== 'visible') return;
        if (pending) { repeat = true; return; }
        var csrf = document.querySelector('meta[name="csrf-token"]')?.content;
        if (!csrf) return;
        pending = true;
        var controller = new AbortController();
        var timer = window.setTimeout(function () { controller.abort(); }, 8000);
        try {
            var response = await fetch('/location-hide/', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: {'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest'},
                signal: controller.signal
            });
            if (!response.ok) throw new Error('Estado de privacidade não sincronizado.');
            var result = await response.json();
            if (result.success !== true) throw new Error('Ocultação não confirmada.');
            hiddenConfirmed = window.MargotPreferencias?.obter('invisivel') === true;
            // Espera também por um arranque anterior que ainda estivesse a ocultar.
            await window.MargotBackgroundLocation?.start();
            await window.MargotBackgroundLocation?.start();
        } catch (error) {
            console.warn('A privacidade será sincronizada ao recuperar a ligação.');
        } finally {
            window.clearTimeout(timer);
            pending = false;
            if (repeat) { repeat = false; synchronize(); }
        }
    }

    window.addEventListener('margot:preferencias-alteradas', synchronize);
    window.addEventListener('online', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', synchronize, {once: true});
    } else {
        synchronize();
    }
})();