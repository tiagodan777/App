(function (window, document, $) {
    'use strict';

    var socket = null;
    var reconnectTimer = null;
    var connectionTimeout = null;
    var pingTimer = null;
    var reconnectAttempts = 0;
    var locationWatchId = null;
    var lastLocationSentAt = 0;
    var lastSentLatitude = null;
    var lastSentLongitude = null;

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;
    var CONNECTION_TIMEOUT = 12000;
    var PING_INTERVAL = 20000;
    var LOCATION_MIN_INTERVAL = 15000;
    var LOCATION_MIN_DISTANCE = 5;
    var LOCATION_MAX_AGE = 10000;

    function getWebSocketUrl() {
        if (window.webSocketUrl) return window.webSocketUrl;

        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return protocol + '//' + window.location.hostname + ':8080';
    }

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

        try {
            socket = new WebSocket(getWebSocketUrl());
        } catch (erro) {
            console.error('Erro ao criar WebSocket:', erro);
            socket = null;
            scheduleReconnect();
            return;
        }

        window.ws = socket;
        var currentSocket = socket;

        connectionTimeout = window.setTimeout(function () {
            if (currentSocket.readyState === WebSocket.CONNECTING) {
                currentSocket.close();
            }
        }, CONNECTION_TIMEOUT);

        currentSocket.onopen = function () {
            if (currentSocket !== socket) return;

            clearConnectionTimeout();
            reconnectAttempts = 0;
            setStatus('connected');
            authenticate();
            startPing();

            if (!window.disableLocationTracking) {
                startLocationTracking();
            }
        };

        currentSocket.onmessage = function (evento) {
            if (currentSocket === socket) handleMessage(evento);
        };

        currentSocket.onerror = function (evento) {
            if (currentSocket === socket) {
                console.error('Erro no WebSocket:', evento);
            }
        };

        currentSocket.onclose = function () {
            if (currentSocket !== socket) return;

            clearConnectionTimeout();
            clearPingTimer();

            socket = null;
            window.ws = null;

            setStatus(navigator.onLine ? 'disconnected' : 'offline');
            scheduleReconnect();
        };
    }

    function authenticate() {
        var membroId = String(window.membroId || '').trim();

        if (!membroId) {
            console.error('window.membroId não está definido.');
            return;
        }

        send({
            type: 'auth',
            membro_id: membroId,
            map_presence: !window.disableLocationTracking
        });
    }

    function send(data) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;

        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (erro) {
            console.error('Erro ao enviar mensagem:', erro);
            return false;
        }
    }

    function startPing() {
        clearPingTimer();

        pingTimer = window.setInterval(function () {
            send({
                type: 'ping',
                timestamp: Date.now()
            });
        }, PING_INTERVAL);
    }

    function startLocationTracking() {
        if (locationWatchId !== null) return;

        if (!window.isSecureContext) {
            mostrarMensagemTemporaria('A localização exige HTTPS.', 'erro');
            return;
        }

        if (!('geolocation' in navigator)) {
            mostrarMensagemTemporaria(
                'Este dispositivo não suporta localização.',
                'erro'
            );
            return;
        }

        locationWatchId = navigator.geolocation.watchPosition(
            handleLocationSuccess,
            handleLocationError,
            {
                enableHighAccuracy: true,
                maximumAge: LOCATION_MAX_AGE,
                timeout: 15000
            }
        );
    }

    function handleLocationSuccess(position) {
        var latitude = Number(position.coords.latitude);
        var longitude = Number(position.coords.longitude);
        var accuracy = Number(position.coords.accuracy) || 0;

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return;
        }

        var agora = Date.now();

        var distancia = lastSentLatitude === null
            ? Infinity
            : calculateDistanceMeters(
                lastSentLatitude,
                lastSentLongitude,
                latitude,
                longitude
            );

        var passouTempo =
            agora - lastLocationSentAt >= LOCATION_MIN_INTERVAL;

        if (
            lastSentLatitude !== null &&
            !passouTempo &&
            distancia < LOCATION_MIN_DISTANCE
        ) {
            return;
        }

        if (!send({
            type: 'location',
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: position.timestamp
        })) {
            return;
        }

        lastLocationSentAt = agora;
        lastSentLatitude = latitude;
        lastSentLongitude = longitude;
    }

    function handleLocationError(error) {
        var mensagem = 'Não foi possível obter a localização.';

        if (error.code === error.PERMISSION_DENIED) {
            mensagem = 'A localização não foi autorizada.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
            mensagem = 'A localização não está disponível.';
        } else if (error.code === error.TIMEOUT) {
            mensagem = 'A localização demorou demasiado tempo.';
        }

        console.warn(mensagem, error);
        mostrarMensagemTemporaria(mensagem, 'erro');
    }

    function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
        var raio = 6371000;
        var latitude1 = toRadians(lat1);
        var latitude2 = toRadians(lat2);
        var diferencaLatitude = toRadians(lat2 - lat1);
        var diferencaLongitude = toRadians(lng2 - lng1);

        var a =
            Math.sin(diferencaLatitude / 2) ** 2 +
            Math.cos(latitude1) *
            Math.cos(latitude2) *
            Math.sin(diferencaLongitude / 2) ** 2;

        return raio * 2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
    }

    function toRadians(valor) {
        return valor * Math.PI / 180;
    }

    function scheduleReconnect() {
        if (reconnectTimer || !navigator.onLine) return;

        reconnectAttempts++;

        var atraso = Math.min(
            RECONNECT_MIN_DELAY * Math.pow(2, reconnectAttempts - 1),
            RECONNECT_MAX_DELAY
        );

        atraso += Math.floor(Math.random() * 1000);

        reconnectTimer = window.setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, atraso);
    }

    function handleMessage(evento) {
        var data;

        try {
            data = JSON.parse(evento.data);
        } catch (erro) {
            console.error('JSON inválido recebido:', evento.data);
            return;
        }

        if (!data || typeof data !== 'object') return;

        switch (data.type) {
            case 'connected':
                break;

            case 'authenticated':
                console.log('WebSocket autenticado:', data.membro_id);
                break;

            case 'location_received':
                break;

            case 'state':
                if (document.getElementById('gridCanvas')) {
                    atualizarPessoasNoMapa(
                        Array.isArray(data.people) ? data.people : []
                    );
                }
                break;

            case 'notification':
                window.dispatchEvent(new CustomEvent(
                    'app:hey-recebido',
                    { detail: data }
                ));
                break;

            case 'notification_sent':
                window.dispatchEvent(new CustomEvent(
                    'app:hey-enviado',
                    { detail: data }
                ));
                break;

            case 'notification_not_delivered':
                window.dispatchEvent(new CustomEvent(
                    'app:hey-erro',
                    { detail: data }
                ));
                break;

            case 'chat_message':
                window.dispatchEvent(new CustomEvent(
                    'app:chat-message',
                    { detail: data }
                ));

                atualizarBadgeMensagens(
                    Number(data.unread_count) || 0
                );

                if (
                    data.message &&
                    String(data.message.destinatario_id) ===
                        String(window.membroId) &&
                    String(window.chatMembroId || '') !==
                        String(data.message.emissor_id)
                ) {
                    mostrarNotificacaoMensagem(data.message);
                }
                break;

            case 'chat_messages_read':
                window.dispatchEvent(new CustomEvent(
                    'app:chat-messages-read',
                    { detail: data }
                ));
                break;

            case 'chat_unread_count':
                atualizarBadgeMensagens(
                    Number(data.unread_count) || 0
                );

                window.dispatchEvent(new CustomEvent(
                    'app:chat-unread-count',
                    { detail: data }
                ));
                break;

            case 'chat_error':
                window.dispatchEvent(new CustomEvent(
                    'app:chat-error',
                    { detail: data }
                ));

                mostrarMensagemTemporaria(
                    data.message ||
                    'Não foi possível atualizar a conversa.',
                    'erro'
                );
                break;

            case 'pong':
                break;

            case 'error':
                console.error('Erro do servidor:', data.message);

                mostrarMensagemTemporaria(
                    data.message || 'Ocorreu um erro.',
                    'erro'
                );
                break;

            default:
                console.warn(
                    'Mensagem WebSocket desconhecida:',
                    data
                );
        }
    }

    function atualizarPessoasNoMapa(pessoas) {
        var idsAtuais = pessoas.map(function (pessoa) {
            return String(pessoa.id);
        });

        $('.foto').each(function () {
            var $foto = $(this);
            var id = String($foto.attr('id') || '');

            if (
                idsAtuais.includes(id) ||
                $foto.hasClass('a-remover')
            ) {
                return;
            }

            $foto.addClass('a-remover').css({
                opacity: '0',
                transition: 'opacity 0.4s ease-out'
            });

            window.setTimeout(function () {
                $foto.remove();
                reinicializarFotos();
            }, 400);
        });

        var fragmento = document.createDocumentFragment();
        var inseriuImagem = false;

        pessoas.forEach(function (pessoa) {
            if (!pessoa || pessoa.id === undefined) return;

            var id = String(pessoa.id);
            var src = String(pessoa.src || '').trim();

            if (!src) {
                src = '/imagens/fotos-perfil/default.webp';
            }

            var imagemExistente = document.getElementById(id);

            if (imagemExistente) {
                $(imagemExistente).removeClass('a-remover').attr({
                    'data-top': Number(pessoa.top) || 0,
                    'data-left': Number(pessoa.left) || 0,
                    'data-membro-id': pessoa.membro_id || '',
                    'data-nome': pessoa.nome || '',
                    'data-distancia': Number(pessoa.distance_m) || 0,
                    src: src,
                    alt: pessoa.nome || 'Foto de perfil'
                }).css('opacity', '1');

                return;
            }

            inseriuImagem = true;

            var $imagem = $('<img>', {
                id: id,
                class: 'foto',
                src: src,
                alt: pessoa.nome || 'Foto de perfil'
            });

            $imagem.attr({
                'data-top': Number(pessoa.top) || 0,
                'data-left': Number(pessoa.left) || 0,
                'data-membro-id': pessoa.membro_id || '',
                'data-nome': pessoa.nome || '',
                'data-distancia': Number(pessoa.distance_m) || 0
            });

            $imagem.css({
                opacity: '0',
                transition: 'opacity 0.4s ease-out'
            });

            $imagem[0].decoding = 'async';

            $imagem.on('load', function () {
                $(this).css('opacity', '1');
            });

            $imagem.on('error', function () {
                if (this.dataset.fallbackAplicado === '1') {
                    $(this).css('opacity', '1');
                    return;
                }

                this.dataset.fallbackAplicado = '1';
                this.src = '/imagens/fotos-perfil/default.webp';
            });

            fragmento.appendChild($imagem[0]);
        });

        if (inseriuImagem) {
            document.body.appendChild(fragmento);
        }

        reinicializarFotos();
    }

    function reinicializarFotos() {
        window.clearTimeout(window.mapInitTimeout);

        window.mapInitTimeout = window.setTimeout(function () {
            if (typeof window.inicializarFotos === 'function') {
                window.inicializarFotos();
            }
        }, 50);
    }

    function mostrarMensagemTemporaria(mensagem, tipo) {
        $('.mensagem-websocket').remove();

        var $mensagem = $('<div>', {
            class:
                'mensagem-websocket ' +
                (tipo === 'erro' ? 'erro' : 'sucesso')
        }).text(mensagem);

        $('body').append($mensagem);

        window.requestAnimationFrame(function () {
            $mensagem.addClass('visivel');
        });

        window.setTimeout(function () {
            $mensagem.removeClass('visivel');

            window.setTimeout(function () {
                $mensagem.remove();
            }, 300);
        }, 3000);
    }

    function atualizarBadgeMensagens(total) {
        var $link = $('#menuPrincipal a[href*="messages"]').first();

        if (!$link.length) return;

        var $badge = $link.find('.mensagens-badge');

        if (!$badge.length) {
            $badge = $('<span>', {
                class: 'mensagens-badge'
            }).appendTo($link);
        }

        $badge
            .text(total > 99 ? '99+' : total)
            .prop('hidden', total < 1);
    }

    function mostrarNotificacaoMensagem(mensagem) {
        var nome = String(
            mensagem.emissor_nome || 'Alguém'
        );

        var resumo = String(
            mensagem.texto || ''
        ).trim();

        if (!resumo) {
            resumo = mensagem.tipo === 'imagem'
                ? 'Enviou-te uma fotografia.'
                : 'Enviou-te um vídeo.';
        }

        mostrarMensagemTemporaria(
            'Nova mensagem de ' + nome,
            'sucesso'
        );

        if (
            !window.isSecureContext ||
            !('Notification' in window) ||
            Notification.permission !== 'granted'
        ) {
            return;
        }

        try {
            var notificacao = new Notification(
                'Nova mensagem de ' + nome,
                {
                    body: resumo,
                    icon:
                        mensagem.emissor_foto_url ||
                        '/imagens/fotos-perfil/default.webp',
                    tag:
                        'chat-' +
                        String(
                            mensagem.emissor_id ||
                            'desconhecido'
                        )
                }
            );

            notificacao.onclick = function () {
                window.focus();

                window.location.href =
                    String(
                        window.messagesUrl ||
                        '/messages'
                    ).replace(/\/+$/, '') +
                    '/' +
                    encodeURIComponent(
                        mensagem.emissor_id
                    );

                notificacao.close();
            };
        } catch (erro) {
            console.error(
                'Erro ao mostrar notificação de mensagem:',
                erro
            );
        }
    }

    function setStatus(status) {
        document.documentElement.setAttribute(
            'data-websocket-status',
            status
        );

        $(document).trigger(
            'websocket:status',
            [status]
        );
    }

    function clearReconnectTimer() {
        if (!reconnectTimer) return;

        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    function clearConnectionTimeout() {
        if (!connectionTimeout) return;

        window.clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }

    function clearPingTimer() {
        if (!pingTimer) return;

        window.clearInterval(pingTimer);
        pingTimer = null;
    }

    window.AppWebSocket = {
        connect: connect,
        send: send,
        startLocationTracking: startLocationTracking,

        isConnected: function () {
            return Boolean(
                socket &&
                socket.readyState === WebSocket.OPEN
            );
        }
    };

    window.mostrarMensagemTemporaria =
        mostrarMensagemTemporaria;

    window.addEventListener('online', function () {
        reconnectAttempts = 0;
        connect();
    });

    window.addEventListener('offline', function () {
        setStatus('offline');
    });

    window.addEventListener('focus', function () {
        if (!window.AppWebSocket.isConnected()) {
            connect();
        }
    });

    window.addEventListener('pageshow', function () {
        if (!window.AppWebSocket.isConnected()) {
            connect();
        }
    });

    document.addEventListener(
        'visibilitychange',
        function () {
            if (
                document.visibilityState === 'visible' &&
                !window.AppWebSocket.isConnected()
            ) {
                connect();
            }
        }
    );

    $(function () {
        connect();
    });
})(window, document, jQuery);