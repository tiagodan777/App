$(function () {

    $(document).on('click', '.foto', function (e) {
        e.stopPropagation();

        var $div = $('.mini-menu');

        $div.animate({
            bottom: '-35%'
        }, 500);
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('.mini-menu, .foto').length) {
            $('.mini-menu').animate({
                bottom: '-100%'
            }, 500);
        }
    });

    $(document).on('click', '.mini-menu', function (e) {
        e.stopPropagation();
    });

});