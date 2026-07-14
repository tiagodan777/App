(function (window, document, $) {
    'use strict';

    var $form = $('#create-account-form');

    var STORAGE_KEY =
        'create-account-dados';

    var ETAPA_INICIAL = '#nome';

    var ETAPAS = [
        '#nome',
        '#nascimento',
        '#sexo',
        '#gostos',
        '#contactos',
        '#descricao',
        '#fotos',
        '#palavra-passe',
        '#criar-conta'
    ];

    var dados = {
        gostos: []
    };

    var etapaAtual = null;
    var pedidoAtual = null;
    var estaAProcessarPopState = false;

    function etapaExiste(etapa) {
        return ETAPAS.includes(etapa);
    }

    function normalizarEtapa(etapa) {
        etapa = String(etapa || '').trim();

        if (!etapa.startsWith('#')) {
            etapa = '#' + etapa;
        }

        if (!etapaExiste(etapa)) {
            return ETAPA_INICIAL;
        }

        return etapa;
    }

    function obterEtapaDoEstado(
        estado
    ) {
        if (
            estado &&
            estado.createAccount === true &&
            estado.etapa
        ) {
            return normalizarEtapa(
                estado.etapa
            );
        }

        return ETAPA_INICIAL;
    }

    function obterNomeEtapa(etapa) {
        return normalizarEtapa(etapa)
            .replace(/^#/, '');
    }

    function criarUrlEtapa(etapa) {
        var url = new URL(
            window.location.href
        );

        url.searchParams.set(
            'etapa',
            obterNomeEtapa(etapa)
        );

        url.hash = '';

        return (
            url.pathname +
            url.search
        );
    }

    function obterEtapaDaUrl() {
        var url = new URL(
            window.location.href
        );

        var etapa =
            url.searchParams.get(
                'etapa'
            );

        if (!etapa) {
            return ETAPA_INICIAL;
        }

        return normalizarEtapa(
            etapa
        );
    }

    function obterEtapaVisivel() {
        var id = $form
            .children('div')
            .first()
            .attr('id');

        if (!id) {
            return etapaAtual;
        }

        return normalizarEtapa(
            '#' + id
        );
    }

    function guardarDadosNaSessao() {
        var dadosSeguros = {};

        Object.keys(dados).forEach(
            function (chave) {
                if (
                    chave === 'password' ||
                    chave ===
                        'confirma_password'
                ) {
                    return;
                }

                dadosSeguros[chave] =
                    dados[chave];
            }
        );

        try {
            window.sessionStorage
                .setItem(
                    STORAGE_KEY,
                    JSON.stringify(
                        dadosSeguros
                    )
                );
        } catch (erro) {
            console.warn(
                'Não foi possível guardar temporariamente os dados do formulário.',
                erro
            );
        }
    }

    function restaurarDadosDaSessao() {
        try {
            var guardado =
                window.sessionStorage
                    .getItem(
                        STORAGE_KEY
                    );

            if (!guardado) {
                return;
            }

            var resultado =
                JSON.parse(
                    guardado
                );

            if (
                !resultado ||
                typeof resultado !==
                    'object'
            ) {
                return;
            }

            dados = Object.assign(
                {
                    gostos: []
                },
                resultado
            );

            if (
                !Array.isArray(
                    dados.gostos
                )
            ) {
                dados.gostos = [];
            }
        } catch (erro) {
            console.warn(
                'Não foi possível restaurar os dados temporários do formulário.',
                erro
            );

            dados = {
                gostos: []
            };
        }
    }

    function limparDadosTemporarios() {
        try {
            window.sessionStorage
                .removeItem(
                    STORAGE_KEY
                );
        } catch (erro) {
            console.warn(
                'Não foi possível limpar os dados temporários.',
                erro
            );
        }
    }

    function guardarCamposAtuais() {
        $form
            .serializeArray()
            .forEach(
                function (campo) {
                    if (
                        campo.name ===
                            'imagens[]' ||
                        campo.name ===
                            'hobbie' ||
                        campo.name ===
                            'ver_password' ||
                        campo.name ===
                            'gostos[]'
                    ) {
                        return;
                    }

                    dados[
                        campo.name
                    ] = campo.value;
                }
            );

        if (
            !Array.isArray(
                dados.gostos
            )
        ) {
            dados.gostos = [];
        }

        guardarDadosNaSessao();
    }

    function restaurarCampo(
        nome,
        valor
    ) {
        var seletor =
            '[name="' +
            CSS.escape(nome) +
            '"]';

        var $campos =
            $form.find(seletor);

        if (!$campos.length) {
            return;
        }

        if ($campos.is(':radio')) {
            $campos.prop(
                'checked',
                false
            );

            $campos
                .filter(
                    '[value="' +
                    CSS.escape(
                        String(valor)
                    ) +
                    '"]'
                )
                .prop(
                    'checked',
                    true
                );

            return;
        }

        if ($campos.is(':checkbox')) {
            $campos.each(
                function () {
                    var $campo =
                        $(this);

                    $campo.prop(
                        'checked',
                        String(
                            $campo.val()
                        ) ===
                            String(
                                valor
                            )
                    );
                }
            );

            return;
        }

        $campos.val(valor);
    }

    function restaurarGostosaDaEtapa() {
        if (
            !$('#gostos').length ||
            !Array.isArray(
                dados.gostos
            )
        ) {
            return;
        }

        var $lista =
            $('#meus-gostos');

        $lista.empty();

        dados.gostos.forEach(
            function (gosto) {
                $lista.append(
                    $('<p>', {
                        class:
                            'meu-hobbie',
                        text: gosto
                    })
                );
            }
        );
    }

    function restaurarCamposDaEtapa() {
        Object.keys(dados).forEach(
            function (nome) {
                if (
                    nome === 'gostos'
                ) {
                    return;
                }

                restaurarCampo(
                    nome,
                    dados[nome]
                );
            }
        );

        restaurarGostosaDaEtapa();

        if (
            typeof window
                .inicializarEtapaFotos ===
            'function'
        ) {
            window
                .inicializarEtapaFotos();
        }
    }

    function pararRecursosDaEtapa() {
        if (
            typeof window
                .pararCameraPerfil ===
            'function'
        ) {
            window
                .pararCameraPerfil();
        }
    }

    function cancelarPedidoAtual() {
        if (
            pedidoAtual &&
            pedidoAtual.readyState !== 4
        ) {
            pedidoAtual.abort();
        }

        pedidoAtual = null;
    }

    function animarEtapa() {
        var $etapa =
            $form.children('div');

        $etapa.css({
            marginLeft: '200%'
        });

        $etapa.stop(
            true,
            true
        );

        $etapa.animate(
            {
                marginLeft: '0%'
            },
            500
        );
    }

    function atualizarHistorico(
        etapa,
        modo
    ) {
        var estado = {
            createAccount: true,
            etapa: etapa
        };

        var url =
            criarUrlEtapa(etapa);

        if (modo === 'replace') {
            window.history
                .replaceState(
                    estado,
                    '',
                    url
                );

            return;
        }

        window.history
            .pushState(
                estado,
                '',
                url
            );
    }

    function carregarEtapa(
        seletor,
        opcoes
    ) {
        opcoes = Object.assign(
            {
                historico:
                    'nenhum',
                animar: true
            },
            opcoes || {}
        );

        var etapa =
            normalizarEtapa(
                seletor
            );

        pararRecursosDaEtapa();
        cancelarPedidoAtual();

        pedidoAtual = $form.load(
            '/create-account-campos ' +
                etapa,

            function (
                resposta,
                estado,
                xhr
            ) {
                pedidoAtual = null;

                if (
                    estado ===
                    'error'
                ) {
                    if (
                        xhr.statusText ===
                        'abort'
                    ) {
                        return;
                    }

                    console.error(
                        'Erro ao carregar etapa:',
                        xhr.status,
                        xhr.statusText
                    );

                    alert(
                        'Não foi possível carregar esta etapa.'
                    );

                    return;
                }

                etapaAtual = etapa;

                restaurarCamposDaEtapa();

                if (
                    opcoes.animar
                ) {
                    animarEtapa();
                }

                if (
                    opcoes.historico ===
                    'push'
                ) {
                    atualizarHistorico(
                        etapa,
                        'push'
                    );
                } else if (
                    opcoes.historico ===
                    'replace'
                ) {
                    atualizarHistorico(
                        etapa,
                        'replace'
                    );
                }
            }
        );
    }

    function validarEtapaAtual(
        destino
    ) {
        var atual =
            obterEtapaVisivel();

        if (
            atual === '#fotos' &&
            typeof window
                .validarFotosPerfil ===
            'function'
        ) {
            return window
                .validarFotosPerfil();
        }

        return true;
    }

    function navegarParaEtapa(
        destino
    ) {
        destino =
            normalizarEtapa(
                destino
            );

        guardarCamposAtuais();

        if (
            !validarEtapaAtual(
                destino
            )
        ) {
            return;
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
        var formData =
            new FormData();

        Object.keys(dados).forEach(
            function (chave) {
                if (
                    chave ===
                    'gostos'
                ) {
                    dados.gostos
                        .forEach(
                            function (
                                gosto
                            ) {
                                formData
                                    .append(
                                        'gostos[]',
                                        gosto
                                    );
                            }
                        );

                    return;
                }

                formData.append(
                    chave,
                    dados[chave]
                );
            }
        );

        if (
            typeof window
                .adicionarFotosPerfilAoFormData ===
            'function'
        ) {
            window
                .adicionarFotosPerfilAoFormData(
                    formData
                );
        }

        return formData;
    }

    function mostrarErroEnvio(
        mensagem
    ) {
        var $erro =
            $('#create-account-erro');

        if (!$erro.length) {
            $erro = $('<p>', {
                id:
                    'create-account-erro',
                'aria-live':
                    'polite'
            });

            $form.prepend(
                $erro
            );
        }

        $erro.text(
            mensagem || ''
        );
    }

    function obterUrlFormulario() {
        return (
            $form.attr(
                'action'
            ) ||
            '/create-account'
        );
    }

    function obterTextoBotao(
        $botao
    ) {
        if (
            $botao.is(
                'input'
            )
        ) {
            return $botao.val();
        }

        return $botao.text();
    }

    function definirTextoBotao(
        $botao,
        texto
    ) {
        if (
            $botao.is(
                'input'
            )
        ) {
            $botao.val(texto);
            return;
        }

        $botao.text(texto);
    }

    function inicializarHistorico() {
        var etapaInicial =
            obterEtapaDaUrl();

        var estadoAtual =
            window.history.state;

        if (
            estadoAtual &&
            estadoAtual.createAccount
        ) {
            etapaInicial =
                obterEtapaDoEstado(
                    estadoAtual
                );
        }

        atualizarHistorico(
            etapaInicial,
            'replace'
        );

        carregarEtapa(
            etapaInicial,
            {
                historico:
                    'nenhum',
                animar: false
            }
        );
    }

    restaurarDadosDaSessao();

    $(function () {
        inicializarHistorico();

        $(document).on(
            'click',
            'nav.anterior-proximo > a',
            function (evento) {
                evento
                    .preventDefault();

                var destino =
                    this.id;

                if (!destino) {
                    return;
                }

                navegarParaEtapa(
                    destino
                );
            }
        );

        window.addEventListener(
            'popstate',
            function (evento) {
                if (
                    estaAProcessarPopState
                ) {
                    return;
                }

                estaAProcessarPopState =
                    true;

                guardarCamposAtuais();

                var destino =
                    obterEtapaDoEstado(
                        evento.state
                    );

                carregarEtapa(
                    destino,
                    {
                        historico:
                            'nenhum',
                        animar: true
                    }
                );

                window.setTimeout(
                    function () {
                        estaAProcessarPopState =
                            false;
                    },
                    0
                );
            }
        );

        $form.on(
            'submit',
            function (evento) {
                evento
                    .preventDefault();

                guardarCamposAtuais();

                if (
                    typeof window
                        .validarFotosPerfil ===
                        'function' &&
                    !window
                        .validarFotosPerfil()
                ) {
                    carregarEtapa(
                        '#fotos',
                        {
                            historico:
                                'push',
                            animar: true
                        }
                    );

                    return;
                }

                var formData =
                    criarFormData();

                var $botao =
                    $form.find(
                        'input[type="submit"], button[type="submit"]'
                    );

                var textoOriginal =
                    obterTextoBotao(
                        $botao
                    );

                $botao.prop(
                    'disabled',
                    true
                );

                definirTextoBotao(
                    $botao,
                    'A criar conta...'
                );

                mostrarErroEnvio('');

                $.ajax({
                    url:
                        obterUrlFormulario(),

                    method: 'POST',

                    data: formData,

                    processData: false,

                    contentType: false,

                    dataType: 'json',

                    success:
                        function (
                            resposta
                        ) {
                            if (
                                resposta.success &&
                                resposta.redirect
                            ) {
                                limparDadosTemporarios();

                                window.location
                                    .href =
                                    resposta.redirect;

                                return;
                            }

                            if (
                                resposta.erros
                            ) {
                                var mensagens =
                                    Object
                                        .values(
                                            resposta.erros
                                        )
                                        .filter(
                                            Boolean
                                        );

                                mostrarErroEnvio(
                                    mensagens
                                        .join(
                                            ' '
                                        )
                                );

                                return;
                            }

                            mostrarErroEnvio(
                                resposta.message ||
                                'Não foi possível criar a conta.'
                            );
                        },

                    error:
                        function (
                            xhr
                        ) {
                            console.error(
                                xhr.responseText
                            );

                            var mensagem =
                                'Ocorreu um erro ao criar a conta.';

                            try {
                                var resposta =
                                    JSON.parse(
                                        xhr.responseText
                                    );

                                if (
                                    resposta.message
                                ) {
                                    mensagem =
                                        resposta.message;
                                }

                                if (
                                    resposta.erros
                                ) {
                                    mensagem =
                                        Object
                                            .values(
                                                resposta.erros
                                            )
                                            .filter(
                                                Boolean
                                            )
                                            .join(
                                                ' '
                                            );
                                }
                            } catch (
                                erro
                            ) {
                                console.error(
                                    'A resposta não era JSON.',
                                    erro
                                );
                            }

                            mostrarErroEnvio(
                                mensagem
                            );
                        },

                    complete:
                        function () {
                            $botao.prop(
                                'disabled',
                                false
                            );

                            definirTextoBotao(
                                $botao,
                                textoOriginal ||
                                'Criar conta'
                            );
                        }
                });
            }
        );

        $(document).on(
            'change',
            '#ver-password',
            function () {
                var tipo =
                    $(this).is(
                        ':checked'
                    )
                        ? 'text'
                        : 'password';

                $('#password').attr(
                    'type',
                    tipo
                );

                $('#confirma-password')
                    .attr(
                        'type',
                        tipo
                    );
            }
        );

        $(document).on(
            'click',
            '#lista > li',
            function () {
                $('#hobbie').val(
                    $(this)
                        .text()
                        .trim()
                );

                $('#adicionar-gosto')
                    .trigger(
                        'click'
                    );
            }
        );
    });

    window.createAccountDados =
        dados;

    window.guardarCamposCreateAccount =
        guardarCamposAtuais;

    window.carregarEtapaCreateAccount =
        navegarParaEtapa;
})(
    window,
    document,
    jQuery
);