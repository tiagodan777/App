(function () {
    'use strict';

    var form = document.querySelector('[data-login-form]');
    if (!form) return;

    var button = form.querySelector('[type="submit"]');
    var originalLabel = button ? button.value : 'Entrar';
    var submitting = false;
    var resetTimer;
    var errorPlayed = false;

    var checkbox = document.getElementById('ver-password');
    var password = document.getElementById('palavra-passe');

    if (checkbox && password) {
        checkbox.addEventListener('change', function () {
            password.type = checkbox.checked ? 'text' : 'password';
        });
    }

    function reset() {
        clearTimeout(resetTimer);
        submitting = false;
        form.removeAttribute('aria-busy');

        if (button) {
            button.disabled = false;
            button.value = originalLabel;
        }
    }

    form.addEventListener('submit', function (event) {
        if (event.defaultPrevented) return;

        if (submitting) {
            event.preventDefault();
            return;
        }

        submitting = true;
        form.setAttribute('aria-busy', 'true');

        if (button) {
            button.value = 'A entrar…';
            button.disabled = true;
        }

        // O POST segue imediatamente, sem esperar pela animação.
        // Recuperar o botão se a navegação não terminar.
        resetTimer = setTimeout(reset, 12000);
    });

    function vibrate() {
        try {
            var capacitor = window.Capacitor;

            if (capacitor?.isNativePlatform?.()) {
                var plugin = capacitor.Plugins?.MargotHaptics
                    || capacitor.registerPlugin?.('MargotHaptics');

                Promise.resolve(
                    plugin?.play({ type: 'heySent' })
                ).catch(function () {});
            } else if (typeof navigator.vibrate === 'function') {
                navigator.vibrate(60);
            }
        } catch (_) {}
    }

    function showError() {
        if (errorPlayed || submitting) return;

        if (
            !document.querySelector('[data-login-error-feedback]')
        ) {
            return;
        }

        if (document.visibilityState === 'hidden') return;

        errorPlayed = true;
        document.body.classList.add('margot-login-error-shake');
        vibrate();
    }

    function scheduleError() {
        requestAnimationFrame(function () {
            requestAnimationFrame(showError);
        });
    }

    window.addEventListener('pageshow', function (event) {
        reset();

        if (!event.persisted) {
            scheduleError();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            scheduleError();
        }
    });

    document.addEventListener('animationend', function (event) {
        if (event.animationName === 'margot-login-shake') {
            document.body.classList.remove(
                'margot-login-error-shake'
            );
        }
    });

    if (document.readyState === 'complete') {
        scheduleError();
    }
})();