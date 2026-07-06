var $form = $('form');
var dados = {};

$(function() {
    $form.load('/create-account-campos #nome', function() {
        $('form > div').animate({
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
                marginLeft: '100%'
            }).animate({
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

        alert($.param(dados));
    });
});

$(function() {
    $form.on('submit', function(e) {
        e.preventDefaul();
        $.post('/create-acount', dados);
    })
})