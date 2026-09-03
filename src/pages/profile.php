<?php

declare(strict_types=1);

function responderPerfilIndisponivel($twig): never
{
    http_response_code(404);

    header(
        'Cache-Control: no-store, no-cache, must-revalidate'
    );

    header(
        'Pragma: no-cache'
    );

    header(
        'X-Robots-Tag: noindex, nofollow'
    );

    header(
        'Referrer-Policy: no-referrer'
    );

    echo $twig->render(
        'error-page.html',
        [
            'page_title' =>
                'Perfil indisponível',

            'heading' =>
                'Perfil indisponível',

            'message' =>
                'Não foi possível abrir este perfil.'
        ]
    );

    exit;
}

require_login(
    $session
);

header(
    'Cache-Control: no-store, no-cache, must-revalidate'
);

header(
    'Pragma: no-cache'
);

header(
    'X-Robots-Tag: noindex, nofollow'
);

header(
    'Referrer-Policy: no-referrer'
);

if (
    strtoupper(
        (string) (
            $_SERVER[
                'REQUEST_METHOD'
            ] ??
            'GET'
        )
    ) !==
    'GET'
) {
    header(
        'Allow: GET'
    );

    http_response_code(
        405
    );

    exit;
}

$viewerId =
    trim(
        (string) (
            $session->id ??
            ''
        )
    );

$profileId =
    trim(
        (string) (
            $id ??
            ''
        )
    );

$profileAccess =
    $cms->getProfileAccess();

if (
    !$profileAccess->canView(
        $viewerId,
        $profileId
    )
) {
    responderPerfilIndisponivel(
        $twig
    );
}

$member =
    $cms
        ->getMember()
        ->get(
            $profileId
        );

if (!$member) {
    responderPerfilIndisponivel(
        $twig
    );
}

unset(
    $member['telefone'],
    $member['email'],
    $member['password']
);

try {
    $age =
        calcularIdade(
            (string) (
                $member[
                    'nascimento'
                ] ??
                ''
            )
        );
} catch (Throwable) {
    responderPerfilIndisponivel(
        $twig
    );
}

$connected =
    $viewerId !==
    $profileId
        ? $cms
            ->getMemberConnection()
            ->areConnected(
                $viewerId,
                $profileId
            )
        : false;

echo $twig->render(
    'profile.html',
    [
        'membro' =>
            $member,

        'primeiro_gosto' =>
            trim(
                (string) (
                    $member[
                        'gostos'
                    ][0][
                        'nome'
                    ] ??
                    ''
                )
            ),

        'idade' =>
            $age,

        'id' =>
            $profileId,

        'ligados' =>
            $connected
    ]
);