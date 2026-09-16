(function (window, document) {
    'use strict';

    var botao = document.getElementById('conectar-perfil');
    if (!botao) {
        return;
    }
    var label = botao.querySelector('.perfil-conectar-label');
    var estado = document.getElementById('perfil-conectar-estado');
    var temporizador = null;
    var aEsperar = false;
    var aDesligar = false;

    function destinatarioId() {
        return String(botao.dataset.destinatarioId || '').trim();
    }

    function estaLigado() {
        return botao.dataset.ligado === '1';
    }

    function corresponde(evento) {
        var detalhe = evento && evento.detail ? evento.detail : {};
        var outro = String(detalhe.other_member_id || detalhe.outro_id || detalhe.destinatario_id || '').trim();
        return outro !== '' && outro === destinatarioId();
    }

    function anunciar(texto) {
        if (estado) {
            estado.textContent = texto || '';
        }
    }

    function mostrarErro(texto) {
        anunciar(texto);
        if (typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(texto, 'erro');
        }
    }

    function limparTemporizador() {
        if (temporizador !== null) {
            window.clearTimeout(temporizador);
            temporizador = null;
        }
    }

    function aplicarEstadoDesligado() {
        limparTemporizador();
        aEsperar = false;
        aDesligar = false;
        botao.dataset.ligado = '0';
        botao.disabled = false;
        botao.classList.remove('a-espera', 'a-desligar', 'ligado');
        botao.setAttribute('aria-pressed', 'false');
        if (label) {
            label.textContent = 'Conectar';
        }
    }

    function limparEspera() {
        limparTemporizador();
        aEsperar = false;
        if (!estaLigado()) {
            aplicarEstadoDesligado();
        }
    }

    function marcarLigado() {
        limparTemporizador();
        aEsperar = false;
        aDesligar = false;
        botao.dataset.ligado = '1';

        /*
         * Continua clicável para a pessoa poder
         * remover a ligação quando quiser.
         */
        botao.disabled = false;
        botao.classList.remove('a-espera', 'a-desligar');
        botao.classList.add('ligado');
        botao.setAttribute('aria-pressed', 'true');
        if (label) {
            label.textContent = 'Desconectar';
        }
        anunciar('Estão ligados na Margot. Podem conversar mesmo quando já não estão perto.');
    }

    function celebrar(nome) {
        if (document.querySelector('.perfil-conexao-celebracao')) {
            return;
        }
        var camada = document.createElement('div');
        camada.className = 'perfil-conexao-celebracao';
        camada.setAttribute('aria-hidden', 'true');
        var mensagem = document.createElement('div');
        mensagem.className = 'perfil-conexao-celebracao-mensagem';
        mensagem.textContent = nome ? 'Tu e ' + nome + ' estão ligados' : 'Agora estão ligados';
        camada.appendChild(mensagem);
        document.body.appendChild(camada);

        /*
         * Antes desaparecia em ~1,45 s.
         * Mantemos a celebração no ecrã tempo suficiente
         * para ser percebida sem parecer um flash.
         */
        window.setTimeout(function () {
            if (camada.parentNode) {
                camada.parentNode.removeChild(camada);
            }
        }, 2850);
    }

    function garantirWebSocket() {
        if (
            window.AppWebSocket &&
            typeof window.AppWebSocket.isConnected === 'function' &&
            window.AppWebSocket.isConnected()
        ) {
            return true;
        }
        if (window.AppWebSocket && typeof window.AppWebSocket.connect === 'function') {
            window.AppWebSocket.connect();
        }
        mostrarErro('A ligação está a ser restabelecida. Tenta novamente daqui a um instante.');
        return false;
    }

    function tentarConectar() {
        if (aEsperar || aDesligar || estaLigado()) {
            return;
        }
        var outroId = destinatarioId();
        if (!outroId) {
            return;
        }
        if (!garantirWebSocket()) {
            return;
        }
        var enviado = window.AppWebSocket.send({ type: 'connection_attempt', destinatario_id: outroId });
        if (!enviado) {
            mostrarErro('Não foi possível tentar a ligação.');
            return;
        }
        aEsperar = true;
        botao.disabled = true;
        botao.classList.add('a-espera');
        if (label) {
            label.textContent = 'Agora…';
        }
        anunciar('A outra pessoa tem um instante para tocar em Conectar.');
        temporizador = window.setTimeout(limparEspera, 1800);
    }

    function desconectar() {
        if (aEsperar || aDesligar || !estaLigado()) {
            return;
        }
        var outroId = destinatarioId();
        if (!outroId) {
            return;
        }
        if (!garantirWebSocket()) {
            return;
        }
        aDesligar = true;
        botao.disabled = true;
        botao.classList.add('a-desligar');
        if (label) {
            label.textContent = 'A desligar…';
        }
        var enviado = window.AppWebSocket.send({ type: 'connection_disconnect', destinatario_id: outroId });
        if (!enviado) {
            aDesligar = false;
            marcarLigado();
            mostrarErro('Não foi possível remover a ligação.');
            return;
        }
        limparTemporizador();
        temporizador = window.setTimeout(function () {
            if (!aDesligar) {
                return;
            }
            aDesligar = false;
            marcarLigado();
            mostrarErro('Não foi recebida confirmação. Tenta novamente.');
        }, 8000);
    }

    function aoClicar() {
        if (estaLigado()) {
            desconectar();
            return;
        }
        tentarConectar();
    }

    function aoAguardar(evento) {
        if (!corresponde(evento)) {
            return;
        }
        anunciar('A outra pessoa tem um instante para tocar em Conectar.');
    }

    function aoConectar(evento) {
        if (!corresponde(evento)) {
            return;
        }
        var detalhe = evento.detail || {};
        var jaLigados = !!detalhe.already_connected;
        marcarLigado();
        if (!jaLigados) {
            celebrar(String(detalhe.other_name || '').trim());
        }
    }

    function aoDesconectar(evento) {
        if (!corresponde(evento)) {
            return;
        }
        aplicarEstadoDesligado();
        anunciar('A ligação foi removida.');
    }

    function aoErro(evento) {
        if (!corresponde(evento)) {
            return;
        }
        var detalhe = evento.detail || {};
        if (estaLigado()) {
            aDesligar = false;
            marcarLigado();
        } else {
            limparEspera();
        }
        mostrarErro(String(detalhe.message || 'Não foi possível atualizar a ligação.'));
    }

    function sair() {
        limparTemporizador();
        botao.removeEventListener('click', aoClicar);
        window.removeEventListener('app:connection-waiting', aoAguardar);
        window.removeEventListener('app:connection-created', aoConectar);
        window.removeEventListener('app:connection-removed', aoDesconectar);
        window.removeEventListener('app:connection-error', aoErro);
        document.removeEventListener('margot:page-leave', sair);
    }
    if (estaLigado()) {
        marcarLigado();
    } else {
        aplicarEstadoDesligado();
    }
    botao.addEventListener('click', aoClicar);
    window.addEventListener('app:connection-waiting', aoAguardar);
    window.addEventListener('app:connection-created', aoConectar);
    window.addEventListener('app:connection-removed', aoDesconectar);
    window.addEventListener('app:connection-error', aoErro);
    document.addEventListener('margot:page-leave', sair);
})(window, document);
