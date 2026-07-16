<?php

declare(strict_types=1);

function responderNotificacoes(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function obterHeys($db, string $membroId, string $direcao): array
{
    $recebido = $direcao === 'recebido';
    $campoDoOutro = $recebido ? 'emissor_id' : 'destinatario_id';
    $campoDoMembro = $recebido ? 'destinatario_id' : 'emissor_id';
    $campoOculto = $recebido ? 'ocultada_para_destinatario_em' : 'ocultada_para_emissor_em';

    $sql = "
        SELECT n.id, n.emissor_id, n.destinatario_id, n.tipo, n.lida, n.criada_em, n.lida_em,
            '{$direcao}' AS direcao,
            m.id AS outro_membro_id,
            COALESCE(NULLIF(TRIM(CONCAT(COALESCE(m.primeiro_nome, ''), ' ', COALESCE(m.ultimo_nome, ''))), ''), 'Utilizador') AS outro_nome,
            COALESCE((
                SELECT fp.nome_arquivo
                FROM fotos_perfil AS fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
                AND (fp.status = 'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
                LIMIT 1
            ), 'default.webp') AS outro_foto
        FROM notificacao AS n
        LEFT JOIN membros AS m ON m.id COLLATE utf8mb4_unicode_ci = n.{$campoDoOutro} COLLATE utf8mb4_unicode_ci
        WHERE n.{$campoDoMembro} = :membro_id
        AND n.tipo = 'hey'
        AND n.{$campoOculto} IS NULL
        ORDER BY n.criada_em DESC, n.id DESC
        LIMIT 100
    ";

    return $db->runSQL($sql, ['membro_id' => $membroId])->fetchAll();
}

function prepararHeys(array $heys): array
{
    usort($heys, function (array $a, array $b): int {
        $porData = strcmp((string) ($b['criada_em'] ?? ''), (string) ($a['criada_em'] ?? ''));
        return $porData !== 0 ? $porData : (int) ($b['id'] ?? 0) <=> (int) ($a['id'] ?? 0);
    });

    foreach ($heys as &$hey) {
        $foto = basename(trim((string) ($hey['outro_foto'] ?? 'default.webp'))) ?: 'default.webp';
        $hey['id'] = (int) ($hey['id'] ?? 0);
        $hey['lida'] = (bool) ($hey['lida'] ?? false);
        $hey['direcao'] = ($hey['direcao'] ?? '') === 'enviado' ? 'enviado' : 'recebido';
        $hey['outro_foto_url'] = DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($foto);
        unset($hey['outro_foto']);
    }

    unset($hey);
    return array_slice($heys, 0, 100);
}

function contarHeysNaoLidos($db, string $membroId): int
{
    $sql = "
        SELECT COUNT(*)
        FROM notificacao
        WHERE destinatario_id = :membro_id
        AND tipo = 'hey'
        AND lida = 0
        AND ocultada_para_destinatario_em IS NULL
    ";

    return (int) $db->runSQL($sql, ['membro_id' => $membroId])->fetchColumn();
}

$membroId = trim((string) ($session->id ?? ''));

if ($membroId === '' || $membroId === '0') {
    responderNotificacoes(['success' => false, 'message' => 'A sessão terminou.'], 401);
}

try {
    $metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($metodo === 'POST') {
        $acao = trim((string) ($_POST['action'] ?? ''));

        if ($acao === 'mark_all_read') {
            $sql = "
                UPDATE notificacao
                SET lida = 1, lida_em = COALESCE(lida_em, NOW())
                WHERE destinatario_id = :membro_id
                AND tipo = 'hey'
                AND lida = 0
                AND ocultada_para_destinatario_em IS NULL
            ";

            $db->runSQL($sql, ['membro_id' => $membroId]);
            responderNotificacoes(['success' => true, 'unread_count' => 0]);
        }

        if ($acao === 'hide_one') {
            $id = (int) ($_POST['notification_id'] ?? 0);
            $direcao = trim((string) ($_POST['direction'] ?? ''));

            if ($id < 1 || !in_array($direcao, ['recebido', 'enviado'], true)) {
                responderNotificacoes(['success' => false, 'message' => 'O Hey indicado não é válido.'], 422);
            }

            if ($direcao === 'recebido') {
                $sql = "
                    UPDATE notificacao
                    SET ocultada_para_destinatario_em = COALESCE(ocultada_para_destinatario_em, NOW()),
                        lida = 1,
                        lida_em = COALESCE(lida_em, NOW())
                    WHERE id = :id AND destinatario_id = :membro_id AND tipo = 'hey'
                ";
            } else {
                $sql = "
                    UPDATE notificacao
                    SET ocultada_para_emissor_em = COALESCE(ocultada_para_emissor_em, NOW())
                    WHERE id = :id AND emissor_id = :membro_id AND tipo = 'hey'
                ";
            }

            $db->runSQL($sql, ['id' => $id, 'membro_id' => $membroId]);
            responderNotificacoes(['success' => true, 'unread_count' => contarHeysNaoLidos($db, $membroId)]);
        }

        if ($acao === 'hide_all') {
            $direcao = trim((string) ($_POST['direction'] ?? ''));

            if (!in_array($direcao, ['recebido', 'enviado'], true)) {
                responderNotificacoes(['success' => false, 'message' => 'A lista indicada não é válida.'], 422);
            }

            if ($direcao === 'recebido') {
                $sql = "
                    UPDATE notificacao
                    SET ocultada_para_destinatario_em = COALESCE(ocultada_para_destinatario_em, NOW()),
                        lida = 1,
                        lida_em = COALESCE(lida_em, NOW())
                    WHERE destinatario_id = :membro_id
                    AND tipo = 'hey'
                    AND ocultada_para_destinatario_em IS NULL
                ";
            } else {
                $sql = "
                    UPDATE notificacao
                    SET ocultada_para_emissor_em = COALESCE(ocultada_para_emissor_em, NOW())
                    WHERE emissor_id = :membro_id
                    AND tipo = 'hey'
                    AND ocultada_para_emissor_em IS NULL
                ";
            }

            $db->runSQL($sql, ['membro_id' => $membroId]);
            responderNotificacoes(['success' => true, 'unread_count' => contarHeysNaoLidos($db, $membroId)]);
        }

        responderNotificacoes(['success' => false, 'message' => 'Ação inválida.'], 422);
    }

    if ($metodo !== 'GET') {
        header('Allow: GET, POST');
        responderNotificacoes(['success' => false, 'message' => 'Método não permitido.'], 405);
    }

    $heys = array_merge(obterHeys($db, $membroId, 'recebido'), obterHeys($db, $membroId, 'enviado'));

    responderNotificacoes([
        'success' => true,
        'unread_count' => contarHeysNaoLidos($db, $membroId),
        'notifications' => prepararHeys($heys)
    ]);
} catch (Throwable $erro) {
    error_log('[notifications] ' . $erro->getMessage());
    responderNotificacoes(['success' => false, 'message' => 'Não foi possível carregar os Heys.'], 500);
}