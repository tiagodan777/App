// Avisos e contadores de mensagens recebidas por WebSocket ou push.
window.MargotMessageAlerts = function (window, document, $) {
    'use strict';
    var notifiedMessageIds = new Set();
    var notifiedMessageOrder = [];
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
    function atualizarBadgeMensagens(total) {
        var $link = $('#menuPrincipal a[href*="messages"]').first();
        if (!$link.length) {
            return;
        }
        var $badge = $link.find('.mensagens-badge');
        if (!$badge.length) {
            $badge = $('<span>', { class: 'mensagens-badge' }).appendTo($link);
        }
        $badge.text(total > 99 ? '99+' : total).prop('hidden', total < 1);
    }
    function mostrarAvisoMensagem(mensagem) {
        var nome = String(mensagem.emissor_nome || 'Alguém');
        var resumo = String(mensagem.texto || '').trim();
        var foto = String(mensagem.emissor_foto_url || '/imagens/fotos-perfil/default.webp');
        var emissorId = String(mensagem.emissor_id || '');
        var conversaUrl =
            String(window.messagesUrl || '/messages').replace(/\/+$/, '') + '/' + encodeURIComponent(emissorId);
        if (!resumo) {
            resumo = { imagem: 'Enviou-te uma fotografia.', video: 'Enviou-te um vídeo.', audio: 'Enviou-te uma mensagem de voz.' }[mensagem.tipo] || 'Enviou-te uma mensagem.';
        }

        /*
         * Heys e mensagens usam a mesma pilha. Assim nunca ficam dois
         * contentores diferentes a ocupar exatamente o mesmo espaço no topo.
         */
        var $avisos = $('#heys-avisos');
        if (!$avisos.length) {
            $avisos = $('#mensagens-avisos');
        }
        if (!$avisos.length) {
            $avisos = $('<div>', {
                id: 'mensagens-avisos',
                class: 'mensagens-avisos',
                'aria-live': 'polite',
                'aria-atomic': 'true'
            }).appendTo('body');
        }
        var seletorExistente = '.mensagem-aviso[data-emissor-id="' + emissorId.replace(/"/g, '') + '"]';
        var $aviso = $avisos.find(seletorExistente).first();
        var quantidade = 1;
        function removerAviso(imediato) {
            if (!$aviso || !$aviso.length) {
                return;
            }
            var timer = Number($aviso.data('removerTimer') || 0);
            if (timer) {
                window.clearTimeout(timer);
                $aviso.removeData('removerTimer');
            }
            $aviso.addClass('a-sair').removeClass('visivel');
            if (imediato) {
                $aviso.remove();
                return;
            }
            window.setTimeout(function () {
                $aviso.remove();
                if ($avisos.attr('id') === 'mensagens-avisos' && !$avisos.children().length) {
                    $avisos.remove();
                }
            }, 230);
        }
        if ($aviso.length) {
            quantidade = Number($aviso.attr('data-quantidade')) || 1;
            quantidade += 1;
            var timerAnterior = Number($aviso.data('removerTimer') || 0);
            if (timerAnterior) {
                window.clearTimeout(timerAnterior);
            }
            $aviso.removeClass('a-sair').addClass('visivel').attr('data-quantidade', String(quantidade));
            $aviso.find('.mensagem-aviso-corpo strong').text(quantidade + ' novas mensagens de ' + nome);
            $aviso.find('.mensagem-aviso-corpo > span').text(resumo);
            $aviso.attr('aria-label', quantidade + ' novas mensagens de ' + nome + '. ' + resumo);
        } else {
            /* Máximo de três cartões no topo. O mais antigo sai primeiro. */
            var $itens = $avisos.children('.mensagem-aviso, .hey-aviso');
            while ($itens.length >= 3) {
                $itens.first().remove();
                $itens = $avisos.children('.mensagem-aviso, .hey-aviso');
            }
            $aviso = $('<a>', {
                class: 'mensagem-aviso',
                href: conversaUrl,
                'data-emissor-id': emissorId,
                'data-quantidade': '1',
                'aria-label': 'Nova mensagem de ' + nome + '. ' + resumo
            });
            var $imagem = $('<img>', { class: 'mensagem-aviso-foto', src: foto, alt: '' }).on('error', function () {
                this.onerror = null;
                this.src = '/imagens/fotos-perfil/default.webp';
            });
            var $corpo = $('<span>', { class: 'mensagem-aviso-corpo' }).append(
                $('<strong>').text('Nova mensagem de ' + nome),
                $('<span>').text(resumo)
            );
            $aviso.append($imagem, $corpo);
            $avisos.append($aviso);
            var gesto = null;
            $aviso.on('pointerdown', function (evento) {
                var original = evento.originalEvent || evento;
                if (original.pointerType === 'mouse' && original.button !== 0) {
                    return;
                }
                gesto = { id: original.pointerId, y: original.clientY, x: original.clientX, inicio: performance.now() };
            });
            $aviso.on('pointermove', function (evento) {
                if (!gesto) {
                    return;
                }
                var original = evento.originalEvent || evento;
                if (original.pointerId !== undefined && gesto.id !== undefined && original.pointerId !== gesto.id) {
                    return;
                }
                var dy = original.clientY - gesto.y;
                if (dy < 0) {
                    var deslocamento = Math.max(-105, dy);
                    $aviso.css({
                        transition: 'none',
                        transform: 'translateY(' + deslocamento + 'px) scale(.985)',
                        opacity: Math.max(0.18, 1 - Math.abs(deslocamento) / 110)
                    });
                }
            });
            $aviso.on('pointerup pointercancel', function (evento) {
                if (!gesto) {
                    return;
                }
                var original = evento.originalEvent || evento;
                var dy = original.clientY - gesto.y;
                var duracao = Math.max(1, performance.now() - gesto.inicio);
                var velocidade = dy / duracao;
                var fechar = dy <= -34 || velocidade <= -0.42;
                $aviso.css({ transition: '', transform: '', opacity: '' });
                if (fechar) {
                    $aviso.data('swiped', true);
                    evento.preventDefault();
                    removerAviso(false);
                }
                gesto = null;
            });
            $aviso.on('click', function (evento) {
                if ($aviso.data('swiped')) {
                    evento.preventDefault();
                    $aviso.removeData('swiped');
                    return;
                }
                var timer = Number($aviso.data('removerTimer') || 0);
                if (timer) {
                    window.clearTimeout(timer);
                }
            });
            window.requestAnimationFrame(function () {
                $aviso.addClass('visivel');
            });
        }
        $aviso.data(
            'removerTimer',
            window.setTimeout(function () {
                removerAviso(false);
            }, 3600)
        );
        return resumo;
    }
    function mostrarNotificacaoMensagem(mensagem) {
        var nome = String(mensagem.emissor_nome || 'Alguém');
        var resumo = mostrarAvisoMensagem(mensagem);
        if (window.disableNotifications) {
            return;
        }
        if (!window.isSecureContext || !('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }
        try {
            var notificacao = new Notification('Nova mensagem de ' + nome, {
                body: resumo,
                icon: mensagem.emissor_foto_url || '/imagens/fotos-perfil/default.webp',
                tag: 'chat-' + String(mensagem.emissor_id || 'desconhecido')
            });
            notificacao.onclick = function () {
                window.focus();
                window.location.href =
                    String(window.messagesUrl || '/messages').replace(/\/+$/, '') +
                    '/' +
                    encodeURIComponent(mensagem.emissor_id);
                notificacao.close();
            };
        } catch (erro) {
            console.error('Erro ao mostrar notificação de mensagem:', erro);
        }
    }
    function aoReceberPushDeMensagem(evento) {
        var dados = evento.detail || {};
        var mensagemId = Number(dados.message_id) || 0;
        if (!rememberNotifiedMessage(mensagemId)) {
            return;
        }
        if (String(window.chatMembroId || '') === String(dados.from_member_id || '')) {
            return;
        }
        mostrarAvisoMensagem({
            emissor_id: String(dados.from_member_id || ''),
            emissor_nome: String(dados.from_name || 'Alguém'),
            emissor_foto_url: String(dados.from_photo || '/imagens/fotos-perfil/default.webp'),
            texto: 'Enviou-te uma mensagem.',
            tipo: 'texto'
        });
    }
    return {
        rememberNotifiedMessage: rememberNotifiedMessage,
        atualizarBadgeMensagens: atualizarBadgeMensagens,
        mostrarNotificacaoMensagem: mostrarNotificacaoMensagem,
        aoReceberPushDeMensagem: aoReceberPushDeMensagem
    };
};