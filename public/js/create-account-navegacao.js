$(function() {
    $('form').load('/create-account-campos #nome');

    $('nav.anterior-proximo > a').on('click', function(e) {
        e.preventDefault();

        var url = this.href;

        $('form').load('/create-account-campos ' + url);
    })
});