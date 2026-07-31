(function (window, navigator) {
    'use strict';

    // Muda apenas para false se quiseres desligar esta funcionalidade.
    var VIBRACAO_HEY_ATIVA = true;

    // Duas vibrações curtas e uma mais longa.
    // Duração total aproximada: 1,44 segundos.
    var PADRAO_VIBRACAO_HEY = [
        250,
        120,
        250,
        120,
        700
    ];

    var notificacoesProcessadas = new Set();

    function notificacoesDesativadas() {
        return window.disableNotifications === true;
    }

    function vibrarHey(evento) {
        if (
            !VIBRACAO_HEY_ATIVA ||
            notificacoesDesativadas() ||
            typeof navigator.vibrate !== 'function'
        ) {
            return;
        }

        var detalhe = evento && evento.detail
            ? evento.detail
            : {};

        var id = String(
            detalhe.notification_id || ''
        ).trim();

        if (
            id &&
            notificacoesProcessadas.has(id)
        ) {
            return;
        }

        if (id) {
            notificacoesProcessadas.add(id);

            window.setTimeout(function () {
                notificacoesProcessadas.delete(id);
            }, 10 * 60 * 1000);
        }

        try {
            navigator.vibrate(
                PADRAO_VIBRACAO_HEY.slice()
            );
        } catch (erro) {
            console.warn(
                'Não foi possível ativar a vibração do Hey.',
                erro
            );
        }
    }

    window.addEventListener(
        'app:hey-recebido',
        vibrarHey
    );

    window.MargotHeyVibracao = Object.freeze({
        ativa: VIBRACAO_HEY_ATIVA,

        padrao: PADRAO_VIBRACAO_HEY.slice(),

        cancelar: function () {
            if (
                typeof navigator.vibrate === 'function'
            ) {
                navigator.vibrate(0);
            }
        }
    });
})(window, navigator);