$(function() {
    $('form').load('/create-account-campos #nome', function() {
        console.log('OKOK');
    });
});

$(function() {
    $(document).on('click', 'nav.anterior-proximo > a', function(e) {
        e.preventDefault();

        var url = this.id;

        $('form').load('/create-account-campos ' + url).animate({
            marginRight: '0%'
        }, 350);
    });
});