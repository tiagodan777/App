var ws = new WebSocket(
    'ws://' + location.hostname + ':8080'
);

ws.onopen = function () {
    console.log('WebSocket ligado');

    ws.send(JSON.stringify({
        type: 'auth',
        membro_id: window.membroId
    }));
};

$('#botoes').on(
    'click',
    'input[type="button"]',
    function () {
        var top = 0;
        var left = 0;

        switch ($(this).val()) {
            case '⬆️':
                top = -25;
                break;

            case '⬇️':
                top = 25;
                break;

            case '➡️':
                left = 25;
                break;

            case '⬅️':
                left = -25;
                break;
        }

        if (
            ws.readyState !==
            WebSocket.OPEN
        ) {
            return;
        }

        ws.send(JSON.stringify({
            type: 'move',
            top: top,
            left: left
        }));
    }
);

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

    if (!Array.isArray(data)) {
        console.error(
            'O estado recebido não é um array:',
            data
        );

        return;
    }

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
        if (!pessoa || pessoa.id === undefined) {
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

                src: src
            });

            return;
        }

        inseriuNovasFotos = true;

        var $img = $('<img>', {
            id: id,
            class: 'foto',
            src: src,
            alt: 'Foto de perfil'
        });

        $img.attr({
            'data-top':
                Number(pessoa.top) || 0,

            'data-left':
                Number(pessoa.left) || 0,

            'data-membro-id':
                pessoa.membro_id || ''
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
};

ws.onerror = function (error) {
    console.error(
        'Erro no WebSocket:',
        error
    );
};

ws.onclose = function (event) {
    console.log(
        'WebSocket fechado',
        event.code,
        event.reason
    );
};