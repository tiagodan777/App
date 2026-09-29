(function () {
    'use strict';

    function vibrarErro() {
        try {
            var capacitor = window.Capacitor;

            if (capacitor?.isNativePlatform?.()) {
                var haptics = capacitor.Plugins?.MargotHaptics
                    || capacitor.registerPlugin?.('MargotHaptics');

                // Impacto mais forte já disponível na build instalada.
                // Este método só produz háptica; não envia um Hey.
                Promise.resolve(
                    haptics?.play({ type: 'heySent' })
                ).catch(function () {});
            } else if (typeof navigator.vibrate === 'function') {
                navigator.vibrate(50);
            }
        } catch (_) {
            // A mensagem funciona mesmo sem suporte de háptica.
        }
    }

    function mostrarFeedbackErro() {
        var erro = document.getElementById('login-erro');
        if (!erro) return;

        var mensagem = erro.textContent.replace(/\s+/g, ' ').trim();

        // Mensagem de credenciais inválidas devolvida por login.php.
        // Não confundir com email por confirmar ou limite de tentativas.
        if (
            mensagem !==
            'O email, número de telefone ou palavra-passe não está correto.'
        ) {
            return;
        }

        window.setTimeout(function () {
            if (document.visibilityState === 'hidden') return;

            vibrarErro();

            if (
                window.matchMedia?.(
                    '(prefers-reduced-motion: reduce)'
                ).matches
            ) {
                return;
            }

            var movimentos = [
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(-7px)', offset: 0.16 },
                { transform: 'translateX(7px)', offset: 0.32 },
                { transform: 'translateX(-5px)', offset: 0.48 },
                { transform: 'translateX(5px)', offset: 0.64 },
                { transform: 'translateX(-2px)', offset: 0.82 },
                { transform: 'translateX(0)', offset: 1 }
            ];

            document.querySelectorAll('body > main, body > aside')
                .forEach(function (elemento) {
                    elemento.animate?.(movimentos, {
                        duration: 360,
                        easing: 'ease-in-out',
                        iterations: 1
                    });
                });
        }, 450);
    }

    function iniciar() {
        var verPassword = document.getElementById('ver-password');
        var palavraPasse = document.getElementById('palavra-passe');

        if (verPassword && palavraPasse) {
            verPassword.addEventListener('change', function () {
                palavraPasse.type = verPassword.checked
                    ? 'text'
                    : 'password';
            });
        }

        mostrarFeedbackErro();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, {
            once: true
        });
    } else {
        iniciar();
    }
})();