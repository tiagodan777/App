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
            $('form > div').animate({
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
    });
});

$(function() {
    $(document).on('click', '#adicionar-gosto', function(e) {
        e.preventDefault();

        var gosto = $('#hobbie').val().trim();

        if (gosto === '') return;

        $('#meus-gostos').append('<p class="meu-hobbie">' + gosto + '</p>');
        
        dados['gostos'] ??= [];
        dados['gostos'].push(gosto);

        $('#hobbie').val('');

    });

    $(document).on('click', '#meus-gostos > p', function () {
        const gosto = $(this).text();

        dados['gostos'] = dados['gostos'].filter(g => g !== gosto);

        $(this).remove();
    });
});


$(function() {
    $form.on('submit', function(e) {
        e.preventDefault();
        var dadosFormulario = $.param(dados)
        // alert(dadosFormulario);
        $.post('/create-account', dados, function(resposta) {
            document.write(resposta);
        });
    });
});

$(function() {
    $(document).on('change', '#ver-password', function() {
        var tipo = $(this).is(':checked') ? 'text' : 'password';

        $('#password').attr('type', tipo);
        $('#confirma-password').attr('type', tipo);
    });
});

$(function() {
    $(document).on('click', '#lista > li', function(e) {
        $('#hobbie').val($(this).text());
        $('#adicionar-gosto').trigger('click');
        $('#hobbie').val('');
        $('#lista').empty();
        $('#recomendacoes').hide();
    });
});