(function (window, document, $) {
    'use strict';

    var $miniMenu = $('.mini-menu');
    if (!$miniMenu.length) return;

    var $anexo = $miniMenu.find('.mini-menu-anexo');
    var $maisOpcoes = $('#abrir-acoes-perfil');
    var $acoes = $('#acoes-perfil');
    var $acoesPrincipal = $('#acoes-perfil-principal');
    var $formDenuncia = $('#form-denuncia');
    var aEnviarHey = false;
    var aEnviarMensagem = false;
    var aProcessarSeguranca = false;

    function texto(valor) {
        return String(valor || '').trim();
    }

    function urlFoto(valor) {
        try {
            return new URL(texto(valor) || '/imagens/fotos-perfil/default.webp', window.location.href).href;
        } catch (erro) {
            return '/imagens/fotos-perfil/default.webp';
        }
    }

    function membroId(elemento) {
        return texto(elemento.getAttribute('data-membro-id') || elemento.getAttribute('data-id') || elemento.id);
    }

    function nome(elemento) {
        return texto(elemento.getAttribute('data-nome') || elemento.getAttribute('alt') || elemento.getAttribute('title')) || 'Utilizador';
    }

    function foto(elemento) {
        return urlFoto(elemento.currentSrc || elemento.src || elemento.getAttribute('src'));
    }

    function baseUrl(valor, fallback) {
        return texto(valor || fallback).replace(/\/+$/, '');
    }

    function idSelecionado() {
        return texto($miniMenu.attr('data-destinatario-id'));
    }

    function nomeSelecionado() {
        return texto($miniMenu.find('header h1').text()) || 'esta pessoa';
    }

    function fecharAcoes() {
        $acoes.removeClass('aberta').attr('aria-hidden', 'true').prop('hidden', true);
        $maisOpcoes.attr('aria-expanded', 'false');
        $acoesPrincipal.prop('hidden', false);
        $formDenuncia.prop('hidden', true);
    }

    function abrirAcoes() {
        if ($miniMenu.hasClass('perfil-proprio') || !idSelecionado()) return;

        $acoes.prop('hidden', false).attr('aria-hidden', 'false').addClass('aberta');
        $maisOpcoes.attr('aria-expanded', 'true');
        $acoesPrincipal.prop('hidden', false);
        $formDenuncia.prop('hidden', true);
        $acoes.find('.acoes-perfil-caixa').trigger('focus');
    }

    function abrirFormularioDenuncia() {
        $acoesPrincipal.prop('hidden', true);
        $formDenuncia.prop('hidden', false);
        $('#denuncia-motivo').trigger('focus');
    }

    function prepararMiniMenu(elemento) {
        if (!elemento) return false;

        var id = membroId(elemento);
        if (!id) return false;

        var membroNome = nome(elemento);
        var souEu = id === texto(window.membroId);
        var imagem = $miniMenu.find('header img').get(0);

        fecharAcoes();
        $miniMenu.attr('data-destinatario-id', id).toggleClass('perfil-proprio', souEu);
        $miniMenu.find('.mini-menu-perfil').attr('href', baseUrl(window.profileUrl, '/profile') + '/' + encodeURIComponent(id));
        $miniMenu.find('header h1').text(membroNome);
        $miniMenu.find('.mini-menu-mensagem').attr('action', baseUrl(window.messagesUrl, '/messages') + '/' + encodeURIComponent(id));

        if (imagem) {
            imagem.onerror = function () {
                this.onerror = null;
                this.src = urlFoto('/imagens/fotos-perfil/default.webp');
            };

            imagem.src = foto(elemento);
            imagem.alt = membroNome;
        }

        return true;
    }

    function aviso(mensagem, tipo) {
        if (typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(mensagem, tipo);
        }
    }

    function libertarHey() {
        aEnviarHey = false;
        $('#enviar-hey').prop('disabled', false).removeAttr('aria-busy');
    }

    async function pedidoSeguranca(acao, campos) {
        var dados = new FormData();

        dados.set('action', acao);
        dados.set('target_id', idSelecionado());

        Object.keys(campos || {}).forEach(function (chave) {
            dados.set(chave, campos[chave]);
        });

        var resposta = await fetch(baseUrl(window.safetyUrl, '/safety'), {
            method: 'POST',
            body: dados,
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        var conteudo = await resposta.text();
        var resultado;

        try {
            resultado = JSON.parse(conteudo);
        } catch (erro) {
            throw new Error('O servidor devolveu uma resposta inválida.');
        }

        if (!resposta.ok || !resultado.success) {
            throw new Error(resultado.message || 'Não foi possível concluir o pedido.');
        }

        return resultado;
    }

    function removerPessoaDoMapa(id) {
        $('.foto').filter(function () {
            return membroId(this) === id;
        }).remove();
    }

    function definirSegurancaOcupada(ocupada) {
        aProcessarSeguranca = ocupada;
        $acoes.find('button, select, textarea').prop('disabled', ocupada);
    }

    window.prepararMiniMenuDaFoto = prepararMiniMenu;

    $(document).on('pointerdown click', '.foto', function () {
        prepararMiniMenu(this);
    });

    $(document).on('click', '#enviar-hey', function (evento) {
        evento.preventDefault();
        evento.stopPropagation();

        if (aEnviarHey) return;

        var id = idSelecionado();

        if (!id) {
            aviso('Seleciona primeiro uma pessoa.', 'erro');
            return;
        }

        if (!window.AppWebSocket || !window.AppWebSocket.isConnected()) {
            aviso('A ligação está a ser restabelecida.', 'erro');
            if (window.AppWebSocket) window.AppWebSocket.connect();
            return;
        }

        aEnviarHey = true;
        $(this).prop('disabled', true).attr('aria-busy', 'true');

        var enviado = window.AppWebSocket.send({
            type: 'notify',
            destinatario_id: id
        });

        if (!enviado) {
            libertarHey();
            aviso('Não foi possível enviar o Hey.', 'erro');
            return;
        }

        window.setTimeout(libertarHey, 1200);
    });

    $(document).on('submit', '.mini-menu-mensagem', async function (evento) {
        evento.preventDefault();

        if (aEnviarMensagem) return;

        var id = idSelecionado();
        var $form = $(this);
        var $botao = $form.find('[type="submit"]');
        var dados = new FormData(this);
        var ficheiro = dados.get('media');

        if (!id) {
            aviso('Seleciona primeiro uma pessoa.', 'erro');
            return;
        }

        if (!texto(dados.get('mensagem')) && !(ficheiro instanceof File && ficheiro.size)) return;

        dados.set('action', 'send');
        aEnviarMensagem = true;
        $botao.prop('disabled', true).val('A enviar…');

        try {
            var resposta = await fetch(baseUrl(window.messagesUrl, '/messages') + '/' + encodeURIComponent(id), {
                method: 'POST',
                body: dados,
                credentials: 'same-origin'
            });

            var resultado = await resposta.json();

            if (!resposta.ok || !resultado.success) {
                throw new Error(resultado.message || 'Não foi possível enviar a mensagem.');
            }

            this.reset();
            $anexo.removeClass('selecionado').text('+').attr('aria-label', 'Adicionar fotografia ou vídeo');
            aviso('Mensagem enviada.', 'sucesso');

            if (window.AppWebSocket && window.AppWebSocket.isConnected()) {
                window.AppWebSocket.send({
                    type: 'chat_publish',
                    message_id: resultado.message.id
                });
            }
        } catch (erro) {
            aviso(erro.message, 'erro');
        } finally {
            aEnviarMensagem = false;
            $botao.prop('disabled', false).val('Enviar');
        }
    });

    $(document).on('change', '#mini-menu-media', function () {
        var ficheiro = this.files && this.files[0];

        $anexo
            .toggleClass('selecionado', Boolean(ficheiro))
            .text(ficheiro ? '✓' : '+')
            .attr('aria-label', ficheiro ? ficheiro.name : 'Adicionar fotografia ou vídeo');
    });

    $maisOpcoes.on('pointerdown pointerup', function (evento) {
        evento.stopPropagation();
    });

    $maisOpcoes.on('click', function (evento) {
        evento.preventDefault();
        evento.stopPropagation();
        abrirAcoes();
    });

    $acoes.on('pointerdown pointermove pointerup pointercancel', function (evento) {
        evento.stopPropagation();
    });

    $acoes.on('click', '[data-fechar-acoes]', function (evento) {
        evento.preventDefault();
        fecharAcoes();
    });

    $('#abrir-denuncia').on('click', abrirFormularioDenuncia);

    $('#voltar-denuncia').on('click', function () {
        $formDenuncia.prop('hidden', true);
        $acoesPrincipal.prop('hidden', false);
    });

    $('#bloquear-membro').on('click', async function () {
        if (aProcessarSeguranca) return;

        var id = idSelecionado();
        var membroNome = nomeSelecionado();

        if (!id || !window.confirm('Bloquear ' + membroNome + '? Deixam imediatamente de se ver no mapa.')) return;

        definirSegurancaOcupada(true);

        try {
            await pedidoSeguranca('block');
            removerPessoaDoMapa(id);

            if (window.AppWebSocket && window.AppWebSocket.isConnected()) {
                window.AppWebSocket.send({
                    type: 'block_refresh',
                    target_id: id
                });
            }

            fecharAcoes();

            if (typeof window.fecharMiniMenu === 'function') {
                window.fecharMiniMenu();
            }

            aviso(membroNome + ' foi bloqueado.', 'sucesso');
        } catch (erro) {
            aviso(erro.message, 'erro');
        } finally {
            definirSegurancaOcupada(false);
        }
    });

    $formDenuncia.on('submit', async function (evento) {
        evento.preventDefault();

        if (aProcessarSeguranca) return;

        var motivo = texto($('#denuncia-motivo').val());
        var mensagem = texto($('#denuncia-mensagem').val());

        if (!motivo) {
            aviso('Escolhe o motivo da denúncia.', 'erro');
            return;
        }

        definirSegurancaOcupada(true);

        try {
            await pedidoSeguranca('report', {
                motivo: motivo,
                mensagem: mensagem
            });

            this.reset();
            fecharAcoes();
            aviso('Denúncia enviada. Obrigado por nos avisares.', 'sucesso');
        } catch (erro) {
            aviso(erro.message, 'erro');
        } finally {
            definirSegurancaOcupada(false);
        }
    });

    $(document).on('keydown', function (evento) {
        if (evento.key === 'Escape' && !$acoes.prop('hidden')) {
            fecharAcoes();
        }
    });

    window.addEventListener('app:hey-enviado', libertarHey);
    window.addEventListener('app:hey-erro', libertarHey);
})(window, document, jQuery);