$(function () {
    /*
    |--------------------------------------------------------------------------
    | Criar ligação WebSocket
    |--------------------------------------------------------------------------
    */

    window.ws = new WebSocket(
        'ws://' + location.hostname + ':8080'
    );

    var ws = window.ws;

    /*
    |--------------------------------------------------------------------------
    | Ligação aberta
    |--------------------------------------------------------------------------
    */

    ws.onopen = function () {
        console.log('WebSocket ligado');

        if (!window.membroId) {
            console.error(
                'window.membroId não está definido.'
            );

            return;
        }

        ws.send(JSON.stringify({
            type: 'auth',
            membro_id: window.membroId
        }));
    };

    /*
    |--------------------------------------------------------------------------
    | Receber mensagens
    |--------------------------------------------------------------------------
    */

    ws.onmessage = function (event) {
        var data;

        try {
            data = JSON.parse(event.data);
        } catch (erro) {
            console.error(
                'Resposta WebSocket inválida:',
                event.data
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Notificação recebida
        |--------------------------------------------------------------------------
        */

        if (
            data &&
            !Array.isArray(data) &&
            data.type === 'notification'
        ) {
            mostrarNotificacao(data);
            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Confirmação de envio
        |--------------------------------------------------------------------------
        */

        if (
            data &&
            !Array.isArray(data) &&
            data.type === 'notification_sent'
        ) {
            mostrarMensagemTemporaria(
                data.message || 'Hey enviado.',
                'sucesso'
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Destinatário offline
        |--------------------------------------------------------------------------
        */

        if (
            data &&
            !Array.isArray(data) &&
            data.type ===
                'notification_not_delivered'
        ) {
            mostrarMensagemTemporaria(
                data.message ||
                    'Este utilizador não está online.',
                'erro'
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Erro devolvido pelo servidor
        |--------------------------------------------------------------------------
        */

        if (
            data &&
            !Array.isArray(data) &&
            data.type === 'error'
        ) {
            console.error(
                'Erro do WebSocket:',
                data.message
            );

            mostrarMensagemTemporaria(
                data.message ||
                    'Ocorreu um erro.',
                'erro'
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | O estado do mapa tem de ser um array
        |--------------------------------------------------------------------------
        */

        if (!Array.isArray(data)) {
            console.error(
                'Mensagem WebSocket desconhecida:',
                data
            );

            return;
        }

        atualizarPessoasNoMapa(data);
    };

    /*
    |--------------------------------------------------------------------------
    | Erro da ligação
    |--------------------------------------------------------------------------
    */

    ws.onerror = function (error) {
        console.error(
            'Erro no WebSocket:',
            error
        );
    };

    /*
    |--------------------------------------------------------------------------
    | Ligação fechada
    |--------------------------------------------------------------------------
    */

    ws.onclose = function (event) {
        console.log(
            'WebSocket fechado',
            event.code,
            event.reason
        );
    };
});

/*
|--------------------------------------------------------------------------
| Atualizar pessoas no mapa
|--------------------------------------------------------------------------
*/

function atualizarPessoasNoMapa(data) {
    var idsAtuais = data.map(
        function (pessoa) {
            return String(pessoa.id);
        }
    );

    /*
    |--------------------------------------------------------------------------
    | Remover ligações que já não existem
    |--------------------------------------------------------------------------
    */

    $('.foto').each(function () {
        var $foto = $(this);

        var id = String(
            $foto.attr('id') || ''
        );

        if (
            idsAtuais.includes(id) ||
            $foto.hasClass('a-remover')
        ) {
            return;
        }

        $foto.addClass('a-remover');

        $foto.css({
            transition:
                'opacity 0.4s ease-out',

            opacity: '0'
        });

        setTimeout(function () {
            $foto.remove();

            if (
                typeof inicializarFotos ===
                'function'
            ) {
                inicializarFotos();
            }
        }, 400);
    });

    /*
    |--------------------------------------------------------------------------
    | Criar e atualizar fotografias
    |--------------------------------------------------------------------------
    */

    var fragmento =
        document.createDocumentFragment();

    var inseriuNovasFotos = false;

    data.forEach(function (pessoa) {
        if (
            !pessoa ||
            pessoa.id === undefined
        ) {
            return;
        }

        var src = String(
            pessoa.src || ''
        ).trim();

        if (src === '') {
            src =
                '/imagens/fotos-perfil/default.webp';
        }

        var id = String(pessoa.id);

        var imgExistente =
            document.getElementById(id);

        if (imgExistente) {
            var $imgExistente =
                $(imgExistente);

            $imgExistente.attr({
                'data-top':
                    Number(pessoa.top) || 0,

                'data-left':
                    Number(pessoa.left) || 0,

                'data-membro-id':
                    pessoa.membro_id || '',

                'data-nome':
                    pessoa.nome || '',

                src: src
            });

            return;
        }

        inseriuNovasFotos = true;

        var $img = $('<img>', {
            id: id,

            class: 'foto',

            src: src,

            alt:
                pessoa.nome ||
                'Foto de perfil'
        });

        $img.attr({
            'data-top':
                Number(pessoa.top) || 0,

            'data-left':
                Number(pessoa.left) || 0,

            'data-membro-id':
                pessoa.membro_id || '',

            'data-nome':
                pessoa.nome || ''
        });

        $img.css({
            opacity: '0',

            transition:
                'opacity 0.4s ease-out'
        });

        $img[0].decoding = 'async';

        $img.on('load', function () {
            $(this).css(
                'opacity',
                '1'
            );
        });

        $img.on('error', function () {
            console.error(
                'Erro ao carregar imagem:',
                this.src
            );

            this.src =
                '/imagens/fotos-perfil/default.webp';

            $(this).css(
                'opacity',
                '1'
            );
        });

        fragmento.appendChild(
            $img[0]
        );
    });

    if (inseriuNovasFotos) {
        document.body.appendChild(
            fragmento
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Atualizar cache matemático do mapa
    |--------------------------------------------------------------------------
    */

    clearTimeout(
        window.mapInitTimeout
    );

    window.mapInitTimeout =
        setTimeout(function () {
            if (
                typeof inicializarFotos ===
                'function'
            ) {
                inicializarFotos();
            }
        }, 50);
}

/*
|--------------------------------------------------------------------------
| Mostrar notificação recebida
|--------------------------------------------------------------------------
*/

function mostrarNotificacao(data) {
    /*
     * Mostramos sempre uma notificação dentro da página.
     */
    mostrarNotificacaoInterna(data);

    /*
     * Se o browser tiver autorização, também mostramos
     * uma notificação do sistema.
     */
    if (!('Notification' in window)) {
        return;
    }

    if (
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
                        ),

                    data: {
                        membro_id:
                            data.from_member_id ||
                            ''
                    }
                }
            );

        notificacao.onclick =
            function () {
                window.focus();

                notificacao.close();

                var membroId =
                    notificacao.data
                        .membro_id;

                if (!membroId) {
                    return;
                }

                var $foto = $(
                    '.foto[data-membro-id="' +
                    membroId +
                    '"]'
                );

                if ($foto.length) {
                    $foto.first().trigger(
                        'click'
                    );
                }
            };
    } catch (erro) {
        console.error(
            'Erro ao mostrar notificação:',
            erro
        );
    }
}

/*
|--------------------------------------------------------------------------
| Notificação dentro da página
|--------------------------------------------------------------------------
*/

function mostrarNotificacaoInterna(data) {
    $('.notificacao-interna')
        .remove();

    var $notificacao = $('<button>', {
        type: 'button',

        class:
            'notificacao-interna',

        'data-membro-id':
            data.from_member_id || ''
    });

    var $foto = $('<img>', {
        src:
            data.from_photo ||
            '/imagens/fotos-perfil/default.webp',

        alt: ''
    });

    var $conteudo = $('<div>', {
        class:
            'notificacao-interna-conteudo'
    });

    var $titulo = $('<strong>')
        .text(
            data.title ||
            'Nova notificação'
        );

    var $texto = $('<span>')
        .text(
            data.body ||
            'Recebeste um Hey.'
        );

    $conteudo.append(
        $titulo,
        $texto
    );

    $notificacao.append(
        $foto,
        $conteudo
    );

    $('body').append(
        $notificacao
    );

    requestAnimationFrame(
        function () {
            $notificacao.addClass(
                'visivel'
            );
        }
    );

    var removerTimeout =
        setTimeout(function () {
            removerNotificacaoInterna(
                $notificacao
            );
        }, 5000);

    $notificacao.on(
        'click',
        function () {
            clearTimeout(
                removerTimeout
            );

            var membroId =
                $(this).attr(
                    'data-membro-id'
                );

            removerNotificacaoInterna(
                $(this)
            );

            if (!membroId) {
                return;
            }

            var $fotoPessoa = $(
                '.foto[data-membro-id="' +
                membroId +
                '"]'
            );

            if ($fotoPessoa.length) {
                $fotoPessoa
                    .first()
                    .trigger('click');
            }
        }
    );
}

function removerNotificacaoInterna(
    $notificacao
) {
    $notificacao.removeClass(
        'visivel'
    );

    setTimeout(function () {
        $notificacao.remove();
    }, 300);
}

/*
|--------------------------------------------------------------------------
| Mensagens de sucesso ou erro
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

    requestAnimationFrame(
        function () {
            $mensagem.addClass(
                'visivel'
            );
        }
    );

    setTimeout(function () {
        $mensagem.removeClass(
            'visivel'
        );

        setTimeout(function () {
            $mensagem.remove();
        }, 300);
    }, 3000);
}