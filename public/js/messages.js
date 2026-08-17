(function (window, document, $) {
    'use strict';

    var $lista = $('#conversas-lista');
    var $erro = $('#conversas-erro');
    var temporizador = null;

    if (!$lista.length) return;

    function baseUrl() {
        return String(
            window.messagesUrl ||
            '/messages'
        ).replace(/\/+$/, '');
    }

    function dataLocal(valor) {
        if (!valor) return '';

        var texto = String(valor);

        var data = new Date(
            texto.replace(' ', 'T') +
            (
                texto.includes('Z')
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

        var hoje = new Date();

        return (
            data.toDateString() ===
            hoje.toDateString()
        )
            ? data.toLocaleTimeString(
                'pt-PT',
                {
                    hour: '2-digit',
                    minute: '2-digit'
                }
            )
            : data.toLocaleDateString(
                'pt-PT',
                {
                    day: '2-digit',
                    month: '2-digit'
                }
            );
    }

    function criarConversa(
        conversa
    ) {
        var $link = $('<a>', {
            href:
                conversa.chat_url,

            class:
                'conversa-item',

            'data-membro-id':
                conversa.outro_id,

            'data-mensagem-id':
                conversa.id
        });

        var $foto = $('<img>', {
            src:
                conversa.outro_foto_url,

            alt:
                'Fotografia de ' +
                conversa.outro_nome
        });

        $foto.on(
            'error',
            function () {
                this.onerror = null;

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
                        conversa.criada_em
                    )
                )
            );

        if (
            Number(
                conversa.nao_lidas
            ) > 0
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

        if (!conversas.length) {
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
            function (conversa) {
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

        if (!$badge.length) {
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
                total > 99
                    ? '99+'
                    : total
            )
            .prop(
                'hidden',
                total < 1
            );
    }

    async function carregarConversas() {
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
                ) || 0
            );

            $erro
                .prop(
                    'hidden',
                    true
                )
                .text('');
        } catch (erro) {
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

    /*
     * Abre a conversa através do sistema
     * de navegação da Margot.
     *
     * Como o listener é delegado à lista,
     * também funciona para conversas que
     * sejam recriadas pelo AJAX.
     */
    function abrirConversa(
        evento
    ) {
        if (
            evento.defaultPrevented ||
            evento.button !== 0 ||
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

        /*
         * Links externos continuam a
         * comportar-se normalmente.
         */
        if (
            url.origin !==
            window.location.origin
        ) {
            return;
        }

        /*
         * Se o sistema de navegação ainda
         * não estiver disponível por algum
         * motivo, deixamos o link funcionar
         * normalmente como fallback.
         */
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

                    /*
                     * Chat entra sempre
                     * pela direita.
                     */
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
            ) || 0
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

    function desativarPagina() {
        if (
            temporizador !== null
        ) {
            window.clearInterval(
                temporizador
            );

            temporizador = null;
        }

        /*
         * Remove também o listener delegado
         * das conversas antes de abandonar
         * esta página.
         */
        $lista.off(
            '.margotMessages'
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
    }

    /*
     * Listener delegado:
     * continua a funcionar mesmo depois
     * de carregarConversas() reconstruir
     * completamente a lista.
     */
    $lista.on(
        'click.margotMessages',
        'a.conversa-item[href]',
        abrirConversa
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
})(
    window,
    document,
    jQuery
);