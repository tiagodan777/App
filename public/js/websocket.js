(function (window, document, $) {
    'use strict';

    if (window.AppWebSocket) return;

    var socket = null;
    var tokenRequest = null;
    var authenticated = false;
    var sessionEnded = false;
    var reconnectTimer = null;
    var connectionTimeout = null;
    var pingTimer = null;
    var locationRefreshTimer = null;
    var reconnectAttempts = 0;
    var locationWatchId = null;
    var locationWatchProvider = null;
    var locationWatchStarting = false;
    var locationWatchGeneration = 0;
    var locationRequestPending = false;
    var locationTrackingStartedAt = 0;
    var lastLocationErrorAt = 0;
    var lastLocationSentAt = 0;
    var lastSentLatitude = null;
    var lastSentLongitude = null;
    var lastKnownLocation = null;
    var photoRemovalTimers = Object.create(null);
    var latestPeople = [];
    var notifiedMessageIds = new Set();
    var notifiedMessageOrder = [];

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;
    var CONNECTION_TIMEOUT = 12000;
    var PING_INTERVAL = 20000;
    var LOCATION_MIN_INTERVAL = 15000;
    var LOCATION_REFRESH_INTERVAL = 45000;
    var LOCATION_MIN_DISTANCE = 5;
    var LOCATION_MAX_AGE = 10000;
    var LOCATION_TIMEOUT = 30000;
    var LOCATION_ERROR_COOLDOWN = 30000;
    var LOCATION_STARTUP_GRACE = 60000;
    var MAX_NOTIFIED_MESSAGE_IDS = 200;

    function rememberNotifiedMessage(messageId) {
        messageId = Number(messageId) || 0;

        if (messageId < 1) {
            return true;
        }

        if (notifiedMessageIds.has(messageId)) {
            return false;
        }

        notifiedMessageIds.add(messageId);
        notifiedMessageOrder.push(messageId);

        while (notifiedMessageOrder.length > MAX_NOTIFIED_MESSAGE_IDS) {
            notifiedMessageIds.delete(notifiedMessageOrder.shift());
        }

        return true;
    }

    function aplicarPreferenciasGuardadas() {
        if (window.MargotPreferencias) {
            window.MargotPreferencias.aplicar();
            return;
        }

        try {
            var preferencias = JSON.parse(
                window.localStorage.getItem('margot-preferencias-v1') || '{}'
            );

            window.disableLocationTracking = preferencias.localizacao === false;
            window.disableNotifications = preferencias.notificacoes === false;
            window.margotInvisible = preferencias.invisivel === true;
            window.disableMapPresence =
                window.disableLocationTracking || window.margotInvisible;
        } catch (erro) {
            window.disableLocationTracking = false;
            window.disableNotifications = false;
            window.margotInvisible = false;
            window.disableMapPresence = false;
        }
    }

    aplicarPreferenciasGuardadas();

    function localizacaoEstaAtiva() {
        return window.disableLocationTracking !== true;
    }

    function modoInvisivelEstaAtivo() {
        return window.margotInvisible === true;
    }

    function deveAparecerNoMapa() {
        return localizacaoEstaAtiva() && !modoInvisivelEstaAtivo();
    }

    function obterEstadoPresenca() {
        return {
            location_enabled: localizacaoEstaAtiva(),
            map_presence: deveAparecerNoMapa()
        };
    }

    function getWebSocketUrl() {
        if (window.webSocketUrl) return window.webSocketUrl;

        var protocol =
            window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        return protocol + '//' + window.location.hostname + ':8080';
    }

    function getWebSocketTokenUrl() {
        return String(window.webSocketTokenUrl || '/websocket-token');
    }

    function requestWebSocketToken() {
        return window.fetch(getWebSocketTokenUrl(), {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(function (response) {
            return response.json().catch(function () {
                return {};
            }).then(function (data) {
                if (response.status === 401) {
                    var sessionError = new Error('A sessão terminou.');

                    sessionError.sessionEnded = true;

                    throw sessionError;
                }

                if (!response.ok || data.success !== true) {
                    throw new Error(
                        data.message ||
                        'Não foi possível preparar a ligação.'
                    );
                }

                var token = String(data.token || '').trim();

                if (!/^[a-f0-9]{64}$/i.test(token)) {
                    throw new Error(
                        'O servidor devolveu um token de ligação inválido.'
                    );
                }

                return token;
            });
        });
    }

    function connect() {
        if (sessionEnded) return;

        if (!navigator.onLine) {
            setStatus('offline');
            return;
        }

        if (tokenRequest) return;

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

        authenticated = false;

        setStatus('connecting');

        tokenRequest = requestWebSocketToken();

        tokenRequest.then(function (token) {
            tokenRequest = null;

            if (sessionEnded || !navigator.onLine) return;

            openSocket(token);
        }).catch(function (erro) {
            tokenRequest = null;

            if (erro.sessionEnded) {
                sessionEnded = true;

                setStatus('unauthenticated');
                stopLocationTracking();

                window.location.assign(
                    String(window.loginUrl || '/login/')
                );

                return;
            }

            console.error('Erro ao obter token WebSocket:', erro);

            setStatus(
                navigator.onLine ? 'disconnected' : 'offline'
            );

            scheduleReconnect();
        });
    }

    function openSocket(token) {
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
            if (currentSocket === socket && !authenticated) {
                currentSocket.close();
            }
        }, CONNECTION_TIMEOUT);

        currentSocket.onopen = function () {
            if (currentSocket !== socket) return;

            authenticate(token);
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
            stopLocationTracking();

            authenticated = false;
            socket = null;
            window.ws = null;

            setStatus(
                navigator.onLine ? 'disconnected' : 'offline'
            );

            scheduleReconnect();
        };
    }

    function authenticate(token) {
        var estadoPresenca = obterEstadoPresenca();

        sendRaw({
            type: 'auth',
            token: token,
            location_enabled: estadoPresenca.location_enabled,
            map_presence: estadoPresenca.map_presence
        });
    }

    function sendRaw(data) {
        if (
            !socket ||
            socket.readyState !== WebSocket.OPEN
        ) {
            return false;
        }

        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (erro) {
            console.error('Erro ao enviar mensagem:', erro);
            return false;
        }
    }

    function send(data) {
        if (!authenticated) return false;

        return sendRaw(data);
    }

    function sendPresenceState() {
        var estadoPresenca = obterEstadoPresenca();

        return send({
            type: 'presence_update',
            location_enabled: estadoPresenca.location_enabled,
            map_presence: estadoPresenca.map_presence
        });
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
        if (
            window.disableLocationTracking ||
            document.visibilityState !== 'visible'
        ) return;
        if (locationWatchId !== null || locationWatchStarting) return;

        var nativeGeolocation = getNativeGeolocation();

        if (isNativeApp()) {
            if (!nativeGeolocation) {
                mostrarMensagemTemporaria(
                    'A localização nativa não está disponível.',
                    'erro'
                );

                return;
            }

            locationWatchStarting = true;
            locationTrackingStartedAt = Date.now();

            var generation = ++locationWatchGeneration;

            nativeGeolocation.watchPosition(
                getLocationOptions(),
                function (position, error) {
                    if (
                        generation !== locationWatchGeneration ||
                        window.disableLocationTracking
                    ) {
                        return;
                    }

                    if (error) {
                        handleLocationError(error);
                        return;
                    }

                    if (position) {
                        handleLocationSuccess(position);
                    }
                }
            ).then(function (watchId) {
                if (
                    generation !== locationWatchGeneration ||
                    window.disableLocationTracking
                ) {
                    return nativeGeolocation.clearWatch({
                        id: String(watchId)
                    }).catch(function (error) {
                        console.warn(
                            'Não foi possível terminar a localização nativa.',
                            error
                        );
                    });
                }

                locationWatchId = String(watchId);
                locationWatchProvider = 'native';
                locationWatchStarting = false;
            }).catch(function (error) {
                if (generation !== locationWatchGeneration) return;

                locationWatchId = null;
                locationWatchProvider = null;
                locationWatchStarting = false;
                handleLocationError(error);
            });

            return;
        }

        if (!window.isSecureContext) {
            mostrarMensagemTemporaria(
                'A localização exige HTTPS.',
                'erro'
            );

            return;
        }

        if (!('geolocation' in navigator)) {
            mostrarMensagemTemporaria(
                'Este dispositivo não suporta localização.',
                'erro'
            );

            return;
        }

        locationTrackingStartedAt = Date.now();
        locationWatchProvider = 'web';
        locationWatchId = navigator.geolocation.watchPosition(
            handleLocationSuccess,
            handleLocationError,
            getLocationOptions()
        );
    }

    function requestCurrentLocation() {
        if (
            window.disableLocationTracking ||
            document.visibilityState !== 'visible' ||
            locationRequestPending
        ) {
            return;
        }

        var nativeGeolocation = getNativeGeolocation();

        if (isNativeApp()) {
            if (!nativeGeolocation) {
                mostrarMensagemTemporaria(
                    'A localização nativa não está disponível.',
                    'erro'
                );

                return;
            }

            locationRequestPending = true;

            nativeGeolocation.getCurrentPosition(
                getLocationOptions()
            ).then(function (position) {
                locationRequestPending = false;
                handleLocationSuccess(position);
            }).catch(function (error) {
                locationRequestPending = false;
                handleLocationError(error);
            });

            return;
        }

        if (
            !window.isSecureContext ||
            !('geolocation' in navigator)
        ) {
            return;
        }

        locationRequestPending = true;

        navigator.geolocation.getCurrentPosition(
            function (position) {
                locationRequestPending = false;
                handleLocationSuccess(position);
            },
            function (error) {
                locationRequestPending = false;
                handleLocationError(error);
            },
            getLocationOptions()
        );
    }

    function isNativeApp() {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform()
        );
    }

    var nativeGeolocationPlugin = null;

    function getNativeGeolocation() {
        if (!isNativeApp() || !window.Capacitor) {
            return null;
        }

        if (nativeGeolocationPlugin) {
            return nativeGeolocationPlugin;
        }

        var plugins = window.Capacitor.Plugins || {};

        if (plugins.Geolocation) {
            nativeGeolocationPlugin = plugins.Geolocation;
            return nativeGeolocationPlugin;
        }

        if (typeof window.Capacitor.registerPlugin === 'function') {
            nativeGeolocationPlugin =
                window.Capacitor.registerPlugin('Geolocation');

            return nativeGeolocationPlugin;
        }

        return null;
    }

    function getLocationOptions() {
        return {
            enableHighAccuracy: true,
            maximumAge: LOCATION_MAX_AGE,
            timeout: LOCATION_TIMEOUT
        };
    }

    function startLocationRefresh() {
        clearLocationRefreshTimer();

        locationRefreshTimer = window.setInterval(function () {
            if (
                document.visibilityState !== 'visible' ||
                window.disableLocationTracking
            ) {
                return;
            }

            sendLastKnownLocation();
        }, LOCATION_REFRESH_INTERVAL);
    }

    function stopLocationTracking() {
        var watchId = locationWatchId;
        var watchProvider = locationWatchProvider;
        var nativeGeolocation = getNativeGeolocation();

        locationWatchGeneration += 1;
        locationWatchId = null;
        locationWatchProvider = null;
        locationWatchStarting = false;

        if (
            watchId !== null &&
            watchProvider === 'native' &&
            nativeGeolocation
        ) {
            nativeGeolocation.clearWatch({
                id: String(watchId)
            }).catch(function (error) {
                console.warn(
                    'Não foi possível terminar a localização nativa.',
                    error
                );
            });
        } else if (
            watchId !== null &&
            watchProvider === 'web' &&
            navigator.geolocation
        ) {
            navigator.geolocation.clearWatch(watchId);
        }

        clearLocationRefreshTimer();

        locationRequestPending = false;
        locationTrackingStartedAt = 0;
        lastLocationErrorAt = 0;
        lastLocationSentAt = 0;
        lastSentLatitude = null;
        lastSentLongitude = null;
        lastKnownLocation = null;
    }

    function handleLocationSuccess(position) {
        if (window.disableLocationTracking) return;
        if (!position || !position.coords) return;

        var latitude = Number(position.coords.latitude);
        var longitude = Number(position.coords.longitude);
        var accuracy = Number(position.coords.accuracy) || 0;

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return;
        }

        lastKnownLocation = {
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: Number(position.timestamp) || Date.now()
        };

        lastLocationErrorAt = 0;

        var agora = Date.now();

        var distancia =
            lastSentLatitude === null
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

        sendLastKnownLocation();
    }

    function sendLastKnownLocation() {
        if (
            !lastKnownLocation ||
            window.disableLocationTracking
        ) {
            return false;
        }

        if (!send({
            type: 'location',
            latitude: lastKnownLocation.latitude,
            longitude: lastKnownLocation.longitude,
            accuracy: lastKnownLocation.accuracy,
            timestamp: lastKnownLocation.timestamp
        })) {
            return false;
        }

        lastLocationSentAt = Date.now();
        lastSentLatitude = lastKnownLocation.latitude;
        lastSentLongitude = lastKnownLocation.longitude;

        return true;
    }

    function handleLocationError(error) {
        if (window.disableLocationTracking) return;

        var code = error && error.code;
        var errorMessage = String(
            error && error.message ? error.message : ''
        ).toLowerCase();
        var mensagem = 'Não foi possível obter a localização.';
        var permissionDenied =
            code === 1 ||
            code === 'OS-PLUG-GLOC-0003' ||
            code === 'OS-PLUG-GLOC-0004' ||
            errorMessage.includes('permission denied') ||
            errorMessage.includes('not authorized');
        var positionUnavailable =
            code === 2 ||
            code === 'OS-PLUG-GLOC-0002' ||
            code === 'OS-PLUG-GLOC-0007' ||
            code === 'OS-PLUG-GLOC-0008' ||
            code === 'OS-PLUG-GLOC-0017';
        var timedOut =
            code === 3 ||
            code === 'OS-PLUG-GLOC-0010' ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('timed out');

        if (permissionDenied) {
            mensagem = 'A localização não foi autorizada.';
        } else if (positionUnavailable) {
            mensagem = 'A localização não está disponível.';
        } else if (timedOut) {
            mensagem = 'A localização demorou demasiado tempo.';

            if (
                lastKnownLocation ||
                (
                    locationTrackingStartedAt > 0 &&
                    Date.now() - locationTrackingStartedAt <
                        LOCATION_STARTUP_GRACE
                )
            ) {
                console.warn(
                    'A atualização pontual da localização expirou; foi mantida a última posição válida.',
                    error
                );

                return;
            }
        }

        console.warn(mensagem, error);

        if (
            lastLocationErrorAt > 0 &&
            Date.now() - lastLocationErrorAt <
                LOCATION_ERROR_COOLDOWN
        ) {
            return;
        }

        lastLocationErrorAt = Date.now();
        mostrarMensagemTemporaria(mensagem, 'erro');
    }

    function calculateDistanceMeters(
        lat1,
        lng1,
        lat2,
        lng2
    ) {
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

        return raio *
            2 *
            Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            );
    }

    function toRadians(valor) {
        return valor * Math.PI / 180;
    }

    function scheduleReconnect() {
        if (
            sessionEnded ||
            reconnectTimer ||
            !navigator.onLine
        ) {
            return;
        }

        reconnectAttempts++;

        var atraso = Math.min(
            RECONNECT_MIN_DELAY *
            Math.pow(2, reconnectAttempts - 1),
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
            console.error(
                'JSON inválido recebido:',
                evento.data
            );

            return;
        }

        if (!data || typeof data !== 'object') return;

        switch (data.type) {
            case 'connected':
                break;

            case 'authenticated':
                authenticated = true;

                clearConnectionTimeout();

                reconnectAttempts = 0;

                setStatus('connected');
                startPing();

                if (
                    !window.disableLocationTracking &&
                    document.visibilityState === 'visible'
                ) {
                    startLocationTracking();
                    startLocationRefresh();
                    requestCurrentLocation();
                }

                console.log(
                    'WebSocket autenticado:',
                    data.membro_id
                );

                if (data.location_enabled === false) {
                    limparMapaLocal();
                } else if (data.map_presence === false) {
                    removerPropriaFotoDoMapa();
                }

                break;

            case 'location_received':
                break;

            case 'presence_updated':
                if (data.location_enabled === false) {
                    limparMapaLocal();
                } else if (data.map_presence === false) {
                    removerPropriaFotoDoMapa();
                }

                window.dispatchEvent(
                    new CustomEvent(
                        'app:map-presence-updated',
                        {
                            detail: data
                        }
                    )
                );

                break;

            case 'state':
                if (document.getElementById('gridCanvas')) {
                    atualizarPessoasNoMapa(
                        window.disableLocationTracking
                            ? []
                            : (
                                Array.isArray(data.people)
                                    ? data.people
                                    : []
                            )
                    );
                }

                break;

            case 'notification':
                window.dispatchEvent(
                    new CustomEvent('app:hey-recebido', {
                        detail: data
                    })
                );

                break;

            case 'notification_sent':
                window.dispatchEvent(
                    new CustomEvent('app:hey-enviado', {
                        detail: data
                    })
                );

                break;

            case 'notification_not_delivered':
                window.dispatchEvent(
                    new CustomEvent('app:hey-erro', {
                        detail: data
                    })
                );

                break;

            case 'chat_message':
                window.dispatchEvent(
                    new CustomEvent('app:chat-message', {
                        detail: data
                    })
                );

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
                    var receivedMessageId = Number(data.message.id) || 0;

                    if (rememberNotifiedMessage(receivedMessageId)) {
                        mostrarNotificacaoMensagem(data.message);
                    }
                }

                break;

            case 'chat_messages_read':
                window.dispatchEvent(
                    new CustomEvent(
                        'app:chat-messages-read',
                        {
                            detail: data
                        }
                    )
                );

                break;

            case 'chat_unread_count':
                atualizarBadgeMensagens(
                    Number(data.unread_count) || 0
                );

                window.dispatchEvent(
                    new CustomEvent(
                        'app:chat-unread-count',
                        {
                            detail: data
                        }
                    )
                );

                break;

            case 'chat_error':
                window.dispatchEvent(
                    new CustomEvent('app:chat-error', {
                        detail: data
                    })
                );

                mostrarMensagemTemporaria(
                    data.message ||
                    'Não foi possível atualizar a conversa.',
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

    function removerPropriaFotoDoMapa() {
        var membroId = String(window.membroId || '').trim();

        if (!membroId) return;

        var imagem = document.getElementById(membroId);

        if (
            !imagem ||
            !imagem.classList.contains('foto')
        ) {
            return;
        }

        var $imagem = $(imagem);

        $imagem.addClass('a-remover').css({
            opacity: '0',
            transition: 'opacity 0.25s ease-out'
        });

        agendarRemocaoFoto(
            membroId,
            $imagem,
            260
        );
    }

    function limparMapaLocal() {
        if (!document.getElementById('gridCanvas')) return;

        atualizarPessoasNoMapa([]);
    }

    function atualizarPessoasNoMapa(pessoas) {
        latestPeople =
            Array.isArray(pessoas)
                ? pessoas.slice()
                : [];

        pessoas = latestPeople;

        var idsAtuais = pessoas.map(function (pessoa) {
            return String(pessoa.id);
        });

        $('.foto').each(function () {
            var $foto = $(this);
            var id = String($foto.attr('id') || '');

            if (idsAtuais.includes(id)) {
                cancelarRemocaoFoto(id);

                $foto
                    .removeClass('a-remover')
                    .css('opacity', '1');

                return;
            }

            if (
                $foto.hasClass('a-remover') &&
                photoRemovalTimers[id]
            ) {
                return;
            }

            $foto.addClass('a-remover').css({
                opacity: '0',
                transition: 'opacity 0.4s ease-out'
            });

            agendarRemocaoFoto(
                id,
                $foto,
                400
            );
        });

        var fragmento = document.createDocumentFragment();
        var inseriuImagem = false;

        pessoas.forEach(function (pessoa) {
            if (
                !pessoa ||
                pessoa.id === undefined
            ) {
                return;
            }

            var id = String(pessoa.id);
            var src = String(pessoa.src || '').trim();

            if (!src) {
                src =
                    '/imagens/fotos-perfil/default.webp';
            }

            var imagemExistente =
                document.getElementById(id);

            if (imagemExistente) {
                cancelarRemocaoFoto(id);

                $(imagemExistente)
                    .removeClass('a-remover')
                    .attr({
                        'data-top':
                            Number(pessoa.top) || 0,
                        'data-left':
                            Number(pessoa.left) || 0,
                        'data-membro-id':
                            pessoa.membro_id || '',
                        'data-nome':
                            pessoa.nome || '',
                        'data-distancia':
                            Number(pessoa.distance_m) || 0,
                        'data-profile-access-token':
                            pessoa.profile_access_token || '',
                        src: src,
                        alt:
                            pessoa.nome ||
                            'Foto de perfil'
                    })
                    .css('opacity', '1');

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
                    Number(pessoa.top) || 0,
                'data-left':
                    Number(pessoa.left) || 0,
                'data-membro-id':
                    pessoa.membro_id || '',
                'data-nome':
                    pessoa.nome || '',
                'data-distancia':
                    Number(pessoa.distance_m) || 0,
                'data-profile-access-token':
                    pessoa.profile_access_token || ''
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
                if (
                    this.dataset.fallbackAplicado === '1'
                ) {
                    $(this).css('opacity', '1');
                    return;
                }

                this.dataset.fallbackAplicado = '1';
                this.src =
                    '/imagens/fotos-perfil/default.webp';
            });

            fragmento.appendChild($imagem[0]);
        });

        if (inseriuImagem) {
            document.body.appendChild(fragmento);
        }

        reinicializarFotos();
    }

    function agendarRemocaoFoto(
        id,
        $foto,
        atraso
    ) {
        id = String(id || '');

        if (
            !id ||
            !$foto ||
            !$foto.length
        ) {
            return;
        }

        cancelarRemocaoFoto(id);

        var timer = window.setTimeout(function () {
            if (photoRemovalTimers[id] !== timer) return;

            delete photoRemovalTimers[id];

            if (!$foto.hasClass('a-remover')) return;

            $foto.remove();
            reinicializarFotos();
        }, atraso);

        photoRemovalTimers[id] = timer;
    }

    function cancelarRemocaoFoto(id) {
        id = String(id || '');

        if (!id || !photoRemovalTimers[id]) return;

        window.clearTimeout(photoRemovalTimers[id]);
        delete photoRemovalTimers[id];
    }

    function reinicializarFotos() {
        window.clearTimeout(window.mapInitTimeout);

        window.mapInitTimeout = window.setTimeout(function () {
            if (
                typeof window.inicializarFotos === 'function'
            ) {
                window.inicializarFotos();
            }
        }, 50);
    }

    function mostrarMensagemTemporaria(
        mensagem,
        tipo
    ) {
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
        var $link =
            $('#menuPrincipal a[href*="messages"]').first();

        if (!$link.length) return;

        var $badge =
            $link.find('.mensagens-badge');

        if (!$badge.length) {
            $badge = $('<span>', {
                class: 'mensagens-badge'
            }).appendTo($link);
        }

        $badge
            .text(total > 99 ? '99+' : total)
            .prop('hidden', total < 1);
    }

    function mostrarAvisoMensagem(mensagem) {
        var nome =
            String(
                mensagem.emissor_nome || 'Alguém'
            ).trim() || 'Alguém';

        var resumo =
            String(mensagem.texto || '').trim();

        var foto = String(
            mensagem.emissor_foto_url ||
            '/imagens/fotos-perfil/default.webp'
        );

        var conversaUrl =
            String(
                window.messagesUrl || '/messages'
            ).replace(/\/+$/, '') +
            '/' +
            encodeURIComponent(mensagem.emissor_id);

        if (!resumo) {
            resumo =
                mensagem.tipo === 'imagem'
                    ? 'Enviou-te uma fotografia.'
                    : 'Enviou-te um vídeo.';
        }

        var $avisos = $('#mensagens-avisos');

        if (!$avisos.length) {
            $avisos = $('<div>', {
                id: 'mensagens-avisos',
                class: 'mensagens-avisos',
                'aria-live': 'polite',
                'aria-atomic': 'true'
            }).appendTo('body');
        }

        var $aviso = $('<a>', {
            class: 'mensagem-aviso',
            href: conversaUrl,
            'aria-label':
                'Abrir conversa com ' + nome
        });

        var $imagem = $('<img>', {
            class: 'mensagem-aviso-foto',
            src: foto,
            alt: ''
        }).on('error', function () {
            this.onerror = null;
            this.src =
                '/imagens/fotos-perfil/default.webp';
        });

        var $corpo = $('<span>', {
            class: 'mensagem-aviso-corpo'
        }).append(
            $('<strong>').text(
                'Nova mensagem de ' + nome
            ),
            $('<span>').text(resumo)
        );

        $aviso.append($imagem, $corpo);
        $avisos.append($aviso);

        window.requestAnimationFrame(function () {
            $aviso.addClass('visivel');
        });

        var removerTimer =
            window.setTimeout(removerAviso, 5200);

        $aviso.on('click', function () {
            window.clearTimeout(removerTimer);
        });

        function removerAviso() {
            $aviso.removeClass('visivel');

            window.setTimeout(function () {
                $aviso.remove();

                if (!$avisos.children().length) {
                    $avisos.remove();
                }
            }, 260);
        }

        return resumo;
    }

    function mostrarNotificacaoMensagem(mensagem) {
        var nome = String(
            mensagem.emissor_nome || 'Alguém'
        );

        var resumo = mostrarAvisoMensagem(mensagem);

        if (window.disableNotifications) return;

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
                        window.messagesUrl || '/messages'
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

    function aoReceberPushDeMensagem(evento) {
        var dados = evento.detail || {};
        var mensagemId = Number(dados.message_id) || 0;

        if (!rememberNotifiedMessage(mensagemId)) return;

        if (
            String(window.chatMembroId || '') ===
            String(dados.from_member_id || '')
        ) {
            return;
        }

        mostrarAvisoMensagem({
            emissor_id: String(dados.from_member_id || ''),
            emissor_nome: String(dados.from_name || 'Alguém'),
            emissor_foto_url: String(
                dados.from_photo ||
                '/imagens/fotos-perfil/default.webp'
            ),
            texto: 'Enviou-te uma mensagem.',
            tipo: 'texto'
        });
    }

    window.addEventListener(
        'app:chat-push-recebido',
        aoReceberPushDeMensagem
    );

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

    function clearLocationRefreshTimer() {
        if (!locationRefreshTimer) return;

        window.clearInterval(locationRefreshTimer);
        locationRefreshTimer = null;
    }

    window.AppWebSocket = {
        connect: connect,
        send: send,
        updatePresence: sendPresenceState,
        startLocationTracking: startLocationTracking,
        stopLocationTracking: stopLocationTracking,
        isInvisible: modoInvisivelEstaAtivo,
        refreshMap: function () {
            if (document.getElementById('gridCanvas')) {
                atualizarPessoasNoMapa(latestPeople);
            }
        },
        isConnected: function () {
            return Boolean(
                authenticated &&
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
        stopLocationTracking();
    });

    window.addEventListener('focus', function () {
        if (!window.AppWebSocket.isConnected()) {
            connect();
            return;
        }

        if (!window.disableLocationTracking) {
            startLocationTracking();
            startLocationRefresh();
            requestCurrentLocation();
        }
    });

    window.addEventListener('pageshow', function () {
        if (!window.AppWebSocket.isConnected()) {
            connect();
            return;
        }

        if (!window.disableLocationTracking) {
            startLocationTracking();
            startLocationRefresh();
            requestCurrentLocation();
        }
    });

    document.addEventListener(
        'visibilitychange',
        function () {
            if (document.visibilityState !== 'visible') {
                /*
                 * O watch de alta precisão serve apenas o mapa em primeiro
                 * plano. Em segundo plano fica ativo somente o plugin Swift
                 * adaptativo, evitando dois rastreios concorrentes no iPhone.
                 */
                stopLocationTracking();
                return;
            }

            if (!window.AppWebSocket.isConnected()) {
                connect();
                return;
            }

            if (!window.disableLocationTracking) {
                startLocationTracking();
                startLocationRefresh();
                requestCurrentLocation();
            }
        }
    );

    function aplicarPreferenciasEmTempoReal() {
        aplicarPreferenciasGuardadas();

        if (window.disableLocationTracking) {
            stopLocationTracking();
            limparMapaLocal();
        } else {
            if (window.margotInvisible) {
                removerPropriaFotoDoMapa();
            }

            if (
                window.AppWebSocket.isConnected() &&
                document.visibilityState === 'visible'
            ) {
                startLocationTracking();
                startLocationRefresh();
                requestCurrentLocation();
            }
        }

        if (window.AppWebSocket.isConnected()) {
            sendPresenceState();
            return;
        }

        if (
            !socket ||
            socket.readyState === WebSocket.CLOSED
        ) {
            connect();
        }
    }

    window.addEventListener(
        'margot:preferencias-alteradas',
        aplicarPreferenciasEmTempoReal
    );

    window.addEventListener('storage', function (evento) {
        if (
            evento.key !== 'margot-preferencias-v1' ||
            window.MargotPreferencias
        ) {
            return;
        }

        aplicarPreferenciasGuardadas();
        aplicarPreferenciasEmTempoReal();
    });

    $(function () {
        if (window.disableLocationTracking) {
            limparMapaLocal();
        } else if (window.margotInvisible) {
            removerPropriaFotoDoMapa();
        }

        connect();
    });
})(window, document, jQuery);