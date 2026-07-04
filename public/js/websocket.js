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
    var top = $('#tiago').offset().top;
    var left = $('#tiago').offset().left;

    var data = {
        top: largura,
        left: left
    };

    ws.send(JSON.stringify(data));
}