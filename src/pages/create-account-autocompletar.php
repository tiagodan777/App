<?php

declare(strict_types=1);

header(
    'Content-Type: application/json; charset=UTF-8'
);

header(
    'Cache-Control: no-store'
);

$metodo = strtoupper(
    (string) (
        $_SERVER['REQUEST_METHOD']
        ?? 'GET'
    )
);

$gosto = trim(
    (string) (
        $metodo === 'GET'
            ? ($_GET['gosto'] ?? '')
            : ($_POST['gosto'] ?? '')
    )
);

if ($metodo === 'GET') {
    echo json_encode(
        $gosto === ''
            ? []
            : $cms
                ->getHobbie()
                ->get($gosto),
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}

if ($metodo === 'POST') {
    if ($gosto === '') {
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'Escreve um gosto.'
        ]);

        exit;
    }

    try {
        $cms
            ->getHobbie()
            ->create($gosto);
    } catch (\PDOException $erro) {
        /*
         * Se o gosto já existir, a operação é considerada
         * concluída. Isto também resolve pedidos simultâneos.
         */
        if (
            (int) (
                $erro->errorInfo[1]
                ?? 0
            ) !== 1062
        ) {
            error_log(
                '[create-account-autocompletar] ' .
                $erro->getMessage()
            );

            http_response_code(500);

            echo json_encode([
                'success' => false,
                'message' =>
                    'Não foi possível guardar o gosto.'
            ]);

            exit;
        }
    }

    echo json_encode([
        'success' => true
    ]);

    exit;
}

header('Allow: GET, POST');

http_response_code(405);

echo json_encode([
    'success' => false,
    'message' => 'Método não permitido.'
]);