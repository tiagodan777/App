$(function () {
    var timeout = null;
    var existeCorrespondenciaExata = false;

    function obterDados() {
        return window.createAccountDados;
    }

    function limparPesquisa() {
        $('#hobbie').val('');
        $('#lista').empty();
        $('#recomendacoes').hide();
        existeCorrespondenciaExata = false;
    }

    function adicionarGosto(gosto) {
        var dados = obterDados();
        gosto = String(gosto || '').trim();

        if (!gosto) return;

        var jaExiste = dados.gostos.some(function (gostoGuardado) {
            return gostoGuardado.toLowerCase() === gosto.toLowerCase();
        });

        if (!jaExiste) {
            dados.gostos.push(gosto);
            $('#meus-gostos').append($('<p>', {
                class: 'meu-hobbie',
                text: gosto
            }));
        }

        window.guardarCamposCreateAccount();
        limparPesquisa();
    }

    $(document).on('focus', '#hobbie', function () {
        if ($('#lista').children().length) $('#recomendacoes').fadeIn(100);
    });

    $(document).on('blur', '#hobbie', function () {
        window.setTimeout(function () {
            $('#recomendacoes').fadeOut(100);
        }, 150);
    });

    $(document).on('input', '#hobbie', function () {
        window.clearTimeout(timeout);

        var gosto = $(this).val().trim();
        var $lista = $('#lista');

        existeCorrespondenciaExata = false;
        $lista.empty();

        if (!gosto) {
            $('#recomendacoes').hide();
            return;
        }

        timeout = window.setTimeout(function () {
            $.get('/create-account-autocompletar', {
                gosto: gosto
            }, function (hobbies) {
                $lista.empty();

                hobbies.forEach(function (hobbie) {
                    var nome = String(hobbie.nome || '').trim();

                    if (!nome) return;
                    if (nome.toLowerCase() === gosto.toLowerCase()) existeCorrespondenciaExata = true;

                    $lista.append($('<li>', {
                        'data-id': hobbie.id,
                        text: nome
                    }));
                });

                $('#recomendacoes').toggle($lista.children().length > 0);
            }, 'json');
        }, 250);
    });

    $(document).on('click', '#lista > li', function () {
        existeCorrespondenciaExata = true;
        adicionarGosto($(this).text());
    });

    $(document).on('click', '#adicionar-gosto', function (evento) {
        evento.preventDefault();

        var gosto = $('#hobbie').val().trim();

        if (!gosto) return;
        if (!existeCorrespondenciaExata) $.post('/create-account-autocompletar', { gosto: gosto });

        adicionarGosto(gosto);
    });

    $(document).on('click', '#meus-gostos > p', function () {
        var gosto = $(this).text().trim();
        var dados = obterDados();

        dados.gostos = dados.gostos.filter(function (gostoGuardado) {
            return gostoGuardado.toLowerCase() !== gosto.toLowerCase();
        });

        $(this).remove();
        window.guardarCamposCreateAccount();
    });
});