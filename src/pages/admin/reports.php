<?php

declare(strict_types=1);

require_moderator($db, $session);

$status = trim((string) ($_GET['status'] ?? 'nova'));
$allowed = ['nova', 'em_analise', 'resolvida', 'rejeitada'];

if (!in_array($status, $allowed, true)) $status = 'nova';

$reports = $db->runSQL(
    'SELECT d.id, d.motivo, d.mensagem, d.criada_em, d.estado,
            d.contexto_tipo, d.membro_denunciado,
            CONCAT(m.primeiro_nome, " ", m.ultimo_nome) AS denunciado_nome
     FROM denuncias d
     LEFT JOIN membros m ON m.id = d.membro_denunciado
     WHERE d.estado = :estado
     ORDER BY d.criada_em ASC
     LIMIT 200',
    ['estado' => $status]
)->fetchAll();

echo $twig->render('admin/reports.html', [
    'reports' => $reports,
    'status' => $status,
    'allowed_statuses' => $allowed
]);
