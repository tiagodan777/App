$(function() {
    var $hobbie = $('#hobbie');
    var $recomendacoes = $('#recomendacoes');
    var $list = $('#lista');

    $recomendacoes.hide();

    $hobbie.on('focus', function() {
        $recomendacoes.fadeIn(100);
    });

    $hobbie.on('blur', function() {
        $recomendacoes.fadeOut(100);
    });

    $hobbie.on('keyup', function() {
        var queryString = $hobbie.val();
        var timeout = setTimeout(function() {
            $.get('/create-account-autocompletar', {hobbie: queryString}, function(data) {
                if (queryString.length > 0) {
                    $list.empty();
                    var dados = JSON.parse(data);
                    for (var c = 0; c < dados.length; c++) {
                        $list.append('<li><strong>' + dados[c].texto + '</strong></li>');
                    }
                } else {
                    $list.html('');
                }
            });
        }, 250);
    });
});