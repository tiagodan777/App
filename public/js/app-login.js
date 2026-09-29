(() => {
    'use strict';

    /*
     * No Safari ou numa aplicação de email, o link mantém
     * o Universal Link que abre a Margot instalada.
     *
     * Se a página já estiver dentro da Margot, o botão
     * abre diretamente o login dentro da própria app.
     */
    if (!window.Capacitor?.isNativePlatform?.()) {
        return;
    }

    document.querySelectorAll('[data-app-login]').forEach(link => {
        link.href = link.dataset.nativeLogin || '/login';
        link.removeAttribute('data-margot-sem-animacao');
    });
})();