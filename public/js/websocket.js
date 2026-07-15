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
        if (window.webSocketUrl) {
            return window.webSocketUrl;
        }

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
            (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        clearReconnectTimer();
        clearConnectionTimeout();
        clearPingTimer();

        setStatus('connecting');

        var url = getWebSocketUrl();

        console.log('A tentar ligar ao WebSocket:', url);

        try {
            socket = new WebSocket(url);
        } catch (error) {
            console.error('Erro ao criar WebSocket:', error);

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
            if (currentSocket !== socket) {
                return;
            }

            console.log('WebSocket ligado');

            clearConnectionTimeout();
            reconnectAttempts = 0;

            setStatus('connected');
            authenticate();
            startPing();
            startLocationTracking();
        };

        currentSocket.onmessage = function (event) {
            if (currentSocket !== socket) {
                return;
            }

            handleMessage(event);
        };

        currentSocket.onerror = function (event) {
            if (currentSocket !== socket) {
                return;
            }

            console.error('Erro no WebSocket:', event);
        };

        currentSocket.onclose = function (event) {
            if (currentSocket !== socket) {
                return;
            }

            console.warn('WebSocket fechado:', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
            });

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

        if (membroId === '') {
            console.error('window.membroId não está definido.');

            return;
        }

        send({
            type: 'auth',
            membro_id: membroId,
        });
    }

    function send(data) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);

            return false;
        }
    }

    function startPing() {
        clearPingTimer();

        pingTimer = window.setInterval(function () {
            send({
                type: 'ping',
                timestamp: Date.now(),
            });
        }, PING_INTERVAL);
    }

    function startLocationTracking() {
        if (locationWatchId !== null) {
            return;
        }

        if (!window.isSecureContext) {
            mostrarMensagemTemporaria('A localização exige HTTPS.', 'erro');

            console.warn('Geolocation indisponível: a página não está em HTTPS.');

            return;
        }

        if (!('geolocation' in navigator)) {
            mostrarMensagemTemporaria('Este dispositivo não suporta localização.', 'erro');

            return;
        }

        locationWatchId = navigator.geolocation.watchPosition(
            handleLocationSuccess,
            handleLocationError,
            {
                enableHighAccuracy: true,
                maximumAge: LOCATION_MAX_AGE,
                timeout: 15000,
            },
        );
    }

    function handleLocationSuccess(position) {
        var latitude = Number(position.coords.latitude);

        var longitude = Number(position.coords.longitude);

        var accuracy = Number(position.coords.accuracy) || 0;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        var now = Date.now();

        var movedDistance =
            lastSentLatitude === null
                ? Infinity
                : calculateDistanceMeters(lastSentLatitude, lastSentLongitude, latitude, longitude);

        var enoughTimePassed = now - lastLocationSentAt >= LOCATION_MIN_INTERVAL;

        var movedEnough = movedDistance >= LOCATION_MIN_DISTANCE;

        if (lastSentLatitude !== null && !enoughTimePassed && !movedEnough) {
            return;
        }

        var sent = send({
            type: 'location',
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: position.timestamp,
        });

        if (!sent) {
            return;
        }

        lastLocationSentAt = now;
        lastSentLatitude = latitude;
        lastSentLongitude = longitude;

        console.log('Localização enviada:', {
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            movedDistance: movedDistance,
        });
    }

    function handleLocationError(error) {
        var message;

        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = 'A localização não foi autorizada.';
                break;

            case error.POSITION_UNAVAILABLE:
                message = 'A localização não está disponível.';
                break;

            case error.TIMEOUT:
                message = 'A localização demorou demasiado tempo.';
                break;

            default:
                message = 'Não foi possível obter a localização.';
                break;
        }

        console.warn(message, error);

        mostrarMensagemTemporaria(message, 'erro');
    }

    function calculateDistanceMeters(latitude1, longitude1, latitude2, longitude2) {
        var earthRadius = 6371000;

        var lat1 = toRadians(latitude1);
        var lat2 = toRadians(latitude2);

        var deltaLat = toRadians(latitude2 - latitude1);

        var deltaLng = toRadians(longitude2 - longitude1);

        var a =
            Math.sin(deltaLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return earthRadius * c;
    }

    function toRadians(degrees) {
        return (degrees * Math.PI) / 180;
    }

    function scheduleReconnect() {
        if (reconnectTimer || !navigator.onLine) {
            return;
        }

        reconnectAttempts++;

        var delay = Math.min(
            RECONNECT_MIN_DELAY * Math.pow(2, reconnectAttempts - 1),
            RECONNECT_MAX_DELAY,
        );

        delay += Math.floor(Math.random() * 1000);

        console.log('Nova tentativa WebSocket em ' + delay + ' ms');

        reconnectTimer = window.setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, delay);
    }

    function handleMessage(event) {
        var data;

        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.error('JSON inválido recebido:', event.data);

            return;
        }

        if (!data || typeof data !== 'object') {
            return;
        }

        switch (data.type) {
            case 'connected':
                break;

            case 'authenticated':
                console.log('WebSocket autenticado:', data.membro_id);
                break;

            case 'location_received':
                break;

            case 'state':
                atualizarPessoasNoMapa(Array.isArray(data.people) ? data.people : []);
                break;

            case 'notification':
                window.dispatchEvent(
                    new CustomEvent(
                        'app:hey-recebido',
                        {
                            detail: data
                        }
                    )
                );
                break;

            case 'notification_sent':
                window.dispatchEvent(
                    new CustomEvent(
                        'app:hey-enviado',
                        {
                            detail: data
                        }
                    )
                );
                break;

            case 'notification_not_delivered':
                window.dispatchEvent(
                    new CustomEvent(
                        'app:hey-erro',
                        {
                            detail: data
                        }
                    )
                );
                break;

            case 'pong':
                break;

            case 'error':
                console.error('Erro do servidor:', data.message);

                mostrarMensagemTemporaria(data.message || 'Ocorreu um erro.', 'erro');
                break;

            default:
                console.warn('Mensagem WebSocket desconhecida:', data);
                break;
        }
    }

    function atualizarPessoasNoMapa(pessoas) {
        var idsAtuais = pessoas.map(function (pessoa) {
            return String(pessoa.id);
        });

        $('.foto').each(function () {
            var $foto = $(this);
            var id = String($foto.attr('id') || '');

            if (idsAtuais.includes(id) || $foto.hasClass('a-remover')) {
                return;
            }

            $foto.addClass('a-remover');

            $foto.css({
                opacity: '0',
                transition: 'opacity 0.4s ease-out',
            });

            window.setTimeout(function () {
                $foto.remove();
                reinicializarFotos();
            }, 400);
        });

        var fragmento = document.createDocumentFragment();

        var inseriuImagem = false;

        pessoas.forEach(function (pessoa) {
            if (!pessoa || pessoa.id === undefined) {
                return;
            }

            var id = String(pessoa.id);

            var src = String(pessoa.src || '').trim();

            if (src === '') {
                src = '/imagens/fotos-perfil/default.webp';
            }

            var imagemExistente = document.getElementById(id);

            if (imagemExistente) {
                $(imagemExistente)
                    .removeClass('a-remover')
                    .attr({
                        'data-top': Number(pessoa.top) || 0,
                        'data-left': Number(pessoa.left) || 0,
                        'data-membro-id': pessoa.membro_id || '',
                        'data-nome': pessoa.nome || '',
                        'data-distancia': Number(pessoa.distance_m) || 0,
                        src: src,
                        alt: pessoa.nome || 'Foto de perfil',
                    })
                    .css('opacity', '1');

                return;
            }

            inseriuImagem = true;

            var $imagem = $('<img>', {
                id: id,
                class: 'foto',
                src: src,
                alt: pessoa.nome || 'Foto de perfil',
            });

            $imagem.attr({
                'data-top': Number(pessoa.top) || 0,
                'data-left': Number(pessoa.left) || 0,
                'data-membro-id': pessoa.membro_id || '',
                'data-nome': pessoa.nome || '',
                'data-distancia': Number(pessoa.distance_m) || 0,
            });

            $imagem.css({
                opacity: '0',
                transition: 'opacity 0.4s ease-out',
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

    function mostrarNotificacao(data) {
        mostrarNotificacaoInterna(data);

        if (
            !window.isSecureContext ||
            !('Notification' in window) ||
            Notification.permission !== 'granted'
        ) {
            return;
        }

        try {
            var notificacao = new Notification(data.title || 'Nova notificação', {
                body: data.body || '',
                icon: data.from_photo || '/imagens/fotos-perfil/default.webp',
                tag: 'hey-' + (data.from_member_id || 'desconhecido'),
            });

            notificacao.onclick = function () {
                window.focus();
                notificacao.close();
            };
        } catch (error) {
            console.error('Erro ao mostrar notificação:', error);
        }
    }

    function mostrarNotificacaoInterna(data) {
        $('.notificacao-interna').remove();

        var $notificacao = $('<button>', {
            type: 'button',
            class: 'notificacao-interna',
            'data-membro-id': data.from_member_id || '',
        });

        var $imagem = $('<img>', {
            src: data.from_photo || '/imagens/fotos-perfil/default.webp',
            alt: '',
        });

        var $conteudo = $('<div>', {
            class: 'notificacao-interna-conteudo',
        });

        $conteudo.append(
            $('<strong>').text(data.title || 'Nova notificação'),
            $('<span>').text(data.body || 'Recebeste um Hey.'),
        );

        $notificacao.append($imagem, $conteudo);

        $('body').append($notificacao);

        window.requestAnimationFrame(function () {
            $notificacao.addClass('visivel');
        });

        window.setTimeout(function () {
            $notificacao.removeClass('visivel');

            window.setTimeout(function () {
                $notificacao.remove();
            }, 300);
        }, 5000);
    }

    function mostrarMensagemTemporaria(mensagem, tipo) {
        $('.mensagem-websocket').remove();

        var $mensagem = $('<div>', {
            class: 'mensagem-websocket ' + (tipo === 'erro' ? 'erro' : 'sucesso'),
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

    function setStatus(status) {
        document.documentElement.setAttribute('data-websocket-status', status);

        $(document).trigger('websocket:status', [status]);
    }

    function clearReconnectTimer() {
        if (!reconnectTimer) {
            return;
        }

        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    function clearConnectionTimeout() {
        if (!connectionTimeout) {
            return;
        }

        window.clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }

    function clearPingTimer() {
        if (!pingTimer) {
            return;
        }

        window.clearInterval(pingTimer);
        pingTimer = null;
    }

    window.AppWebSocket = {
        connect: connect,
        send: send,
        startLocationTracking: startLocationTracking,

        isConnected: function () {
            return Boolean(socket && socket.readyState === WebSocket.OPEN);
        },
    };

    window.mostrarMensagemTemporaria = mostrarMensagemTemporaria;

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

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && !window.AppWebSocket.isConnected()) {
            connect();
        }
    });

    $(function () {
        connect();
    });
})(window, document, jQuery);