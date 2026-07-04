var ws = new WebSocket('ws://' + location.hostname + ':8080');

ws.onopen = function () {
    console.log('WebSocket ligado');
};

ws.onerror = function (error) {
    console.error('Erro no WebSocket:', error);
};

ws.onclose = function () {
    console.log('WebSocket fechado');
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

    state();
})

function state() {
    var pessoas = [];

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

    ws.send(JSON.stringify(data));
}

ws.onmessage = function(event) {
    var data = JSON.parse(event.data);
    console.log(data);
}