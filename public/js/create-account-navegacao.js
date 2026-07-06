$(function() {
    $('form').load('/create-account-campos #nome');

    $('nav.anterior-proximo > a').on('click', function(e) {
        e.preventDefault();

        var url = this.href;
        alert(url)

        $('form').load('/create-account-campos ' + url);
    })
});