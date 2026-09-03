(function (window, navigator) {
    'use strict';

    var processados = new Set();
    var ordem = [];
    var MAX_PROCESSADOS = 300;

    var PADROES_WEB = Object.freeze({
        heySent: [38],
        heyReceived: [68, 58, 150],
        messageReceived: [105],
        connection: [62, 46, 80, 54, 190]
    });

    function notificacoesDesativadas() {
        return window.disableNotifications === true;
    }

    function chaveProcessamento(tipo, detalhe) {
        detalhe = detalhe || {};

        if (tipo === 'connection') {
            return tipo + ':' + String(
                detalhe.other_member_id ||
                detalhe.outro_id ||
                ''
            );
        }

        return tipo + ':' + String(
            detalhe.notification_id ||
            detalhe.message_id ||
            (detalhe.message && detalhe.message.id) ||
            ''
        );
    }

    function aceitar(tipo, detalhe) {
        var chave = chaveProcessamento(tipo, detalhe);

        if (chave === tipo + ':') {
            return true;
        }

        if (processados.has(chave)) {
            return false;
        }

        processados.add(chave);
        ordem.push(chave);

        while (ordem.length > MAX_PROCESSADOS) {
            processados.delete(ordem.shift());
        }

        return true;
    }

    function pluginNativo() {
        return window.Capacitor &&
            window.Capacitor.Plugins &&
            window.Capacitor.Plugins.MargotHaptics
            ? window.Capacitor.Plugins.MargotHaptics
            : null;
    }

    function tocar(tipo, detalhe) {
        if (notificacoesDesativadas() || !aceitar(tipo, detalhe)) {
            return;
        }

        var plugin = pluginNativo();

        if (plugin && typeof plugin.play === 'function') {
            try {
                Promise.resolve(
                    plugin.play({ type: tipo })
                ).catch(function () {
                    tocarFallback(tipo);
                });

                return;
            } catch (erro) {
                tocarFallback(tipo);
                return;
            }
        }

        tocarFallback(tipo);
    }

    function tocarFallback(tipo) {
        if (typeof navigator.vibrate !== 'function') {
            return;
        }

        try {
            navigator.vibrate(
                (PADROES_WEB[tipo] || PADROES_WEB.messageReceived).slice()
            );
        } catch (erro) {
            console.warn(
                'Não foi possível reproduzir a háptica da Margot.',
                erro
            );
        }
    }

    window.addEventListener(
        'app:hey-recebido',
        function (evento) {
            tocar(
                'heyReceived',
                evento.detail || {}
            );
        }
    );

    window.addEventListener(
        'app:hey-enviado',
        function (evento) {
            tocar(
                'heySent',
                evento.detail || {}
            );
        }
    );

    window.addEventListener(
        'app:chat-message',
        function (evento) {
            var detalhe = evento.detail || {};
            var mensagem = detalhe.message || {};

            if (
                String(mensagem.destinatario_id || '') ===
                String(window.membroId || '')
            ) {
                tocar(
                    'messageReceived',
                    detalhe
                );
            }
        }
    );

    window.addEventListener(
        'app:chat-push-recebido',
        function (evento) {
            tocar(
                'messageReceived',
                evento.detail || {}
            );
        }
    );

    window.addEventListener(
        'app:connection-created',
        function (evento) {
            var detalhe = evento.detail || {};

            if (!detalhe.already_connected) {
                tocar(
                    'connection',
                    detalhe
                );
            }
        }
    );

    window.MargotHaptics = Object.freeze({
        play: tocar,

        cancel: function () {
            if (
                typeof navigator.vibrate ===
                'function'
            ) {
                navigator.vibrate(0);
            }
        }
    });
})(window, navigator);