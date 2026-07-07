var $form = $('form');
var dados = {};

$(function() {
    $form.load('/create-account-campos #nome', function() {
        $('form > div').delay(100).animate({
            marginLeft: '0%'
        }, 350);
    });
});

$(function() {
    $(document).on('click', 'nav.anterior-proximo > a', function(e) {
        e.preventDefault();

        var url = this.id;

        $form.load('/create-account-campos ' + url, function() {
            $('form > div').css({
                marginLeft: '200%'
            }).delay(100).animate({
                marginLeft: '0%'
            }, 350);

        });
    });
});

$(function() {
    $(document).on('click', 'nav.anterior-proximo > a', function(e) {
        e.preventDefault();

        $form.serializeArray().forEach(function(campo) {
            dados[campo.name] = campo.value;
        });

        // alert($.param(dados));
    });
});

$(function() {
    var $meusGostos = $('#meus-gostos');

    $('div#gostos > p > input[type="button"]').on('click', function(e) {
        var gosto = $('#hobbie').val()

        $meusGostos.append(gosto);
        gosto.val('');
    })
});

$(function() {
    $form.on('submit', function(e) {
        e.preventDefault();
        var dadosFormulario = $.param(dados)
        // alert(dadosFormulario);
        $.post('/create-account', dados, function(resposta) {
            document.write(resposta);
        });
    })
})