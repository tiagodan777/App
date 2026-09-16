<?php
declare(strict_types=1);

require_login($session);
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');
$membroId = trim((string) ($session->id ?? ''));
$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($metodo, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit();
}
if ($metodo === 'POST') {
    $acao = trim((string) ($_POST['action'] ?? ''));
    $destinatarioId = trim((string) ($_POST['target_id'] ?? ''));
    if (
        $acao !== 'unblock' ||
        $destinatarioId === '' ||
        strlen($destinatarioId) > 64 ||
        hash_equals($membroId, $destinatarioId)
    ) {
        http_response_code(422);
    } else {
        $cms->getSafety()->unblock($membroId, $destinatarioId);
        redirect(DOC_ROOT . 'blocked-users?desbloqueado=1', [], 303);
    }
}
$bloqueados = $cms->getSafety()->blockedUsers($membroId);
echo $twig->render('blocked-users.html', [
    'bloqueados' => $bloqueados,
    'desbloqueado' => (string) ($_GET['desbloqueado'] ?? '') === '1'
]);
