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
            $.get('/create-account-autocompletar', {hobbie: queryString}, function (data) {
                $lista.empty();

                var dados = JSON.parse(data);

                dados.forEach(function (hobbie) {
                    $lista.append(
                        '<li><strong>' + hobbie.texto + '</strong></li>'
                    );
                });
            });
        }, 250);
    });
});