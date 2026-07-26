<?php

declare(strict_types=1);

require_moderator($db, $session);

$reportId = trim((string) ($id ?? ''));
$report = $db->runSQL(
    'SELECT d.*, CONCAT(m.primeiro_nome, " ", m.ultimo_nome) AS denunciado_nome
     FROM denuncias d
     LEFT JOIN membros m ON m.id = d.membro_denunciado
     WHERE d.id = :id
     LIMIT 1',
    ['id' => $reportId]
)->fetch();

if (!$report) {
    http_response_code(404);
    echo $twig->render('error-page.html', ['message' => 'Denúncia não encontrada.']);
    exit;
}

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    $action = trim((string) ($_POST['action'] ?? ''));
    $note = mb_substr(trim((string) ($_POST['note'] ?? '')), 0, 2000);
    $allowedActions = [
        'abrir',
        'resolver_sem_acao',
        'rejeitar',
        'advertir',
        'suspender',
        'banir'
    ];

    if (!in_array($action, $allowedActions, true)) {
        $message = 'Ação inválida.';
    } elseif (
        in_array($action, ['advertir', 'suspender', 'banir'], true) &&
        $note === ''
    ) {
        $message = 'Regista uma nota antes desta ação.';
    } else {
        $newStatus = match ($action) {
            'abrir' => 'em_analise',
            'rejeitar' => 'rejeitada',
            default => 'resolvida'
        };

        $db->beginTransaction();

        try {
            $db->runSQL(
                'INSERT INTO moderacao_acoes (
                    denuncia_id,
                    moderador_id,
                    acao,
                    nota,
                    criada_em
                 ) VALUES (
                    :denuncia,
                    :moderador,
                    :acao,
                    :nota,
                    UTC_TIMESTAMP(6)
                 )',
                [
                    'denuncia' => $reportId,
                    'moderador' => (string) $session->id,
                    'acao' => $action,
                    'nota' => $note !== '' ? $note : null
                ]
            );

            $db->runSQL(
                'UPDATE denuncias
                 SET estado = :estado,
                     resolvida_em = CASE
                         WHEN :estado_resolvido IN ("resolvida", "rejeitada")
                         THEN UTC_TIMESTAMP(6)
                         ELSE NULL
                     END,
                     reter_ate = CASE
                         WHEN :estado_retencao IN ("resolvida", "rejeitada")
                         THEN DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 12 MONTH)
                         ELSE NULL
                     END
                 WHERE id = :id',
                [
                    'estado' => $newStatus,
                    'estado_resolvido' => $newStatus,
                    'estado_retencao' => $newStatus,
                    'id' => $reportId
                ]
            );

            if (
                in_array($action, ['suspender', 'banir'], true) &&
                !empty($report['membro_denunciado'])
            ) {
                $accountStatus = $action === 'banir' ? 'banido' : 'suspenso';
                $targetId = (string) $report['membro_denunciado'];

                $db->runSQL(
                    'UPDATE membros
                     SET estado = :estado,
                         moderacao_motivo = :motivo,
                         estado_alterado_em = UTC_TIMESTAMP(6),
                         auth_version = auth_version + 1
                     WHERE id = :id',
                    [
                        'estado' => $accountStatus,
                        'motivo' => 'denuncia:' . $reportId,
                        'id' => $targetId
                    ]
                );
                $db->runSQL('DELETE FROM token WHERE membro_id = :id', ['id' => $targetId]);
                $db->runSQL('DELETE FROM websocket_tickets WHERE membro_id = :id', ['id' => $targetId]);
            }

            $db->commit();
            redirect(DOC_ROOT . 'admin/report/' . rawurlencode($reportId), [], 303);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            error_log('[moderation] ' . $exception->getMessage());
            $message = 'Não foi possível guardar a decisão.';
        }
    }
}

$history = $db->runSQL(
    'SELECT ma.acao, ma.nota, ma.criada_em,
            CONCAT(m.primeiro_nome, " ", m.ultimo_nome) AS moderador_nome
     FROM moderacao_acoes ma
     LEFT JOIN membros m ON m.id = ma.moderador_id
     WHERE ma.denuncia_id = :id
     ORDER BY ma.criada_em ASC',
    ['id' => $reportId]
)->fetchAll();

echo $twig->render('admin/report.html', [
    'report' => $report,
    'history' => $history,
    'message' => $message
]);
