(function (window, document, $) {
    'use strict';

    if (
        typeof window.desativarMessagesMargot ===
        'function'
    ) {
        window.desativarMessagesMargot();
    }

    var NS =
        '.margotMessages';

    var $lista =
        $('#conversas-lista');

    var $erro =
        $('#conversas-erro');

    var $dialog =
        $('#conversa-acoes');

    var $nomeDialog =
        $('#conversa-acoes-nome');

    var $bloquear =
        $('#conversa-bloquear');

    var $eliminar =
        $('#conversa-eliminar');

    var $cancelar =
        $('#conversa-cancelar');

    var temporizador =
        null;

    var temporizadorLongPress =
        null;

    var conversaSelecionada =
        null;

    var pressElemento =
        null;

    var pressX =
        0;

    var pressY =
        0;

    var pressPointerId =
        null;

    var ignorarCliqueAte =
        0;

    var aProcessar =
        false;

    var ativo =
        true;

    if (
        !$lista.length
    ) {
        return;
    }

    function baseUrl() {
        return String(
            window.messagesUrl ||
            '/messages'
        ).replace(
            /\/+$/,
            ''
        );
    }

    function safetyUrl() {
        return String(
            window.safetyUrl ||
            '/safety'
        ).replace(
            /\/+$/,
            ''
        );
    }

    function dataLocal(
        valor
    ) {
        if (
            !valor
        ) {
            return '';
        }

        var texto =
            String(
                valor
            );

        var data =
            new Date(
                texto.replace(
                    ' ',
                    'T'
                ) +
                (
                    texto.includes(
                        'Z'
                    )
                        ? ''
                        : 'Z'
                )
            );

        if (
            Number.isNaN(
                data.getTime()
            )
        ) {
            return '';
        }

        var hoje =
            new Date();

        return (
            data.toDateString() ===
            hoje.toDateString()
        )
            ? data.toLocaleTimeString(
                'pt-PT',
                {
                    hour:
                        '2-digit',

                    minute:
                        '2-digit'
                }
            )
            : data.toLocaleDateString(
                'pt-PT',
                {
                    day:
                        '2-digit',

                    month:
                        '2-digit'
                }
            );
    }

    function mostrarAviso(
        mensagem,
        tipo
    ) {
        if (
            typeof window
                .mostrarMensagemTemporaria ===
            'function'
        ) {
            window
                .mostrarMensagemTemporaria(
                    mensagem,
                    tipo
                );

            return;
        }

        if (
            tipo ===
            'erro'
        ) {
            $erro
                .text(
                    mensagem
                )
                .prop(
                    'hidden',
                    false
                );
        }
    }

    function criarConversa(
        conversa
    ) {
        var $link =
            $('<a>', {
                href:
                    conversa.chat_url,

                class:
                    'conversa-item',

                'data-membro-id':
                    conversa.outro_id,

                'data-mensagem-id':
                    conversa.id,

                'data-membro-nome':
                    conversa.outro_nome
            });

        var $foto =
            $('<img>', {
                src:
                    conversa
                        .outro_foto_url,

                alt:
                    'Fotografia de ' +
                    conversa
                        .outro_nome,

                draggable:
                    false
            });

        $foto.on(
            'error',
            function () {
                this.onerror =
                    null;

                this.src =
                    '/imagens/fotos-perfil/default.webp';
            }
        );

        var $conteudo =
            $('<span>', {
                class:
                    'conversa-conteudo'
            }).append(
                $('<strong>').text(
                    conversa.outro_nome
                ),

                $('<span>', {
                    class:
                        'conversa-resumo'
                }).text(
                    conversa.resumo
                )
            );

        var $meta =
            $('<span>', {
                class:
                    'conversa-meta'
            }).append(
                $('<time>', {
                    datetime:
                        conversa.criada_em
                }).text(
                    dataLocal(
                        conversa
                            .criada_em
                    )
                )
            );

        if (
            Number(
                conversa.nao_lidas
            ) >
            0
        ) {
            $meta.append(
                $('<span>', {
                    class:
                        'conversa-nao-lidas'
                }).text(
                    conversa.nao_lidas
                )
            );
        }

        return $link.append(
            $foto,
            $conteudo,
            $meta
        );
    }

    function mostrarConversas(
        conversas
    ) {
        $lista.empty();

        if (
            !conversas.length
        ) {
            $lista.append(
                $('<div>', {
                    class:
                        'conversas-vazio'
                }).append(
                    $('<span>').text(
                        '💬'
                    ),

                    $('<h2>').text(
                        'Ainda não há conversas'
                    ),

                    $('<p>').text(
                        'Abre uma pessoa no mapa e envia a primeira mensagem.'
                    )
                )
            );

            return;
        }

        var fragmento =
            document
                .createDocumentFragment();

        conversas.forEach(
            function (
                conversa
            ) {
                fragmento.appendChild(
                    criarConversa(
                        conversa
                    )[0]
                );
            }
        );

        $lista.append(
            fragmento
        );
    }

    function atualizarBadge(
        total
    ) {
        var $link =
            $(
                '#menuPrincipal a[href*="messages"]'
            ).first();

        var $badge =
            $link.find(
                '.mensagens-badge'
            );

        if (
            !$badge.length
        ) {
            $badge =
                $('<span>', {
                    class:
                        'mensagens-badge'
                }).appendTo(
                    $link
                );
        }

        $badge
            .text(
                total >
                99
                    ? '99+'
                    : total
            )
            .prop(
                'hidden',
                total <
                1
            );
    }

    async function carregarConversas() {
        if (
            !ativo
        ) {
            return;
        }

        try {
            var resposta =
                await fetch(
                    baseUrl() +
                    '?api=conversations',
                    {
                        credentials:
                            'same-origin',

                        cache:
                            'no-store'
                    }
                );

            var dados =
                await resposta.json();

            if (
                !resposta.ok ||
                !dados.success
            ) {
                throw new Error(
                    dados.message ||
                    'Não foi possível carregar as conversas.'
                );
            }

            mostrarConversas(
                Array.isArray(
                    dados.conversations
                )
                    ? dados.conversations
                    : []
            );

            atualizarBadge(
                Number(
                    dados.unread_count
                ) ||
                0
            );

            $erro
                .prop(
                    'hidden',
                    true
                )
                .text('');
        } catch (
            erro
        ) {
            if (
                !ativo
            ) {
                return;
            }

            $erro
                .text(
                    erro.message
                )
                .prop(
                    'hidden',
                    false
                );
        }
    }

    function ativarMenu() {
        $('#menuPrincipal a')
            .removeClass(
                'active'
            );

        $(
            '#menuPrincipal a[href*="messages"]'
        )
            .first()
            .addClass(
                'active'
            );
    }

    function cancelarLongPress() {
        if (
            temporizadorLongPress !==
            null
        ) {
            window.clearTimeout(
                temporizadorLongPress
            );

            temporizadorLongPress =
                null;
        }

        if (
            pressElemento
        ) {
            $(pressElemento)
                .removeClass(
                    'conversa-a-premir'
                );
        }

        pressElemento =
            null;

        pressPointerId =
            null;
    }

    function vibrarLongPress() {
        if (
            typeof navigator.vibrate !==
            'function'
        ) {
            return;
        }

        try {
            navigator.vibrate(
                12
            );
        } catch (
            erro
        ) {}
    }

    function abrirAcoesConversa(
        elemento
    ) {
        if (
            !elemento
        ) {
            return;
        }

        conversaSelecionada = {
            id:
                String(
                    elemento.getAttribute(
                        'data-membro-id'
                    ) ||
                    ''
                ),

            nome:
                String(
                    elemento.getAttribute(
                        'data-membro-nome'
                    ) ||
                    elemento.querySelector(
                        '.conversa-conteudo strong'
                    )
                        ?.textContent ||
                    'Utilizador'
                ).trim()
        };

        if (
            !conversaSelecionada.id
        ) {
            conversaSelecionada =
                null;

            return;
        }

        ignorarCliqueAte =
            Date.now() +
            700;

        $nomeDialog.text(
            conversaSelecionada.nome
        );

        vibrarLongPress();

        if (
            $dialog[0] &&
            typeof $dialog[0]
                .showModal ===
                'function'
        ) {
            if (
                !$dialog[0].open
            ) {
                $dialog[0]
                    .showModal();
            }
        } else {
            $dialog.attr(
                'open',
                ''
            );
        }
    }

    function fecharAcoesConversa() {
        conversaSelecionada =
            null;

        if (
            !$dialog[0]
        ) {
            return;
        }

        if (
            typeof $dialog[0]
                .close ===
                'function' &&
            $dialog[0].open
        ) {
            $dialog[0]
                .close();

            return;
        }

        $dialog.removeAttr(
            'open'
        );
    }

    function definirProcessamento(
        ocupado
    ) {
        aProcessar =
            ocupado;

        $bloquear
            .prop(
                'disabled',
                ocupado
            );

        $eliminar
            .prop(
                'disabled',
                ocupado
            );

        $cancelar
            .prop(
                'disabled',
                ocupado
            );
    }

    async function bloquearConversa() {
        if (
            aProcessar ||
            !conversaSelecionada
        ) {
            return;
        }

        var id =
            conversaSelecionada.id;

        var nome =
            conversaSelecionada.nome;

        if (
            !window.confirm(
                'Bloquear ' +
                nome +
                '? Deixam de se ver e já não poderão trocar mensagens.'
            )
        ) {
            return;
        }

        definirProcessamento(
            true
        );

        try {
            var dados =
                new FormData();

            dados.set(
                'action',
                'block'
            );

            dados.set(
                'target_id',
                id
            );

            var resposta =
                await fetch(
                    safetyUrl(),
                    {
                        method:
                            'POST',

                        body:
                            dados,

                        credentials:
                            'same-origin',

                        headers: {
                            'Accept':
                                'application/json',

                            'X-Requested-With':
                                'XMLHttpRequest'
                        }
                    }
                );

            var resultado =
                await resposta.json();

            if (
                !resposta.ok ||
                !resultado.success
            ) {
                throw new Error(
                    resultado.message ||
                    'Não foi possível bloquear esta pessoa.'
                );
            }

            fecharAcoesConversa();

            if (
                window.AppWebSocket &&
                window
                    .AppWebSocket
                    .isConnected()
            ) {
                window
                    .AppWebSocket
                    .send({
                        type:
                            'block_refresh',

                        target_id:
                            id
                    });
            }

            await carregarConversas();

            mostrarAviso(
                nome +
                ' foi bloqueado.',
                'sucesso'
            );
        } catch (
            erro
        ) {
            mostrarAviso(
                erro.message,
                'erro'
            );
        } finally {
            definirProcessamento(
                false
            );
        }
    }

    async function eliminarConversa() {
        if (
            aProcessar ||
            !conversaSelecionada
        ) {
            return;
        }

        var id =
            conversaSelecionada.id;

        var nome =
            conversaSelecionada.nome;

        if (
            !window.confirm(
                'Eliminar a conversa com ' +
                nome +
                '? A conversa será removida apenas para ti.'
            )
        ) {
            return;
        }

        definirProcessamento(
            true
        );

        try {
            var dados =
                new FormData();

            dados.set(
                'action',
                'delete_conversation'
            );

            var resposta =
                await fetch(
                    baseUrl() +
                    '/' +
                    encodeURIComponent(
                        id
                    ),
                    {
                        method:
                            'POST',

                        body:
                            dados,

                        credentials:
                            'same-origin',

                        headers: {
                            'Accept':
                                'application/json',

                            'X-Requested-With':
                                'XMLHttpRequest'
                        }
                    }
                );

            var resultado =
                await resposta.json();

            if (
                !resposta.ok ||
                !resultado.success
            ) {
                throw new Error(
                    resultado.message ||
                    'Não foi possível eliminar a conversa.'
                );
            }

            fecharAcoesConversa();

            await carregarConversas();

            mostrarAviso(
                'Conversa eliminada.',
                'sucesso'
            );
        } catch (
            erro
        ) {
            mostrarAviso(
                erro.message,
                'erro'
            );
        } finally {
            definirProcessamento(
                false
            );
        }
    }

    function iniciarLongPress(
        evento
    ) {
        if (
            aProcessar ||
            evento.button >
            0
        ) {
            return;
        }

        cancelarLongPress();

        pressElemento =
            evento.currentTarget;

        pressPointerId =
            evento.pointerId;

        pressX =
            evento.clientX;

        pressY =
            evento.clientY;

        $(pressElemento)
            .addClass(
                'conversa-a-premir'
            );

        temporizadorLongPress =
            window.setTimeout(
                function () {
                    temporizadorLongPress =
                        null;

                    var elemento =
                        pressElemento;

                    if (
                        !elemento
                    ) {
                        return;
                    }

                    $(elemento)
                        .removeClass(
                            'conversa-a-premir'
                        );

                    abrirAcoesConversa(
                        elemento
                    );

                    pressElemento =
                        null;

                    pressPointerId =
                        null;
                },
                480
            );
    }

    function moverLongPress(
        evento
    ) {
        if (
            !pressElemento ||
            evento.pointerId !==
            pressPointerId
        ) {
            return;
        }

        var dx =
            Math.abs(
                evento.clientX -
                pressX
            );

        var dy =
            Math.abs(
                evento.clientY -
                pressY
            );

        if (
            dx >
                10 ||
            dy >
                10
        ) {
            cancelarLongPress();
        }
    }

    function terminarLongPress(
        evento
    ) {
        if (
            pressPointerId !==
            null &&
            evento.pointerId !==
            pressPointerId
        ) {
            return;
        }

        cancelarLongPress();
    }

    function abrirConversa(
        evento
    ) {
        if (
            Date.now() <
            ignorarCliqueAte
        ) {
            evento.preventDefault();
            evento.stopImmediatePropagation();

            return;
        }

        if (
            evento.defaultPrevented ||
            evento.button !==
                0 ||
            evento.metaKey ||
            evento.ctrlKey ||
            evento.shiftKey ||
            evento.altKey
        ) {
            return;
        }

        var link =
            evento.currentTarget;

        if (
            !link ||
            !link.href
        ) {
            return;
        }

        var url =
            new URL(
                link.href,
                window.location.href
            );

        if (
            url.origin !==
            window.location.origin
        ) {
            return;
        }

        if (
            !window.MargotNavigation ||
            typeof window
                .MargotNavigation
                .navigate !==
                'function'
        ) {
            return;
        }

        evento.preventDefault();

        window
            .MargotNavigation
            .navigate(
                url.href,
                {
                    historico:
                        'push',

                    direcao:
                        1
                }
            );
    }

    function aoReceberContagem(
        evento
    ) {
        atualizarBadge(
            Number(
                evento.detail
                    .unread_count
            ) ||
            0
        );
    }

    function aoMudarVisibilidade() {
        if (
            document
                .visibilityState ===
            'visible'
        ) {
            carregarConversas();
        }
    }

    $lista.on(
        'pointerdown' + NS,
        'a.conversa-item[href]',
        iniciarLongPress
    );

    $lista.on(
        'pointermove' + NS,
        'a.conversa-item[href]',
        moverLongPress
    );

    $lista.on(
        'pointerup' + NS +
        ' pointercancel' + NS,
        'a.conversa-item[href]',
        terminarLongPress
    );

    $lista.on(
        'contextmenu' + NS,
        'a.conversa-item[href]',
        function (
            evento
        ) {
            evento.preventDefault();
        }
    );

    $lista.on(
        'click' + NS,
        'a.conversa-item[href]',
        abrirConversa
    );

    $dialog.on(
        'click' + NS,
        function (
            evento
        ) {
            if (
                evento.target ===
                this
            ) {
                fecharAcoesConversa();
            }
        }
    );

    $dialog.on(
        'cancel' + NS,
        function (
            evento
        ) {
            evento.preventDefault();

            fecharAcoesConversa();
        }
    );

    $bloquear.on(
        'click' + NS,
        bloquearConversa
    );

    $eliminar.on(
        'click' + NS,
        eliminarConversa
    );

    $cancelar.on(
        'click' + NS,
        fecharAcoesConversa
    );

    $(
        'time[data-data-mensagem]'
    ).each(
        function () {
            $(this).text(
                dataLocal(
                    $(this).attr(
                        'datetime'
                    )
                )
            );
        }
    );

    window.addEventListener(
        'app:chat-message',
        carregarConversas
    );

    window.addEventListener(
        'app:chat-unread-count',
        aoReceberContagem
    );

    window.addEventListener(
        'pagehide',
        desativarPagina
    );

    document.addEventListener(
        'visibilitychange',
        aoMudarVisibilidade
    );

    document.addEventListener(
        'margot:page-leave',
        desativarPagina
    );

    ativarMenu();

    temporizador =
        window.setInterval(
            carregarConversas,
            10000
        );

    function desativarPagina() {
        if (
            !ativo
        ) {
            return;
        }

        ativo =
            false;

        cancelarLongPress();

        if (
            temporizador !==
            null
        ) {
            window.clearInterval(
                temporizador
            );

            temporizador =
                null;
        }

        fecharAcoesConversa();

        $lista.off(
            NS
        );

        $dialog.off(
            NS
        );

        $bloquear.off(
            NS
        );

        $eliminar.off(
            NS
        );

        $cancelar.off(
            NS
        );

        window.removeEventListener(
            'app:chat-message',
            carregarConversas
        );

        window.removeEventListener(
            'app:chat-unread-count',
            aoReceberContagem
        );

        window.removeEventListener(
            'pagehide',
            desativarPagina
        );

        document.removeEventListener(
            'visibilitychange',
            aoMudarVisibilidade
        );

        document.removeEventListener(
            'margot:page-leave',
            desativarPagina
        );

        if (
            window.desativarMessagesMargot ===
            desativarPagina
        ) {
            delete window
                .desativarMessagesMargot;
        }
    }

    window.desativarMessagesMargot =
        desativarPagina;
})(
    window,
    document,
    jQuery
);