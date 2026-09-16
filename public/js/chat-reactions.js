// Reações, gestos e eliminação de mensagens.
window.MargotChatReactions = function ($conteudo, $mensagens, NS, conversaUrl) {
    'use strict';
    var $ = jQuery;
    var LONG_PRESS_REACAO_MS = 650;
    var DOUBLE_TAP_REACAO_MS = 330;
    var gestoReacao = null;
    var ultimoTapReacao = { id: 0, instante: 0 };
    var $menuReacoes = null;
    function normalizarReacoes(reacoes) {
        if (!Array.isArray(reacoes)) {
            return [];
        }
        return reacoes
            .map(function (reacao) {
                return {
                    member_id: String((reacao && (reacao.member_id || reacao.membro_id)) || ''),
                    emoji: String((reacao && reacao.emoji) || '')
                };
            })
            .filter(function (reacao) {
                return Boolean(reacao.member_id && reacao.emoji);
            });
    }
    function renderizarReacoesMensagem($artigo, reacoes) {
        if (!$artigo || !$artigo.length) {
            return;
        }
        reacoes = normalizarReacoes(reacoes);
        var $zona = $artigo.children('.chat-reacoes');
        if (!$zona.length) {
            $zona = $('<div>', { class: 'chat-reacoes', 'aria-label': 'Reações à mensagem' });
            $artigo.append($zona);
        }
        $zona.empty();
        if (!reacoes.length) {
            $zona.prop('hidden', true);
            return;
        }
        var agrupadas = Object.create(null);
        reacoes.forEach(function (reacao) {
            if (!agrupadas[reacao.emoji]) {
                agrupadas[reacao.emoji] = { emoji: reacao.emoji, count: 0, minha: false };
            }
            agrupadas[reacao.emoji].count += 1;
            if (reacao.member_id === String(window.membroId || '')) {
                agrupadas[reacao.emoji].minha = true;
            }
        });
        Object.keys(agrupadas).forEach(function (emoji) {
            var grupo = agrupadas[emoji];
            var $reacao = $('<span>', {
                class: 'chat-reacao' + (grupo.minha ? ' minha-reacao' : ''),
                'data-emoji': grupo.emoji,
                text: grupo.emoji + (grupo.count > 1 ? ' ' + grupo.count : '')
            });
            $zona.append($reacao);
        });
        $zona.prop('hidden', false);
    }
    function artigoMensagemPorId(mensagemId) {
        return $conteudo.find('.chat-mensagem[data-mensagem-id="' + String(Number(mensagemId) || 0) + '"]');
    }
    function animarCoracaoMensagem(mensagemId) {
        var $artigo = artigoMensagemPorId(mensagemId);
        if (!$artigo.length) {
            return;
        }
        $artigo.find('.chat-coracao-feedback').remove();
        var $coracao = $('<span>', { class: 'chat-coracao-feedback', text: '❤️', 'aria-hidden': 'true' });
        $artigo.append($coracao);
        window.requestAnimationFrame(function () {
            $coracao.addClass('visivel');
        });
        window.setTimeout(function () {
            $coracao.removeClass('visivel');
            window.setTimeout(function () {
                $coracao.remove();
            }, 220);
        }, 520);
    }
    function obterMinhaReacao($artigo) {
        var $reacao = $artigo.find('.chat-reacao.minha-reacao').first();
        return String($reacao.attr('data-emoji') || '');
    }
    async function enviarReacao(mensagemId, emoji, alternar) {
        mensagemId = Number(mensagemId) || 0;
        emoji = String(emoji || '');
        if (!mensagemId || !emoji) {
            return;
        }
        try {
            var corpo = new URLSearchParams();
            corpo.set('action', 'react');
            corpo.set('message_id', String(mensagemId));
            corpo.set('emoji', emoji);
            corpo.set('toggle', alternar ? '1' : '0');
            var resposta = await fetch(conversaUrl(), {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: corpo.toString()
            });
            var dados = await resposta.json();
            if (!resposta.ok || !dados.success) {
                throw new Error(dados.message || 'Não foi possível reagir à mensagem.');
            }
            renderizarReacoesMensagem(artigoMensagemPorId(mensagemId), dados.reactions || []);
            var ficouComCoracao = (dados.reactions || []).some(function (reacao) {
                return (
                    String((reacao && (reacao.member_id || reacao.membro_id)) || '') ===
                        String(window.membroId || '') && String((reacao && reacao.emoji) || '') === '❤️'
                );
            });
            if (emoji === '❤️' && ficouComCoracao) {
                animarCoracaoMensagem(mensagemId);
            }
            if (window.AppWebSocket && typeof window.AppWebSocket.send === 'function') {
                window.AppWebSocket.send({ type: 'chat_reaction', message_id: mensagemId });
            }
        } catch (erro) {
            console.error(erro);
            if (typeof window.mostrarMensagemTemporaria === 'function') {
                window.mostrarMensagemTemporaria(erro.message || 'Não foi possível reagir à mensagem.', 'erro');
            }
        }
    }
    function removerMensagemDoChat(mensagemId, animar) {
        var $artigo = artigoMensagemPorId(mensagemId);
        if (!$artigo.length) {
            return;
        }
        if (animar === false) {
            $artigo.remove();
            return;
        }
        $artigo.css({ transition: 'opacity 160ms ease, transform 180ms ease', opacity: '0', transform: 'scale(.96)' });
        window.setTimeout(function () {
            $artigo.remove();
        }, 190);
    }
    async function apagarMensagem(mensagemId) {
        mensagemId = Number(mensagemId) || 0;
        if (!mensagemId) {
            return;
        }
        var $artigo = artigoMensagemPorId(mensagemId);
        if (!$artigo.length || String($artigo.attr('data-emissor-id') || '') !== String(window.membroId || '')) {
            return;
        }
        try {
            var corpo = new URLSearchParams();
            corpo.set('action', 'delete_message');
            corpo.set('message_id', String(mensagemId));
            var resposta = await fetch(conversaUrl(), {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: corpo.toString()
            });
            var dados = await resposta.json();
            if (!resposta.ok || !dados.success) {
                throw new Error(dados.message || 'Não foi possível apagar a mensagem.');
            }
            removerMensagemDoChat(mensagemId, true);
            if (window.AppWebSocket && typeof window.AppWebSocket.send === 'function') {
                window.AppWebSocket.send({ type: 'chat_delete', message_id: mensagemId });
            }
        } catch (erro) {
            console.error(erro);
            if (typeof window.mostrarMensagemTemporaria === 'function') {
                window.mostrarMensagemTemporaria(erro.message || 'Não foi possível apagar a mensagem.', 'erro');
            }
        }
    }
    function fecharMenuReacoes() {
        if (!$menuReacoes || !$menuReacoes.length) {
            return;
        }
        $menuReacoes.removeClass('visivel');
        $menuReacoes.attr('aria-hidden', 'true');
        $menuReacoes.removeAttr('data-mensagem-id');
    }
    function garantirMenuReacoes() {
        if ($menuReacoes && $menuReacoes.length && $menuReacoes[0].isConnected) {
            return $menuReacoes;
        }
        $menuReacoes = $('<div>', {
            id: 'chat-menu-reacoes',
            class: 'chat-menu-reacoes',
            role: 'menu',
            'aria-label': 'Reagir à mensagem',
            'aria-hidden': 'true'
        });
        ['❤️', '😂', '😮', '😢', '😍', '🔥'].forEach(function (emoji) {
            $menuReacoes.append(
                $('<button>', {
                    type: 'button',
                    class: 'chat-menu-reacao',
                    'data-emoji': emoji,
                    'aria-label': 'Reagir com ' + emoji,
                    text: emoji
                })
            );
        });
        $menuReacoes.append(
            $('<button>', {
                type: 'button',
                class: 'chat-menu-reacao chat-menu-apagar',
                'data-action': 'delete',
                'aria-label': 'Apagar mensagem',
                text: '🗑️',
                hidden: true
            })
        );
        $('body').append($menuReacoes);
        return $menuReacoes;
    }
    function abrirMenuReacoes($artigo) {
        if (!$artigo || !$artigo.length) {
            return;
        }
        var mensagemId = Number($artigo.attr('data-mensagem-id')) || 0;
        if (!mensagemId) {
            return;
        }
        var $menu = garantirMenuReacoes();
        var minhaMensagem = String($artigo.attr('data-emissor-id') || '') === String(window.membroId || '');
        $menu.find('[data-action="delete"]').prop('hidden', !minhaMensagem);
        var rect = $artigo[0].getBoundingClientRect();
        var largura = Math.min(minhaMensagem ? 364 : 326, window.innerWidth - 24);
        var esquerda = Math.max(
            12,
            Math.min(window.innerWidth - largura - 12, rect.left + rect.width / 2 - largura / 2)
        );
        $menu.css({ width: largura + 'px', left: esquerda + 'px', top: '0px' });
        $menu.attr('data-mensagem-id', String(mensagemId));
        var minhaReacao = obterMinhaReacao($artigo);
        $menu.find('.chat-menu-reacao').each(function () {
            $(this).toggleClass('ativa', String($(this).attr('data-emoji')) === minhaReacao);
        });
        $menu.addClass('medir');
        var altura = $menu.outerHeight() || 58;
        var topo = rect.top - altura - 10;
        if (topo < 12) {
            topo = Math.min(window.innerHeight - altura - 12, rect.bottom + 10);
        }
        $menu.css('top', Math.max(12, topo) + 'px');
        $menu.removeClass('medir');
        window.requestAnimationFrame(function () {
            $menu.attr('aria-hidden', 'false').addClass('visivel');
        });
    }
    function cancelarGestoReacao() {
        if (!gestoReacao) {
            return;
        }
        if (gestoReacao.timer) {
            window.clearTimeout(gestoReacao.timer);
        }
        gestoReacao = null;
    }
    function iniciarGestoReacao(evento) {
        var original = evento.originalEvent || evento;
        if (original.pointerType === 'mouse' && original.button !== 0) {
            return;
        }
        if ($(evento.target).closest('button, a, video, input, textarea').length) {
            return;
        }
        var $artigo = $(evento.currentTarget).closest('.chat-mensagem');
        var mensagemId = Number($artigo.attr('data-mensagem-id')) || 0;
        if (!mensagemId) {
            return;
        }
        cancelarGestoReacao();
        gestoReacao = {
            pointerId: original.pointerId,
            $alvoPointer: $(evento.currentTarget),
            mensagemId: mensagemId,
            $artigo: $artigo,
            inicioX: Number(original.clientX) || 0,
            inicioY: Number(original.clientY) || 0,
            moveu: false,
            longo: false,
            timer: null
        };
        if (
            original.pointerId !== undefined &&
            evento.currentTarget &&
            typeof evento.currentTarget.setPointerCapture === 'function'
        ) {
            try {
                evento.currentTarget.setPointerCapture(original.pointerId);
            } catch (erro) {
                /* O Safari pode recusar a captura do ponteiro. */
            }
        }
        gestoReacao.timer = window.setTimeout(function () {
            if (!gestoReacao || gestoReacao.moveu) {
                return;
            }
            gestoReacao.longo = true;
            abrirMenuReacoes(gestoReacao.$artigo);
            if (window.MargotHaptics && typeof window.MargotHaptics.play === 'function') {
                window.MargotHaptics.play('messageReceived');
            }
        }, LONG_PRESS_REACAO_MS);
    }
    function moverGestoReacao(evento) {
        if (!gestoReacao) {
            return;
        }
        var original = evento.originalEvent || evento;
        if (
            original.pointerId !== undefined &&
            gestoReacao.pointerId !== undefined &&
            original.pointerId !== gestoReacao.pointerId
        ) {
            return;
        }
        var dx = (Number(original.clientX) || 0) - gestoReacao.inicioX;
        var dy = (Number(original.clientY) || 0) - gestoReacao.inicioY;
        if (Math.hypot(dx, dy) > 28) {
            gestoReacao.moveu = true;
            if (gestoReacao.timer) {
                window.clearTimeout(gestoReacao.timer);
                gestoReacao.timer = null;
            }
        }
    }
    function terminarGestoReacao(evento) {
        if (!gestoReacao) {
            return;
        }
        var original = evento.originalEvent || evento;
        if (
            original.pointerId !== undefined &&
            gestoReacao.pointerId !== undefined &&
            original.pointerId !== gestoReacao.pointerId
        ) {
            return;
        }
        var gesto = gestoReacao;
        if (
            gesto.$alvoPointer &&
            gesto.$alvoPointer.length &&
            original.pointerId !== undefined &&
            typeof gesto.$alvoPointer[0].releasePointerCapture === 'function'
        ) {
            try {
                if (
                    typeof gesto.$alvoPointer[0].hasPointerCapture !== 'function' ||
                    gesto.$alvoPointer[0].hasPointerCapture(original.pointerId)
                ) {
                    gesto.$alvoPointer[0].releasePointerCapture(original.pointerId);
                }
            } catch (erro) {
                /* O ponteiro pode já ter sido libertado. */
            }
        }
        cancelarGestoReacao();
        if (gesto.moveu || gesto.longo) {
            return;
        }
        var agora = Date.now();
        if (ultimoTapReacao.id === gesto.mensagemId && agora - ultimoTapReacao.instante <= DOUBLE_TAP_REACAO_MS) {
            ultimoTapReacao.id = 0;
            ultimoTapReacao.instante = 0;
            enviarReacao(gesto.mensagemId, '❤️', true);
            return;
        }
        ultimoTapReacao.id = gesto.mensagemId;
        ultimoTapReacao.instante = agora;
    }
    function bind() {
        $mensagens.on('pointerdown' + NS, '.chat-balao', iniciarGestoReacao);
        $mensagens.on('contextmenu' + NS, '.chat-balao', function (evento) {
            evento.preventDefault();
        });
        $mensagens.on('pointermove' + NS, '.chat-balao', moverGestoReacao);
        $mensagens.on('pointerup' + NS + ' pointercancel' + NS, '.chat-balao', terminarGestoReacao);
        $(document).on('pointerdown' + NS, function (evento) {
            if (
                $menuReacoes &&
                $menuReacoes.length &&
                !$menuReacoes.is(evento.target) &&
                !$menuReacoes.has(evento.target).length
            ) {
                fecharMenuReacoes();
            }
        });
        $(document).on('click' + NS, '.chat-menu-reacao', function () {
            var $botao = $(this);
            var mensagemId = Number($menuReacoes && $menuReacoes.attr('data-mensagem-id')) || 0;
            if (!mensagemId) {
                return;
            }
            var acao = String($botao.attr('data-action') || '');
            if (acao === 'delete') {
                fecharMenuReacoes();
                apagarMensagem(mensagemId);
                return;
            }
            var emoji = String($botao.attr('data-emoji') || '');
            if (!emoji) {
                return;
            }
            fecharMenuReacoes();
            enviarReacao(mensagemId, emoji, true);
        });
    }
    function destroy() {
        cancelarGestoReacao();
        if ($menuReacoes) $menuReacoes.remove();
        $menuReacoes = null;
    }
    return {
        bind: bind,
        destroy: destroy,
        renderizarReacoesMensagem: renderizarReacoesMensagem,
        artigoMensagemPorId: artigoMensagemPorId,
        removerMensagemDoChat: removerMensagemDoChat
    };
};
