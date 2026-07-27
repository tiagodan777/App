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

    var dados = Object.assign({gostos: []}, config.dadosIniciais || {});
    var etapaAtual = null;
    var pedidoAtual = null;
    var aEnviar = false;

    if (!Array.isArray(dados.gostos)) dados.gostos = [];

    function etapaPermitida(etapa) {
        if (!ETAPAS.includes(etapa)) return false;
        if (modoEdicao && etapa === '#introducao') return false;
        if (!modoEdicao && etapa === '#editar-perfil') return false;

        return true;
    }

    function normalizarEtapa(etapa) {
        etapa = String(etapa || '').trim();

        if (!etapa.startsWith('#')) etapa = '#' + etapa;

        return etapaPermitida(etapa)
            ? etapa
            : ETAPA_INICIAL;
    }

    function nomeEtapa(etapa) {
        return normalizarEtapa(etapa).replace(/^#/, '');
    }

    function etapaVisivel() {
        var id = $form.children('div').first().attr('id');

        return id
            ? normalizarEtapa('#' + id)
            : etapaAtual || ETAPA_INICIAL;
    }

    function etapaDaUrl() {
        var etapa = new URL(window.location.href).searchParams.get('etapa');

        return etapa
            ? normalizarEtapa(etapa)
            : ETAPA_INICIAL;
    }

    function urlDaEtapa(etapa) {
        var url = new URL(window.location.href);

        url.searchParams.set('etapa', nomeEtapa(etapa));
        url.hash = '';

        return url.pathname + url.search;
    }

    function atualizarHistorico(etapa, substituir) {
        var estado = {
            createAccount: true,
            etapa: etapa
        };

        var metodo = substituir
            ? 'replaceState'
            : 'pushState';

        window.history[metodo](
            estado,
            '',
            urlDaEtapa(etapa)
        );
    }

    function guardarNaSessao() {
        if (modoEdicao) return;

        var seguros = {};

        Object.keys(dados).forEach(function (chave) {
            if (
                chave !== 'password' &&
                chave !== 'confirma_password'
            ) {
                seguros[chave] = dados[chave];
            }
        });

        try {
            sessionStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(seguros)
            );
        } catch (erro) {
            console.warn(
                'Não foi possível guardar temporariamente o formulário.',
                erro
            );
        }
    }

    function restaurarDaSessao() {
        if (modoEdicao) return;

        try {
            var guardado = sessionStorage.getItem(STORAGE_KEY);

            if (!guardado) return;

            var resultado = JSON.parse(guardado);

            if (
                !resultado ||
                typeof resultado !== 'object'
            ) {
                return;
            }

            dados = Object.assign(
                {gostos: []},
                dados,
                resultado
            );

            if (!Array.isArray(dados.gostos)) {
                dados.gostos = [];
            }
        } catch (erro) {
            console.warn(
                'Não foi possível restaurar o formulário.',
                erro
            );
        }
    }

    function limparSessao() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (erro) {
            console.warn(
                'Não foi possível limpar os dados temporários.',
                erro
            );
        }
    }

    function guardarCamposAtuais(opcoes) {
        opcoes = Object.assign(
            {
                incluirPassword: false
            },
            opcoes || {}
        );

        $form.serializeArray().forEach(function (campo) {
            if (
                [
                    'imagens[]',
                    'hobbie',
                    'ver_password',
                    'gostos[]'
                ].includes(campo.name)
            ) {
                return;
            }

            if (
                !opcoes.incluirPassword &&
                [
                    'password',
                    'confirma_password'
                ].includes(campo.name)
            ) {
                return;
            }

            dados[campo.name] = campo.value;
        });

        if (!Array.isArray(dados.gostos)) {
            dados.gostos = [];
        }

        guardarNaSessao();
    }

    function restaurarCampo(nome, valor) {
        var $campos = $form
            .find('[name]')
            .filter(function () {
                return this.name === nome;
            });

        if (!$campos.length) return;

        if ($campos.is(':radio')) {
            $campos
                .prop('checked', false)
                .filter(function () {
                    return String(this.value) === String(valor);
                })
                .prop('checked', true);

            return;
        }

        if ($campos.is(':checkbox')) {
            $campos.each(function () {
                this.checked =
                    String(this.value) === String(valor);
            });

            return;
        }

        $campos.val(valor);
    }

    function restaurarGostos() {
        if (
            !$('#gostos').length ||
            !Array.isArray(dados.gostos)
        ) {
            return;
        }

        var $lista = $('#meus-gostos').empty();

        dados.gostos.forEach(function (gosto) {
            $lista.append(
                $('<p>', {
                    class: 'meu-hobbie',
                    text: gosto
                })
            );
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
        var texto = String(valor || '')
            .trim()
            .replace(/\s+/g, ' ');

        if (
            !texto ||
            texto.length <= limite
        ) {
            return texto;
        }

        return texto
            .substring(0, limite - 1)
            .trimEnd() + '…';
    }

    function definirResumo(campo, texto) {
        var $resumo = $(
            '[data-resumo-campo="' +
            campo +
            '"]'
        );

        if ($resumo.length && texto) {
            $resumo.text(texto);
        }
    }

    function resumoPermissoes() {
        var API = window.MargotPreferencias;

        if (!API) {
            return 'Localização e notificações';
        }

        var localizacao =
            API.obter('localizacao');

        var notificacoes =
            API.obter('notificacoes');

        if (
            localizacao === true &&
            notificacoes === true
        ) {
            return 'Localização e notificações ativas';
        }

        if (
            localizacao === false &&
            notificacoes === false
        ) {
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
        if (
            !document.getElementById(
                'editar-perfil'
            )
        ) {
            return;
        }

        var nome = [
            dados.primeiro_nome,
            dados.ultimo_nome
        ]
            .map(function (valor) {
                return String(valor || '').trim();
            })
            .filter(Boolean)
            .join(' ');

        var nascimento = [
            String(dados.dia || '').padStart(2, '0'),
            String(dados.mes || '').padStart(2, '0'),
            String(dados.ano || '')
        ]
            .filter(Boolean)
            .join('/');

        var gostos = Array.isArray(dados.gostos)
            ? dados.gostos
            : [];

        var resumoGostos = gostos.length
            ? (
                resumir(
                    gostos
                        .slice(0, 3)
                        .join(', '),
                    58
                ) +
                (
                    gostos.length > 3
                        ? ' +' + (gostos.length - 3)
                        : ''
                )
            )
            : 'Ainda não adicionaste gostos';

        var contacto =
            String(dados.email || '').trim() ||
            String(dados.telefone || '').trim();

        var numeroFotos =
            Array.isArray(window.fotosPerfil)
                ? window.fotosPerfil.length
                : 0;

        definirResumo(
            'nome',
            nome || 'Editar o teu nome'
        );

        definirResumo(
            'nascimento',
            nascimento.length >= 8
                ? nascimento
                : 'Editar a data de nascimento'
        );

        definirResumo(
            'genero',
            textoGenero(dados.genero)
        );

        definirResumo(
            'gostos',
            resumoGostos
        );

        definirResumo(
            'objetivo',
            textoObjetivo(dados.objetivo)
        );

        definirResumo(
            'sobre_ti',
            resumir(
                dados.sobre_ti,
                62
            ) ||
            'Ainda não escreveste uma descrição'
        );

        definirResumo(
            'contactos',
            contacto ||
            'Email e telefone privados'
        );

        definirResumo(
            'fotos',
            numeroFotos === 1
                ? '1 fotografia'
                : numeroFotos + ' fotografias'
        );

        definirResumo(
            'permissoes',
            resumoPermissoes()
        );
    }

    function restaurarEtapa() {
        Object.keys(dados).forEach(function (nome) {
            if (
                ![
                    'gostos',
                    'password',
                    'confirma_password'
                ].includes(nome)
            ) {
                restaurarCampo(
                    nome,
                    dados[nome]
                );
            }
        });

        restaurarGostos();

        if (
            typeof window.inicializarEtapaFotos ===
            'function'
        ) {
            window.inicializarEtapaFotos();
        }

        if (
            typeof window.inicializarEtapaPermissoes ===
            'function'
        ) {
            window.inicializarEtapaPermissoes();
        }

        atualizarResumos();
    }

    function pararRecursos() {
        if (
            typeof window.pararCameraPerfil ===
            'function'
        ) {
            window.pararCameraPerfil();
        }
    }

    function carregarEtapa(destino, opcoes) {
        opcoes = Object.assign(
            {
                historico: 'nenhum',
                animar: true
            },
            opcoes || {}
        );

        var etapa = normalizarEtapa(destino);

        pararRecursos();

        if (
            pedidoAtual &&
            pedidoAtual.readyState !== 4
        ) {
            pedidoAtual.abort();
        }

        var pedido = $.ajax({
            url:
                config.camposUrl ||
                '/create-account-campos',

            method: 'GET',
            dataType: 'html',
            cache: false
        });

        pedidoAtual = pedido;

        pedido.done(function (resposta) {
            var $resposta = $('<div>').append(
                $.parseHTML(
                    resposta,
                    document,
                    false
                )
            );

            var $etapa = $resposta
                .find(etapa)
                .first();

            if (!$etapa.length) {
                console.error(
                    'A etapa não existe na resposta:',
                    etapa
                );

                alert(
                    'Não foi possível carregar esta área.'
                );

                return;
            }

            $form.empty().append($etapa);
            etapaAtual = etapa;

            restaurarEtapa();

            if (opcoes.animar) {
                $etapa
                    .css(
                        'margin-left',
                        '200%'
                    )
                    .stop(true, true)
                    .animate(
                        {
                            marginLeft: '0%'
                        },
                        420
                    );
            } else {
                $etapa.css(
                    'margin-left',
                    '0'
                );
            }

            if (
                opcoes.historico === 'push'
            ) {
                atualizarHistorico(
                    etapa,
                    false
                );
            }

            if (
                opcoes.historico === 'replace'
            ) {
                atualizarHistorico(
                    etapa,
                    true
                );
            }
        });

        pedido.fail(function (xhr, estado) {
            if (estado === 'abort') return;

            console.error(
                'Erro ao carregar a área:',
                xhr.status,
                xhr.responseText
            );

            alert(
                'Não foi possível carregar esta área.'
            );
        });

        pedido.always(function () {
            if (pedidoAtual === pedido) {
                pedidoAtual = null;
            }
        });
    }

    function validarEtapa() {
        var formulario = $form.get(0);

        if (
            formulario &&
            !formulario.checkValidity()
        ) {
            formulario.reportValidity();

            return false;
        }

        if (
            etapaVisivel() === '#fotos' &&
            typeof window.validarFotosPerfil ===
                'function'
        ) {
            return window.validarFotosPerfil();
        }

        if (
            etapaVisivel() === '#permissoes' &&
            typeof window.validarEtapaPermissoes ===
                'function'
        ) {
            return window.validarEtapaPermissoes();
        }

        return true;
    }

    function navegar(destino, opcoes) {
        opcoes = Object.assign(
            {
                validar: true,
                guardar: true
            },
            opcoes || {}
        );

        var origem = etapaVisivel();

        if (opcoes.guardar) {
            guardarCamposAtuais();
        }

        if (
            opcoes.validar &&
            !validarEtapa()
        ) {
            return;
        }

        if (origem === '#palavra-passe') {
            dados.password = '';
            dados.confirma_password = '';
        }

        carregarEtapa(
            destino,
            {
                historico: 'push',
                animar: true
            }
        );
    }

    function criarFormData() {
        var formData = new FormData();

        Object.keys(dados).forEach(function (chave) {
            if (chave === 'gostos') {
                dados.gostos.forEach(function (gosto) {
                    formData.append(
                        'gostos[]',
                        gosto
                    );
                });

                return;
            }

            formData.append(
                chave,
                dados[chave] == null
                    ? ''
                    : dados[chave]
            );
        });

        formData.append(
            'modo',
            modoEdicao
                ? 'editar'
                : 'criar'
        );

        /*
         * Esta é a parte essencial da edição parcial.
         * O PHP passa a saber exatamente qual área deve atualizar.
         */
        formData.append(
            'secao',
            nomeEtapa(
                etapaVisivel()
            )
        );

        if (
            typeof window.adicionarFotosPerfilAoFormData ===
            'function'
        ) {
            window.adicionarFotosPerfilAoFormData(
                formData
            );
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

    function mensagemDaResposta(
        resposta,
        alternativa
    ) {
        if (
            resposta &&
            resposta.erros
        ) {
            var erros = Object
                .values(resposta.erros)
                .filter(Boolean);

            if (erros.length) {
                return erros.join(' ');
            }
        }

        return resposta &&
            resposta.message
                ? resposta.message
                : alternativa;
    }

    function inicializar() {
        var inicial = etapaDaUrl();

        if (
            history.state &&
            history.state.createAccount &&
            history.state.etapa
        ) {
            inicial = normalizarEtapa(
                history.state.etapa
            );
        }

        atualizarHistorico(
            inicial,
            true
        );

        carregarEtapa(
            inicial,
            {
                historico: 'nenhum',
                animar: false
            }
        );
    }

    restaurarDaSessao();

    window.createAccountDados = dados;
    window.guardarCamposCreateAccount =
        guardarCamposAtuais;

    window.carregarEtapaCreateAccount =
        navegar;

    $(function () {
        inicializar();

        $(document).on(
            'click',
            'nav.anterior-proximo > a',
            function (evento) {
                evento.preventDefault();

                var destino =
                    $(this).data('etapa');

                if (!destino) return;

                navegar(
                    destino,
                    {
                        validar:
                            $(this).data(
                                'sem-validar'
                            ) !== true,

                        guardar: true
                    }
                );
            }
        );

        $(document).on(
            'click',
            '.editar-area',
            function () {
                navegar(
                    $(this).data('etapa'),
                    {
                        validar: false,
                        guardar: false
                    }
                );
            }
        );

        $(document).on(
            'click',
            '[data-voltar-perfil]',
            function () {
                if (config.perfilUrl) {
                    window.location.href =
                        config.perfilUrl;

                    return;
                }

                history.back();
            }
        );

        window.addEventListener(
            'popstate',
            function (evento) {
                guardarCamposAtuais();

                var destino =
                    evento.state &&
                    evento.state.createAccount
                        ? evento.state.etapa
                        : ETAPA_INICIAL;

                carregarEtapa(
                    destino,
                    {
                        historico: 'nenhum',
                        animar: true
                    }
                );
            }
        );

        $form.on(
            'submit',
            function (evento) {
                evento.preventDefault();

                if (aEnviar) return;

                guardarCamposAtuais({
                    incluirPassword: true
                });

                if (!validarEtapa()) return;

                aEnviar = true;

                var $botao =
                    $(document.activeElement)
                        .is('[type="submit"]')
                        ? $(document.activeElement)
                        : $form
                            .find('[type="submit"]')
                            .first();

                var textoOriginal =
                    $botao.text();

                $botao
                    .prop('disabled', true)
                    .text(
                        modoEdicao
                            ? 'A guardar…'
                            : 'A criar conta…'
                    );

                mostrarErro('');

                $.ajax({
                    url:
                        $form.attr('action') ||
                        '/create-account',

                    method: 'POST',
                    data: criarFormData(),
                    processData: false,
                    contentType: false,
                    dataType: 'json',
                    cache: false
                })
                    .done(function (resposta) {
                        if (
                            resposta.success &&
                            resposta.redirect
                        ) {
                            limparSessao();

                            window.location.href =
                                resposta.redirect;

                            return;
                        }

                        mostrarErro(
                            mensagemDaResposta(
                                resposta,
                                modoEdicao
                                    ? 'Não foi possível guardar as alterações.'
                                    : 'Não foi possível criar a conta.'
                            )
                        );
                    })
                    .fail(function (xhr) {
                        console.error(
                            'Erro ao guardar:',
                            xhr.status,
                            xhr.responseText
                        );

                        var resposta =
                            xhr.responseJSON;

                        if (
                            !resposta &&
                            xhr.responseText
                        ) {
                            try {
                                resposta =
                                    JSON.parse(
                                        xhr.responseText
                                    );
                            } catch (erro) {
                                resposta = null;
                            }
                        }

                        mostrarErro(
                            mensagemDaResposta(
                                resposta,
                                modoEdicao
                                    ? 'Ocorreu um erro ao guardar as alterações.'
                                    : 'Ocorreu um erro ao criar a conta.'
                            )
                        );
                    })
                    .always(function () {
                        aEnviar = false;

                        $botao
                            .prop(
                                'disabled',
                                false
                            )
                            .text(
                                textoOriginal ||
                                (
                                    modoEdicao
                                        ? 'Guardar e sair'
                                        : 'Criar conta'
                                )
                            );
                    });
            }
        );

        $(document).on(
            'change',
            '#ver-password',
            function () {
                $(
                    '#password, #confirma-password'
                ).attr(
                    'type',
                    this.checked
                        ? 'text'
                        : 'password'
                );
            }
        );
    });
})(window, document, jQuery);