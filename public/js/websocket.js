var ws = new WebSocket('ws://' + location.host + '/ws');

var botao = window.document.querySelector('#botao');
botao.addEventListener('click', enviar);

function enviar() {
    var largura = $(window).width();
    var altura = $(window).height();

    var data = {
        largura: largura,
        altura: altura
    };

    ws.send(JSON.stringify(data));
}