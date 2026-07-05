$(function() {
    $(document).on('click', '.foto', function(e) {
        var top = $(this).attr('data-top');
        var left = $(this).attr('data-left');

        console.log(top);
        console.log(left);
    });
});
