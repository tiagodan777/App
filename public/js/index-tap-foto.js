$(function() {
    $(document).on('click', '.foto', function() {
        var $div = $('<div class="mini-menu"></div>');

        $('body').append($div);

        $div.animate({
            bottom: '0%'
        }, 500);

        $div.focus();
    });

    $('.mini-menu').on('blur', function() {
        $(this).animate({
            bottom: '-100%'
        }, 500);

        $(this).remove();
    })

});
