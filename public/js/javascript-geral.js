$('#menuPrincipal > nav > ul > li').on('click', function(e) {
    $('#menuPrincipal > nav > ul > li').removeClass('active');
    $(this).addClass('active');
})