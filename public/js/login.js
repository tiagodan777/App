(function () {
    'use strict';

    function iniciar() {
        var verPassword = document.getElementById('ver-password');
        var palavraPasse = document.getElementById('palavra-passe');

        if (!verPassword || !palavraPasse) {
            return;
        }

        verPassword.addEventListener(
            'change',
            function () {
                palavraPasse.type = verPassword.checked
                    ? 'text'
                    : 'password';
            }
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            iniciar,
            {
                once: true
            }
        );
    } else {
        iniciar();
    }
})();