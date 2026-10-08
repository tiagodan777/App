(function (window, navigator) {
    'use strict';

    var processados = new Set();
    var ordem = [];
    var MAX_PROCESSADOS = 300;
    var PADROES_WEB = Object.freeze({
        interaction: [12],
        shutter: [10],
        heySent: [15],
        heyReceived: [45],
        messageReceived: [30],
        connection: [18]
    });

    function notificacoesDesativadas() {
        return window.disableNotifications === true;
    }

    function chaveProcessamento(tipo, detalhe) {
        detalhe = detalhe || {};

        if (tipo === 'messageReceived') {
            return tipo + ':' + String(
                detalhe.message_id ||
                (detalhe.message && detalhe.message.id) ||
                ''
            );
        }

        if (tipo === 'connection') {
            return tipo + ':' + String(
                detalhe.other_member_id || detalhe.outro_id || ''
            );
        }

        return (
            tipo +
            ':' +
            String(
                detalhe.notification_id ||
                    detalhe.message_id ||
                    (detalhe.message && detalhe.message.id) ||
                    ''
            )
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

    function tocar(tipo, detalhe, interacao) {
        if (
            document.hidden ||
            (
                !interacao &&
                !['heySent', 'heyReceived', 'messageReceived', 'connection'].includes(tipo)
            )
        ) {
            return;
        }

        if (!interacao && (notificacoesDesativadas() || !aceitar(tipo, detalhe))) {
            return;
        }

        var plugin = pluginNativo();

        if (plugin && typeof plugin.play === 'function') {
            try {
                // As builds atuais já suportam este impacto, sem exigir uma nova build.
                var tipoNativo = tipo === 'connection' ? 'heySent' : tipo;
                Promise.resolve(plugin.play({ type: tipoNativo })).catch(function () {
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
                (PADROES_WEB[tipo] || PADROES_WEB.interaction).slice()
            );
        } catch (erro) {
            console.warn('Não foi possível reproduzir a háptica da Margot.', erro);
        }
    }

    window.addEventListener('app:hey-recebido', function (evento) {
        tocar('heyReceived', evento.detail || {});
    });

    window.addEventListener('app:hey-enviado', function (evento) {
        tocar('heySent', evento.detail || {});
    });

    // A háptica acompanha o aviso mostrado, não cada mensagem recebida.
    window.addEventListener('app:chat-aviso', function (evento) {
        var detalhe = evento.detail || {};
        var emissor = String(detalhe.from_member_id || '');

        if (
            emissor &&
            emissor !== String(window.membroId || '') &&
            emissor !== String(window.chatMembroId || '')
        ) {
            tocar('messageReceived', detalhe);
        }
    });

    window.addEventListener('app:connection-created', function (evento) {
        var detalhe = evento.detail || {};

        if (!detalhe.already_connected) {
            tocar('connection', detalhe);
        }
    });

    window.MargotHaptics = Object.freeze({
        play: tocar,
        feedback: function (tipo) {
            tocar(tipo || 'interaction', null, true);
        },
        cancel: function () {
            if (typeof navigator.vibrate === 'function') {
                navigator.vibrate(0);
            }
        }
    });
})(window, navigator);