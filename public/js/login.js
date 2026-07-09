$(document).on('change', '#ver-password', function() {
    var tipo = $(this).is(':checked') ? 'text' : 'password';

    $('#palavra-passe').attr('type', tipo);
});
