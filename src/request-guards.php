<?php

function rejeitarLimiteRota(array $limite): never {
    $tentarEm = max(1, (int) ($limite['tentar_em'] ?? 1));
    $minutos = minutosParaTentarNovamente($tentarEm);
    $espera = $minutos === 1 ? '1 minuto' : $minutos . ' minutos';
    header('Retry-After: ' . $tentarEm);
    json_response(
        [
            'success' => false,
            'message' => 'Estás a fazer pedidos demasiado depressa. Tenta novamente dentro de ' . $espera . '.'
        ],
        429
    );
}

function limitarRota(string $grupo, string $identificador, int $maximo, int $janelaSegundos): void {
    $limite = consumirLimiteRequisicoes($grupo, $identificador, $maximo, $janelaSegundos);
    if (!$limite['permitido']) {
        rejeitarLimiteRota($limite);
    }
}

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$atualizacaoBackground = $page === 'background-location-update' && $metodo === 'POST';
if (!$atualizacaoBackground) {
    require_csrf_token();
}
$membroId = trim((string) ($session->id ?? ''));
$endereco = chaveLimiteRequisicoes(enderecoCliente());
$sessaoAtual = session_status() === PHP_SESSION_ACTIVE ? session_id() : '';
$sessaoOuEndereco = chaveLimiteRequisicoes($sessaoAtual !== '' ? $sessaoAtual : enderecoCliente());
$membroOuSessao = chaveLimiteRequisicoes($membroId !== '' ? $membroId : $sessaoOuEndereco);

if ($page === 'create-account' && $metodo === 'POST') {
    $modoEdicao = (string) ($_POST['modo'] ?? '') === 'editar';
    if ($modoEdicao) {
        limitarRota('profile-edit', $membroOuSessao, 30, 15 * 60);
    } else {
        limitarRota('create-account-session', $sessaoOuEndereco, 5, 60 * 60);
        limitarRota('create-account-ip', $endereco, 50, 60 * 60);
    }
}

if ($page === 'messages' && $metodo === 'POST' && trim((string) ($_POST['action'] ?? 'send')) === 'send') {
    limitarRota('message-send-minute', $membroOuSessao, 60, 60);
    limitarRota('message-send-hour', $membroOuSessao, 500, 60 * 60);
    $erroMedia = (int) ($_FILES['media']['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($erroMedia !== UPLOAD_ERR_NO_FILE) {
        limitarRota('message-media', $membroOuSessao, 60, 10 * 60);
    }
}

if ($page === 'websocket-token' && $metodo === 'POST') {
    limitarRota('websocket-token', $membroOuSessao, 60, 5 * 60);
}

if ($page === 'push-device' && $metodo === 'POST') {
    limitarRota('push-device', $membroOuSessao, 120, 60 * 60);
}

if ($atualizacaoBackground) {
    $autorizacao = authorization_header();
    $tokenLimite = '';
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $autorizacao, $correspondencias) === 1) {
        $tokenLimite = strtolower($correspondencias[1]);
    }
    $identificadorBackground = chaveLimiteRequisicoes(
        $tokenLimite !== '' ? hash('sha256', $tokenLimite) : enderecoCliente()
    );
    limitarRota('background-location-update', $identificadorBackground, 300, 5 * 60);
}

if ($page === 'create-account-autocompletar') {
    if ($metodo === 'GET') {
        limitarRota('hobby-search', $sessaoOuEndereco, 240, 60);
    } elseif ($metodo === 'POST') {
        limitarRota('hobby-create', $sessaoOuEndereco, 60, 60 * 60);
    }
}

if ($page === 'safety' && $metodo === 'POST') {
    $acaoSeguranca = trim((string) ($_POST['action'] ?? ''));
    if ($acaoSeguranca === 'report') {
        limitarRota('safety-report', $membroOuSessao, 5, 60 * 60);
    } else {
        limitarRota('safety-action', $membroOuSessao, 30, 60 * 60);
    }
}

if ($page === 'blocked-users' && $metodo === 'POST') {
    limitarRota('unblock-user', $membroOuSessao, 30, 60 * 60);
}

if ($page === 'today') {
    if ($metodo === 'GET') {
        limitarRota('today-read', $membroOuSessao, 300, 5 * 60);
    } elseif (in_array($metodo, ['POST', 'DELETE'], true)) {
        limitarRota('today-write', $membroOuSessao, 60, 15 * 60);
    }
}

if (in_array($page, ['daylies', 'notification-preferences'], true) && $metodo !== 'GET') {
    limitarRota($page . '-write', $membroOuSessao, 40, 15 * 60);
}