<?php
declare(strict_types=1);

// Requerido explicitamente para instalações com o classmap otimizado anterior.
require_once APP_ROOT . '/src/classes/CMS/HalloweenHunt.php';

header('Cache-Control: private, no-store, max-age=0');
header('Vary: Cookie');
header('X-Content-Type-Options: nosniff');

$huntMember = strtolower(trim((string) ($session->id ?? '')));
if (!preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D', $huntMember)) {
    json_response(['success' => false, 'member_id' => null, 'state' => null,
        'message' => 'Precisas de iniciar sessão.'], 401);
}
$huntMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($huntMethod, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    json_response(['success' => false, 'member_id' => $huntMember, 'state' => null,
        'message' => 'Método não permitido.'], 405);
}
require_csrf_token();
limitarRota('halloween-hunt-' . ($huntMethod === 'GET' ? 'read' : 'write'),
    chaveLimiteRequisicoes($huntMember), $huntMethod === 'GET' ? 120 : 90, 60);

// A sessão já foi validada; não a manter bloqueada durante operações na base de dados.
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();

$hunt = new App\CMS\HalloweenHunt($cms->getDatabase());
try {
    if ($huntMethod === 'GET') {
        if (($_GET['action'] ?? 'state') !== 'state') {
            throw new InvalidArgumentException('Ação inválida.', 422);
        }
        $huntState = $hunt->state($huntMember);
    } else {
        $huntRaw = file_get_contents('php://input', false, null, 0, 8193);
        if ($huntRaw === false || strlen($huntRaw) > 8192) {
            throw new InvalidArgumentException('Pedido inválido.', 422);
        }
        try {
            $huntBody = json_decode($huntRaw, true, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException('Pedido inválido.', 422);
        }
        if (!is_array($huntBody) || array_is_list($huntBody)) {
            throw new InvalidArgumentException('Pedido inválido.', 422);
        }
        $huntAction = $huntBody['action'] ?? '';
        if ($huntAction === 'round') {
            $expectedCampaign = $huntBody['campaign_id'] ?? null;
            if (!is_string($expectedCampaign) || $expectedCampaign === '' || strlen($expectedCampaign) > 96) {
                throw new InvalidArgumentException('Campanha inválida.', 422);
            }
            $huntState = $hunt->startRound($huntMember, $expectedCampaign);
        } elseif ($huntAction === 'capture') {
            foreach (['campaign_id', 'round_id', 'kind'] as $field) {
                if (!isset($huntBody[$field]) || !is_string($huntBody[$field]) || strlen($huntBody[$field]) > 96) {
                    throw new InvalidArgumentException('Captura inválida.', 422);
                }
            }
            $huntState = $hunt->capture($huntMember, $huntBody['campaign_id'],
                $huntBody['round_id'], $huntBody['kind']);
        } else {
            throw new InvalidArgumentException('Ação inválida.', 422);
        }
    }
    json_response(['success' => true, 'member_id' => $huntMember, 'state' => $huntState]);
} catch (DomainException | InvalidArgumentException $error) {
    $status = $error->getCode();
    if ($status < 400 || $status > 499) $status = 422;
    try {
        $huntState = $hunt->state($huntMember);
    } catch (Throwable) {
        $huntState = null;
    }
    json_response(['success' => false, 'member_id' => $huntMember, 'state' => $huntState,
        'message' => $error->getMessage()], $status);
} catch (Throwable $error) {
    // Não expor SQL, credenciais ou detalhes de infraestrutura ao cliente.
    error_log('[halloween-hunt] ' . get_class($error) . ' code=' . $error->getCode());
    json_response(['success' => false, 'member_id' => $huntMember, 'state' => null,
        'message' => 'O desafio está temporariamente indisponível. Tenta novamente.'], 503);
}
