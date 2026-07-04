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

var botao = window.document.querySelector('#botao');
botao.addEventListener('click', enviar);

function enviar() {
    var pessoas = [];

    var $imagens = $('.foto');

    $imagens.each(function() {
        var dados = {
            id: this.attr('id'),
            top: this.offset().top,
            left: this.offset().left
        };

        pessoas.push(dados);
    })

    var data = {
        pessoas: pessoas
    };

    ws.send(JSON.stringify(data));
}