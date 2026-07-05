var protocoloWS = location.protocol === 'https:' ? 'wss://' : 'ws://';
var wsUrl = protocoloWS + location.hostname + ':8080';

console.log('A tentar WebSocket:', wsUrl);

var ws = new WebSocket(wsUrl);

ws.onopen = function () {
    console.log('WebSocket ligado');
};

ws.onerror = function (error) {
    console.error('Erro WebSocket:', error);
};

ws.onclose = function (e) {
    console.log('WebSocket fechado:', e.code, e.reason);
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
