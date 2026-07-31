<?php

require_once '../src/bootstrap.php';

require_csrf_token();

function rejeitarLimiteRota(array $limite): never
{
    $tentarEm = max(1, (int) ($limite['tentar_em'] ?? 1));
    $minutos = minutosParaTentarNovamente($tentarEm);
    $espera = $minutos === 1 ? '1 minuto' : $minutos . ' minutos';

    http_response_code(429);
    header('Retry-After: ' . $tentarEm);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');

    echo json_encode([
        'success' => false,
        'message' => 'Estás a fazer pedidos demasiado depressa. Tenta novamente dentro de ' . $espera . '.'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    exit;
}

function limitarRota(string $grupo, string $identificador, int $maximo, int $janelaSegundos): void {
    $limite = consumirLimiteRequisicoes($grupo, $identificador, $maximo, $janelaSegundos);

    if (!$limite['permitido']) {
        rejeitarLimiteRota($limite);
    }
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

$path = mb_strtolower($path);
$path = substr($path, strlen(DOC_ROOT));
$path = trim($path, '/');

$parts = explode('/', $path);

if ($parts[0] != 'admin') {
    $page = $parts[0] ?: 'index';
    $id = $parts[1] ?? null;
} else {
    $page = 'admin/' . ($parts[1] ?? '');
    $id = $parts[2] ?? null;
}

$id = filter_var($id);

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

$membroId = trim((string) ($session->id ?? ''));

$endereco = chaveLimiteRequisicoes(enderecoCliente());

$sessaoAtual = session_status() === PHP_SESSION_ACTIVE ? session_id() : '';

$sessaoOuEndereco = chaveLimiteRequisicoes($sessaoAtual !== '' ? $sessaoAtual : enderecoCliente());

$membroOuSessao = chaveLimiteRequisicoes($membroId !== ''? $membroId: $sessaoOuEndereco);

/*
 * Criação de conta:
 * - máximo de 5 tentativas por sessão numa hora;
 * - máximo de 50 tentativas por IP numa hora.
 *
 * O limite por IP é mais alto para permitir redes Wi-Fi partilhadas.
 */
if ($page === 'create-account' && $metodo === 'POST') {
    $modoEdicao = (string) ($_POST['modo'] ?? '') === 'editar';

    if ($modoEdicao) {
        limitarRota('profile-edit', $membroOuSessao, 30, 15 * 60);
    } else {
        limitarRota( 'create-account-session', $sessaoOuEndereco, 5, 60 * 60);

        limitarRota( 'create-account-ip', $endereco, 50, 60 * 60 );
    }
}

/*
 * Mensagens:
 * - 60 por minuto;
 * - 500 por hora;
 * - 20 uploads em 10 minutos.
 */
if ( $page === 'messages' && $metodo === 'POST' && trim((string) ($_POST['action'] ?? 'send') ) === 'send') {
    limitarRota( 'message-send-minute', $membroOuSessao, 60, 60 );

    limitarRota('message-send-hour', $membroOuSessao, 500, 60 * 60);

    $erroMedia = (int) ( $_FILES['media']['error'] ?? UPLOAD_ERR_NO_FILE );

    if ($erroMedia !== UPLOAD_ERR_NO_FILE) {
        limitarRota('message-media', $membroOuSessao, 60, 10 * 60 );
    }
}

/*
 * Tokens WebSocket:
 * permite reconexões normais, mas bloqueia pedidos automatizados excessivos.
 */
if ($page === 'websocket-token' && $metodo === 'POST') {
    limitarRota('websocket-token', $membroOuSessao, 60, 5 * 60 );
}

/*
 * Pesquisa e criação de gostos.
 */
if ($page === 'create-account-autocompletar') {
    if ($metodo === 'GET') {
        limitarRota('hobby-search',$sessaoOuEndereco,240,60);
    } elseif ($metodo === 'POST') {
        limitarRota('hobby-create',$sessaoOuEndereco,60,60 * 60);
    }
}

/*
 * Denúncias e bloqueios.
 */
if ($page === 'safety' &&$metodo === 'POST') {
    $acaoSeguranca = trim((string) ($_POST['action'] ?? ''));

    if ($acaoSeguranca === 'report') {
        limitarRota('safety-report',$membroOuSessao,5,60 * 60);
    } else {
        limitarRota('safety-action',$membroOuSessao,30,60 * 60);
    }
}

$php_page =APP_ROOT . '/src/pages/' . $page . '.php';

if (!file_exists($php_page)) {
    $php_page = APP_ROOT . '/src/pages/error-page.php';
}

include $php_page;