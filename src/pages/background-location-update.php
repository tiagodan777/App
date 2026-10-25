<?php
declare(strict_types=1);

function normalizarBooleanoBackgroundLocation(mixed $valor, bool $padrao): bool {
    if (is_bool($valor)) {
        return $valor;
    }
    if (is_int($valor)) {
        return $valor === 1;
    }
    if (is_string($valor)) {
        $resultado = filter_var($valor, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($resultado !== null) {
            return $resultado;
        }
    }
    return $padrao;
}

function estadoAppBackgroundLocation(mixed $valor): ?bool {
    $estado = strtolower(trim((string) $valor));
    return match ($estado) {
        'background' => true,
        'foreground' => false,
        default => null
    };
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
}
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
$conteudo = file_get_contents('php://input');
try {
    $dados = json_decode($conteudo !== false ? $conteudo : '', true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    json_response(['success' => false, 'message' => 'Dados inválidos.'], 400);
}
if (!is_array($dados)) {
    json_response(['success' => false, 'message' => 'Dados inválidos.'], 400);
}
$autorizacao = authorization_header();
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
    json_response(['success' => false, 'message' => 'Autorização inválida.'], 401);
}
$stateOnly = normalizarBooleanoBackgroundLocation($dados['state_only'] ?? false, false);
$appEmBackground = estadoAppBackgroundLocation($dados['app_state'] ?? null);
if ($stateOnly && $appEmBackground === null) {
    json_response(['success' => false, 'message' => 'Estado da aplicação inválido.'], 400);
}
$localizacaoAtiva = normalizarBooleanoBackgroundLocation($dados['active'] ?? true, true);
$visivel = normalizarBooleanoBackgroundLocation($dados['visible'] ?? true, true);
$locationPushProbe = ($dados['location_push_probe'] ?? null) === 1;
if ($locationPushProbe && ($stateOnly || !$localizacaoAtiva
    || ($dados['location_policy_version'] ?? null) !== 1)) {
    json_response(['success' => false, 'message' => 'Pedido da extensão inválido.'], 400);
}
$latitude = null;
$longitude = null;
$precisao = null;
if (!$stateOnly && $localizacaoAtiva && ($visivel || isset($dados['latitude'], $dados['longitude']))) {
    if (
        !isset($dados['latitude'], $dados['longitude']) ||
        !is_numeric($dados['latitude']) ||
        !is_numeric($dados['longitude'])
    ) {
        json_response(['success' => false, 'message' => 'Coordenadas inválidas.'], 400);
    }
    $latitude = (float) $dados['latitude'];
    $longitude = (float) $dados['longitude'];
    if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        json_response(['success' => false, 'message' => 'Coordenadas inválidas.'], 400);
    }
    if (isset($dados['accuracy']) && is_numeric($dados['accuracy'])) {
        $precisao = max(0, min(10000, (float) $dados['accuracy']));
    }
}
try {
    $membroId = $cms->getToken()->getMemberId($token, 'background_location');
    if (!$membroId) {
        json_response(['success' => false, 'accepted' => false, 'reason' => 'authorization_revoked',
            'message' => 'A autorização expirou.'], 401);
    }
    $membroId = (string) $membroId;
    if (!$stateOnly && !$localizacaoAtiva) {
        $cms->getLocation()->revokeBackgroundGrant($membroId, $token);
        json_response(['success' => true, 'accepted' => true, 'reason' => 'grant_revoked']);
    }
    $capturedAt = null;
    if (!$stateOnly && $localizacaoAtiva && ($visivel || isset($dados['latitude'], $dados['longitude']))) {
        try { $capturedAt = \App\CMS\LocationSample::capturedAt($dados); }
        catch (\InvalidArgumentException $invalidSample) {
            // Authenticated but obsolete samples are acknowledged, never retried forever or made fresh.
            json_response(['success'=>true,'accepted'=>false,'reason'=>'invalid_location_sample']);
        }
    }
    $nearby = $cms->getNearbyPresenceNotification();
    if (!$locationPushProbe && $appEmBackground !== null) {
        try {
            $nearby->syncAppState($membroId, $appEmBackground);
        } catch (Throwable $erroEstado) {
            error_log('[background-location-app-state] ' . $erroEstado->getMessage());
        }
    }
    if ($stateOnly) {
        if ($appEmBackground === true) {
            try {
                $nearby->evaluateMember($membroId);
            } catch (Throwable $erroProximidade) {
                error_log('[background-location-nearby] ' . $erroProximidade->getMessage());
            }
        }
        json_response(['success' => true, 'accepted' => true]);
    }
    $posicaoAnterior = null;
    try {
        $posicaoAnterior = $nearby->locationSnapshot($membroId);
    } catch (Throwable $erroSnapshot) {
        error_log('[background-location-snapshot-before] ' . $erroSnapshot->getMessage());
    }
    // Todas as amostras nativas atuais preservam os estados público e de recolha.
    $strictSample = $locationPushProbe || ($localizacaoAtiva && $latitude !== null
        && ($dados['location_policy_version'] ?? null) === 1);
    $accepted = $strictSample
        ? $cms->getLocation()->saveLocationPush($membroId, $token, $dados)
        : $cms->getLocation()->saveBackground($membroId,$latitude,$longitude,$precisao,
            $localizacaoAtiva,$visivel,$capturedAt);
    if (!$accepted) {
        json_response(['success' => true, 'accepted' => false,
            'reason' => $cms->getLocation()->rejectionReason($membroId, $token)]);
    }
    try {
        $posicaoNova = $nearby->locationSnapshot($membroId);
        $nearby->processLocationChange($membroId, $posicaoAnterior, $posicaoNova);
    } catch (Throwable $erroProximidade) {
        /*
         * A localização é funcionalidade principal. Uma falha isolada no
         * alerta de proximidade nunca deve fazer o cliente pensar que a
         * atualização da posição falhou.
         */
        error_log('[background-location-nearby] ' . $erroProximidade->getMessage());
    }
    if ($locationPushProbe) {
        json_response(['success' => true, 'accepted' => true, 'location_push_probe' => 1]);
    }
    json_response(['success' => true, 'accepted' => true]);
} catch (Throwable $erro) {
    error_log('[background-location-update] ' . $erro->getMessage());
    json_response(['success' => false, 'message' => 'Não foi possível atualizar a localização.'], 500);
}