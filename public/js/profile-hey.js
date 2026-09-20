(function (window, document) {
    'use strict';

    var botao = document.getElementById('enviar-hey-perfil');
    if (!botao) {
        return;
    }
    var etiqueta = botao.querySelector('.perfil-hey-label');
    var estadoAcessivel = document.getElementById('perfil-hey-estado');
    var temporizadorReposicao = null;
    var temporizadorConfirmacao = null;
    var aEnviar = false;
    var textoInicial = etiqueta ? etiqueta.textContent : 'Hey';

    function detalheCorresponde(evento) {
        var detalhe = evento && evento.detail ? evento.detail : {};
        return String(detalhe.destinatario_id || '') === String(botao.dataset.destinatarioId || '');
    }

    function alterarEtiqueta(texto) {
        if (etiqueta) {
            etiqueta.textContent = texto;
        }
    }

    function anunciar(texto) {
        if (estadoAcessivel) {
            estadoAcessivel.textContent = texto;
        }
    }

    function limparTemporizadorConfirmacao() {
        if (temporizadorConfirmacao === null) {
            return;
        }
        window.clearTimeout(temporizadorConfirmacao);
        temporizadorConfirmacao = null;
    }

    function reporBotao() {
        limparTemporizadorConfirmacao();
        aEnviar = false;
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        botao.classList.remove('a-enviar', 'enviado');
        alterarEtiqueta(textoInicial);
    }

    function mostrarMensagem(texto, tipo) {
        anunciar(texto);
        if (typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(texto, tipo || 'erro');
        }
    }

    function enviarHey() {
        var destinatarioId = botao.dataset.destinatarioId;
        if (aEnviar || !destinatarioId) {
            return;
        }
        if (
            !window.AppWebSocket ||
            typeof window.AppWebSocket.isConnected !== 'function' ||
            !window.AppWebSocket.isConnected()
        ) {
            if (window.AppWebSocket && typeof window.AppWebSocket.connect === 'function') {
                window.AppWebSocket.connect();
            }
            mostrarMensagem('A ligação está a ser restabelecida.', 'erro');
            return;
        }
        aEnviar = true;
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
        botao.classList.add('a-enviar');
        alterarEtiqueta('A enviar…');
        anunciar('A enviar o Hey.');
        var enviado = window.AppWebSocket.send({ type: 'notify', destinatario_id: destinatarioId });
        if (!enviado) {
            reporBotao();
            mostrarMensagem('Não foi possível enviar o Hey.', 'erro');
            return;
        }
        temporizadorConfirmacao = window.setTimeout(function () {
            temporizadorConfirmacao = null;
            reporBotao();
            anunciar('Não foi recebida confirmação do envio. Podes tentar novamente.');
        }, 8000);
    }

    function aoEnviarHey(evento) {
        if (!detalheCorresponde(evento)) {
            return;
        }
        limparTemporizadorConfirmacao();
        aEnviar = false;
        botao.disabled = true;
        botao.removeAttribute('aria-busy');
        botao.classList.remove('a-enviar');
        // botao.classList.add('enviado');
        // alterarEtiqueta('Enviado');
        anunciar('Hey enviado com sucesso.');
        if (temporizadorReposicao !== null) {
            window.clearTimeout(temporizadorReposicao);
        }
        temporizadorReposicao = window.setTimeout(function () {
            temporizadorReposicao = null;
            reporBotao();
        }, 1600);
    }

    function aoFalharHey(evento) {
        if (!detalheCorresponde(evento)) {
            return;
        }
        reporBotao();
        mostrarMensagem('Não foi possível enviar o Hey.', 'erro');
    }

    function desativarPagina() {
        if (temporizadorReposicao !== null) {
            window.clearTimeout(temporizadorReposicao);
        }
        limparTemporizadorConfirmacao();
        botao.removeEventListener('click', enviarHey);
        window.removeEventListener('app:hey-enviado', aoEnviarHey);
        window.removeEventListener('app:hey-erro', aoFalharHey);
        document.removeEventListener('margot:page-leave', desativarPagina);
    }
    botao.addEventListener('click', enviarHey);
    window.addEventListener('app:hey-enviado', aoEnviarHey);
    window.addEventListener('app:hey-erro', aoFalharHey);
    document.addEventListener('margot:page-leave', desativarPagina);
})(window, document);
