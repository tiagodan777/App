var $form = $('form');
var dados = {
    gostos: []
};

function guardarCamposAtuais() {
    $form.serializeArray().forEach(function(campo) {
        dados[campo.name] = campo.value;
    });

    dados['gostos'] ??= [];
}

$(function() {
    $form.load('/create-account-campos #nome', function() {
        $('form > div').animate({
            marginLeft: '0%'
        }, 500);
    });

    $(document).on('click', 'nav.anterior-proximo > a', function(e) {
        e.preventDefault();

        guardarCamposAtuais();

        var url = this.id;

        $form.load('/create-account-campos ' + url, function() {
            $('form > div').animate({
                marginLeft: '0%'
            }, 500);
        });
    });

    $form.on('submit', function(e) {
        e.preventDefault();

        guardarCamposAtuais();

        console.log(dados);

        $.post('/create-account', dados, function(resposta) {
            document.write(resposta);
        });
    });

    $(document).on('change', '#ver-password', function() {
        var tipo = $(this).is(':checked') ? 'text' : 'password';

        $('#password').attr('type', tipo);
        $('#confirma-password').attr('type', tipo);
    });

    $(document).on('click', '#lista > li', function(e) {
        $('#hobbie').val($(this).text().trim());
        $('#adicionar-gosto').trigger('click');
    });
});