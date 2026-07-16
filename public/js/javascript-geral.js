$('#menuPrincipal > nav > ul > li > a').on('click', function(e) {
    $('#menuPrincipal > nav > ul > li').removeClass('active');
    $(this).addClass('active');
})