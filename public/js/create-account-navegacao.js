$(function() {
    $('form').load('/create-account-campos #nome', function() {
        console.log('OKOK');
    });

    $(document).on('click', 'nav.anterior-proximo a', function(e) {
        // e.preventDefault();

        var url = this.href;
        alert(url)

        $('form').load('/create-account-campos ' + url);
    })
});