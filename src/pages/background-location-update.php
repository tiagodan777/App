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

$autorizacao = obterAutorizacaoBackgroundLocation();

if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $autorizacao, $resultadoToken)) {
    responderJsonBackgroundLocation([
        'success' => false,
        'message' => 'Autorização inválida.'
    ], 401);
}

$token = strtolower($resultadoToken[1]);
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

if ($localizacaoAtiva && $visivel) {
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
    $membroId = $db->runSQL(
        'SELECT membro_id
         FROM token
         WHERE token = :token
         AND proposito = :proposito
         AND validade > UTC_TIMESTAMP()
         LIMIT 1',
        [
            'token' => hash('sha256', $token),
            'proposito' => 'background_location'
        ]
    )->fetchColumn();

    if (!$membroId) {
        responderJsonBackgroundLocation([
            'success' => false,
            'message' => 'A autorização expirou.'
        ], 401);
    }

    $db->runSQL(
        'INSERT INTO localizacao_membro (
            membro_id,
            latitude,
            longitude,
            precisao_m,
            localizacao_ativa,
            visivel,
            origem,
            atualizada_em
         ) VALUES (
            :membro_id,
            :latitude,
            :longitude,
            :precisao_m,
            :localizacao_ativa,
            :visivel,
            :origem,
            UTC_TIMESTAMP()
         )
         ON DUPLICATE KEY UPDATE
            latitude = VALUES(latitude),
            longitude = VALUES(longitude),
            precisao_m = VALUES(precisao_m),
            localizacao_ativa = VALUES(localizacao_ativa),
            visivel = VALUES(visivel),
            origem = VALUES(origem),
            atualizada_em = UTC_TIMESTAMP()',
        [
            'membro_id' => (string) $membroId,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'precisao_m' => $precisao,
            'localizacao_ativa' => $localizacaoAtiva ? 1 : 0,
            'visivel' => $visivel ? 1 : 0,
            'origem' => 'background'
        ]
    );

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