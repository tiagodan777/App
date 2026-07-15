<?php

declare(strict_types=1);

function responderNotificacoes(
    array $dados,
    int $status = 200
): never {
    http_response_code($status);

    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_THROW_ON_ERROR
    );

    exit;
}

function obterHeysRecebidos(
    $db,
    string $membroId
): array {
    $sql = "
        SELECT
            n.id,
            n.emissor_id,
            n.destinatario_id,
            n.tipo,
            n.lida,
            n.criada_em,
            n.lida_em,
            'recebido' AS direcao,
            m.id AS outro_membro_id,
            COALESCE(
                NULLIF(
                    TRIM(
                        CONCAT(
                            COALESCE(m.primeiro_nome, ''),
                            ' ',
                            COALESCE(m.ultimo_nome, '')
                        )
                    ),
                    ''
                ),
                'Utilizador'
            ) AS outro_nome,
            COALESCE(
                (
                    SELECT fp.nome_arquivo
                    FROM fotos_perfil AS fp
                    WHERE fp.membro_id = m.id
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
        LEFT JOIN membros AS m
            ON m.id = n.emissor_id
        WHERE n.destinatario_id = :membro_id
        ORDER BY
            n.criada_em DESC,
            n.id DESC
        LIMIT 100
    ";

    return $db
        ->runSQL($sql, [
            'membro_id' => $membroId
        ])
        ->fetchAll();
}

function obterHeysEnviados(
    $db,
    string $membroId
): array {
    $sql = "
        SELECT
            n.id,
            n.emissor_id,
            n.destinatario_id,
            n.tipo,
            n.lida,
            n.criada_em,
            n.lida_em,
            'enviado' AS direcao,
            m.id AS outro_membro_id,
            COALESCE(
                NULLIF(
                    TRIM(
                        CONCAT(
                            COALESCE(m.primeiro_nome, ''),
                            ' ',
                            COALESCE(m.ultimo_nome, '')
                        )
                    ),
                    ''
                ),
                'Utilizador'
            ) AS outro_nome,
            COALESCE(
                (
                    SELECT fp.nome_arquivo
                    FROM fotos_perfil AS fp
                    WHERE fp.membro_id = m.id
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
        LEFT JOIN membros AS m
            ON m.id = n.destinatario_id
        WHERE n.emissor_id = :membro_id
        ORDER BY
            n.criada_em DESC,
            n.id DESC
        LIMIT 100
    ";

    return $db
        ->runSQL($sql, [
            'membro_id' => $membroId
        ])
        ->fetchAll();
}

function prepararHeys(array $heys): array
{
    usort(
        $heys,
        function (array $primeiro, array $segundo): int {
            $comparacaoData = strcmp(
                (string) ($segundo['criada_em'] ?? ''),
                (string) ($primeiro['criada_em'] ?? '')
            );

            if ($comparacaoData !== 0) {
                return $comparacaoData;
            }

            return (int) ($segundo['id'] ?? 0)
                <=> (int) ($primeiro['id'] ?? 0);
        }
    );

    $heys = array_slice($heys, 0, 100);

    foreach ($heys as &$hey) {
        $foto = basename(
            trim(
                (string) (
                    $hey['outro_foto']
                    ?? 'default.webp'
                )
            )
        );

        if ($foto === '') {
            $foto = 'default.webp';
        }

        $hey['id'] = (int) ($hey['id'] ?? 0);
        $hey['lida'] = (bool) ($hey['lida'] ?? false);
        $hey['direcao'] =
            ($hey['direcao'] ?? '') === 'enviado'
                ? 'enviado'
                : 'recebido';

        $hey['outro_foto_url'] =
            DOC_ROOT .
            'imagens/fotos-perfil/' .
            rawurlencode($foto);

        unset($hey['outro_foto']);
    }

    unset($hey);

    return $heys;
}

$membroId = trim(
    (string) ($session->id ?? '')
);

if ($membroId === '' || $membroId === '0') {
    responderNotificacoes([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

try {
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
                lida_em = COALESCE(lida_em, NOW())
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

    $recebidos = obterHeysRecebidos(
        $db,
        $membroId
    );

    $enviados = obterHeysEnviados(
        $db,
        $membroId
    );

    $heys = prepararHeys(
        array_merge(
            $recebidos,
            $enviados
        )
    );

    $sql = "
        SELECT COUNT(*)
        FROM notificacao
        WHERE destinatario_id = :destinatario_id
        AND lida = 0
    ";

    $naoLidos = (int) $db
        ->runSQL($sql, [
            'destinatario_id' => $membroId
        ])
        ->fetchColumn();

    responderNotificacoes([
        'success' => true,
        'unread_count' => $naoLidos,
        'notifications' => $heys
    ]);
} catch (Throwable $erro) {
    error_log(
        '[notifications] ' .
        $erro->getMessage()
    );

    responderNotificacoes([
        'success' => false,
        'message' => 'Não foi possível carregar os Heys.'
    ], 500);
}