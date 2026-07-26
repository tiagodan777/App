(function (window, document, $) {
    'use strict';

    if (window.AppWebSocket) return;

    var socket = null;
    var reconnectTimer = null;
    var connectionTimeout = null;
    var pingTimer = null;
    var reconnectAttempts = 0;
    var ticketRequestInFlight = false;
    var authenticated = false;
    var locationWatchId = null;
    var lastLocationSentAt = 0;

    var RECONNECT_MIN_DELAY = 1000;
    var RECONNECT_MAX_DELAY = 30000;
    var CONNECTION_TIMEOUT = 12000;
    var PING_INTERVAL = 20000;
    var LOCATION_MIN_INTERVAL = 10000;
    var LOCATION_MAX_AGE = 5000;
    
    function aplicarPreferenciasGuardadas() {
        if (window.MargotPreferencias) {
            window.MargotPreferencias.aplicar();
            return;
        }

        /*
         * Sem o módulo de preferências autenticado, a presença falha fechada.
         * Nunca se reutiliza uma chave local genérica que possa pertencer a
         * outra conta.
         */
        window.disableLocationTracking = true;
        window.disableNotifications = true;
        window.margotInvisible = false;
        window.disableMapPresence = true;
    }

    aplicarPreferenciasGuardadas();

    function localizacaoEstaAtiva() {
        return window.forceDisableLocationTracking !== true &&
            window.disableLocationTracking !== true;
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

        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        return protocol + '//' + window.location.hostname + ':8080';
    }

    function getWebSocketTicketUrl() {
        return String(window.webSocketTicketUrl || '/websocket-ticket');
    }

    function requestWebSocketTicket() {
        var headers = {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };

        if (window.csrfToken) {
            headers['X-CSRF-Token'] = String(window.csrfToken);
        }

        var controller = typeof AbortController === 'function'
            ? new AbortController()
            : null;
        var timeout = window.setTimeout(function () {
            if (controller) controller.abort();
        }, CONNECTION_TIMEOUT);

        return window.fetch(getWebSocketTicketUrl(), {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: headers,
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            return response.json().catch(function () {
                return {};
            }).then(function (data) {
                var ticket = String(data.ticket || '').trim();

                if (!response.ok || !/^[a-f0-9]{64}$/i.test(ticket)) {
                    throw new Error(data.message || 'Não foi possível preparar a ligação segura.');
                }

                return ticket;
            });
        }).finally(function () {
            window.clearTimeout(timeout);
        });
    }

    function connect() {
        if (!navigator.onLine) {
            setStatus('offline');
            return;
        }

        if (ticketRequestInFlight) return;
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

        clearReconnectTimer();
        clearConnectionTimeout();
        clearPingTimer();
        authenticated = false;
        setStatus('connecting');

        ticketRequestInFlight = true;

        requestWebSocketTicket().then(function (ticket) {
            ticketRequestInFlight = false;

            if (!navigator.onLine) {
                setStatus('offline');
                return;
            }

            openSocket(ticket);
        }).catch(function (erro) {
            ticketRequestInFlight = false;
            console.error('Erro ao obter bilhete WebSocket:', erro);
            setStatus(navigator.onLine ? 'disconnected' : 'offline');
            scheduleReconnect();
        });
    }

    function openSocket(ticket) {
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
            if (currentSocket === socket && !authenticated) currentSocket.close();
        }, CONNECTION_TIMEOUT);

        currentSocket.onopen = function () {
            if (currentSocket !== socket) return;

            setStatus('authenticating');
            authenticate(ticket);
        };

        currentSocket.onmessage = function (evento) {
            if (currentSocket === socket) handleMessage(evento);
        };

        currentSocket.onerror = function (evento) {
            if (currentSocket === socket) console.error('Erro no WebSocket:', evento);
        };

        currentSocket.onclose = function () {
            if (currentSocket !== socket) return;

            clearConnectionTimeout();
            clearPingTimer();

            authenticated = false;
            socket = null;
            window.ws = null;
            limparMapaLocal();

            setStatus(navigator.onLine ? 'disconnected' : 'offline');
            scheduleReconnect();
        };
    }

    function authenticate(ticket) {
        var estadoPresenca = obterEstadoPresenca();

        sendRaw({
            type: 'auth',
            ticket: ticket,
            location_enabled: estadoPresenca.location_enabled,
            map_presence: estadoPresenca.map_presence
        });
    }

    function sendRaw(data) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;

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
        if (!localizacaoEstaAtiva()) return;
        
        if (locationWatchId !== null) return;

        if (!window.isSecureContext) {
            mostrarMensagemTemporaria('A localização exige HTTPS.', 'erro');
            return;
        }

        if (!('geolocation' in navigator)) {
            mostrarMensagemTemporaria('Este dispositivo não suporta localização.', 'erro');
            return;
        }

        locationWatchId = navigator.geolocation.watchPosition(handleLocationSuccess, handleLocationError, {
            enableHighAccuracy: true,
            maximumAge: LOCATION_MAX_AGE,
            timeout: 15000
        });
    }

    function stopLocationTracking() {
        if (locationWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(locationWatchId);
        }

        locationWatchId = null;
        lastLocationSentAt = 0;
    }

    function refreshLocationNow() {
        if (
            !authenticated ||
            !localizacaoEstaAtiva() ||
            !window.isSecureContext ||
            !('geolocation' in navigator)
        ) {
            return;
        }

        lastLocationSentAt = 0;
        navigator.geolocation.getCurrentPosition(
            handleLocationSuccess,
            handleLocationError,
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 15000
            }
        );
    }

    function handleLocationSuccess(position) {
        if (!localizacaoEstaAtiva()) return;

        var latitude = Number(position.coords.latitude);
        var longitude = Number(position.coords.longitude);
        var accuracy = Number(position.coords.accuracy) || 0;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        var agora = Date.now();
        var passouTempo = agora - lastLocationSentAt >= LOCATION_MIN_INTERVAL;

        if (lastLocationSentAt > 0 && !passouTempo) return;

        if (!send({
            type: 'location',
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: position.timestamp
        })) return;

        lastLocationSentAt = agora;
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

        if (
            error.code === error.PERMISSION_DENIED ||
            error.code === error.POSITION_UNAVAILABLE
        ) {
            stopLocationTracking();
            limparMapaLocal();
            send({
                type: 'presence_update',
                location_enabled: false,
                map_presence: false
            });
        }
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
                authenticated = true;
                clearConnectionTimeout();
                reconnectAttempts = 0;
                setStatus('connected');
                startPing();

                if (data.location_enabled === false) {
                    stopLocationTracking();
                    limparMapaLocal();
                } else {
                    if (localizacaoEstaAtiva()) startLocationTracking();

                    if (data.map_presence === false) {
                        removerPropriaFotoDoMapa();
                    }
                }
                break;

            case 'location_received':
                break;

            case 'location_refresh_required':
                refreshLocationNow();
                break;

            case 'location_ignored':
                break;

            case 'location_rejected':
                limparMapaLocal();
                mostrarMensagemTemporaria(
                    data.message || 'A localização atual não permite usar a descoberta.',
                    'erro'
                );
                break;

            case 'presence_updated':
                if (data.location_enabled === false) {
                    stopLocationTracking();
                    limparMapaLocal();
                } else {
                    if (localizacaoEstaAtiva()) startLocationTracking();

                    if (data.map_presence === false) {
                        removerPropriaFotoDoMapa();
                    }
                }

                window.dispatchEvent(new CustomEvent('app:map-presence-updated', {
                    detail: data
                }));
                break;

            case 'state':
                if (document.getElementById('gridCanvas')) {
                    atualizarPessoasNoMapa(
                        !localizacaoEstaAtiva()
                            ? []
                            : (Array.isArray(data.people) ? data.people : [])
                    );
                }
                break;

            case 'notification':
                window.dispatchEvent(new CustomEvent('app:hey-recebido', {
                    detail: data
                }));
                break;

            case 'notification_sent':
                window.dispatchEvent(new CustomEvent('app:hey-enviado', {
                    detail: data
                }));
                break;

            case 'notification_not_delivered':
                window.dispatchEvent(new CustomEvent('app:hey-erro', {
                    detail: data
                }));
                mostrarMensagemTemporaria(
                    data.message || 'Não foi possível enviar o Hey.',
                    'erro'
                );
                break;

            case 'chat_message':
                window.dispatchEvent(new CustomEvent('app:chat-message', {
                    detail: data
                }));

                atualizarBadgeMensagens(Number(data.unread_count) || 0);

                if (
                    data.message &&
                    String(data.message.destinatario_id) === String(window.membroId) &&
                    String(window.chatMembroId || '') !== String(data.message.emissor_id)
                ) {
                    mostrarNotificacaoMensagem(data.message);
                }
                break;

            case 'chat_messages_read':
                window.dispatchEvent(new CustomEvent('app:chat-messages-read', {
                    detail: data
                }));
                break;

            case 'chat_unread_count':
                atualizarBadgeMensagens(Number(data.unread_count) || 0);

                window.dispatchEvent(new CustomEvent('app:chat-unread-count', {
                    detail: data
                }));
                break;

            case 'chat_error':
                window.dispatchEvent(new CustomEvent('app:chat-error', {
                    detail: data
                }));

                mostrarMensagemTemporaria(
                    data.message || 'Não foi possível atualizar a conversa.',
                    'erro'
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
        }
    }

    function removerPropriaFotoDoMapa() {
        var membroId = String(window.membroId || '').trim();

        if (!membroId) return;

        var imagem = document.getElementById(membroId);

        if (
            !imagem ||
            !imagem.classList.contains('foto') ||
            imagem.classList.contains('a-remover')
        ) return;

        var $imagem = $(imagem);

        $imagem.addClass('a-remover').css({
            opacity: '0',
            transition: 'opacity 0.25s ease-out'
        });

        window.setTimeout(function () {
            $imagem.remove();
            reinicializarFotos();
        }, 260);
    }

    function limparMapaLocal() {
        if (!document.getElementById('gridCanvas')) return;

        atualizarPessoasNoMapa([]);
    }

    function atualizarPessoasNoMapa(pessoas) {
        var idsAtuais = pessoas.map(function (pessoa) {
            return String(pessoa.id);
        });

        $('.foto').each(function () {
            var $foto = $(this);
            var id = String($foto.attr('id') || '');

            if (idsAtuais.includes(id) || $foto.hasClass('a-remover')) return;

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

            if (!src) src = '/imagens/fotos-perfil/default.webp';

            var imagemExistente = document.getElementById(id);

            if (imagemExistente) {
                $(imagemExistente).removeClass('a-remover').attr({
                    'data-top': Number(pessoa.top) || 0,
                    'data-left': Number(pessoa.left) || 0,
                    'data-membro-id': pessoa.membro_id || '',
                    'data-nome': pessoa.nome || '',
                    'data-proximity-token': pessoa.proximity_token || '',
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
                'data-proximity-token': pessoa.proximity_token || ''
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

        if (inseriuImagem) document.body.appendChild(fragmento);

        reinicializarFotos();
    }

    function reinicializarFotos() {
        window.clearTimeout(window.mapInitTimeout);

        window.mapInitTimeout = window.setTimeout(function () {
            if (typeof window.inicializarFotos === 'function') window.inicializarFotos();
        }, 50);
    }

    function mostrarMensagemTemporaria(mensagem, tipo) {
        $('.mensagem-websocket').remove();

        var $mensagem = $('<div>', {
            class: 'mensagem-websocket ' + (tipo === 'erro' ? 'erro' : 'sucesso')
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

        $badge.text(total > 99 ? '99+' : total).prop('hidden', total < 1);
    }

    function mostrarAvisoMensagem(mensagem) {
        var nome = String(mensagem.emissor_nome || 'Alguém').trim() || 'Alguém';
        var resumo = String(mensagem.texto || '').trim();
        var foto = String(mensagem.emissor_foto_url || '/imagens/fotos-perfil/default.webp');
        var conversaUrl = String(window.messagesUrl || '/messages').replace(/\/+$/, '') + '/' + encodeURIComponent(mensagem.emissor_id);

        if (!resumo) resumo = mensagem.tipo === 'imagem' ? 'Enviou-te uma fotografia.' : 'Enviou-te um vídeo.';

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
            'aria-label': 'Abrir conversa com ' + nome
        });

        var $imagem = $('<img>', {
            class: 'mensagem-aviso-foto',
            src: foto,
            alt: ''
        }).on('error', function () {
            this.onerror = null;
            this.src = '/imagens/fotos-perfil/default.webp';
        });

        var $corpo = $('<span>', {
            class: 'mensagem-aviso-corpo'
        }).append(
            $('<strong>').text('Nova mensagem de ' + nome),
            $('<span>').text(resumo)
        );

        $aviso.append($imagem, $corpo);
        $avisos.append($aviso);

        requestAnimationFrame(function () {
            $aviso.addClass('visivel');
        });

        var removerTimer = setTimeout(removerAviso, 5200);

        $aviso.on('click', function () {
            clearTimeout(removerTimer);
        });

        function removerAviso() {
            $aviso.removeClass('visivel');

            setTimeout(function () {
                $aviso.remove();

                if (!$avisos.children().length) $avisos.remove();
            }, 260);
        }

        return resumo;
    }

    function mostrarNotificacaoMensagem(mensagem) {
        if (window.disableNotifications) return;
        var nome = String(mensagem.emissor_nome || 'Alguém');
        var resumo = mostrarAvisoMensagem(mensagem);

        if (!window.isSecureContext || !('Notification' in window) || Notification.permission !== 'granted') return;

        try {
            var notificacao = new Notification('Margot', {
                body: 'Recebeste uma nova mensagem.',
                icon: '/imagens/fotos-perfil/default.webp',
                tag: 'chat-' + String(mensagem.emissor_id || 'desconhecido')
            });

            notificacao.onclick = function () {
                window.focus();
                window.location.href = String(window.messagesUrl || '/messages').replace(/\/+$/, '') + '/' + encodeURIComponent(mensagem.emissor_id);
                notificacao.close();
            };
        } catch (erro) {
            console.error('Erro ao mostrar notificação de mensagem:', erro);
        }
    }

    function setStatus(status) {
        document.documentElement.setAttribute('data-websocket-status', status);
        $(document).trigger('websocket:status', [status]);
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
        updatePresence: sendPresenceState,
        startLocationTracking: startLocationTracking,
        stopLocationTracking: stopLocationTracking,
        isInvisible: modoInvisivelEstaAtivo,

        isConnected: function () {
            return Boolean(
                authenticated &&
                socket &&
                socket.readyState === WebSocket.OPEN
            );
        }
    };

    window.mostrarMensagemTemporaria = mostrarMensagemTemporaria;

    window.addEventListener('online', function () {
        reconnectAttempts = 0;
        connect();
    });

    window.addEventListener('offline', function () {
        limparMapaLocal();
        setStatus('offline');
    });

    window.addEventListener('focus', function () {
        if (!window.AppWebSocket.isConnected()) connect();
    });

    window.addEventListener('pageshow', function () {
        if (!window.AppWebSocket.isConnected()) connect();
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && !window.AppWebSocket.isConnected()) connect();
    });

    function aplicarPreferenciasEmTempoReal() {
        aplicarPreferenciasGuardadas();

        if (!localizacaoEstaAtiva()) {
            stopLocationTracking();
            limparMapaLocal();
        } else {
            if (window.margotInvisible) removerPropriaFotoDoMapa();
            if (authenticated && socket && socket.readyState === WebSocket.OPEN) {
                startLocationTracking();
            }
        }

        if (authenticated && socket && socket.readyState === WebSocket.OPEN) {
            sendPresenceState();
            return;
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    }

    window.addEventListener('margot:preferencias-alteradas', aplicarPreferenciasEmTempoReal);

    $(function () {
        if (!localizacaoEstaAtiva()) {
            limparMapaLocal();
        } else if (window.margotInvisible) {
            removerPropriaFotoDoMapa();
        }

        connect();
    });
})(window, document, jQuery);
