$(function() {
    $('form').load('/create-account-campos #nome', function() {
        $('form > div').animate({
            marginLeft: '0%'
        }, 350);
    });
});

$(function() {
    $(document).on('click', 'nav.anterior-proximo > a', function(e) {
        e.preventDefault();

        var url = this.id;

        $('form').load('/create-account-campos ' + url, function() {
            $('form > div').css({
                marginLeft: '200%'
            })
            
            if (e.target.class == 'proximo') {
                $('form').animate({
                    marginLeft: '0%'
                }, 350);
            } else {
                $('form').animate({
                    marginLeft: '-100%'
                }, 350);
            }

            
        });
    });
});