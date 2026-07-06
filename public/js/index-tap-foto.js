$(function() {
    $(document).on('click', '.foto', function(e) {
        var $backdrop = $('<div class="back-drop"></div>');
        var $div = $('<div class="mini-menu"></div>');

        $backdrop.append($div);
        $('body').append($backdrop);

        $backdrop.animate({
            bottom: '0%'
        }, 500)
    });


});
