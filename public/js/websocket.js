var ws = new WebSocket('ws://' + location.hostname + ':8080');

var resourceId;

ws.onopen = function (data) {
    console.log('WebSocket ligado');
};

/*var botao = window.document.querySelector('#botao');
botao.addEventListener('click', enviar);*/

$('#botoes').on('click', 'input[type="button"]', function(e) {
    var top;
    var left;

    console.log($(this).val());

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

    var move = {
        type: 'move',
        top: top,
        left: left
    };

    ws.send(JSON.stringify(move));
})

ws.onmessage = function(event) {
    var data = JSON.parse(event.data);

    var idsAtuais = data.map(function(pessoa) {
        return String(pessoa.id);
    });

    $('.foto').each(function() {
        if (!idsAtuais.includes($(this).attr('id'))) {
            $(this).remove();
        }
    });

    minhaPosicao = null;

    data.forEach(function(pessoa) {
        var id = String(pessoa.id);

        var imgExistente = document.getElementById(id);
        var $img;

        if (imgExistente) {
            $img = $(imgExistente);
        } else {
            $img = $('<img>');
            $img.attr('id', id);
            $img.attr('src', pessoa.src);
            $img.addClass('foto');
            $('body').append($img);
        }

        $img.attr('data-top', pessoa.top);
        $img.attr('data-left', pessoa.left);

        if (pessoa.souEu === true) {
            minhaPosicao = {
                top: Number(pessoa.top),
                left: Number(pessoa.left),
                id: id
            };

            $img.addClass('minha-foto');
        } else {
            $img.removeClass('minha-foto');
        }
    });

    console.log('minhaPosicao:', minhaPosicao);

    aplicarTransform();
};

ws.onerror = function (error) {
    console.error('Erro no WebSocket:', error);
};

ws.onclose = function (id) {
    console.log('WebSocket fechado');
};


/*var pessoas = [];

    var $imagens = $('.foto');

    $imagens.each(function() {
        var dados = {
            id: $(this).attr('id'),
            top: $(this).offset().top,
            left: $(this).offset().left
        };

        pessoas.push(dados);
    });

    var data = {
        type: 'state',
        pessoas: pessoas
    };
    return data;*/