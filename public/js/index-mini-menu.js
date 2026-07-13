$(function() {
    var $miniMenu = $('.mini-menu');
    $(document).on('click', '.foto', function() {
        var $img = $(this);

        $miniMenu.find('img').attr('src', $img.attr('src'));
        $miniMenu.find('h1').text($img.attr('data-nome'));
        $miniMenu.find('form').attr('action', '{{ doc_root }}messages?sendTo=' + $img.attr('data-membro-id'));
    }) 
});