<?php

require_once '../src/bootstrap.php';

function rejeitarLimiteRota(
    array $limite
): never {
    $tentarEm = max(
        1,
        (int) (
            $limite['tentar_em'] ?? 1
        )
    );

    $minutos =
        minutosParaTentarNovamente(
            $tentarEm
        );

    $espera =
        $minutos === 1
            ? '1 minuto'
            : $minutos . ' minutos';

    http_response_code(429);

    header(
        'Retry-After: ' . $tentarEm
    );

    header(
        'Content-Type: application/json; charset=UTF-8'
    );

    header(
        'Cache-Control: no-store, no-cache, must-revalidate'
    );

    echo json_encode(
        [
            'success' => false,
            'message' =>
                'Estás a fazer pedidos demasiado depressa. ' .
                'Tenta novamente dentro de ' .
                $espera .
                '.'
        ],
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}

function limitarRota(
    string $grupo,
    string $identificador,
    int $maximo,
    int $janelaSegundos
): void {
    $limite =
        consumirLimiteRequisicoes(
            $grupo,
            $identificador,
            $maximo,
            $janelaSegundos
        );

    if (!$limite['permitido']) {
        rejeitarLimiteRota($limite);
    }
}

function obterAutorizacaoRota(): string
{
    $autorizacao = trim(
        (string) (
            $_SERVER[
                'HTTP_AUTHORIZATION'
            ] ??
            $_SERVER[
                'REDIRECT_HTTP_AUTHORIZATION'
            ] ??
            ''
        )
    );

    if ($autorizacao !== '') {
        return $autorizacao;
    }

    if (function_exists('getallheaders')) {
        foreach (
            getallheaders()
            as $nome => $valor
        ) {
            if (
                strcasecmp(
                    (string) $nome,
                    'Authorization'
                ) === 0
            ) {
                return trim(
                    (string) $valor
                );
            }
        }
    }

    return '';
}

$path = (string) (
    parse_url(
        (string) (
            $_SERVER['REQUEST_URI'] ??
            '/'
        ),
        PHP_URL_PATH
    ) ?: '/'
);

$path = mb_strtolower($path);

$path = substr(
    $path,
    strlen(DOC_ROOT)
);

$path = trim($path, '/');
$parts = explode('/', $path);

if (($parts[0] ?? '') !== 'admin') {
    $page = $parts[0] ?: 'index';
    $id = $parts[1] ?? null;
} else {
    $page =
        'admin/' .
        ($parts[1] ?? '');

    $id = $parts[2] ?? null;
}

$id = filter_var($id);

$metodo = strtoupper(
    (string) (
        $_SERVER['REQUEST_METHOD'] ??
        'GET'
    )
);

$atualizacaoBackground =
    $page ===
        'background-location-update' &&
    $metodo === 'POST';

if (!$atualizacaoBackground) {
    require_csrf_token();
}

$membroId = trim(
    (string) ($session->id ?? '')
);

$endereco = chaveLimiteRequisicoes(
    enderecoCliente()
);

$sessaoAtual =
    session_status() ===
        PHP_SESSION_ACTIVE
        ? session_id()
        : '';

$sessaoOuEndereco =
    chaveLimiteRequisicoes(
        $sessaoAtual !== ''
            ? $sessaoAtual
            : enderecoCliente()
    );

$membroOuSessao =
    chaveLimiteRequisicoes(
        $membroId !== ''
            ? $membroId
            : $sessaoOuEndereco
    );

if (
    $page === 'create-account' &&
    $metodo === 'POST'
) {
    $modoEdicao =
        (string) (
            $_POST['modo'] ?? ''
        ) === 'editar';

    if ($modoEdicao) {
        limitarRota(
            'profile-edit',
            $membroOuSessao,
            30,
            15 * 60
        );
    } else {
        limitarRota(
            'create-account-session',
            $sessaoOuEndereco,
            5,
            60 * 60
        );

        limitarRota(
            'create-account-ip',
            $endereco,
            50,
            60 * 60
        );
    }
}

if (
    $page === 'messages' &&
    $metodo === 'POST' &&
    trim(
        (string) (
            $_POST['action'] ?? 'send'
        )
    ) === 'send'
) {
    limitarRota(
        'message-send-minute',
        $membroOuSessao,
        60,
        60
    );

    limitarRota(
        'message-send-hour',
        $membroOuSessao,
        500,
        60 * 60
    );

    $erroMedia = (int) (
        $_FILES['media']['error'] ??
        UPLOAD_ERR_NO_FILE
    );

    if (
        $erroMedia !==
        UPLOAD_ERR_NO_FILE
    ) {
        limitarRota(
            'message-media',
            $membroOuSessao,
            60,
            10 * 60
        );
    }
}

if (
    $page === 'websocket-token' &&
    $metodo === 'POST'
) {
    limitarRota(
        'websocket-token',
        $membroOuSessao,
        60,
        5 * 60
    );
}

if ($atualizacaoBackground) {
    $autorizacao =
        obterAutorizacaoRota();

    $tokenLimite = '';

    if (
        preg_match(
            '/^Bearer\s+([a-f0-9]{64})$/i',
            $autorizacao,
            $correspondencias
        ) === 1
    ) {
        $tokenLimite = strtolower(
            $correspondencias[1]
        );
    }

    $identificadorBackground =
        chaveLimiteRequisicoes(
            $tokenLimite !== ''
                ? hash(
                    'sha256',
                    $tokenLimite
                )
                : enderecoCliente()
        );

    limitarRota(
        'background-location-update',
        $identificadorBackground,
        300,
        5 * 60
    );
}

if (
    $page ===
    'create-account-autocompletar'
) {
    if ($metodo === 'GET') {
        limitarRota(
            'hobby-search',
            $sessaoOuEndereco,
            240,
            60
        );
    } elseif ($metodo === 'POST') {
        limitarRota(
            'hobby-create',
            $sessaoOuEndereco,
            60,
            60 * 60
        );
    }
}

if (
    $page === 'safety' &&
    $metodo === 'POST'
) {
    $acaoSeguranca = trim(
        (string) (
            $_POST['action'] ?? ''
        )
    );

    if (
        $acaoSeguranca === 'report'
    ) {
        limitarRota(
            'safety-report',
            $membroOuSessao,
            5,
            60 * 60
        );
    } else {
        limitarRota(
            'safety-action',
            $membroOuSessao,
            30,
            60 * 60
        );
    }
}

if (
    $page === 'blocked-users' &&
    $metodo === 'POST'
) {
    limitarRota(
        'unblock-user',
        $membroOuSessao,
        30,
        60 * 60
    );
}

$phpPage =
    APP_ROOT .
    '/src/pages/' .
    $page .
    '.php';

if (!file_exists($phpPage)) {
    $phpPage =
        APP_ROOT .
        '/src/pages/error-page.php';
}

include $phpPage;