<?php

declare(strict_types=1);

function responderNotificacoes(
    array $dados,
    int $status = 200
): never {
    http_response_code($status);

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

$membroId = trim(
    (string) ($session->id ?? '')
);

if (
    $membroId === '' ||
    $membroId === '0'
) {
    responderNotificacoes([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $acao = trim(
        (string) ($_POST['action'] ?? '')
    );

    if ($acao !== 'mark_all_read') {
        responderNotificacoes([
            'success' => false,
            'message' => 'Ação inválida.'
        ], 422);
    }

    $sql = "
        UPDATE notificacao
        SET
            lida = 1,
            lida_em = COALESCE(
                lida_em,
                NOW()
            )
        WHERE destinatario_id = :destinatario_id
        AND lida = 0
    ";

    $db->runSQL($sql, [
        'destinatario_id' => $membroId
    ]);

    responderNotificacoes([
        'success' => true,
        'unread_count' => 0
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, POST');

    responderNotificacoes([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

$sql = "
    SELECT
        n.id,
        n.emissor_id,
        n.destinatario_id,
        n.tipo,
        n.lida,
        n.criada_em,
        n.lida_em,

        CASE
            WHEN n.emissor_id = :id_direcao
                THEN 'enviado'
            ELSE 'recebido'
        END AS direcao,

        outro.id AS outro_membro_id,

        TRIM(
            CONCAT_WS(
                ' ',
                outro.primeiro_nome,
                outro.ultimo_nome
            )
        ) AS outro_nome,

        COALESCE(
            (
                SELECT fp.nome_arquivo
                FROM fotos_perfil AS fp
                WHERE fp.membro_id = outro.id
                AND (
                    fp.status = 'completo'
                    OR fp.status IS NULL
                )
                ORDER BY
                    fp.ordem IS NULL ASC,
                    fp.ordem ASC
                LIMIT 1
            ),
            'default.webp'
        ) AS outro_foto

    FROM notificacao AS n

    INNER JOIN membros AS outro
        ON outro.id = CASE
            WHEN n.emissor_id = :id_outro
                THEN n.destinatario_id
            ELSE n.emissor_id
        END

    WHERE
        n.emissor_id = :id_emissor
        OR n.destinatario_id = :id_destinatario

    ORDER BY
        n.criada_em DESC,
        n.id DESC

    LIMIT 100
";

$notificacoes = $db
    ->runSQL($sql, [
        'id_direcao' => $membroId,
        'id_outro' => $membroId,
        'id_emissor' => $membroId,
        'id_destinatario' => $membroId
    ])
    ->fetchAll();

foreach ($notificacoes as &$notificacao) {
    $foto = basename(
        trim(
            (string) (
                $notificacao['outro_foto']
                ?? 'default.webp'
            )
        )
    );

    if ($foto === '') {
        $foto = 'default.webp';
    }

    $notificacao['id'] =
        (int) $notificacao['id'];

    $notificacao['lida'] =
        (bool) $notificacao['lida'];

    $notificacao['outro_foto_url'] =
        DOC_ROOT .
        'imagens/fotos-perfil/' .
        $foto;

    unset($notificacao['outro_foto']);
}

unset($notificacao);

$sql = "
    SELECT COUNT(*)
    FROM notificacao
    WHERE destinatario_id = :destinatario_id
    AND lida = 0
";

$naoLidas = (int) $db
    ->runSQL($sql, [
        'destinatario_id' => $membroId
    ])
    ->fetchColumn();

responderNotificacoes([
    'success' => true,
    'unread_count' => $naoLidas,
    'notifications' => $notificacoes
]);