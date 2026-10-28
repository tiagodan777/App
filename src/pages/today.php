<?php
declare(strict_types=1);

function corpoJsonHoje(): array {
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        return [];
    }

    try {
        $dados = json_decode(
            $raw,
            true,
            32,
            JSON_THROW_ON_ERROR
        );

        return is_array($dados) ? $dados : [];
    } catch (Throwable) {
        json_response(
            ['success' => false, 'message' => 'Pedido inválido.'],
            400
        );
    }
}

require_login($session);

header('Cache-Control: private, no-store, max-age=0');
header('Vary: Cookie, X-Margot-Wardrobe');

$wardrobeVersion = (string) (
    $_SERVER['HTTP_X_MARGOT_WARDROBE'] ?? ''
);

$todayEnabled = !defined('MARGOT_TODAY_ENABLED')
    || MARGOT_TODAY_ENABLED;

if (!$todayEnabled) {
    json_response(
        ['success' => false, 'message' => 'Funcionalidade indisponível.'],
        404
    );
}

$viewerId = trim((string) ($session->id ?? ''));
$targetId = trim((string) ($id ?? $viewerId));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$today = $cms->getTodayStatus();

if ($method === 'GET') {
    if (
        $targetId === ''
        || !$cms->getProfileAccess()->canView($viewerId, $targetId)
    ) {
        json_response(
            ['success' => false, 'message' => 'Perfil indisponível.'],
            404
        );
    }

    json_response([
        'success' => true,
        'today' => $today->getForViewer(
            $targetId,
            $viewerId,
            $wardrobeVersion
        ),
    ]);
}

if ($targetId !== $viewerId) {
    json_response(
        [
            'success' => false,
            'message' => 'Não podes alterar o estado de outra pessoa.',
        ],
        403
    );
}

if ($method === 'POST') {
    $dados = corpoJsonHoje();
    $nota = $today->normaliseNote($dados['note'] ?? '', 160);

    try {
        $roupa = $today->normaliseClothes(
            $dados['clothes'] ?? [],
            $viewerId
        );

        $estado = $today->save(
            $viewerId,
            $nota,
            $roupa,
            $wardrobeVersion
        );
    } catch (DomainException $e) {
        json_response(
            ['success' => false, 'message' => $e->getMessage()],
            403
        );
    } catch (InvalidArgumentException $e) {
        json_response(
            ['success' => false, 'message' => $e->getMessage()],
            422
        );
    } catch (LogicException $e) {
        json_response(
            ['success' => false, 'message' => $e->getMessage()],
            409
        );
    }

    json_response([
        'success' => true,
        'today' => $estado,
    ]);
}

if ($method === 'DELETE') {
    $today->delete($viewerId);

    json_response([
        'success' => true,
        'today' => null,
    ]);
}

header('Allow: GET, POST, DELETE');

json_response(
    ['success' => false, 'message' => 'Método não permitido.'],
    405
);