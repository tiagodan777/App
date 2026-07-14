(function (window, document, $) {
    'use strict';

    var socket = null;

    var reconnectTimer = null;
    var connectionTimeout = null;
    var pingTimer = null;

    var reconnectAttempts = 0;

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;

    var CONNECTION_TIMEOUT = 12000;
    var PING_INTERVAL = 20000;

    /*
    |--------------------------------------------------------------------------
    | URL
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Ligação
    |--------------------------------------------------------------------------
    */

    function connect() {
        if (!navigator.onLine) {
            setStatus('offline');
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
        clearConnectionTimeout();
        clearPingTimer();

        setStatus('connecting');

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

            socket = null;

            scheduleReconnect();
            return;
        }

        window.ws = socket;

        var currentSocket = socket;

        connectionTimeout =
            window.setTimeout(
                function () {
                    if (
                        currentSocket.readyState ===
                        WebSocket.CONNECTING
                    ) {
                        currentSocket.close();
                    }
                },
                CONNECTION_TIMEOUT
            );

        currentSocket.onopen =
            function () {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                console.log(
                    'WebSocket ligado'
                );

                clearConnectionTimeout();

                reconnectAttempts = 0;

                setStatus('connected');

                authenticate();
                startPing();
            };

        currentSocket.onmessage =
            function (event) {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                handleMessage(event);
            };

        currentSocket.onerror =
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
            };

        currentSocket.onclose =
            function (event) {
                if (
                    currentSocket !== socket
                ) {
                    return;
                }

                console.warn(
                    'WebSocket fechado:',
                    {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean
                    }
                );

                clearConnectionTimeout();
                clearPingTimer();

                socket = null;
                window.ws = null;

                setStatus(
                    navigator.onLine
                        ? 'disconnected'
                        : 'offline'
                );

                scheduleReconnect();
            };
    }

    /*
    |--------------------------------------------------------------------------
    | Autenticação
    |--------------------------------------------------------------------------
    */

    function authenticate() {
        var membroId = String(
            window.membroId || ''
        ).trim();

        if (membroId === '') {
            console.error(
                'window.membroId não está definido.'
            );

            return;
        }

        send({
            type: 'auth',
            membro_id: membroId
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Enviar
    |--------------------------------------------------------------------------
    */

    function send(data) {
        if (
            !socket ||
            socket.readyState !== WebSocket.OPEN
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
                'Erro ao enviar mensagem:',
                error
            );

            return false;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Ping
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Reconexão
    |--------------------------------------------------------------------------
    */

    function scheduleReconnect() {
        if (
            reconnectTimer ||
            !navigator.onLine
        ) {
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
            'Nova tentativa WebSocket em ' +
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

    /*
    |--------------------------------------------------------------------------
    | Mensagens recebidas
    |--------------------------------------------------------------------------
    */

    function handleMessage(event) {
        var data;

        try {
            data = JSON.parse(
                event.data
            );
        } catch (error) {
            console.error(
                'JSON inválido recebido:',
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
                    'Erro do servidor:',
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
                    'Mensagem desconhecida:',
                    data
                );
                break;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Mapa
    |--------------------------------------------------------------------------
    */

    function atualizarPessoasNoMapa(
        pessoas
    ) {
        var idsAtuais = pessoas.map(
            function (pessoa) {
                return String(
                    pessoa.id
                );
            }
        );

        /*
         * Remover pessoas que deixaram de estar online.
         */
        $('.foto').each(function () {
            var $foto = $(this);

            var id = String(
                $foto.attr('id') || ''
            );

            if (
                idsAtuais.includes(id) ||
                $foto.hasClass('a-remover')
            ) {
                return;
            }

            $foto.addClass('a-remover');

            $foto.css({
                opacity: '0',
                transition:
                    'opacity 0.4s ease-out'
            });

            window.setTimeout(
                function () {
                    $foto.remove();
                    reinicializarFotos();
                },
                400
            );
        });

        var fragmento =
            document.createDocumentFragment();

        var inseriuImagem = false;

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

                if (src === '') {
                    src =
                        '/imagens/fotos-perfil/default.webp';
                }

                var imagemExistente =
                    document.getElementById(
                        id
                    );

                if (imagemExistente) {
                    var $imagemExistente =
                        $(imagemExistente);

                    $imagemExistente
                        .removeClass('a-remover')
                        .attr({
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
                        })
                        .css(
                            'opacity',
                            '1'
                        );

                    return;
                }

                inseriuImagem = true;

                var $imagem = $('<img>', {
                    id: id,
                    class: 'foto',
                    src: src,
                    alt:
                        pessoa.nome ||
                        'Foto de perfil'
                });

                $imagem.attr({
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

                $imagem.css({
                    opacity: '0',

                    transition:
                        'opacity 0.4s ease-out'
                });

                $imagem[0].decoding =
                    'async';

                $imagem.on(
                    'load',
                    function () {
                        $(this).css(
                            'opacity',
                            '1'
                        );
                    }
                );

                $imagem.on(
                    'error',
                    function () {
                        if (
                            this.dataset
                                .fallbackAplicado ===
                            '1'
                        ) {
                            $(this).css(
                                'opacity',
                                '1'
                            );

                            return;
                        }

                        this.dataset
                            .fallbackAplicado =
                            '1';

                        this.src =
                            '/imagens/fotos-perfil/default.webp';
                    }
                );

                fragmento.appendChild(
                    $imagem[0]
                );
            }
        );

        if (inseriuImagem) {
            document.body.appendChild(
                fragmento
            );
        }

        reinicializarFotos();
    }

    function reinicializarFotos() {
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

    /*
    |--------------------------------------------------------------------------
    | Notificações internas
    |--------------------------------------------------------------------------
    */

    function mostrarNotificacao(data) {
        $('.notificacao-interna')
            .remove();

        var $notificacao =
            $('<button>', {
                type: 'button',

                class:
                    'notificacao-interna',

                'data-membro-id':
                    data.from_member_id ||
                    ''
            });

        var $imagem = $('<img>', {
            src:
                data.from_photo ||
                '/imagens/fotos-perfil/default.webp',

            alt: ''
        });

        var $conteudo = $('<div>', {
            class:
                'notificacao-interna-conteudo'
        });

        $conteudo.append(
            $('<strong>').text(
                data.title ||
                    'Nova notificação'
            ),

            $('<span>').text(
                data.body ||
                    'Recebeste um Hey.'
            )
        );

        $notificacao.append(
            $imagem,
            $conteudo
        );

        $('body').append(
            $notificacao
        );

        window.requestAnimationFrame(
            function () {
                $notificacao.addClass(
                    'visivel'
                );
            }
        );

        var timeout =
            window.setTimeout(
                function () {
                    removerNotificacao(
                        $notificacao
                    );
                },
                5000
            );

        $notificacao.on(
            'click',
            function () {
                window.clearTimeout(
                    timeout
                );

                var membroId = String(
                    $(this).attr(
                        'data-membro-id'
                    ) || ''
                );

                removerNotificacao(
                    $(this)
                );

                var $foto = $(
                    '.foto[data-membro-id="' +
                    membroId +
                    '"]'
                );

                if ($foto.length) {
                    $foto
                        .first()
                        .trigger('click');
                }
            }
        );
    }

    function removerNotificacao(
        $notificacao
    ) {
        $notificacao.removeClass(
            'visivel'
        );

        window.setTimeout(
            function () {
                $notificacao.remove();
            },
            300
        );
    }

    function mostrarMensagemTemporaria(
        mensagem,
        tipo
    ) {
        $('.mensagem-websocket')
            .remove();

        var $mensagem = $('<div>', {
            class:
                'mensagem-websocket ' +
                (
                    tipo === 'erro'
                        ? 'erro'
                        : 'sucesso'
                )
        }).text(mensagem);

        $('body').append(
            $mensagem
        );

        window.requestAnimationFrame(
            function () {
                $mensagem.addClass(
                    'visivel'
                );
            }
        );

        window.setTimeout(
            function () {
                $mensagem.removeClass(
                    'visivel'
                );

                window.setTimeout(
                    function () {
                        $mensagem.remove();
                    },
                    300
                );
            },
            3000
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Estado e timers
    |--------------------------------------------------------------------------
    */

    function setStatus(status) {
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

    function clearConnectionTimeout() {
        if (connectionTimeout) {
            window.clearTimeout(
                connectionTimeout
            );

            connectionTimeout = null;
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

    window.mostrarMensagemTemporaria =
        mostrarMensagemTemporaria;

    /*
    |--------------------------------------------------------------------------
    | Recuperação
    |--------------------------------------------------------------------------
    */

    window.addEventListener(
        'online',
        function () {
            reconnectAttempts = 0;
            connect();
        }
    );

    window.addEventListener(
        'offline',
        function () {
            setStatus('offline');
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

    /*
    |--------------------------------------------------------------------------
    | Iniciar
    |--------------------------------------------------------------------------
    */

    $(function () {
        connect();
    });
})(
    window,
    document,
    jQuery
);