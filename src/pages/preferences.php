<?php

declare(strict_types=1);

use App\Security\RateLimiter;

require_login($session);

function responderPreferenciasJson(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: private, no-store');
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
    exit;
}

function obterPreferenciasGuardadas(
    $db,
    string $memberId,
    ?string &$revision = null
): array
{
    $row = $db->runSQL(
        'SELECT
            pp.localizacao_ativa,
            pp.notificacoes_ativas,
            pp.invisivel,
            COALESCE((
                SELECT MAX(ppe.id)
                FROM preferencias_privacidade_eventos AS ppe
                WHERE ppe.membro_id = pp.membro_id
            ), 0) AS revision
         FROM preferencias_privacidade AS pp
         WHERE pp.membro_id = :id
         LIMIT 1',
        ['id' => $memberId]
    )->fetch();

    $revision = preg_match(
        '/\A[0-9]+\z/D',
        (string) ($row['revision'] ?? '')
    ) ? (string) $row['revision'] : '0';

    return [
        'localizacao' => (bool) ($row['localizacao_ativa'] ?? false),
        'notificacoes' => (bool) ($row['notificacoes_ativas'] ?? false),
        'invisivel' => (bool) ($row['invisivel'] ?? false)
    ];
}

$memberId = trim((string) ($session->id ?? ''));
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    $revision = '0';

    responderPreferenciasJson([
        'success' => true,
        'preferences' => obterPreferenciasGuardadas(
            $db,
            $memberId,
            $revision
        ),
        'revision' => $revision
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    responderPreferenciasJson([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

require_csrf();

if (!RateLimiter::allow(
    'preferences-update',
    privacy_hash('member:' . $memberId),
    180,
    3600
)) {
    header('Retry-After: 3600');
    responderPreferenciasJson([
        'success' => false,
        'message' => 'Foram feitas demasiadas alterações. Tenta novamente mais tarde.'
    ], 429);
}

$type = trim((string) ($_POST['type'] ?? ''));
$rawValue = (string) ($_POST['value'] ?? '');
$columns = [
    'localizacao' => 'localizacao_ativa',
    'notificacoes' => 'notificacoes_ativas',
    'invisivel' => 'invisivel'
];

if (!isset($columns[$type]) || !in_array($rawValue, ['0', '1'], true)) {
    responderPreferenciasJson([
        'success' => false,
        'message' => 'Preferência inválida.'
    ], 422);
}

$origin = 'web';
$values = [
    'localizacao' => 0,
    'notificacoes' => 0,
    'invisivel' => 0
];
$values[$type] = $rawValue === '1' ? 1 : 0;
$column = $columns[$type];

$db->beginTransaction();

try {
    $db->runSQL(
        "INSERT INTO preferencias_privacidade (
            membro_id,
            localizacao_ativa,
            notificacoes_ativas,
            invisivel,
            atualizada_em
         ) VALUES (
            :membro_id,
            :localizacao,
            :notificacoes,
            :invisivel,
            UTC_TIMESTAMP(6)
         )
         ON DUPLICATE KEY UPDATE
            {$column} = VALUES({$column}),
            atualizada_em = VALUES(atualizada_em)",
        [
            'membro_id' => $memberId,
            'localizacao' => $values['localizacao'],
            'notificacoes' => $values['notificacoes'],
            'invisivel' => $values['invisivel']
        ]
    );

    $preferences = obterPreferenciasGuardadas($db, $memberId);
    $stateJson = json_encode(
        $preferences,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_THROW_ON_ERROR
    );

    $db->runSQL(
        'INSERT INTO preferencias_privacidade_eventos (
            membro_id,
            tipo,
            valor,
            estado_json,
            origem,
            versao_aviso,
            criado_em
         ) VALUES (
            :membro_id,
            :tipo,
            :valor,
            :estado_json,
            :origem,
            :versao_aviso,
            UTC_TIMESTAMP(6)
         )',
        [
            'membro_id' => $memberId,
            'tipo' => $type,
            'valor' => $rawValue === '1' ? 1 : 0,
            'estado_json' => $stateJson,
            'origem' => $origin,
            'versao_aviso' => PRIVACY_VERSION
        ]
    );
    $revision = (string) $db->lastInsertId();

    $db->commit();
} catch (\Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    throw $error;
}

responderPreferenciasJson([
    'success' => true,
    'preferences' => $preferences,
    'revision' => $revision
]);
