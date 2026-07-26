<?php

declare(strict_types=1);

use App\Security\RateLimiter;

require_login($session);

$memberId = (string) $session->id;
$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    if (!RateLimiter::allow(
        'unblock',
        privacy_hash('member:' . $memberId),
        30,
        3600
    )) {
        http_response_code(429);
        $message = 'Foram feitos demasiados pedidos. Tenta mais tarde.';
    } else {
        $targetId = trim((string) ($_POST['target_id'] ?? ''));

        $db->runSQL(
            'DELETE FROM bloqueados
             WHERE pessoa_bloqueou_id = :membro
             AND pessoa_bloqueada_id = :alvo',
            ['membro' => $memberId, 'alvo' => $targetId]
        );
        $message = 'O bloqueio foi removido.';
    }
}

$blocked = $db->runSQL(
    "SELECT m.id,
            CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome
     FROM bloqueados b
     INNER JOIN membros m ON m.id = b.pessoa_bloqueada_id
     WHERE b.pessoa_bloqueou_id = :membro
     ORDER BY m.primeiro_nome, m.ultimo_nome",
    ['membro' => $memberId]
)->fetchAll();

echo $twig->render('blocked-users.html', [
    'blocked' => $blocked,
    'message' => $message
]);
