<?php
declare(strict_types=1);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
}
if (strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) !== 'xmlhttprequest') {
    json_response(['success' => false, 'message' => 'Pedido inválido.'], 403);
}
$membroId = trim((string) ($session->id ?? ''));
$acao = trim((string) ($_POST['action'] ?? ''));
$destinatarioId = trim((string) ($_POST['target_id'] ?? ''));
if ($membroId === '' || $membroId === '0') {
    json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
}
if ($destinatarioId === '' || strlen($destinatarioId) > 64) {
    json_response(['success' => false, 'message' => 'A pessoa selecionada não é válida.'], 422);
}
if (hash_equals($membroId, $destinatarioId)) {
    json_response(['success' => false, 'message' => 'Não podes executar esta ação sobre o teu perfil.'], 422);
}
try {
    $membroExiste = $cms->getSafety()->memberExists($destinatarioId);
    if (!$membroExiste) {
        json_response(['success' => false, 'message' => 'Esta pessoa já não existe.'], 404);
    }
    if ($acao === 'block') {
        $blocked = $cms->getSafety()->block($membroId, $destinatarioId);
        json_response([
            'success' => true,
            'blocked' => true,
            'already_blocked' => !$blocked,
            'target_id' => $destinatarioId
        ]);
    }
    if ($acao === 'report') {
        $motivo = trim((string) ($_POST['motivo'] ?? ''));
        $mensagem = trim((string) ($_POST['mensagem'] ?? ''));
        $motivosPermitidos = ['comportamento_inadequado', 'assedio', 'perfil_falso', 'spam', 'seguranca', 'outro'];
        if (!in_array($motivo, $motivosPermitidos, true)) {
            json_response(['success' => false, 'message' => 'Escolhe um motivo válido.'], 422);
        }
        if (mb_strlen($mensagem) > 2048) {
            json_response(['success' => false, 'message' => 'A descrição pode ter no máximo 2048 caracteres.'], 422);
        }
        $cms->getSafety()->report($membroId, $destinatarioId, $motivo, $mensagem);
        json_response(['success' => true, 'reported' => true]);
    }
    json_response(['success' => false, 'message' => 'Ação inválida.'], 422);
} catch (Throwable $erro) {
    error_log('[safety] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível concluir o pedido.'], 500);
}
