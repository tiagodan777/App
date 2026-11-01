<?php
declare(strict_types=1);

$membroId = trim((string) ($session->id ?? ''));
if ($membroId === '' || $membroId === '0') {
    json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
}
$notifications = $cms->getNotification();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    if ($metodo === 'POST') {
        $acao = trim((string) ($_POST['action'] ?? ''));
        if ($acao === 'mark_all_read') {
            $notifications->markAllRead($membroId);
            json_response(['success' => true, 'unread_count' => 0]);
        }
        if ($acao === 'hide_one' || $acao === 'hide_all') {
            $direcao = trim((string) ($_POST['direction'] ?? ''));
            $notificationId = $acao === 'hide_one' ? (int) ($_POST['notification_id'] ?? 0) : null;
            if (
                !in_array($direcao, ['recebido', 'enviado'], true) ||
                ($notificationId !== null && $notificationId < 1)
            ) {
                $message = $acao === 'hide_one' ? 'O Hey indicado não é válido.' : 'A lista indicada não é válida.';
                json_response(['success' => false, 'message' => $message], 422);
            }
            $notifications->hide($membroId, $direcao, $notificationId);
            json_response(['success' => true, 'unread_count' => $notifications->unreadCount($membroId)]);
        }
        json_response(['success' => false, 'message' => 'Ação inválida.'], 422);
    }
    if ($metodo !== 'GET') {
        header('Allow: GET, POST');
        json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
    }
    json_response([
        'success' => true,
        'unread_count' => $notifications->unreadCount($membroId),
        'notifications' => $notifications->list($membroId)
    ]);
} catch (Throwable $erro) {
    error_log('[notifications] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível carregar os Heys.'], 500);
}
