var ws = new WebSocket('ws://' + location.hostname + ':8080');

ws.onopen = function () {
    console.log('WebSocket ligado');
};

$('#botoes').on('click', 'input[type="button"]', function(e) {
    var top = 0;
    var left = 0;

    switch ($(this).val()) {
        case '⬆️': top = -25; break;
        case '⬇️': top = 25; break;
        case '➡️': left = 25; break;
        case '⬅️': left = -25; break;
    }

    ws.send(JSON.stringify({
        type: 'move',
        top: top,
        left: left
    }));
});

ws.onmessage = function(event) {
    var data = JSON.parse(event.data);

    var idsAtuais = data.map(function(pessoa) {
        return String(pessoa.id);
    });

    // 1. ANIMAÇÃO DE SAÍDA
    $('.foto').each(function() {
        var $this = $(this);
        
        if (!idsAtuais.includes($this.attr('id')) && !$this.hasClass('a-remover')) {
            $this.addClass('a-remover'); 
            
            $this.css({
                'transition': 'opacity 0.4s ease-out',
                'opacity': '0'
            });
            
            setTimeout(function() {
                $this.remove();
                // CORREÇÃO CRÍTICA: Se apagámos uma foto do HTML, temos de avisar 
                // o mapa para a apagar da memória, senão o Safari colapsa.
                if (typeof inicializarFotos === 'function') inicializarFotos();
            }, 400);
        }
    });

    // 2. CRIAÇÃO DE FRAGMENTO (O segredo da performance no iOS)
    // Montamos as imagens aqui primeiro, para não engasgar o telemóvel
    var fragmento = document.createDocumentFragment();
    var inseriuNovasFotos = false;

    // 3. ANIMAÇÃO DE ENTRADA
    data.forEach(function(pessoa) {
        if (!pessoa.src || pessoa.src.trim() === '') return;

        var id = String(pessoa.id);
        var imgExistente = document.getElementById(id);

        if (imgExistente) {
            var $img = $(imgExistente);
            $img.attr('data-top', pessoa.top);
            $img.attr('data-left', pessoa.left);
        } else {
            inseriuNovasFotos = true;
            var $img = $('<img>');
            $img.attr('id', id);
            $img.addClass('foto');
            
            $img.css({
                'opacity': '0',
                'transition': 'opacity 0.4s ease-out'
            });

            // Obriga o iOS a não parar o site enquanto processa a imagem
            $img[0].decoding = 'async';

            $img.on('load', function() {
                $(this).css('opacity', '1');
            });

            $img.on('error', function() {
                $(this).hide();
            });

            $img.attr('data-top', pessoa.top);
            $img.attr('data-left', pessoa.left);
            $img.attr('src', pessoa.src);

            // Adiciona ao bloco invisível em vez do body
            fragmento.appendChild($img[0]);
        }
    });

    // Cola todas as fotos novas na página numa única operação super rápida
    if (inseriuNovasFotos) {
        document.body.appendChild(fragmento);
    }

    // Atualiza a memória matemática do mapa (com sistema anti-spam para redes rápidas)
    clearTimeout(window.mapInitTimeout);
    window.mapInitTimeout = setTimeout(function() {
        if (typeof inicializarFotos === 'function') {
            inicializarFotos();
        }
    }, 50);
};

ws.onerror = function (error) {
    console.error('Erro no WebSocket:', error);
};

ws.onclose = function () {
    console.log('WebSocket fechado');
};