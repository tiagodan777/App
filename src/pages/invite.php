<?php
declare(strict_types=1);

use App\CMS\Invitation;

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    return;
}

limitarRota(
    'invitation-read',
    chaveLimiteRequisicoes(enderecoCliente()),
    120,
    60
);

/*
 * O router aplica filter_var ao ID.
 * Quando não há ID, pode chegar uma string vazia em vez de null.
 */
$rawId = (string) ($id ?? '');
$personal = $rawId === '';
$code = Invitation::normalize($rawId);
$base = rtrim((string) DOC_ROOT, '/') . '/';

if (
    strtolower((string) ($_SERVER['HTTP_HOST'] ?? '')) === 'go.margot-app.com'
    && $code !== ''
) {
    redirect(
        rtrim((string) DOMAIN, '/') . '/invite/' . $code,
        [],
        302
    );
}

if ($personal) {
    require_login($session);
}

try {
    $invitations = new Invitation($db);

    if ($personal) {
        $code = $invitations->personalCode((string) $session->id);
    } elseif ($code === '' || $invitations->owner($code) === '') {
        http_response_code(404);

        echo $twig->render('invite.html', [
            'invalid_invitation' => true
        ]);

        return;
    }

    echo $twig->render('invite.html', [
        'personal_invitation' => $personal,
        'invitation_code' => Invitation::display($code),
        'invitation_url' => 'https://go.margot-app.com/invite/' . $code,
        'registration_url' => $base . 'create-account?convite=' . $code,
        'invitation_count' => $personal
            ? $invitations->confirmedCount((string) $session->id)
            : 0
    ]);
} catch (Throwable $error) {
    error_log(
        '[invitation] Não foi possível carregar o convite: '
        . $error->getMessage()
    );

    http_response_code(503);

    echo $twig->render('invite.html', [
        'invitation_unavailable' => true
    ]);
}