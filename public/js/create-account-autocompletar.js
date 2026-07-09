$(function () {
    var timeout = null;
    var $recomendacoes = $('#recomendacoes');

    $recomendacoes.hide();

    $(document).on('blur', '#hobbie', function () {
        setTimeout(function () {
            $recomendacoes.fadeOut(100);
        }, 150);
    });

    $(document).on('keyup', '#hobbie', function () {
        clearTimeout(timeout);
        
        $recomendacoes.show();

        var queryString = $(this).val().trim();
        var $lista = $('#lista');

        if (queryString === '') {
            $lista.empty();
            return;
        }

        timeout = setTimeout(function () {
            $.get('/create-account-autocompletar', { gosto: queryString }, function (dados) {
                $lista.empty();

                dados.forEach(function (hobbie) {
                    $lista.append(
                        '<li id="' + hobbie.id + '"><strong>' + hobbie.nome + '</strong></li>'
                    );
                });
            },
            'json'
        );
            
        }, 250);
    });
});