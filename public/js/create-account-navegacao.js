(function (window, document, $) {
    'use strict';

    var $form = $('#create-account-form');
    var config = window.createAccountConfig || {};
    var modoEdicao = config.modoEdicao === true;
    var STORAGE_KEY = modoEdicao ? 'editar-perfil-' + String(config.membroId || '') : 'create-account-dados';
    var ETAPA_INICIAL = modoEdicao ? '#editar-perfil' : '#introducao';
    var ETAPAS = [
        '#introducao',
        '#editar-perfil',
        '#nome',
        '#nascimento',
        '#sexo',
        '#gostos',
        '#objetivo',
        '#contactos',
        '#descricao',
        '#fotos',
        '#permissoes',
        '#palavra-passe'
    ];
    var dados = Object.assign({
        gostos: [],
        aceitou_termos: '',
        aceitou_privacidade: '',
        versao_termos: '1.0',
        versao_privacidade: '1.0'
    }, config.dadosIniciais || {});
    var etapaAtual = null;
    var pedidoAtual = null;
    var aEnviar = false;
    var erroValidacaoPendente = null;

    if (!Array.isArray(dados.gostos)) dados.gostos = [];

    function etapaPermitida(etapa) {
        // if (!ETAPAS.includes(etapa)) return false;
        if (modoEdicao && etapa === '#introducao') return false;
        if (!modoEdicao && etapa === '#editar-perfil') return false;
        return true;
    }

    function normalizarEtapa(etapa) {
        etapa = String(etapa || '').trim();
        if (!etapa.startsWith('#')) etapa = '#' + etapa;
        return etapaPermitida(etapa) ? etapa : ETAPA_INICIAL;
    }

    function nomeEtapa(etapa) {
        return normalizarEtapa(etapa).replace(/^#/, '');
    }

    function etapaVisivel() {
        var id = $form.children('div').first().attr('id');
        return id ? normalizarEtapa('#' + id) : etapaAtual || ETAPA_INICIAL;
    }

    function etapaDaUrl() {
        var etapa = new URL(window.location.href).searchParams.get('etapa');
        return etapa ? normalizarEtapa(etapa) : ETAPA_INICIAL;
    }

    function urlDaEtapa(etapa) {
        var url = new URL(window.location.href);
        url.searchParams.set('etapa', nomeEtapa(etapa));
        url.hash = '';
        return url.pathname + url.search;
    }

    function atualizarHistorico(etapa, substituir) {
        window.history[substituir ? 'replaceState' : 'pushState']({
            createAccount: true,
            etapa: etapa
        }, '', urlDaEtapa(etapa));
    }

    function guardarNaSessao() {
        if (modoEdicao) return;

        var seguros = {};
        Object.keys(dados).forEach(function (chave) {
            if (chave !== 'password' && chave !== 'confirma_password') {
                seguros[chave] = dados[chave];
            }
        });

        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seguros));
        } catch (erro) {
            console.warn('Não foi possível guardar temporariamente o formulário.', erro);
        }
    }

    function restaurarDaSessao() {
        if (modoEdicao) return;

        try {
            var guardado = sessionStorage.getItem(STORAGE_KEY);
            if (!guardado) return;

            var resultado = JSON.parse(guardado);
            if (!resultado || typeof resultado !== 'object') return;

            dados = Object.assign({
                gostos: [],
                aceitou_termos: '',
                aceitou_privacidade: '',
                versao_termos: '1.0',
                versao_privacidade: '1.0'
            }, dados, resultado);

            if (!Array.isArray(dados.gostos)) dados.gostos = [];
            window.createAccountDados = dados;
        } catch (erro) {
            console.warn('Não foi possível restaurar o formulário.', erro);
        }
    }

    function limparSessao() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (erro) {
            console.warn('Não foi possível limpar os dados temporários.', erro);
        }
    }

    function guardarCamposAtuais(opcoes) {
        opcoes = Object.assign({incluirPassword: false}, opcoes || {});

        $form.serializeArray().forEach(function (campo) {
            if (['imagens[]', 'hobbie', 'ver_password', 'gostos[]'].includes(campo.name)) return;
            if (!opcoes.incluirPassword && ['password', 'confirma_password'].includes(campo.name)) return;
            dados[campo.name] = campo.value;
        });

        var $aceitouTermos = $form.find('[name="aceitou_termos"]');
        var $aceitouPrivacidade = $form.find('[name="aceitou_privacidade"]');
        var $versaoTermos = $form.find('[name="versao_termos"]');
        var $versaoPrivacidade = $form.find('[name="versao_privacidade"]');

        if ($aceitouTermos.length) {
            dados.aceitou_termos = $aceitouTermos.prop('checked') ? '1' : '';
        }

        if ($aceitouPrivacidade.length) {
            dados.aceitou_privacidade = $aceitouPrivacidade.prop('checked') ? '1' : '';
        }

        if ($versaoTermos.length) {
            dados.versao_termos = String($versaoTermos.val() || '1.0');
        }

        if ($versaoPrivacidade.length) {
            dados.versao_privacidade = String($versaoPrivacidade.val() || '1.0');
        }

        if (!Array.isArray(dados.gostos)) dados.gostos = [];
        guardarNaSessao();
    }

    function restaurarCampo(nome, valor) {
        var $campos = $form.find('[name]').filter(function () {
            return this.name === nome;
        });

        if (!$campos.length) return;

        if ($campos.is(':radio')) {
            $campos.prop('checked', false).filter(function () {
                return String(this.value) === String(valor);
            }).prop('checked', true);
            return;
        }

        if ($campos.is(':checkbox')) {
            $campos.each(function () {
                this.checked = String(this.value) === String(valor);
            });
            return;
        }

        $campos.val(valor);
    }

    function restaurarGostos() {
        if (!$('#gostos').length || !Array.isArray(dados.gostos)) return;

        var $lista = $('#meus-gostos').empty();
        dados.gostos.forEach(function (gosto) {
            $lista.append($('<p>', {
                class: 'meu-hobbie',
                text: gosto
            }));
        });
    }

    function textoGenero(valor) {
        return {
            M: 'Masculino',
            F: 'Feminino',
            D: 'Personalizado'
        }[valor] || 'Editar o género';
    }

    function textoObjetivo(valor) {
        return {
            amizade: 'Fazer amigos',
            conhecer_pessoas: 'Conhecer pessoas novas',
            relacao_seria: 'Encontrar uma relação séria',
            algo_casual: 'Algo casual',
            conversar: 'Conversar e ver no que dá',
            ainda_nao_sei: 'Ainda não sei'
        }[valor] || 'Editar o teu objetivo';
    }

    function resumir(valor, limite) {
        var texto = String(valor || '').trim().replace(/\s+/g, ' ');
        if (!texto || texto.length <= limite) return texto;
        return texto.substring(0, limite - 1).trimEnd() + '…';
    }

    function definirResumo(campo, texto) {
        var $resumo = $('[data-resumo-campo="' + campo + '"]');
        if ($resumo.length && texto) $resumo.text(texto);
    }

    function resumoPermissoes() {
        var API = window.MargotPreferencias;
        if (!API) return 'Localização e notificações';

        var localizacao = API.obter('localizacao');
        var notificacoes = API.obter('notificacoes');

        if (localizacao === true && notificacoes === true) {
            return 'Localização e notificações ativas';
        }

        if (localizacao === false && notificacoes === false) {
            return 'Localização e notificações desativadas';
        }

        if (localizacao === true) {
            return 'Localização ativa · notificações desativadas';
        }

        if (notificacoes === true) {
            return 'Localização desativada · notificações ativas';
        }

        return 'Escolher localização e notificações';
    }

    function atualizarResumos() {
        if (!document.getElementById('editar-perfil')) return;

        var nome = [dados.primeiro_nome, dados.ultimo_nome]
            .map(function (valor) {
                return String(valor || '').trim();
            })
            .filter(Boolean)
            .join(' ');

        var nascimento = [
            String(dados.dia || '').padStart(2, '0'),
            String(dados.mes || '').padStart(2, '0'),
            String(dados.ano || '')
        ].filter(Boolean).join('/');

        var gostos = Array.isArray(dados.gostos) ? dados.gostos : [];
        var resumoGostos = gostos.length
            ? resumir(gostos.slice(0, 3).join(', '), 58) + (gostos.length > 3 ? ' +' + (gostos.length - 3) : '')
            : 'Ainda não adicionaste gostos';

        var contacto = String(dados.email || '').trim() || String(dados.telefone || '').trim();
        var numeroFotos = Array.isArray(window.fotosPerfil) ? window.fotosPerfil.length : 0;

        definirResumo('nome', nome || 'Editar o teu nome');
        definirResumo('nascimento', nascimento.length >= 8 ? nascimento : 'Editar a data de nascimento');
        definirResumo('genero', textoGenero(dados.genero));
        definirResumo('gostos', resumoGostos);
        definirResumo('objetivo', textoObjetivo(dados.objetivo));
        definirResumo('sobre_ti', resumir(dados.sobre_ti, 62) || 'Ainda não escreveste uma descrição');
        definirResumo('contactos', contacto || 'Email e telefone privados');
        definirResumo('fotos', numeroFotos === 1 ? '1 fotografia' : numeroFotos + ' fotografias');
        definirResumo('permissoes', resumoPermissoes());
    }

    function restaurarEtapa() {
        Object.keys(dados).forEach(function (nome) {
            if (!['gostos', 'password', 'confirma_password'].includes(nome)) {
                restaurarCampo(nome, dados[nome]);
            }
        });

        restaurarGostos();

        if (typeof window.inicializarEtapaFotos === 'function') {
            window.inicializarEtapaFotos();
        }

        if (typeof window.inicializarEtapaPermissoes === 'function') {
            window.inicializarEtapaPermissoes();
        }

        atualizarResumos();
    }

    function pararRecursos() {
        if (typeof window.pararCameraPerfil === 'function') {
            window.pararCameraPerfil();
        }
    }

    function carregarEtapa(destino, opcoes) {
        opcoes = Object.assign({
            historico: 'nenhum',
            animar: true
        }, opcoes || {});

        var etapa = normalizarEtapa(destino);
        pararRecursos();

        if (pedidoAtual && pedidoAtual.readyState !== 4) {
            pedidoAtual.abort();
        }

        var pedido = $.ajax({
            url: config.camposUrl || '/create-account-campos',
            method: 'GET',
            dataType: 'html',
            cache: false
        });

        pedidoAtual = pedido;

        pedido.done(function (resposta) {
            var $resposta = $('<div>').append($.parseHTML(resposta, document, false));
            var $etapa = $resposta.find(etapa).first();

            if (!$etapa.length) {
                console.error('A etapa não existe na resposta:', etapa);
                alert('Não foi possível carregar esta área.');
                return;
            }

            $form.empty().append($etapa);
            etapaAtual = etapa;
            restaurarEtapa();

            if (erroValidacaoPendente && erroValidacaoPendente.etapa === etapa) {
                apresentarErroValidacao(erroValidacaoPendente);
            }

            if (opcoes.animar) {
                $etapa.css('margin-left', '200%').stop(true, true).animate({
                    marginLeft: '0%'
                }, 420);
            } else {
                $etapa.css('margin-left', '0');
            }

            if (opcoes.historico === 'push') {
                atualizarHistorico(etapa, false);
            }

            if (opcoes.historico === 'replace') {
                atualizarHistorico(etapa, true);
            }
        });

        pedido.fail(function (xhr, estado) {
            if (estado === 'abort') return;

            console.error('Erro ao carregar a área:', xhr.status, xhr.responseText);
            alert('Não foi possível carregar esta área.');
        });

        pedido.always(function () {
            if (pedidoAtual === pedido) pedidoAtual = null;
        });
    }

    function validarEtapa() {
        var formulario = $form.get(0);

        if (formulario && !formulario.checkValidity()) {
            formulario.reportValidity();
            return false;
        }

        if (
            etapaVisivel() === '#fotos' &&
            typeof window.validarFotosPerfil === 'function'
        ) {
            return window.validarFotosPerfil();
        }

        if (
            etapaVisivel() === '#permissoes' &&
            typeof window.validarEtapaPermissoes === 'function'
        ) {
            return window.validarEtapaPermissoes();
        }

        return true;
    }

    function textoGuardado(nome) {
        return String(dados[nome] == null ? '' : dados[nome]).trim();
    }

    function comprimentoTexto(valor) {
        return Array.from(String(valor || '')).length;
    }

    function emailValido(email) {
        var campo = document.createElement('input');
        campo.type = 'email';
        campo.required = true;
        campo.value = email;
        return campo.checkValidity();
    }

    function telefoneValido(telefone) {
        if (telefone === '') return true;
        if (!/^\+?[0-9\s().-]+$/.test(telefone)) return false;

        var totalDigitos = telefone.replace(/\D+/g, '').length;
        return totalDigitos >= 7 && totalDigitos <= 15;
    }

    function nascimentoValido() {
        var dia = Number(textoGuardado('dia'));
        var mes = Number(textoGuardado('mes'));
        var ano = Number(textoGuardado('ano'));
        var anoAtual = new Date().getFullYear();

        if (
            !Number.isInteger(dia) ||
            !Number.isInteger(mes) ||
            !Number.isInteger(ano) ||
            ano < 1900 ||
            ano > anoAtual
        ) {
            return false;
        }

        var data = new Date(Date.UTC(ano, mes - 1, dia));

        return (
            data.getUTCFullYear() === ano &&
            data.getUTCMonth() === mes - 1 &&
            data.getUTCDate() === dia
        );
    }

    function primeiroErroCriacao() {
        var primeiroNome = textoGuardado('primeiro_nome');

        if (comprimentoTexto(primeiroNome) < 1 || comprimentoTexto(primeiroNome) > 60) {
            return {
                etapa: '#nome',
                campo: 'primeiro_nome',
                mensagem: 'Escreve um primeiro nome válido.'
            };
        }

        var ultimoNome = textoGuardado('ultimo_nome');

        if (comprimentoTexto(ultimoNome) < 1 || comprimentoTexto(ultimoNome) > 60) {
            return {
                etapa: '#nome',
                campo: 'ultimo_nome',
                mensagem: 'Escreve um último nome válido.'
            };
        }

        if (!nascimentoValido()) {
            return {
                etapa: '#nascimento',
                campo: 'dia',
                mensagem: 'Escolhe uma data de nascimento válida.'
            };
        }

        if (!['M', 'F', 'D'].includes(textoGuardado('genero'))) {
            return {
                etapa: '#sexo',
                campo: 'genero',
                mensagem: 'Escolhe um género válido.'
            };
        }

        var gostos = Array.isArray(dados.gostos) ? dados.gostos : [];

        if (
            gostos.length > 30 ||
            gostos.some(function (gosto) {
                var comprimento = comprimentoTexto(String(gosto).trim());
                return comprimento < 1 || comprimento > 80;
            })
        ) {
            return {
                etapa: '#gostos',
                campo: 'hobbie',
                mensagem: 'Revê os teus gostos. Podes adicionar até 30 e cada um pode ter no máximo 80 caracteres.'
            };
        }

        if (![
            'amizade',
            'conhecer_pessoas',
            'relacao_seria',
            'algo_casual',
            'conversar',
            'ainda_nao_sei'
        ].includes(textoGuardado('objetivo'))) {
            return {
                etapa: '#objetivo',
                campo: 'objetivo',
                mensagem: 'Escolhe o que procuras na Margot.'
            };
        }

        var telefone = textoGuardado('telefone');

        if (!telefoneValido(telefone)) {
            return {
                etapa: '#contactos',
                campo: 'telefone',
                mensagem: 'Introduz um número de telefone válido.'
            };
        }

        var email = textoGuardado('email');

        if (!emailValido(email)) {
            return {
                etapa: '#contactos',
                campo: 'email',
                mensagem: 'Introduz um email válido.'
            };
        }

        if (comprimentoTexto(textoGuardado('sobre_ti')) > 1000) {
            return {
                etapa: '#descricao',
                campo: 'sobre_ti',
                mensagem: 'A descrição pode ter no máximo 1000 caracteres.'
            };
        }

        var preferencias = window.MargotPreferencias;

        if (
            !preferencias ||
            !preferencias.foiEscolhida('localizacao') ||
            !preferencias.foiEscolhida('notificacoes')
        ) {
            return {
                etapa: '#permissoes',
                campo: '',
                mensagem: 'Escolhe se queres ativar ou desativar a localização e as notificações.'
            };
        }

        var password = String(dados.password || '');

        if (
            comprimentoTexto(password) < 8 ||
            !/[A-Z]/.test(password) ||
            !/[a-z]/.test(password) ||
            !/[0-9]/.test(password)
        ) {
            return {
                etapa: '#palavra-passe',
                campo: 'password',
                mensagem: 'A palavra-passe deve ter pelo menos 8 caracteres, uma minúscula, uma maiúscula e um número.'
            };
        }

        if (password !== String(dados.confirma_password || '')) {
            return {
                etapa: '#palavra-passe',
                campo: 'confirma_password',
                mensagem: 'As palavras-passe não são idênticas.'
            };
        }

        if (textoGuardado('aceitou_termos') !== '1') {
            return {
                etapa: '#palavra-passe',
                campo: 'aceitou_termos',
                mensagem: 'Tens de aceitar os Termos de Utilização para criar uma conta.'
            };
        }

        if (textoGuardado('aceitou_privacidade') !== '1') {
            return {
                etapa: '#palavra-passe',
                campo: 'aceitou_privacidade',
                mensagem: 'Tens de confirmar que leste a Política de Privacidade para criar uma conta.'
            };
        }

        return null;
    }

    function apresentarErroValidacao(erro) {
        erroValidacaoPendente = null;

        if (
            erro.etapa === '#permissoes' &&
            typeof window.validarEtapaPermissoes === 'function'
        ) {
            window.validarEtapaPermissoes();
        }

        mostrarErro(erro.mensagem);

        var $campo = $form.find('[name]').filter(function () {
            return this.name === erro.campo;
        }).first();

        if ($campo.length) {
            $campo.attr('aria-invalid', 'true');

            window.setTimeout(function () {
                $campo.trigger('focus');
            }, 0);
        }

        var elementoErro = document.getElementById('create-account-erro');

        if (elementoErro && typeof elementoErro.scrollIntoView === 'function') {
            elementoErro.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    function mostrarPrimeiroErro(erro) {
        if (etapaVisivel() === erro.etapa) {
            apresentarErroValidacao(erro);
            return;
        }

        erroValidacaoPendente = erro;

        carregarEtapa(erro.etapa, {
            historico: 'push',
            animar: true
        });
    }

    function navegar(destino, opcoes) {
        opcoes = Object.assign({
            validar: false,
            guardar: true
        }, opcoes || {});

        if (opcoes.guardar) {
            guardarCamposAtuais({incluirPassword: true});
        }

        if (opcoes.validar && !validarEtapa()) return;

        carregarEtapa(destino, {
            historico: 'push',
            animar: true
        });
    }

    function criarFormData() {
        var formData = new FormData();

        Object.keys(dados).forEach(function (chave) {
            if (chave === 'gostos') {
                dados.gostos.forEach(function (gosto) {
                    formData.append('gostos[]', gosto);
                });
                return;
            }

            formData.append(chave, dados[chave] == null ? '' : dados[chave]);
        });

        formData.set('aceitou_termos', textoGuardado('aceitou_termos'));
        formData.set('aceitou_privacidade', textoGuardado('aceitou_privacidade'));
        formData.set('versao_termos', textoGuardado('versao_termos') || '1.0');
        formData.set('versao_privacidade', textoGuardado('versao_privacidade') || '1.0');
        formData.append('modo', modoEdicao ? 'editar' : 'criar');
        formData.append('secao', nomeEtapa(etapaVisivel()));

        if (typeof window.adicionarFotosPerfilAoFormData === 'function') {
            window.adicionarFotosPerfilAoFormData(formData);
        }

        return formData;
    }

    function mostrarErro(mensagem) {
        var $erro = $('#create-account-erro');

        if (!$erro.length) {
            $erro = $('<p>', {
                id: 'create-account-erro',
                role: 'alert',
                'aria-live': 'polite'
            }).prependTo($form);
        }

        $erro.text(mensagem || '');
    }

    function mensagemDaResposta(resposta, alternativa) {
        if (resposta && resposta.erros) {
            var erros = Object.values(resposta.erros).filter(Boolean);
            if (erros.length) return erros.join(' ');
        }

        return resposta && resposta.message ? resposta.message : alternativa;
    }

    function inicializar() {
        var inicial = etapaDaUrl();

        if (
            history.state &&
            history.state.createAccount &&
            history.state.etapa
        ) {
            inicial = normalizarEtapa(history.state.etapa);
        }

        atualizarHistorico(inicial, true);

        carregarEtapa(inicial, {
            historico: 'nenhum',
            animar: false
        });
    }

    restaurarDaSessao();

    window.createAccountDados = dados;
    window.guardarCamposCreateAccount = guardarCamposAtuais;
    window.carregarEtapaCreateAccount = navegar;

    $(function () {
        inicializar();

        $(document).on('click', 'nav.anterior-proximo > a', function (evento) {
            evento.preventDefault();

            var destino = $(this).data('etapa');
            if (!destino) return;

            navegar(destino, {
                validar: false,
                guardar: true
            });
        });

        $(document).on('click', '.editar-area[data-etapa]', function () {
            navegar($(this).data('etapa'), {
                validar: false,
                guardar: false
            });
        });

        $(document).on('click', '[data-voltar-perfil]', function () {
            if (config.perfilUrl) {
                window.location.href = config.perfilUrl;
                return;
            }

            history.back();
        });

        window.addEventListener('popstate', function (evento) {
            guardarCamposAtuais({incluirPassword: true});

            var destino = evento.state && evento.state.createAccount
                ? evento.state.etapa
                : ETAPA_INICIAL;

            carregarEtapa(destino, {
                historico: 'nenhum',
                animar: true
            });
        });

        $form.on('submit', function (evento) {
            evento.preventDefault();
            if (aEnviar) return;

            guardarCamposAtuais({incluirPassword: true});

            if (modoEdicao) {
                if (!validarEtapa()) return;
            } else {
                var erroValidacao = primeiroErroCriacao();

                if (erroValidacao) {
                    mostrarPrimeiroErro(erroValidacao);
                    return;
                }
            }

            aEnviar = true;

            var $botao = $(document.activeElement).is('[type="submit"]')
                ? $(document.activeElement)
                : $form.find('[type="submit"]').first();

            var textoOriginal = $botao.text();

            $botao
                .prop('disabled', true)
                .text(modoEdicao ? 'A guardar…' : 'A criar conta…');

            mostrarErro('');

            $.ajax({
                url: $form.attr('action') || '/create-account',
                method: 'POST',
                data: criarFormData(),
                processData: false,
                contentType: false,
                dataType: 'json',
                cache: false
            })
                .done(function (resposta) {
                    if (resposta.success && resposta.redirect) {
                        limparSessao();
                        window.location.href = resposta.redirect;
                        return;
                    }

                    mostrarErro(mensagemDaResposta(
                        resposta,
                        modoEdicao
                            ? 'Não foi possível guardar as alterações.'
                            : 'Não foi possível criar a conta.'
                    ));
                })
                .fail(function (xhr) {
                    console.error('Erro ao guardar:', xhr.status, xhr.responseText);

                    var resposta = xhr.responseJSON;

                    if (!resposta && xhr.responseText) {
                        try {
                            resposta = JSON.parse(xhr.responseText);
                        } catch (erro) {
                            resposta = null;
                        }
                    }

                    mostrarErro(mensagemDaResposta(
                        resposta,
                        modoEdicao
                            ? 'Ocorreu um erro ao guardar as alterações.'
                            : 'Ocorreu um erro ao criar a conta.'
                    ));
                })
                .always(function () {
                    aEnviar = false;

                    $botao
                        .prop('disabled', false)
                        .text(textoOriginal || (modoEdicao ? 'Guardar e sair' : 'Criar conta'));
                });
        });

        $(document).on('input change', '#create-account-form [name]', function () {
            $(this).removeAttr('aria-invalid');
            mostrarErro('');
        });

        $(document).on('change', '#ver-password', function () {
            $('#password, #confirma-password').attr(
                'type',
                this.checked ? 'text' : 'password'
            );
        });
    });
})(window, document, jQuery);