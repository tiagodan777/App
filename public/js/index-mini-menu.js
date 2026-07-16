(function (window, document, $) {
    'use strict';

    var $miniMenu = $('.mini-menu');
    var aEnviarHey = false;

    if ($miniMenu.length === 0) return;

    function texto(valor) {
        return String(valor || '').trim();
    }

    function urlFoto(valor) {
        var caminho = texto(valor) || '/imagens/fotos-perfil/default.webp';

        try {
            return new URL(caminho, window.location.href).href;
        } catch (erro) {
            return '/imagens/fotos-perfil/default.webp';
        }
    }

    function obterMembroId(elemento) {
        return texto(
            elemento.getAttribute('data-membro-id') ||
            elemento.getAttribute('data-id') ||
            elemento.id
        );
    }

    function prepararMiniMenu(elemento) {
        if (!elemento) return false;

        var membroId = obterMembroId(elemento);
        if (!membroId) return false;

        var nome = obterNome(elemento) || 'Utilizador';
        var foto = obterFoto(elemento);
        var souEu = membroId === texto(window.membroId);
        var imagem = $miniMenu.find('header img').get(0);

        $miniMenu.attr('data-destinatario-id', membroId);
        $miniMenu.toggleClass('perfil-proprio', souEu);

        if (imagem) {
            imagem.onerror = function () {
                this.onerror = null;
                this.src = urlFoto('/imagens/fotos-perfil/default.webp');
            };

            imagem.src = foto;
            imagem.alt = nome;
        }

        $miniMenu.find('header h1').text(nome);

        if (window.messagesUrl) {
            $miniMenu.find('form').attr('action', window.messagesUrl + '?sendTo=' + encodeURIComponent(membroId));
        }

        return true;
    }

    function mostrarMensagem(mensagem, tipo) {
        if (typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(mensagem, tipo);
        }
    }

    function libertarBotaoHey() {
        aEnviarHey = false;
        $('#enviar-hey').prop('disabled', false).removeAttr('aria-busy');
    }

    window.prepararMiniMenuDaFoto = prepararMiniMenu;

    $(document).on('pointerdown click', '.foto', function () {
        prepararMiniMenu(this);
    });

    $(document).on('click', '#enviar-hey', function (evento) {
        evento.preventDefault();
        evento.stopPropagation();

        if (aEnviarHey) return;

        var $botao = $(this);
        var destinatarioId = texto($miniMenu.attr('data-destinatario-id'));

        if (!destinatarioId) {
            mostrarMensagem('Seleciona primeiro uma pessoa.', 'erro');
            return;
        }

        if (!window.AppWebSocket || !window.AppWebSocket.isConnected()) {
            mostrarMensagem('A ligação está a ser restabelecida.', 'erro');
            if (window.AppWebSocket) window.AppWebSocket.connect();
            return;
        }

        aEnviarHey = true;
        $botao.prop('disabled', true).attr('aria-busy', 'true');

        var enviado = window.AppWebSocket.send({
            type: 'notify',
            destinatario_id: destinatarioId
        });

        if (!enviado) {
            libertarBotaoHey();
            mostrarMensagem('Não foi possível enviar o Hey.', 'erro');
            return;
        }

        window.setTimeout(libertarBotaoHey, 1200);
    });

    window.addEventListener('app:hey-enviado', libertarBotaoHey);
    window.addEventListener('app:hey-erro', libertarBotaoHey);
})(window, document, jQuery);