(function (window, document, $) {
    'use strict';

    if (window.AppWebSocket) return;
    var messageAlerts = window.MargotMessageAlerts(window, document, $);
    var socket = null;
    var tokenRequest = null;
    var authenticated = false;
    var sessionEnded = false;
    var reconnectTimer = null;
    var connectionTimeout = null;
    var pingTimer = null;

    var reconnectAttempts = 0;

    var photoRemovalTimers = Object.create(null);
    var latestPeople = [];
    var profileAccessTokens = Object.create(null);

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;
    var CONNECTION_TIMEOUT = 12000;
    var PING_INTERVAL = 20000;

    var locationTracking = window.MargotLocationTracker({
        send: send,
        clearMap: limparMapaLocal,
        showMessage: mostrarMensagemTemporaria
    });

    function atualizarTokensAcessoPerfil(pessoas) {
        var novos = Object.create(null);
        if (Array.isArray(pessoas)) {
            pessoas.forEach(function (pessoa) {
                if (!pessoa) return;
                var id = String(pessoa.membro_id || pessoa.id || '').trim();
                var token = String(pessoa.profile_access_token || '').trim();
                if (id && /^[a-f0-9]{64}$/i.test(token)) {
                    novos[id] = token;
                }
            });
        }
        profileAccessTokens = novos;
    }

    function obterTokenAcessoPerfil(membroId) {
        return String(profileAccessTokens[String(membroId || '').trim()] || '');
    }

    function aplicarPreferenciasGuardadas() {
        if (window.MargotPreferencias) {
            window.MargotPreferencias.aplicar();
            return;
        }
        try {
            var preferencias = JSON.parse(window.localStorage.getItem('margot-preferencias-v1') || '{}');
            window.disableLocationTracking = preferencias.localizacao === false;
            window.disableNotifications = preferencias.notificacoes === false;
            window.margotInvisible = preferencias.invisivel === true;
            window.disableMapPresence = window.disableLocationTracking || window.margotInvisible;
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

    function podeMostrarPessoasNoMapa() {
        if (!localizacaoEstaAtiva()) {
            return false;
        }
        if (locationTracking.isAndroidNativeApp() && locationTracking.permissionConfirmed() !== true) {
            return false;
        }
        return true;
    }

    function obterEstadoPresenca() {
        return { location_enabled: localizacaoEstaAtiva(), map_presence: deveAparecerNoMapa() };
    }

    function getWebSocketUrl() {
        if (window.webSocketUrl) {
            return window.webSocketUrl;
        }
        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return protocol + '//' + window.location.hostname + ':8080';
    }

    function getWebSocketTokenUrl() {
        return String(window.webSocketTokenUrl || '/websocket-token');
    }

    function requestWebSocketToken() {
        return window
            .fetch(getWebSocketTokenUrl(), {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (response) {
                return response
                    .json()
                    .catch(function () {
                        return {};
                    })
                    .then(function (data) {
                        if (response.status === 401) {
                            var sessionError = new Error('A sessão terminou.');
                            sessionError.sessionEnded = true;
                            throw sessionError;
                        }
                        if (!response.ok || data.success !== true) {
                            throw new Error(data.message || 'Não foi possível preparar a ligação.');
                        }
                        var token = String(data.token || '').trim();
                        if (!/^[a-f0-9]{64}$/i.test(token)) {
                            throw new Error('O servidor devolveu um token de ligação inválido.');
                        }
                        return token;
                    });
            });
    }

    function connect() {
        if (sessionEnded) {
            return;
        }
        if (!navigator.onLine) {
            setStatus('offline');
            return;
        }
        if (tokenRequest) {
            return;
        }
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }
        clearReconnectTimer();
        clearConnectionTimeout();
        clearPingTimer();
        authenticated = false;
        setStatus('connecting');
        tokenRequest = requestWebSocketToken();
        tokenRequest
            .then(function (token) {
                tokenRequest = null;
                if (sessionEnded || !navigator.onLine) {
                    return;
                }
                openSocket(token);
            })
            .catch(function (erro) {
                tokenRequest = null;
                if (erro.sessionEnded) {
                    sessionEnded = true;
                    setStatus('unauthenticated');
                    locationTracking.stopLocationTracking();
                    window.location.assign(String(window.loginUrl || '/login/'));
                    return;
                }
                console.error('Erro ao obter token WebSocket:', erro);
                setStatus(navigator.onLine ? 'disconnected' : 'offline');
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
            if (currentSocket !== socket) {
                return;
            }
            authenticate(token);
        };
        currentSocket.onmessage = function (evento) {
            if (currentSocket === socket) {
                handleMessage(evento);
            }
        };
        currentSocket.onerror = function (evento) {
            if (currentSocket === socket) {
                console.error('Erro no WebSocket:', evento);
            }
        };
        currentSocket.onclose = function () {
            if (currentSocket !== socket) {
                return;
            }
            clearConnectionTimeout();
            clearPingTimer();
            locationTracking.stopLocationTracking();
            authenticated = false;
            socket = null;
            window.ws = null;
            setStatus(navigator.onLine ? 'disconnected' : 'offline');
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
        if (!socket || socket.readyState !== WebSocket.OPEN) {
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
        if (!authenticated) {
            return false;
        }
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
            send({ type: 'ping', timestamp: Date.now() });
        }, PING_INTERVAL);
    }

    /*
     * No Android começamos por assumir que a
     * localização ainda NÃO foi autorizada.
     *
     * O valor só passa para true depois de
     * checkPermissions() ou depois do evento
     * emitido pelo background-location.js.
     *
     * No iOS e na Web esta proteção não altera
     * o comportamento existente.
     */

    function scheduleReconnect() {
        if (sessionEnded || reconnectTimer || !navigator.onLine) {
            return;
        }
        reconnectAttempts++;
        var atraso = Math.min(RECONNECT_MIN_DELAY * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_DELAY);
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
        if (!data || typeof data !== 'object') {
            return;
        }
        switch (data.type) {
            case 'connected':
                break;
            case 'authenticated':
                authenticated = true;
                clearConnectionTimeout();
                reconnectAttempts = 0;
                setStatus('connected');
                startPing();
                if (!window.disableLocationTracking && document.visibilityState === 'visible') {
                    locationTracking.startLocationTracking();
                    locationTracking.startLocationRefresh();
                    locationTracking.requestCurrentLocation();
                }
                console.log('WebSocket autenticado:', data.membro_id);
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
                window.dispatchEvent(new CustomEvent('app:map-presence-updated', { detail: data }));
                break;
            case 'state':
                atualizarTokensAcessoPerfil(Array.isArray(data.people) ? data.people : []);
                if (document.getElementById('gridCanvas')) {
                    /*
                     * O servidor pode ainda ter uma posição
                     * anterior desta conta e devolver pessoas
                     * imediatamente.
                     *
                     * No Android não mostramos esses dados
                     * enquanto a autorização nativa da
                     * localização ainda não estiver confirmada.
                     */
                    atualizarPessoasNoMapa(
                        podeMostrarPessoasNoMapa() ? (Array.isArray(data.people) ? data.people : []) : []
                    );
                }
                break;
            case 'notification':
                window.dispatchEvent(new CustomEvent('app:hey-recebido', { detail: data }));
                break;
            case 'notification_sent':
                window.dispatchEvent(new CustomEvent('app:hey-enviado', { detail: data }));
                break;
            case 'notification_not_delivered':
                window.dispatchEvent(new CustomEvent('app:hey-erro', { detail: data }));
                break;
            case 'connection_waiting':
                window.dispatchEvent(new CustomEvent('app:connection-waiting', { detail: data }));
                break;
            case 'connection_created':
                window.dispatchEvent(new CustomEvent('app:connection-created', { detail: data }));
                break;
            case 'connection_removed':
                window.dispatchEvent(new CustomEvent('app:connection-removed', { detail: data }));
                break;
            case 'connection_error':
                window.dispatchEvent(new CustomEvent('app:connection-error', { detail: data }));
                break;
            case 'chat_message':
                window.dispatchEvent(new CustomEvent('app:chat-message', { detail: data }));
                messageAlerts.atualizarBadgeMensagens(Number(data.unread_count) || 0);
                if (
                    data.message &&
                    String(data.message.destinatario_id) === String(window.membroId) &&
                    String(window.chatMembroId || '') !== String(data.message.emissor_id)
                ) {
                    var receivedMessageId = Number(data.message.id) || 0;
                    if (messageAlerts.rememberNotifiedMessage(receivedMessageId)) {
                        messageAlerts.mostrarNotificacaoMensagem(data.message);
                    }
                }
                break;
            case 'chat_reaction':
                window.dispatchEvent(new CustomEvent('app:chat-reaction', { detail: data }));
                break;
            case 'chat_messages_read':
                window.dispatchEvent(new CustomEvent('app:chat-messages-read', { detail: data }));
                break;
            case 'chat_unread_count':
                messageAlerts.atualizarBadgeMensagens(Number(data.unread_count) || 0);
                window.dispatchEvent(new CustomEvent('app:chat-unread-count', { detail: data }));
                break;
            case 'chat_error':
                window.dispatchEvent(new CustomEvent('app:chat-error', { detail: data }));
                mostrarMensagemTemporaria(data.message || 'Não foi possível atualizar a conversa.', 'erro');
                break;
            case 'pong':
                break;
            case 'error':
                console.error('Erro do servidor:', data.message);
                mostrarMensagemTemporaria(data.message || 'Ocorreu um erro.', 'erro');
                break;
            default:
                console.warn('Mensagem WebSocket desconhecida:', data);
        }
    }

    function removerPropriaFotoDoMapa() {
        var membroId = String(window.membroId || '').trim();
        if (!membroId) {
            return;
        }
        var imagem = document.getElementById(membroId);
        if (!imagem || !imagem.classList.contains('foto')) {
            return;
        }
        var $imagem = $(imagem);
        $imagem.addClass('a-remover').css({ opacity: '0', transition: 'opacity 0.25s ease-out' });
        agendarRemocaoFoto(membroId, $imagem, 260);
    }

    function limparMapaLocal() {
        if (!document.getElementById('gridCanvas')) {
            return;
        }
        atualizarPessoasNoMapa([]);
    }

    function atualizarPessoasNoMapa(pessoas) {
        latestPeople = Array.isArray(pessoas) ? pessoas.slice() : [];
        pessoas = latestPeople;
        var idsAtuais = pessoas.map(function (pessoa) {
            return String(pessoa.id);
        });
        $('.foto').each(function () {
            var $foto = $(this);
            var id = String($foto.attr('id') || '');
            if (idsAtuais.includes(id)) {
                cancelarRemocaoFoto(id);
                $foto.removeClass('a-remover').css('opacity', '1');
                return;
            }
            if ($foto.hasClass('a-remover') && photoRemovalTimers[id]) {
                return;
            }
            $foto.addClass('a-remover').css({ opacity: '0', transition: 'opacity 0.4s ease-out' });
            agendarRemocaoFoto(id, $foto, 400);
        });
        var fragmento = document.createDocumentFragment();
        var inseriuImagem = false;
        pessoas.forEach(function (pessoa) {
            if (!pessoa || pessoa.id === undefined) {
                return;
            }
            var id = String(pessoa.id);
            var src = String(pessoa.src || '').trim();
            if (!src) {
                src = '/imagens/fotos-perfil/default.webp';
            }
            var imagemExistente = document.getElementById(id);
            if (imagemExistente) {
                cancelarRemocaoFoto(id);
                $(imagemExistente)
                    .removeClass('a-remover')
                    .attr({
                        'data-top': Number(pessoa.top) || 0,
                        'data-left': Number(pessoa.left) || 0,
                        'data-membro-id': pessoa.membro_id || '',
                        'data-nome': pessoa.nome || '',
                        'data-distancia': Number(pessoa.distance_m) || 0,
                        'data-profile-access-token': pessoa.profile_access_token || '',
                        src: src,
                        alt: pessoa.nome || 'Foto de perfil'
                    })
                    .css('opacity', '1');
                return;
            }
            inseriuImagem = true;
            var $imagem = $('<img>', { id: id, class: 'foto', src: src, alt: pessoa.nome || 'Foto de perfil' });
            $imagem.attr({
                'data-top': Number(pessoa.top) || 0,
                'data-left': Number(pessoa.left) || 0,
                'data-membro-id': pessoa.membro_id || '',
                'data-nome': pessoa.nome || '',
                'data-distancia': Number(pessoa.distance_m) || 0,
                'data-profile-access-token': pessoa.profile_access_token || ''
            });
            $imagem.css({ opacity: '0', transition: 'opacity 0.4s ease-out' });
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

    function agendarRemocaoFoto(id, $foto, atraso) {
        id = String(id || '');
        if (!id || !$foto || !$foto.length) {
            return;
        }
        cancelarRemocaoFoto(id);
        var timer = window.setTimeout(function () {
            if (photoRemovalTimers[id] !== timer) {
                return;
            }
            delete photoRemovalTimers[id];
            if (!$foto.hasClass('a-remover')) {
                return;
            }
            $foto.remove();
            reinicializarFotos();
        }, atraso);
        photoRemovalTimers[id] = timer;
    }

    function cancelarRemocaoFoto(id) {
        id = String(id || '');
        if (!id || !photoRemovalTimers[id]) {
            return;
        }
        window.clearTimeout(photoRemovalTimers[id]);
        delete photoRemovalTimers[id];
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
        var $mensagem = $('<div>', { class: 'mensagem-websocket ' + (tipo === 'erro' ? 'erro' : 'sucesso') }).text(
            mensagem
        );
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

    window.addEventListener('app:chat-push-recebido', messageAlerts.aoReceberPushDeMensagem);

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
        updatePresence: sendPresenceState,
        startLocationTracking: locationTracking.startLocationTracking,
        stopLocationTracking: locationTracking.stopLocationTracking,
        isInvisible: modoInvisivelEstaAtivo,
        profileAccessToken: obterTokenAcessoPerfil,
        refreshMap: function () {
            if (!document.getElementById('gridCanvas')) {
                return;
            }

            /*
             * Ao regressar de Perfil/Mensagens, a página principal é
             * recriada pelo navegador interno, mas o WebSocket continua
             * vivo. Primeiro repomos imediatamente o último estado que já
             * temos em memória; depois pedimos ao servidor um estado novo
             * sem obrigar o utilizador a ligar/desligar o modo invisível.
             */
            atualizarPessoasNoMapa(podeMostrarPessoasNoMapa() ? latestPeople : []);
            if (!authenticated) {
                return;
            }
            sendPresenceState();
            if (!window.disableLocationTracking && document.visibilityState === 'visible') {
                if (!locationTracking.sendLastKnownLocation()) {
                    locationTracking.requestCurrentLocation();
                }
            }
        },
        isConnected: function () {
            return Boolean(authenticated && socket && socket.readyState === WebSocket.OPEN);
        }
    };
    window.mostrarMensagemTemporaria = mostrarMensagemTemporaria;
    window.addEventListener('margot:localizacao-permissao-concluida', function (evento) {
        if (!locationTracking.isAndroidNativeApp()) {
            return;
        }
        var detalhe = evento.detail || {};
        locationTracking.confirmPermission(detalhe.granted === true);

        /*
         * Se recusou a localização, não fica qualquer
         * pessoa antiga visível no mapa.
         */
        if (!locationTracking.permissionConfirmed()) {
            limparMapaLocal();
            return;
        }
        if (
            window.disableLocationTracking ||
            document.visibilityState !== 'visible' ||
            !window.AppWebSocket.isConnected()
        ) {
            return;
        }

        /*
         * Só depois da autorização nativa:
         * começa a leitura da localização e envia
         * uma posição atual ao servidor.
         */
        locationTracking.startLocationTracking();
        locationTracking.startLocationRefresh();
        locationTracking.requestCurrentLocation();
    });
    document.addEventListener('margot:page-ready', function () {
        if (!document.getElementById('gridCanvas') || !window.AppWebSocket) {
            return;
        }
        window.AppWebSocket.refreshMap();

        /*
         * Uma segunda passagem, já depois do primeiro layout do canvas,
         * evita o caso em que as fotografias eram criadas antes de a
         * página principal ter as dimensões finais.
         */
        window.requestAnimationFrame(function () {
            if (document.getElementById('gridCanvas')) {
                window.AppWebSocket.refreshMap();
            }
        });
    });
    window.addEventListener('online', function () {
        reconnectAttempts = 0;
        connect();
    });
    window.addEventListener('offline', function () {
        setStatus('offline');
        locationTracking.stopLocationTracking();
    });
    window.addEventListener('focus', function () {
        if (!window.AppWebSocket.isConnected()) {
            connect();
            return;
        }
        if (!window.disableLocationTracking) {
            locationTracking.startLocationTracking();
            locationTracking.startLocationRefresh();
            locationTracking.requestCurrentLocation();
        }
    });
    window.addEventListener('pageshow', function () {
        if (!window.AppWebSocket.isConnected()) {
            connect();
            return;
        }
        if (!window.disableLocationTracking) {
            locationTracking.startLocationTracking();
            locationTracking.startLocationRefresh();
            locationTracking.requestCurrentLocation();
        }
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') {
            /*
             * O watch de alta precisão serve apenas
             * o mapa em primeiro plano.
             *
             * Em segundo plano fica ativo somente
             * o plugin nativo de background.
             */
            locationTracking.stopLocationTracking();
            return;
        }
        if (!window.AppWebSocket.isConnected()) {
            connect();
            return;
        }
        if (!window.disableLocationTracking) {
            locationTracking.startLocationTracking();
            locationTracking.startLocationRefresh();
            locationTracking.requestCurrentLocation();
        }
    });

    function aplicarPreferenciasEmTempoReal() {
        aplicarPreferenciasGuardadas();
        if (window.disableLocationTracking) {
            locationTracking.stopLocationTracking();
            limparMapaLocal();
        } else {
            if (window.margotInvisible) {
                removerPropriaFotoDoMapa();
            }
            if (window.AppWebSocket.isConnected() && document.visibilityState === 'visible') {
                locationTracking.startLocationTracking();
                locationTracking.startLocationRefresh();
                locationTracking.requestCurrentLocation();
            }
        }
        if (window.AppWebSocket.isConnected()) {
            sendPresenceState();
            return;
        }
        if (!socket || socket.readyState === WebSocket.CLOSED) {
            connect();
        }
    }
    window.addEventListener('margot:preferencias-alteradas', aplicarPreferenciasEmTempoReal);
    window.addEventListener('storage', function (evento) {
        if (evento.key !== 'margot-preferencias-v1' || window.MargotPreferencias) {
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
