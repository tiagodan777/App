var $form =
    $('#create-account-form');

var dados = {
    gostos: []
};

function guardarCamposAtuais() {
    $form
        .serializeArray()
        .forEach(function (campo) {
            if (
                campo.name === 'imagens[]' ||
                campo.name === 'hobbie' ||
                campo.name === 'ver_password'
            ) {
                return;
            }

            dados[campo.name] =
                campo.value;
        });

    dados.gostos ??= [];
}

function restaurarCamposDaEtapa() {
    Object.keys(dados).forEach(
        function (nome) {
            if (nome === 'gostos') {
                return;
            }

            var $campo =
                $form.find(
                    '[name="' +
                    nome +
                    '"]'
                );

            if (!$campo.length) {
                return;
            }

            if ($campo.is(':checkbox')) {
                $campo.prop(
                    'checked',
                    String(dados[nome]) ===
                        String(
                            $campo.val()
                        )
                );

                return;
            }

            if ($campo.is(':radio')) {
                $campo
                    .filter(
                        '[value="' +
                        dados[nome] +
                        '"]'
                    )
                    .prop(
                        'checked',
                        true
                    );

                return;
            }

            $campo.val(
                dados[nome]
            );
        }
    );

    if (
        $('#gostos').length &&
        Array.isArray(dados.gostos)
    ) {
        $('#meus-gostos').empty();

        dados.gostos.forEach(
            function (gosto) {
                $('#meus-gostos').append(
                    $('<p>', {
                        class:
                            'meu-hobbie',

                        text: gosto
                    })
                );
            }
        );
    }

    if (
        typeof window
            .inicializarEtapaFotos ===
        'function'
    ) {
        window
            .inicializarEtapaFotos();
    }
}

function carregarEtapa(seletor) {
    if (
        typeof window
            .pararCameraPerfil ===
        'function'
    ) {
        window.pararCameraPerfil();
    }

    $form.load(
        '/create-account-campos ' +
            seletor,

        function (
            resposta,
            estado,
            xhr
        ) {
            if (estado === 'error') {
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

            restaurarCamposDaEtapa();

            $form
                .children('div')
                .css({
                    marginLeft: '200%'
                });

            $form
                .children('div')
                .animate({
                    marginLeft: '0%'
                }, 500);
        }
    );
}

function validarEtapaAtual(
    destino
) {
    var etapaAtual =
        $form
            .children('div')
            .attr('id');

    if (
        etapaAtual === 'fotos' &&
        destino !== '#descricao' &&
        typeof window
            .validarFotosPerfil ===
        'function'
    ) {
        return window
            .validarFotosPerfil();
    }

    return true;
}

function criarFormData() {
    var formData =
        new FormData();

    Object.keys(dados).forEach(
        function (chave) {
            if (chave === 'gostos') {
                dados.gostos.forEach(
                    function (gosto) {
                        formData.append(
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

        $form.prepend($erro);
    }

    $erro.text(
        mensagem || ''
    );
}

function obterUrlFormulario() {
    return (
        $form.attr('action') ||
        '/create-account'
    );
}

$(function () {
    carregarEtapa('#nome');

    $(document).on(
        'click',
        'nav.anterior-proximo > a',

        function (evento) {
            evento.preventDefault();

            guardarCamposAtuais();

            var destino =
                this.id;

            if (!destino) {
                return;
            }

            if (
                !validarEtapaAtual(
                    destino
                )
            ) {
                return;
            }

            carregarEtapa(
                destino
            );
        }
    );

    $form.on(
        'submit',
        function (evento) {
            evento.preventDefault();

            guardarCamposAtuais();

            if (
                typeof window
                    .validarFotosPerfil ===
                    'function' &&
                !window
                    .validarFotosPerfil()
            ) {
                carregarEtapa(
                    '#fotos'
                );

                return;
            }

            var formData =
                criarFormData();

            var $botao =
                $form.find(
                    'input[type="submit"]'
                );

            $botao.prop(
                'disabled',
                true
            );

            $botao.val(
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
                    function (resposta) {
                        if (
                            resposta.success &&
                            resposta.redirect
                        ) {
                            window.location.href =
                                resposta.redirect;

                            return;
                        }

                        if (
                            resposta.erros
                        ) {
                            var mensagens =
                                Object.values(
                                    resposta.erros
                                ).filter(Boolean);

                            mostrarErroEnvio(
                                mensagens.join(
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
                    function (xhr) {
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
                                    Object.values(
                                        resposta.erros
                                    )
                                        .filter(
                                            Boolean
                                        )
                                        .join(' ');
                            }
                        } catch (erro) {
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

                        $botao.val(
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
                .trigger('click');
        }
    );
});