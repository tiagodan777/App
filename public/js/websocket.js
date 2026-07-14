(function (window, document, $) {
    'use strict';

    var socket = null;
    var reconnectTimer = null;
    var pingTimer = null;
    var reconnectAttempts = 0;
    var manualClose = false;

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;
    var PING_INTERVAL = 25000;

    /*
    |--------------------------------------------------------------------------
    | Endereço do WebSocket
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
    | Ligar ao servidor
    |--------------------------------------------------------------------------
    */

    function connect() {
        if (manualClose) {
            return;
        }

        if (!navigator.onLine) {
            console.warn(
                'Sem internet. O WebSocket será ligado quando a internet voltar.'
            );

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
                'Erro ao criar o WebSocket:',
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

            $(document).trigger(
                'websocket:status',
                ['connected']
            );
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

            $(document).trigger(
                'websocket:status',
                [
                    navigator.onLine
                        ? 'disconnected'
                        : 'offline'
                ]
            );

            if (!manualClose) {
                scheduleReconnect();
            }
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Autenticação
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Enviar mensagens
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Ping periódico
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
    | Reconexão automática
    |--------------------------------------------------------------------------
    */

    function scheduleReconnect() {
        if (
            manualClose ||
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
            'Nova tentativa de ligação em ' +
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
    | Receber mensagens
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
                'Mensagem WebSocket inválida:',
                event.data
            );

            return;
        }

        console.log(
            'Mensagem recebida:',
            data
        );

        /*
         * Versão atual do servidor:
         * envia diretamente um array com as pessoas.
         */
        if (Array.isArray(data)) {
            atualizarPessoasNoMapa(data);
            return;
        }

        if (
            !data ||
            typeof data !== 'object'
        ) {
            return;
        }

        /*
         * Compatibilidade com a versão em que
         * o servidor envia { type: "state", people: [] }.
         */
        if (
            data.type === 'state' &&
            Array.isArray(data.people)
        ) {
            atualizarPessoasNoMapa(
                data.people
            );

            return;
        }

        if (
            data.type === 'notification'
        ) {
            mostrarNotificacao(data);
            return;
        }

        if (
            data.type ===
                'notification_sent'
        ) {
            mostrarMensagemTemporaria(
                data.message ||
                    'Hey enviado.',
                'sucesso'
            );

            return;
        }

        if (
            data.type ===
                'notification_not_delivered'
        ) {
            mostrarMensagemTemporaria(
                data.message ||
                    'O utilizador não está online.',
                'erro'
            );

            return;
        }

        if (data.type === 'pong') {
            return;
        }

        if (
            data.type === 'error'
        ) {
            console.error(
                'Erro do servidor:',
                data.message
            );

            mostrarMensagemTemporaria(
                data.message ||
                    'Ocorreu um erro.',
                'erro'
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Atualizar as pessoas no mapa
    |--------------------------------------------------------------------------
    */

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

        /*
         * Remover imagens de ligações que já fecharam.
         */
        $('.foto').each(
            function () {
                var $foto = $(this);

                var id = String(
                    $foto.attr('id') || ''
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
            }
        );

        var fragmento =
            document.createDocumentFragment();

        var inseriuImagem = false;

        /*
         * Criar ou atualizar imagens.
         */
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
                        .removeClass(
                            'a-remover'
                        );

                    $imagemExistente.attr({
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

                    $imagemExistente.css(
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
                                .imagemFallback ===
                            '1'
                        ) {
                            $(this).css(
                                'opacity',
                                '1'
                            );

                            return;
                        }

                        this.dataset
                            .imagemFallback =
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

    /*
    |--------------------------------------------------------------------------
    | Reinicializar posicionamento do mapa
    |--------------------------------------------------------------------------
    */

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
    | Notificação recebida dentro da página
    |--------------------------------------------------------------------------
    */

    function mostrarNotificacao(data) {
        mostrarNotificacaoInterna(data);

        if (
            !window.isSecureContext ||
            !('Notification' in window) ||
            Notification.permission !==
                'granted'
        ) {
            return;
        }

        try {
            var notificacao =
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
                                'desconhecido'
                            )
                    }
                );

            notificacao.onclick =
                function () {
                    window.focus();
                    notificacao.close();

                    abrirPessoa(
                        data.from_member_id
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

    function abrirPessoa(membroId) {
        if (!membroId) {
            return;
        }

        var $foto = $(
            '.foto[data-membro-id="' +
            String(membroId) +
            '"]'
        );

        if ($foto.length) {
            $foto
                .first()
                .trigger('click');
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Mensagens de sucesso e erro
    |--------------------------------------------------------------------------
    */

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
        });

        $mensagem.text(mensagem);

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
    | Limpar timers
    |--------------------------------------------------------------------------
    */

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

    window.atualizarPessoasNoMapa =
        atualizarPessoasNoMapa;

    window.mostrarNotificacao =
        mostrarNotificacao;

    window.mostrarMensagemTemporaria =
        mostrarMensagemTemporaria;

    /*
    |--------------------------------------------------------------------------
    | Recuperação automática
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
            $(document).trigger(
                'websocket:status',
                ['offline']
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
