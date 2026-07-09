$(function () {
    var timeout = null;

    $(document).on('focus', '#hobbie', function () {
        $('#recomendacoes').fadeIn(100);
    });

    $(document).on('blur', '#hobbie', function () {
        setTimeout(function () {
            $('#recomendacoes').fadeOut(100);
        }, 150);
    });

    $(document).on('keyup', '#hobbie', function () {
        clearTimeout(timeout);

        var queryString = $(this).val().trim();
        var $lista = $('#lista');

        if (queryString === '') {
            $lista.empty();
            return;
        }

        timeout = setTimeout(function () {
            $.get('/create-account-autocompletar', { gosto: queryString }, function (dadosResposta) {
                $lista.empty();

                dadosResposta.forEach(function (hobbie) {
                    $lista.append(
                        '<li data-id="' + hobbie.id + '"><strong>' + hobbie.nome + '</strong></li>'
                    );
                });
            }, 'json');
        }, 250);
    });

    $(document).on('click', '#adicionar-gosto', function(e) {
        e.preventDefault();

        var gosto = $('#hobbie').val().trim();
        var $lista = $('#lista');

        if (gosto === '') return;

        dados['gostos'] ??= [];

        if (!dados['gostos'].includes(gosto)) {
            dados['gostos'].push(gosto);
            $('#meus-gostos').append('<p class="meu-hobbie">' + gosto + '</p>');
        }

        if ($lista.html().trim() === '') {
            $.post('/create-account-autocompletar', { gosto: gosto }, function(resposta) {
                console.log(resposta);
            }, 'json');
        }

        $('#hobbie').val('');
        $lista.empty();
        $('#recomendacoes').hide();
    });

    $(document).on('click', '#meus-gostos > p', function () {
        var gosto = $(this).text().trim();

        dados['gostos'] = dados['gostos'].filter(function(g) {
            return g !== gosto;
        });

        $(this).remove();
    });
});