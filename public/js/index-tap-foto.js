$(function() {
    $(document).on('click', '.foto', function(e) {
        var top = $(this).attr('data-top');
        var left = $(this).attr('data-left');

        var $div = $('<div class="mini-menu"></div>');

        $('body').append($div);
        $div.slideDown()
    });
});
