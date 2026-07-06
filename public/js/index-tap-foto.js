$(function() {
    $(document).on('click', '.foto', function() {
        var $backdrop = $('<div class="back-drop"></div>');
        var $div = $('<div class="mini-menu"></div>');

        $backdrop.append($div);
        $('body').append($backdrop);

        $backdrop.animate({
            bottom: '0%'
        }, 500);
    });

    $('.back-drop').on('click', function() {
        $(this).animate({
            bottom: '-100%'
        }, 500);

        $(this).remove();
    })

});
