(function (window, document, $) {
    'use strict';

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;
    var CONNECTION_TIMEOUT = 10000;
    var APPLICATION_PING_INTERVAL = 25000;

    var socket = null;
    var reconnectTimer = null;
    var connectionTimer = null;
    var pingTimer = null;

    var reconnectAttempts = 0;
    var manualClose = false;
    var connecting = false;

    function getWebSocketUrl() {
        /*
         * Enquanto estiveres por HTTP/IP:
         * ws://34.14.62.235:8080
         *
         * Quando tiveres HTTPS e proxy Apache:
         * wss://dominio.pt/websocket
         */
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

    function connectWebSocket(force) {
        if (manualClose) {
            return;
        }

        if (!navigator.onLine) {
            updateConnectionStatus(
                'offline'
            );

            return;
        }

        if (
            socket &&
            (
                socket.readyState ===
                    WebSocket.OPEN ||
                socket.readyState ===
                    WebSocket.CONNECTING
            )
        ) {
            if (!force) {
                return;
            }

            try {
                socket.close(
                    4000,
                    'Reconexão solicitada'
                );
            } catch (error) {
                console.error(error);
            }
        }

        if (connecting) {
            return;
        }

        clearReconnectTimer();
        clearConnectionTimer();
        clearPingTimer();

        connecting = true;

        updateConnectionStatus(
            'connecting'
        );

        var currentSocket;

        try {
            currentSocket = new WebSocket(
                getWebSocketUrl()
            );
        } catch (error) {
            connecting = false;

            console.error(
                'Não foi possível criar o WebSocket:',
                error
            );

            scheduleReconnect();

            return;
        }

        socket = currentSocket;
        window.ws = currentSocket;

        connectionTimer = window.setTimeout(
            function () {
                if (
                    currentSocket.readyState ===
                    WebSocket.CONNECTING
                ) {
                    console.warn(
                        'A ligação WebSocket demorou demasiado tempo.'
                    );

                    currentSocket.close();
                }
            },
            CONNECTION_TIMEOUT
        );

        currentSocket.addEventListener(
            'open',
            function () {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                connecting = false;

                clearConnectionTimer();
                clearReconnectTimer();

                reconnectAttempts = 0;

                updateConnectionStatus(
                    'connected'
                );

                console.log(
                    'WebSocket ligado'
                );

                authenticate();
                startPing();
            }
        );

        currentSocket.addEventListener(
            'message',
            function (event) {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                handleMessage(event);
            }
        );

        currentSocket.addEventListener(
            'error',
            function (event) {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                console.error(
                    'Erro no WebSocket:',
                    event
                );
            }
        );

        currentSocket.addEventListener(
            'close',
            function (event) {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                connecting = false;

                clearConnectionTimer();
                clearPingTimer();

                updateConnectionStatus(
                    navigator.onLine
                        ? 'disconnected'
                        : 'offline'
                );

                console.log(
                    'WebSocket fechado:',
                    {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean
                    }
                );

                socket = null;
                window.ws = null;

                if (!manualClose) {
                    scheduleReconnect();
                }
            }
        );
    }

    function authenticate() {
        if (!window.membroId) {
            console.error(
                'window.membroId não está definido.'
            );

            return;
        }

        sendWebSocketMessage({
            type: 'auth',
            membro_id:
                window.membroId
        });
    }

    function startPing() {
        clearPingTimer();

        pingTimer = window.setInterval(
            function () {
                sendWebSocketMessage({
                    type: 'ping',
                    timestamp: Date.now()
                });
            },
            APPLICATION_PING_INTERVAL
        );
    }

    function scheduleReconnect() {
        if (
            manualClose ||
            reconnectTimer ||
            !navigator.onLine
        ) {
            return;
        }

        reconnectAttempts++;

        var exponentialDelay =
            RECONNECT_MIN_DELAY *
            Math.pow(
                2,
                reconnectAttempts - 1
            );

        var limitedDelay = Math.min(
            exponentialDelay,
            RECONNECT_MAX_DELAY
        );

        /*
         * Pequena variação para vários clientes não tentarem
         * ligar todos exatamente ao mesmo tempo.
         */
        var randomExtra =
            Math.floor(
                Math.random() * 1000
            );

        var delay =
            limitedDelay + randomExtra;

        console.log(
            'Nova tentativa WebSocket em',
            delay,
            'ms'
        );

        reconnectTimer =
            window.setTimeout(
                function () {
                    reconnectTimer = null;
                    connectWebSocket(false);
                },
                delay
            );
    }

    function sendWebSocketMessage(data) {
        if (
            !socket ||
            socket.readyState !==
                WebSocket.OPEN
        ) {
            return false;
        }

        try {
            socket.send(
                JSON.stringify(data)
            );

            return true;
        } catch (error) {
            console.error(
                'Erro ao enviar pelo WebSocket:',
                error
            );

            return false;
        }
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

        if (
            !data ||
            typeof data !== 'object'
        ) {
            return;
        }

        switch (data.type) {
            case 'connected':
                break;

            case 'authenticated':
                console.log(
                    'WebSocket autenticado:',
                    data.membro_id
                );
                break;

            case 'state':
                atualizarPessoasNoMapa(
                    Array.isArray(data.people)
                        ? data.people
                        : []
                );
                break;

            case 'notification':
                mostrarNotificacao(
                    data
                );
                break;

            case 'notification_sent':
                mostrarMensagemTemporaria(
                    data.message ||
                        'Hey enviado.',
                    'sucesso'
                );
                break;

            case 'notification_not_delivered':
                mostrarMensagemTemporaria(
                    data.message ||
                        'O utilizador não está online.',
                    'erro'
                );
                break;

            case 'pong':
                break;

            case 'error':
                console.error(
                    'Erro do servidor WebSocket:',
                    data.message
                );

                mostrarMensagemTemporaria(
                    data.message ||
                        'Ocorreu um erro.',
                    'erro'
                );
                break;

            default:
                console.warn(
                    'Mensagem WebSocket desconhecida:',
                    data
                );
                break;
        }
    }

    function atualizarPessoasNoMapa(
        pessoas
    ) {
        var idsAtuais =
            pessoas.map(
                function (pessoa) {
                    return String(
                        pessoa.id
                    );
                }
            );

        $('.foto').each(
            function () {
                var $foto =
                    $(this);

                var id = String(
                    $foto.attr('id') ||
                    ''
                );

                if (
                    idsAtuais.includes(id) ||
                    $foto.hasClass(
                        'a-remover'
                    )
                ) {
                    return;
                }

                $foto.addClass(
                    'a-remover'
                );

                $foto.css({
                    transition:
                        'opacity 0.4s ease-out',

                    opacity: '0'
                });

                window.setTimeout(
                    function () {
                        $foto.remove();

                        inicializarMapa();
                    },
                    400
                );
            }
        );

        var fragment =
            document.createDocumentFragment();

        var inserted = false;

        pessoas.forEach(
            function (pessoa) {
                if (
                    !pessoa ||
                    pessoa.id === undefined
                ) {
                    return;
                }

                var id = String(
                    pessoa.id
                );

                var src = String(
                    pessoa.src || ''
                ).trim();

                if (!src) {
                    src =
                        '/imagens/fotos-perfil/default.webp';
                }

                var existing =
                    document.getElementById(
                        id
                    );

                if (existing) {
                    $(existing).attr({
                        'data-top':
                            Number(
                                pessoa.top
                            ) || 0,

                        'data-left':
                            Number(
                                pessoa.left
                            ) || 0,

                        'data-membro-id':
                            pessoa.membro_id ||
                            '',

                        'data-nome':
                            pessoa.nome || '',

                        src: src,

                        alt:
                            pessoa.nome ||
                            'Foto de perfil'
                    });

                    return;
                }

                inserted = true;

                var $img = $('<img>', {
                    id: id,
                    class: 'foto',
                    src: src,
                    alt:
                        pessoa.nome ||
                        'Foto de perfil'
                });

                $img.attr({
                    'data-top':
                        Number(
                            pessoa.top
                        ) || 0,

                    'data-left':
                        Number(
                            pessoa.left
                        ) || 0,

                    'data-membro-id':
                        pessoa.membro_id ||
                        '',

                    'data-nome':
                        pessoa.nome || ''
                });

                $img.css({
                    opacity: '0',

                    transition:
                        'opacity 0.4s ease-out'
                });

                $img[0].decoding =
                    'async';

                $img.on(
                    'load',
                    function () {
                        $(this).css(
                            'opacity',
                            '1'
                        );
                    }
                );

                $img.on(
                    'error',
                    function () {
                        if (
                            this.dataset
                                .fallbackApplied
                        ) {
                            $(this).css(
                                'opacity',
                                '1'
                            );

                            return;
                        }

                        this.dataset
                            .fallbackApplied =
                            '1';

                        this.src =
                            '/imagens/fotos-perfil/default.webp';
                    }
                );

                fragment.appendChild(
                    $img[0]
                );
            }
        );

        if (inserted) {
            document.body.appendChild(
                fragment
            );
        }

        inicializarMapa();
    }

    function inicializarMapa() {
        window.clearTimeout(
            window.mapInitTimeout
        );

        window.mapInitTimeout =
            window.setTimeout(
                function () {
                    if (
                        typeof window
                            .inicializarFotos ===
                        'function'
                    ) {
                        window
                            .inicializarFotos();
                    }
                },
                50
            );
    }

    function mostrarNotificacao(data) {
        mostrarNotificacaoInterna(
            data
        );

        if (
            !window.isSecureContext ||
            !('Notification' in window) ||
            Notification.permission !==
                'granted'
        ) {
            return;
        }

        try {
            var notification =
                new Notification(
                    data.title ||
                        'Nova notificação',
                    {
                        body:
                            data.body || '',

                        icon:
                            data.from_photo ||
                            '/imagens/fotos-perfil/default.webp',

                        tag:
                            'hey-' +
                            (
                                data.from_member_id ||
                                'unknown'
                            ),

                        data: {
                            membro_id:
                                data.from_member_id ||
                                ''
                        }
                    }
                );

            notification.onclick =
                function () {
                    window.focus();

                    notification.close();

                    abrirPessoa(
                        notification.data
                            .membro_id
                    );
                };
        } catch (error) {
            console.error(
                'Erro ao mostrar notificação:',
                error
            );
        }
    }

    function mostrarNotificacaoInterna(
        data
    ) {
        $('.notificacao-interna')
            .remove();

        var $notification =
            $('<button>', {
                type: 'button',
                class:
                    'notificacao-interna',

                'data-membro-id':
                    data.from_member_id ||
                    ''
            });

        var $image = $('<img>', {
            src:
                data.from_photo ||
                '/imagens/fotos-perfil/default.webp',

            alt: ''
        });

        var $content = $('<div>', {
            class:
                'notificacao-interna-conteudo'
        });

        $content.append(
            $('<strong>').text(
                data.title ||
                    'Nova notificação'
            ),

            $('<span>').text(
                data.body ||
                    'Recebeste um Hey.'
            )
        );

        $notification.append(
            $image,
            $content
        );

        $('body').append(
            $notification
        );

        window.requestAnimationFrame(
            function () {
                $notification.addClass(
                    'visivel'
                );
            }
        );

        var timeout =
            window.setTimeout(
                function () {
                    removerNotificacao(
                        $notification
                    );
                },
                5000
            );

        $notification.on(
            'click',
            function () {
                window.clearTimeout(
                    timeout
                );

                var membroId =
                    $(this).attr(
                        'data-membro-id'
                    );

                removerNotificacao(
                    $(this)
                );

                abrirPessoa(
                    membroId
                );
            }
        );
    }

    function removerNotificacao(
        $notification
    ) {
        $notification.removeClass(
            'visivel'
        );

        window.setTimeout(
            function () {
                $notification.remove();
            },
            300
        );
    }

    function abrirPessoa(membroId) {
        if (!membroId) {
            return;
        }

        var $photo = $(
            '.foto[data-membro-id="' +
            CSS.escape(
                String(membroId)
            ) +
            '"]'
        );

        if ($photo.length) {
            $photo
                .first()
                .trigger('click');
        }
    }

    function mostrarMensagemTemporaria(
        message,
        type
    ) {
        $('.mensagem-websocket')
            .remove();

        var $message = $('<div>', {
            class:
                'mensagem-websocket ' +
                (
                    type === 'erro'
                        ? 'erro'
                        : 'sucesso'
                )
        }).text(message);

        $('body').append(
            $message
        );

        window.requestAnimationFrame(
            function () {
                $message.addClass(
                    'visivel'
                );
            }
        );

        window.setTimeout(
            function () {
                $message.removeClass(
                    'visivel'
                );

                window.setTimeout(
                    function () {
                        $message.remove();
                    },
                    300
                );
            },
            3000
        );
    }

    function updateConnectionStatus(
        status
    ) {
        document.documentElement
            .setAttribute(
                'data-websocket-status',
                status
            );

        $(document).trigger(
            'websocket:status',
            [status]
        );
    }

    function clearReconnectTimer() {
        if (reconnectTimer) {
            window.clearTimeout(
                reconnectTimer
            );

            reconnectTimer = null;
        }
    }

    function clearConnectionTimer() {
        if (connectionTimer) {
            window.clearTimeout(
                connectionTimer
            );

            connectionTimer = null;
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

    /*
    |--------------------------------------------------------------------------
    | API pública
    |--------------------------------------------------------------------------
    */

    window.AppWebSocket = {
        connect: function () {
            connectWebSocket(false);
        },

        reconnect: function () {
            connectWebSocket(true);
        },

        send: function (data) {
            return sendWebSocketMessage(
                data
            );
        },

        isConnected: function () {
            return Boolean(
                socket &&
                socket.readyState ===
                    WebSocket.OPEN
            );
        }
    };

    /*
    |--------------------------------------------------------------------------
    | Recuperação após suspensão, perda de internet ou mudança de separador
    |--------------------------------------------------------------------------
    */

    window.addEventListener(
        'online',
        function () {
            reconnectAttempts = 0;
            connectWebSocket(false);
        }
    );

    window.addEventListener(
        'offline',
        function () {
            updateConnectionStatus(
                'offline'
            );
        }
    );

    window.addEventListener(
        'focus',
        function () {
            if (
                !window.AppWebSocket
                    .isConnected()
            ) {
                connectWebSocket(false);
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
                connectWebSocket(false);
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
                connectWebSocket(false);
            }
        }
    );

    window.addEventListener(
        'pagehide',
        function () {
            clearPingTimer();
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Iniciar
    |--------------------------------------------------------------------------
    */

    $(function () {
        connectWebSocket(false);
    });

    /*
     * Funções usadas noutros ficheiros.
     */
    window.mostrarMensagemTemporaria =
        mostrarMensagemTemporaria;

})(
    window,
    document,
    jQuery
);