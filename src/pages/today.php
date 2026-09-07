<?php

declare(strict_types=1);

const MARGOT_TODAY_ENABLED = false;

function responderHojeJson(
    array $dados,
    int $status = 200
): never {
    http_response_code(
        $status
    );

    header(
        'Content-Type: application/json; charset=UTF-8'
    );

    header(
        'Cache-Control: no-store, no-cache, must-revalidate'
    );

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_THROW_ON_ERROR
    );

    exit;
}

function corpoJsonHoje(): array
{
    $raw =
        file_get_contents(
            'php://input'
        );

    if (
        $raw === false ||
        trim($raw) === ''
    ) {
        return [];
    }

    try {
        $dados =
            json_decode(
                $raw,
                true,
                32,
                JSON_THROW_ON_ERROR
            );

        return is_array(
            $dados
        )
            ? $dados
            : [];

    } catch (
        Throwable
    ) {
        responderHojeJson(
            [
                'success' =>
                    false,

                'message' =>
                    'Pedido inválido.'
            ],
            400
        );
    }
}

function limitarTextoHoje(
    mixed $valor,
    int $maximo
): string {
    $texto =
        trim(
            (string)
                $valor
        );

    if (
        mb_strlen(
            $texto
        ) >
        $maximo
    ) {
        $texto =
            mb_substr(
                $texto,
                0,
                $maximo
            );
    }

    return $texto;
}

function normalizarRoupaHoje(
    mixed $valor
): array {
    if (
        !is_array(
            $valor
        )
    ) {
        return [];
    }

    $pecasPermitidas = [
        'tshirt' => [
            'icon' => '👕',
            'label' => 'T-shirt'
        ],

        'shirt' => [
            'icon' => '👔',
            'label' => 'Camisa'
        ],

        'sweater' => [
            'icon' => '🧶',
            'label' => 'Camisola'
        ],

        'hoodie' => [
            'icon' => '🧥',
            'label' => 'Hoodie'
        ],

        'jacket' => [
            'icon' => '🧥',
            'label' => 'Casaco'
        ],

        'top' => [
            'icon' => '👚',
            'label' => 'Top'
        ],

        'jeans' => [
            'icon' => '👖',
            'label' => 'Jeans'
        ],

        'trousers' => [
            'icon' => '👖',
            'label' => 'Calças'
        ],

        'shorts' => [
            'icon' => '🩳',
            'label' => 'Calções'
        ],

        'skirt' => [
            'icon' => '👗',
            'label' => 'Saia'
        ],

        'dress' => [
            'icon' => '👗',
            'label' => 'Vestido'
        ],

        'sneakers' => [
            'icon' => '👟',
            'label' => 'Sapatilhas'
        ],

        'boots' => [
            'icon' => '🥾',
            'label' => 'Botas'
        ],

        'shoes' => [
            'icon' => '👞',
            'label' => 'Sapatos'
        ],

        'sandals' => [
            'icon' => '🩴',
            'label' => 'Sandálias'
        ],

        'cap' => [
            'icon' => '🧢',
            'label' => 'Boné'
        ],

        'hat' => [
            'icon' => '👒',
            'label' => 'Chapéu'
        ],

        'glasses' => [
            'icon' => '🕶️',
            'label' => 'Óculos'
        ],

        'backpack' => [
            'icon' => '🎒',
            'label' => 'Mochila'
        ]
    ];

    $coresPermitidas = [
        'white' =>
            'Branco',

        'black' =>
            'Preto',

        'grey' =>
            'Cinzento',

        'blue' =>
            'Azul',

        'denim' =>
            'Ganga',

        'red' =>
            'Vermelho',

        'green' =>
            'Verde',

        'yellow' =>
            'Amarelo',

        'pink' =>
            'Rosa',

        'purple' =>
            'Roxo',

        'brown' =>
            'Castanho',

        'beige' =>
            'Bege',

        'orange' =>
            'Laranja',

        'multicolor' =>
            'Multicolor'
    ];

    $resultado = [];

    foreach (
        array_slice(
            $valor,
            0,
            5
        )
        as
        $item
    ) {
        if (
            !is_array(
                $item
            )
        ) {
            continue;
        }

        $tipo =
            strtolower(
                trim(
                    (string) (
                        $item['type']
                        ?? ''
                    )
                )
            );

        $cor =
            strtolower(
                trim(
                    (string) (
                        $item['color']
                        ?? ''
                    )
                )
            );

        if (
            !isset(
                $pecasPermitidas[
                    $tipo
                ]
            )
        ) {
            continue;
        }

        if (
            $cor !== '' &&
            !isset(
                $coresPermitidas[
                    $cor
                ]
            )
        ) {
            $cor = '';
        }

        $resultado[] = [
            'type' =>
                $tipo,

            'icon' =>
                $pecasPermitidas[
                    $tipo
                ]['icon'],

            'label' =>
                $pecasPermitidas[
                    $tipo
                ]['label'],

            'color' =>
                $cor,

            'color_label' =>
                $cor !== ''
                    ? $coresPermitidas[
                        $cor
                    ]
                    : ''
        ];
    }

    return $resultado;
}


require_login(
    $session
);


/*
 * IMPORTANTE:
 *
 * Mantemos desligado enquanto
 * a build 5 está em App Review.
 */
if (
    !MARGOT_TODAY_ENABLED
) {
    responderHojeJson(
        [
            'success' =>
                false,

            'message' =>
                'Funcionalidade indisponível.'
        ],
        404
    );
}


$viewerId =
    trim(
        (string) (
            $session->id
            ?? ''
        )
    );


$targetId =
    trim(
        (string) (
            $id
            ?? $viewerId
        )
    );


$method =
    strtoupper(
        (string) (
            $_SERVER[
                'REQUEST_METHOD'
            ]
            ?? 'GET'
        )
    );


$today =
    $cms
        ->getTodayStatus();


if (
    $method ===
    'GET'
) {
    if (
        $targetId === '' ||
        !$cms
            ->getProfileAccess()
            ->canView(
                $viewerId,
                $targetId
            )
    ) {
        responderHojeJson(
            [
                'success' =>
                    false,

                'message' =>
                    'Perfil indisponível.'
            ],
            404
        );
    }

    responderHojeJson(
        [
            'success' =>
                true,

            'today' =>
                $today->get(
                    $targetId
                )
        ]
    );
}


if (
    $targetId !==
    $viewerId
) {
    responderHojeJson(
        [
            'success' =>
                false,

            'message' =>
                'Não podes alterar o estado de outra pessoa.'
        ],
        403
    );
}


if (
    $method ===
    'POST'
) {
    $dados =
        corpoJsonHoje();

    $nota =
        limitarTextoHoje(
            $dados['note']
                ?? '',
            160
        );

    $roupa =
        normalizarRoupaHoje(
            $dados['clothes']
                ?? []
        );

    $estado =
        $today->save(
            $viewerId,
            $nota,
            $roupa
        );

    responderHojeJson(
        [
            'success' =>
                true,

            'today' =>
                $estado
        ]
    );
}


if (
    $method ===
    'DELETE'
) {
    $today->delete(
        $viewerId
    );

    responderHojeJson(
        [
            'success' =>
                true,

            'today' =>
                null
        ]
    );
}


header(
    'Allow: GET, POST, DELETE'
);


responderHojeJson(
    [
        'success' =>
            false,

        'message' =>
            'Método não permitido.'
    ],
    405
);