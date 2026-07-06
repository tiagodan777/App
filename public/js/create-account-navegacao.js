$(function() {
    $('form').load('/create-account-campos #nome', function() {
        console.log('OKOK');
    });
});

$(function() {
    $(document).on('click', 'nav.anterior-proximo > a', function(e) {
        e.preventDefault();

        var url = this.id;
        alert(url)

        $('form').load('/create-account-campos ' + url);
    });
});