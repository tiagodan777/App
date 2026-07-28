<?php

declare(strict_types=1);

const PROFILE_ACCESS_SESSION_SECONDS = 120;

function responderPerfilIndisponivel(): never
{
    http_response_code(404);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');

    echo '<!DOCTYPE html>';
    echo '<html lang="pt-PT">';
    echo '<head>';
    echo '<meta charset="UTF-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<meta name="robots" content="noindex,nofollow">';
    echo '<title>Perfil indisponível</title>';
    echo '<style>';
    echo 'body{margin:0;min-height:100vh;padding:24px;box-sizing:border-box;background:#fff;color:#111;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center}';
    echo 'main{width:min(100%,480px);text-align:center}';
    echo 'h1{margin:0 0 12px;font-size:clamp(28px,7vw,42px)}';
    echo 'p{margin:0;color:#666;font-size:17px;line-height:1.5}';
    echo '</style>';
    echo '</head>';
    echo '<body>';
    echo '<main>';
    echo '<h1>Perfil indisponível</h1>';
    echo '<p>Não foi possível abrir este perfil.</p>';
    echo '</main>';
    echo '</body>';
    echo '</html>';
    exit;
}

function obterFaixaEtariaPerfil(string $nascimento): ?string
{
    $nascimento = trim($nascimento);

    if ($nascimento === '') return null;

    $dataNascimento = DateTimeImmutable::createFromFormat(
        '!Y-m-d',
        $nascimento,
        new DateTimeZone('UTC')
    );

    $erros = DateTimeImmutable::getLastErrors();

    if (
        !$dataNascimento ||
        ($erros !== false && (
            ($erros['warning_count'] ?? 0) > 0 ||
            ($erros['error_count'] ?? 0) > 0
        )) ||
        $dataNascimento->format('Y-m-d') !== $nascimento
    ) {
        return null;
    }

    $hoje = new DateTimeImmutable(
        'today',
        new DateTimeZone('UTC')
    );

    if ($dataNascimento > $hoje) return null;

    $idade = $dataNascimento->diff($hoje)->y;

    if ($idade < 13) return null;

    return $idade <= 17 ? '13-17' : '18+';
}

function propositoAcessoPerfil(string $visualizadorId): string
{
    return 'profile:' . substr(
        hash('sha256', $visualizadorId),
        0,
        24
    );
}

function existeBloqueioEntrePerfis(
    $db,
    string $primeiroMembroId,
    string $segundoMembroId
): bool {
    $sql = "
        SELECT 1
        FROM bloqueados
        WHERE (
            pessoa_bloqueou_id = :primeiro1
            AND pessoa_bloqueada_id = :segundo1
        )
        OR (
            pessoa_bloqueou_id = :segundo2
            AND pessoa_bloqueada_id = :primeiro2
        )
        LIMIT 1
    ";

    return (bool) $db->runSQL($sql, [
        'primeiro1' => $primeiroMembroId,
        'segundo1' => $segundoMembroId,
        'segundo2' => $segundoMembroId,
        'primeiro2' => $primeiroMembroId
    ])->fetchColumn();
}

function existeConversaBilateralPerfil(
    $db,
    string $primeiroMembroId,
    string $segundoMembroId
): bool {
    $sql = "
        SELECT
            EXISTS (
                SELECT 1
                FROM mensagens_chat
                WHERE emissor_id = :primeiro_emissor
                AND destinatario_id = :segundo_destinatario
                LIMIT 1
            )
            AND
            EXISTS (
                SELECT 1
                FROM mensagens_chat
                WHERE emissor_id = :segundo_emissor
                AND destinatario_id = :primeiro_destinatario
                LIMIT 1
            ) AS trocaram_mensagens
    ";

    return (bool) $db->runSQL($sql, [
        'primeiro_emissor' => $primeiroMembroId,
        'segundo_destinatario' => $segundoMembroId,
        'segundo_emissor' => $segundoMembroId,
        'primeiro_destinatario' => $primeiroMembroId
    ])->fetchColumn();
}

function limparAcessosPerfilDaSessao(): void
{
    $acessos = $_SESSION['profile_access'] ?? [];

    if (!is_array($acessos)) {
        $_SESSION['profile_access'] = [];
        return;
    }

    $agora = time();

    foreach ($acessos as $perfilId => $expiraEm) {
        if (!is_numeric($expiraEm) || (int) $expiraEm <= $agora) {
            unset($acessos[$perfilId]);
        }
    }

    $_SESSION['profile_access'] = $acessos;
}

function sessaoTemAcessoAoPerfil(string $perfilId): bool
{
    limparAcessosPerfilDaSessao();

    return (int) (
        $_SESSION['profile_access'][$perfilId]
        ?? 0
    ) > time();
}

function guardarAcessoAoPerfilNaSessao(string $perfilId): void
{
    limparAcessosPerfilDaSessao();

    $_SESSION['profile_access'][$perfilId] =
        time() + PROFILE_ACCESS_SESSION_SECONDS;
}

function validarTokenAcessoPerfil(
    $db,
    string $visualizadorId,
    string $perfilId,
    string $token
): bool {
    $token = strtolower(trim($token));

    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return false;
    }

    $sql = "
        SELECT 1
        FROM token
        WHERE token = :token
        AND membro_id = :perfil_id
        AND proposito = :proposito
        AND validade > UTC_TIMESTAMP()
        LIMIT 1
    ";

    $statement = $db->runSQL($sql, [
        'token' => hash('sha256', $token),
        'perfil_id' => $perfilId,
        'proposito' => propositoAcessoPerfil($visualizadorId)
    ]);

    return (bool) $statement->fetchColumn();
}

require_login($session);

header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$metodo = strtoupper(
    (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')
);

if (!in_array($metodo, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}

$visualizadorId = trim((string) ($session->id ?? ''));
$perfilPedidoId = trim((string) ($id ?? ''));

if (
    $visualizadorId === '' ||
    !preg_match(
        '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i',
        $perfilPedidoId
    )
) {
    responderPerfilIndisponivel();
}

$perfilBase = $db->runSQL(
    'SELECT id, nascimento
     FROM membros
     WHERE id = :id
     LIMIT 1',
    ['id' => $perfilPedidoId]
)->fetch();

$visualizadorBase = $db->runSQL(
    'SELECT id, nascimento
     FROM membros
     WHERE id = :id
     LIMIT 1',
    ['id' => $visualizadorId]
)->fetch();

if (!$perfilBase || !$visualizadorBase) {
    responderPerfilIndisponivel();
}

$perfilId = (string) $perfilBase['id'];
$visualizadorId = (string) $visualizadorBase['id'];
$ePerfilProprio = hash_equals($visualizadorId, $perfilId);

$faixaVisualizador = obterFaixaEtariaPerfil(
    (string) $visualizadorBase['nascimento']
);

$faixaPerfil = obterFaixaEtariaPerfil(
    (string) $perfilBase['nascimento']
);

/*
 * Contas sem idade válida, menores de 13 anos e a mistura entre
 * 13–17 e 18+ falham sempre, mesmo que exista uma conversa antiga.
 */
if (
    $faixaVisualizador === null ||
    $faixaPerfil === null ||
    $faixaVisualizador !== $faixaPerfil
) {
    responderPerfilIndisponivel();
}

/*
 * Um bloqueio em qualquer direção prevalece sobre proximidade,
 * conversa, passe temporário e acesso anteriormente guardado.
 */
if (
    !$ePerfilProprio &&
    existeBloqueioEntrePerfis(
        $db,
        $visualizadorId,
        $perfilId
    )
) {
    responderPerfilIndisponivel();
}

$podeVerPerfil = $ePerfilProprio;

if (!$podeVerPerfil) {
    $podeVerPerfil = existeConversaBilateralPerfil(
        $db,
        $visualizadorId,
        $perfilId
    );
}

if (!$podeVerPerfil) {
    $podeVerPerfil = sessaoTemAcessoAoPerfil($perfilId);
}

if (
    !$podeVerPerfil &&
    $metodo === 'POST'
) {
    $tokenRecebido = (string) (
        $_POST['profile_access_token']
        ?? ''
    );

    if (
        validarTokenAcessoPerfil(
            $db,
            $visualizadorId,
            $perfilId,
            $tokenRecebido
        )
    ) {
        guardarAcessoAoPerfilNaSessao($perfilId);
        $podeVerPerfil = true;
    }
}

if (!$podeVerPerfil) {
    responderPerfilIndisponivel();
}

$membro = $cms->getMember()->get($perfilId);

if (!$membro) {
    responderPerfilIndisponivel();
}

/*
 * Estes campos são privados e não devem sequer chegar ao Twig.
 */
unset(
    $membro['telefone'],
    $membro['email'],
    $membro['password']
);

$primeiroGosto = trim(
    (string) ($membro['gostos'][0]['nome'] ?? '')
);

$data = [
    'membro' => $membro,
    'primerio_gosto' => $primeiroGosto,
    'primeiro_gosto' => $primeiroGosto,
    'idade' => calcularIdade(
        (string) $membro['nascimento']
    ),
    'id' => $perfilId
];

echo $twig->render('profile.html', $data);