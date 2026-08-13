<?php

declare(strict_types=1);

require_login($session);

header(
    'Cache-Control: no-store, no-cache, must-revalidate'
);

header('Pragma: no-cache');

header(
    'X-Robots-Tag: noindex, nofollow'
);

$membroId = trim(
    (string) ($session->id ?? '')
);

$metodo = strtoupper(
    (string) (
        $_SERVER['REQUEST_METHOD'] ??
        'GET'
    )
);

if (
    !in_array(
        $metodo,
        ['GET', 'POST'],
        true
    )
) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}

if ($metodo === 'POST') {
    require_csrf_token();

    $acao = trim(
        (string) (
            $_POST['action'] ?? ''
        )
    );

    $destinatarioId = trim(
        (string) (
            $_POST['target_id'] ?? ''
        )
    );

    if (
        $acao !== 'unblock' ||
        $destinatarioId === '' ||
        strlen($destinatarioId) > 64 ||
        hash_equals(
            $membroId,
            $destinatarioId
        )
    ) {
        http_response_code(422);
    } else {
        $db->runSQL(
            'DELETE FROM bloqueados
             WHERE pessoa_bloqueou_id = :membro_id
             AND pessoa_bloqueada_id = :destinatario_id',
            [
                'membro_id' =>
                    $membroId,

                'destinatario_id' =>
                    $destinatarioId
            ]
        );

        redirect(
            DOC_ROOT .
            'blocked-users?desbloqueado=1',
            [],
            303
        );
    }
}

$bloqueados = $db->runSQL(
    "SELECT
        m.id,
        COALESCE(
            NULLIF(
                TRIM(
                    CONCAT(
                        COALESCE(
                            m.primeiro_nome,
                            ''
                        ),
                        ' ',
                        COALESCE(
                            m.ultimo_nome,
                            ''
                        )
                    )
                ),
                ''
            ),
            'Utilizador'
        ) AS nome,
        COALESCE(
            (
                SELECT fp.nome_arquivo
                FROM fotos_perfil AS fp
                WHERE
                    fp.membro_id COLLATE utf8mb4_unicode_ci =
                    m.id COLLATE utf8mb4_unicode_ci
                AND (
                    fp.status = 'completo'
                    OR fp.status IS NULL
                )
                ORDER BY
                    fp.ordem IS NULL ASC,
                    fp.ordem ASC,
                    fp.id ASC
                LIMIT 1
            ),
            'default.webp'
        ) AS foto
     FROM bloqueados AS b
     INNER JOIN membros AS m
        ON m.id COLLATE utf8mb4_unicode_ci =
           b.pessoa_bloqueada_id COLLATE utf8mb4_unicode_ci
     WHERE b.pessoa_bloqueou_id = :membro_id
     ORDER BY nome ASC",
    [
        'membro_id' => $membroId
    ]
)->fetchAll();

foreach (
    $bloqueados as &$bloqueado
) {
    $foto = basename(
        trim(
            (string) (
                $bloqueado['foto'] ??
                'default.webp'
            )
        )
    );

    if ($foto === '') {
        $foto = 'default.webp';
    }

    $bloqueado['foto_url'] =
        DOC_ROOT .
        'imagens/fotos-perfil/' .
        rawurlencode($foto);

    unset($bloqueado['foto']);
}

unset($bloqueado);

echo $twig->render(
    'blocked-users.html',
    [
        'bloqueados' => $bloqueados,
        'desbloqueado' =>
            (string) (
                $_GET['desbloqueado'] ??
                ''
            ) === '1'
    ]
);