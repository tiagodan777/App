<?php
declare(strict_types=1);

function corpoJsonHoje(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    try {
        $dados = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        return is_array($dados) ? $dados : [];
    } catch (Throwable) {
        json_response(['success' => false, 'message' => 'Pedido inválido.'], 400);
    }
}
require_login($session);
$todayEnabled = !defined('MARGOT_TODAY_ENABLED') || MARGOT_TODAY_ENABLED;
if (!$todayEnabled) {
    json_response(['success' => false, 'message' => 'Funcionalidade indisponível.'], 404);
}
$viewerId = trim((string) ($session->id ?? ''));
$targetId = trim((string) ($id ?? $viewerId));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$today = $cms->getTodayStatus();
if ($method === 'GET') {
    if ($targetId === '' || !$cms->getProfileAccess()->canView($viewerId, $targetId)) {
        json_response(['success' => false, 'message' => 'Perfil indisponível.'], 404);
    }
    json_response(['success' => true, 'today' => $today->get($targetId)]);
}
if ($targetId !== $viewerId) {
    json_response(['success' => false, 'message' => 'Não podes alterar o estado de outra pessoa.'], 403);
}
if ($method === 'POST') {
    $dados = corpoJsonHoje();
    $nota = $today->normaliseNote($dados['note'] ?? '', 160);
    $roupa = $today->normaliseClothes($dados['clothes'] ?? []);
    $estado = $today->save($viewerId, $nota, $roupa);
    json_response(['success' => true, 'today' => $estado]);
}
if ($method === 'DELETE') {
    $today->delete($viewerId);
    json_response(['success' => true, 'today' => null]);
}
header('Allow: GET, POST, DELETE');
json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
