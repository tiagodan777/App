(function (window, document) {

    'use strict';

    var socket = null;

    var reconnectTimer = null;

    var pingTimer = null;

    var reconnectAttempts = 0;

    var manualClose = false;

    var RECONNECT_MIN_DELAY = 1000;

    var RECONNECT_MAX_DELAY = 30000;

    var PING_INTERVAL = 25000;

    function getWebSocketUrl() {

        if (window.webSocketUrl) {

            return window.webSocketUrl;

        }

        var protocol =

            window.location.protocol === 'https:'

                ? 'wss:'

                : 'ws:';

        return (

            protocol +

            '//' +

            window.location.hostname +

            ':8080'

        );

    }

    function connect() {

        if (manualClose) {

            return;

        }

        if (!navigator.onLine) {

            console.warn(

                'Sem internet. WebSocket não será ligado agora.'

            );

            scheduleReconnect();

            return;

        }

        if (

            socket &&

            (

                socket.readyState === WebSocket.OPEN ||

                socket.readyState === WebSocket.CONNECTING

            )

        ) {

            return;

        }

        clearReconnectTimer();

        clearPingTimer();

        var url = getWebSocketUrl();

        console.log(

            'A tentar ligar ao WebSocket:',

            url

        );

        try {

            socket = new WebSocket(url);

        } catch (error) {

            console.error(

                'Erro ao criar WebSocket:',

                error

            );

            scheduleReconnect();

            return;

        }

        window.ws = socket;

        socket.onopen = function () {

            console.log(

                'WebSocket ligado com sucesso'

            );

            reconnectAttempts = 0;

            authenticate();

            startPing();

        };

        socket.onmessage = function (event) {

            handleMessage(event);

        };

        socket.onerror = function (event) {

            console.error(

                'Erro no WebSocket:',

                event

            );

        };

        socket.onclose = function (event) {

            console.warn(

                'WebSocket fechado:',

                {

                    code: event.code,

                    reason: event.reason,

                    wasClean: event.wasClean

                }

            );

            clearPingTimer();

            socket = null;

            window.ws = null;

            if (!manualClose) {

                scheduleReconnect();

            }

        };

    }

    function authenticate() {

        if (!window.membroId) {

            console.error(

                'window.membroId não está definido.'

            );

            return;

        }

        send({

            type: 'auth',

            membro_id: window.membroId

        });

    }

    function send(data) {

        if (

            !socket ||

            socket.readyState !== WebSocket.OPEN

        ) {

            console.warn(

                'Tentativa de envio sem WebSocket ligado:',

                data

            );

            return false;

        }

        try {

            socket.send(

                JSON.stringify(data)

            );

            return true;

        } catch (error) {

            console.error(

                'Erro ao enviar mensagem:',

                error

            );

            return false;

        }

    }

    function startPing() {

        clearPingTimer();

        pingTimer = window.setInterval(

            function () {

                send({

                    type: 'ping',

                    timestamp: Date.now()

                });

            },

            PING_INTERVAL

        );

    }

    function scheduleReconnect() {

        if (manualClose || reconnectTimer) {

            return;

        }

        reconnectAttempts++;

        var delay = Math.min(

            RECONNECT_MIN_DELAY *

                Math.pow(

                    2,

                    reconnectAttempts - 1

                ),

            RECONNECT_MAX_DELAY

        );

        delay += Math.floor(

            Math.random() * 1000

        );

        console.log(

            'Nova tentativa em ' +

            delay +

            ' ms'

        );

        reconnectTimer =

            window.setTimeout(

                function () {

                    reconnectTimer = null;

                    connect();

                },

                delay

            );

    }

    function handleMessage(event) {

        var data;

        try {

            data = JSON.parse(

                event.data

            );

        } catch (error) {

            console.error(

                'Mensagem WebSocket inválida:',

                event.data

            );

            return;

        }

        console.log(

            'Mensagem recebida:',

            data

        );

        if (

            data &&

            data.type === 'notification'

        ) {

            if (

                typeof window

                    .mostrarNotificacao ===

                'function'

            ) {

                window.mostrarNotificacao(

                    data

                );

            }

            return;

        }

        if (

            data &&

            data.type ===

                'notification_sent'

        ) {

            if (

                typeof window

                    .mostrarMensagemTemporaria ===

                'function'

            ) {

                window.mostrarMensagemTemporaria(

                    data.message ||

                        'Hey enviado.',

                    'sucesso'

                );

            }

            return;

        }

        if (

            data &&

            data.type ===

                'notification_not_delivered'

        ) {

            if (

                typeof window

                    .mostrarMensagemTemporaria ===

                'function'

            ) {

                window.mostrarMensagemTemporaria(

                    data.message ||

                        'O utilizador não está online.',

                    'erro'

                );

            }

            return;

        }

        if (

            data &&

            data.type === 'error'

        ) {

            console.error(

                'Erro do servidor:',

                data.message

            );

            return;

        }

        if (

            data &&

            data.type === 'pong'

        ) {

            return;

        }

        if (

            data &&

            data.type === 'state' &&

            Array.isArray(data.people)

        ) {

            if (

                typeof window

                    .atualizarPessoasNoMapa ===

                'function'

            ) {

                window.atualizarPessoasNoMapa(

                    data.people

                );

            }

            return;

        }

        if (Array.isArray(data)) {

            if (

                typeof window

                    .atualizarPessoasNoMapa ===

                'function'

            ) {

                window.atualizarPessoasNoMapa(

                    data

                );

            }

            return;

        }

    }

    function clearReconnectTimer() {

        if (reconnectTimer) {

            window.clearTimeout(

                reconnectTimer

            );

            reconnectTimer = null;

        }

    }

    function clearPingTimer() {

        if (pingTimer) {

            window.clearInterval(

                pingTimer

            );

            pingTimer = null;

        }

    }

    window.AppWebSocket = {

        connect: connect,

        send: send,

        isConnected: function () {

            return Boolean(

                socket &&

                socket.readyState ===

                    WebSocket.OPEN

            );

        }

    };

    window.addEventListener(

        'online',

        function () {

            reconnectAttempts = 0;

            connect();

        }

    );

    window.addEventListener(

        'focus',

        function () {

            if (

                !window.AppWebSocket

                    .isConnected()

            ) {

                connect();

            }

        }

    );

    document.addEventListener(

        'visibilitychange',

        function () {

            if (

                document.visibilityState ===

                    'visible' &&

                !window.AppWebSocket

                    .isConnected()

            ) {

                connect();

            }

        }

    );

    window.addEventListener(

        'pageshow',

        function () {

            if (

                !window.AppWebSocket

                    .isConnected()

            ) {

                connect();

            }

        }

    );

    document.addEventListener(

        'DOMContentLoaded',

        function () {

            connect();

        }

    );

})(

    window,

    document

);