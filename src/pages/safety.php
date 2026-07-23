<?php

declare(strict_types=1);

function responderSeguranca(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    responderSeguranca(['success' => false, 'message' => 'Método não permitido.'], 405);
}

if (strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) !== 'xmlhttprequest') {
    responderSeguranca(['success' => false, 'message' => 'Pedido inválido.'], 403);
}

$membroId = trim((string) ($session->id ?? ''));
$acao = trim((string) ($_POST['action'] ?? ''));
$destinatarioId = trim((string) ($_POST['target_id'] ?? ''));

if ($membroId === '' || $membroId === '0') {
    responderSeguranca(['success' => false, 'message' => 'A sessão terminou.'], 401);
}

if ($destinatarioId === '' || strlen($destinatarioId) > 64) {
    responderSeguranca(['success' => false, 'message' => 'A pessoa selecionada não é válida.'], 422);
}

if (hash_equals($membroId, $destinatarioId)) {
    responderSeguranca(['success' => false, 'message' => 'Não podes executar esta ação sobre o teu perfil.'], 422);
}

try {
    $membroExiste = (bool) $db->runSQL(
        'SELECT 1 FROM membros WHERE id = :id LIMIT 1',
        ['id' => $destinatarioId]
    )->fetchColumn();

    if (!$membroExiste) {
        responderSeguranca(['success' => false, 'message' => 'Esta pessoa já não existe.'], 404);
    }

    if ($acao === 'block') {
        $statement = $db->runSQL(
            'INSERT IGNORE INTO bloqueados (pessoa_bloqueou_id, pessoa_bloqueada_id) VALUES (:membro_id, :destinatario_id)',
            ['membro_id' => $membroId, 'destinatario_id' => $destinatarioId]
        );

        responderSeguranca([
            'success' => true,
            'blocked' => true,
            'already_blocked' => $statement->rowCount() === 0,
            'target_id' => $destinatarioId
        ]);
    }

    if ($acao === 'report') {
        $motivo = trim((string) ($_POST['motivo'] ?? ''));
        $mensagem = trim((string) ($_POST['mensagem'] ?? ''));
        $motivosPermitidos = [
            'comportamento_inadequado',
            'assedio',
            'perfil_falso',
            'spam',
            'seguranca',
            'outro'
        ];

        if (!in_array($motivo, $motivosPermitidos, true)) {
            responderSeguranca(['success' => false, 'message' => 'Escolhe um motivo válido.'], 422);
        }

        if (mb_strlen($mensagem) > 2048) {
            responderSeguranca(['success' => false, 'message' => 'A descrição pode ter no máximo 2048 caracteres.'], 422);
        }

        $db->runSQL(
            'INSERT INTO denuncias (membro_denuncia, membro_denunciado, motivo, mensagem) VALUES (:membro_id, :destinatario_id, :motivo, :mensagem)',
            [
                'membro_id' => $membroId,
                'destinatario_id' => $destinatarioId,
                'motivo' => $motivo,
                'mensagem' => $mensagem !== '' ? $mensagem : null
            ]
        );

        responderSeguranca([
            'success' => true,
            'reported' => true
        ]);
    }

    responderSeguranca(['success' => false, 'message' => 'Ação inválida.'], 422);
} catch (Throwable $erro) {
    error_log('[safety] ' . $erro->getMessage());
    responderSeguranca(['success' => false, 'message' => 'Não foi possível concluir o pedido.'], 500);
}