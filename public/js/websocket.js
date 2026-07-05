var ws = new WebSocket('ws://' + location.hostname + ':8080');

ws.onopen = function () {
    alert('WebSocket ligado');
    console.log('WebSocket ligado');
};

$('#botoes').on('click', 'input[type="button"]', function(e) {
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

    var move = {
        type: 'move',
        top: top,
        left: left
    };

    ws.send(JSON.stringify(move));
});

ws.onmessage = function(event) {
    var data = JSON.parse(event.data);

    console.log('DATA:', data);

    var idsAtuais = data.map(function(pessoa) {
        return String(pessoa.id);
    });

    $('.foto').each(function() {
        if (!idsAtuais.includes($(this).attr('id'))) {
            $(this).remove();
        }
    });

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
    });

    aplicarTransform();
};

ws.onerror = function (error) {
    console.error('Erro no WebSocket:', error);
};

ws.onclose = function () {
    console.log('WebSocket fechado');
};