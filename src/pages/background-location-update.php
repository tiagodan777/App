<?php
declare(strict_types=1);

function responderJsonBackgroundLocation(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_THROW_ON_ERROR
    );
    exit;
}

function obterAutorizacaoBackgroundLocation(): string
{
    $autorizacao = trim((string) (
        $_SERVER['HTTP_AUTHORIZATION'] ??
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ??
        ''
    ));

    if ($autorizacao !== '') {
        return $autorizacao;
    }

    if (function_exists('getallheaders')) {
        $cabecalhos = getallheaders();

        foreach ($cabecalhos as $nome => $valor) {
            if (strcasecmp((string) $nome, 'Authorization') === 0) {
                return trim((string) $valor);
            }
        }
    }

    return '';
}

function normalizarBooleanoBackgroundLocation(
    mixed $valor,
    bool $padrao
): bool {
    if (is_bool($valor)) {
        return $valor;
    }

    if (is_int($valor)) {
        return $valor === 1;
    }

    if (is_string($valor)) {
        $resultado = filter_var(
            $valor,
            FILTER_VALIDATE_BOOLEAN,
            FILTER_NULL_ON_FAILURE
        );

        if ($resultado !== null) {
            return $resultado;
        }
    }

    return $padrao;
}

function estadoAppBackgroundLocation(mixed $valor): ?bool
{
    $estado = strtolower(trim((string) $valor));

    return match ($estado) {
        'background' => true,
        'foreground' => false,
        default => null
    };
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');

    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$conteudo = file_get_contents('php://input');

try {
    $dados = json_decode(
        $conteudo !== false ? $conteudo : '',
        true,
        32,
        JSON_THROW_ON_ERROR
    );
} catch (JsonException) {
    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Dados inválidos.'
    ], 400);
}

if (!is_array($dados)) {
    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Dados inválidos.'
    ], 400);
}

$autorizacao = obterAutorizacaoBackgroundLocation();
$token = '';

if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $autorizacao, $resultadoToken)) {
    $token = strtolower($resultadoToken[1]);
} else {
    /* Fallback para servidores que não encaminham Authorization ao PHP-FPM. */
    $tokenCorpo = strtolower(trim((string) ($dados['token'] ?? '')));

    if (preg_match('/^[a-f0-9]{64}$/', $tokenCorpo)) {
        $token = $tokenCorpo;
    }
}

unset($dados['token']);

if ($token === '') {
    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Autorização inválida.'
    ], 401);
}

$stateOnly = normalizarBooleanoBackgroundLocation(
    $dados['state_only'] ?? false,
    false
);

$appEmBackground = estadoAppBackgroundLocation(
    $dados['app_state'] ?? null
);

if ($stateOnly && $appEmBackground === null) {
    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Estado da aplicação inválido.'
    ], 400);
}

$localizacaoAtiva = normalizarBooleanoBackgroundLocation(
    $dados['active'] ?? true,
    true
);

$visivel = normalizarBooleanoBackgroundLocation(
    $dados['visible'] ?? true,
    true
);

$latitude = null;
$longitude = null;
$precisao = null;

if (!$stateOnly && $localizacaoAtiva && $visivel) {
    if (
        !isset($dados['latitude'], $dados['longitude']) ||
        !is_numeric($dados['latitude']) ||
        !is_numeric($dados['longitude'])
    ) {
        responderJsonBackgroundLocation([
            'success' => false,
            'message' => 'Coordenadas inválidas.'
        ], 400);
    }

    $latitude = (float) $dados['latitude'];
    $longitude = (float) $dados['longitude'];

    if (
        $latitude < -90 ||
        $latitude > 90 ||
        $longitude < -180 ||
        $longitude > 180
    ) {
        responderJsonBackgroundLocation([
            'success' => false,
            'message' => 'Coordenadas inválidas.'
        ], 400);
    }

    if (
        isset($dados['accuracy']) &&
        is_numeric($dados['accuracy'])
    ) {
        $precisao = max(
            0,
            min(10000, (float) $dados['accuracy'])
        );
    }
}

try {
    $membroId = $cms->getToken()->getMemberId(
        $token,
        'background_location'
    );

    if (!$membroId) {
        responderJsonBackgroundLocation([
            'success' => false,
            'message' => 'A autorização expirou.'
        ], 401);
    }

    $membroId = (string) $membroId;
    $nearby = $cms->getNearbyPresenceNotification();

    if ($appEmBackground !== null) {
        try {
            $nearby->syncAppState(
                $membroId,
                $appEmBackground
            );
        } catch (Throwable $erroEstado) {
            error_log(
                '[background-location-app-state] ' .
                $erroEstado->getMessage()
            );
        }
    }

    if ($stateOnly) {
        if ($appEmBackground === true) {
            try {
                $nearby->evaluateMember($membroId);
            } catch (Throwable $erroProximidade) {
                error_log(
                    '[background-location-nearby] ' .
                    $erroProximidade->getMessage()
                );
            }
        }

        responderJsonBackgroundLocation([
            'success' => true
        ]);
    }

    $posicaoAnterior = null;

    try {
        $posicaoAnterior = $nearby->locationSnapshot($membroId);
    } catch (Throwable $erroSnapshot) {
        error_log(
            '[background-location-snapshot-before] ' .
            $erroSnapshot->getMessage()
        );
    }

    $cms->getLocation()->saveBackground(
        $membroId,
        $latitude,
        $longitude,
        $precisao,
        $localizacaoAtiva,
        $visivel
    );

    try {
        $posicaoNova = $nearby->locationSnapshot($membroId);

        $nearby->processLocationChange(
            $membroId,
            $posicaoAnterior,
            $posicaoNova
        );
    } catch (Throwable $erroProximidade) {
        /*
         * A localização é funcionalidade principal. Uma falha isolada no
         * alerta de proximidade nunca deve fazer o cliente pensar que a
         * atualização da posição falhou.
         */
        error_log(
            '[background-location-nearby] ' .
            $erroProximidade->getMessage()
        );
    }

    responderJsonBackgroundLocation([
        'success' => true
    ]);
} catch (Throwable $erro) {
    error_log(
        '[background-location-update] ' .
        $erro->getMessage()
    );

    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Não foi possível atualizar a localização.'
    ], 500);
}