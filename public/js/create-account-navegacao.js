$(function() {
    $('form').load('/create-account-campos #nome');

    $('nav.anterior-proximo').on('click', 'a', function(e) {
        e.preventDefault();

        var url = this.href;
        alert(url)

        $('form').load('/create-account-campos ' + url);
    })
});