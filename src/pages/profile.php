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

function idPerfilValido(string $membroId): bool
{
    return preg_match(
        '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i',
        $membroId
    ) === 1;
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

    $hoje = new DateTimeImmutable('today', new DateTimeZone('UTC'));

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
    return (bool) $db->runSQL(
        'SELECT 1
         FROM bloqueados
         WHERE (
             pessoa_bloqueou_id = :primeiro1
             AND pessoa_bloqueada_id = :segundo1
         )
         OR (
             pessoa_bloqueou_id = :segundo2
             AND pessoa_bloqueada_id = :primeiro2
         )
         LIMIT 1',
        [
            'primeiro1' => $primeiroMembroId,
            'segundo1' => $segundoMembroId,
            'segundo2' => $segundoMembroId,
            'primeiro2' => $primeiroMembroId
        ]
    )->fetchColumn();
}

function existeConversaPerfil(
    $db,
    string $primeiroMembroId,
    string $segundoMembroId
): bool {
    return (bool) $db->runSQL(
        'SELECT 1
         FROM mensagens_chat
         WHERE (
             emissor_id = :primeiro1
             AND destinatario_id = :segundo1
         )
         OR (
             emissor_id = :segundo2
             AND destinatario_id = :primeiro2
         )
         LIMIT 1',
        [
            'primeiro1' => $primeiroMembroId,
            'segundo1' => $segundoMembroId,
            'segundo2' => $segundoMembroId,
            'primeiro2' => $primeiroMembroId
        ]
    )->fetchColumn();
}

function existeHeyVisivelPerfil(
    $db,
    string $visualizadorId,
    string $perfilId
): bool {
    return (bool) $db->runSQL(
        "SELECT 1
         FROM notificacao
         WHERE tipo = 'hey'
         AND (
             (
                 emissor_id = :visualizador_emissor
                 AND destinatario_id = :perfil_destinatario
                 AND ocultada_para_emissor_em IS NULL
             )
             OR
             (
                 emissor_id = :perfil_emissor
                 AND destinatario_id = :visualizador_destinatario
                 AND ocultada_para_destinatario_em IS NULL
             )
         )
         LIMIT 1",
        [
            'visualizador_emissor' => $visualizadorId,
            'perfil_destinatario' => $perfilId,
            'perfil_emissor' => $perfilId,
            'visualizador_destinatario' => $visualizadorId
        ]
    )->fetchColumn();
}

function existePasseAtivoPerfil(
    $db,
    string $visualizadorId,
    string $perfilId
): bool {
    return (bool) $db->runSQL(
        'SELECT 1
         FROM token
         WHERE membro_id = :perfil_id
         AND proposito = :proposito
         AND validade > UTC_TIMESTAMP()
         LIMIT 1',
        [
            'perfil_id' => $perfilId,
            'proposito' => propositoAcessoPerfil($visualizadorId)
        ]
    )->fetchColumn();
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
        if (
            !is_string($perfilId) ||
            !is_numeric($expiraEm) ||
            (int) $expiraEm <= $agora
        ) {
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

    return (bool) $db->runSQL(
        'SELECT 1
         FROM token
         WHERE token = :token
         AND membro_id = :perfil_id
         AND proposito = :proposito
         AND validade > UTC_TIMESTAMP()
         LIMIT 1',
        [
            'token' => hash('sha256', $token),
            'perfil_id' => $perfilId,
            'proposito' => propositoAcessoPerfil($visualizadorId)
        ]
    )->fetchColumn();
}

require_login($session);

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if (!in_array($metodo, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}

$visualizadorId = trim((string) ($session->id ?? ''));
$perfilPedidoId = trim((string) ($id ?? ''));

if (
    !idPerfilValido($visualizadorId) ||
    !idPerfilValido($perfilPedidoId)
) {
    responderPerfilIndisponivel();
}

$membrosBase = $db->runSQL(
    'SELECT id, nascimento
     FROM membros
     WHERE id = :visualizador
     OR id = :perfil',
    [
        'visualizador' => $visualizadorId,
        'perfil' => $perfilPedidoId
    ]
)->fetchAll();

$membrosPorId = [];

foreach ($membrosBase as $membroBase) {
    $membroBaseId = trim((string) ($membroBase['id'] ?? ''));

    if ($membroBaseId !== '') {
        $membrosPorId[$membroBaseId] = $membroBase;
    }
}

if (
    !isset(
        $membrosPorId[$visualizadorId],
        $membrosPorId[$perfilPedidoId]
    )
) {
    responderPerfilIndisponivel();
}

$visualizadorBase = $membrosPorId[$visualizadorId];
$perfilBase = $membrosPorId[$perfilPedidoId];
$visualizadorId = (string) $visualizadorBase['id'];
$perfilId = (string) $perfilBase['id'];
$ePerfilProprio = hash_equals($visualizadorId, $perfilId);
$podeVerPerfil = $ePerfilProprio;

/*
 * O perfil próprio nunca depende do passe de proximidade, de uma conversa
 * ou das verificações aplicáveis entre duas contas diferentes.
 */
if (!$ePerfilProprio) {
    $faixaVisualizador = obterFaixaEtariaPerfil(
        (string) ($visualizadorBase['nascimento'] ?? '')
    );

    $faixaPerfil = obterFaixaEtariaPerfil(
        (string) ($perfilBase['nascimento'] ?? '')
    );

    if (
        $faixaVisualizador === null ||
        $faixaPerfil === null ||
        $faixaVisualizador !== $faixaPerfil ||
        existeBloqueioEntrePerfis(
            $db,
            $visualizadorId,
            $perfilId
        )
    ) {
        responderPerfilIndisponivel();
    }

    $podeVerPerfil =
        existeConversaPerfil(
            $db,
            $visualizadorId,
            $perfilId
        ) ||
        existeHeyVisivelPerfil(
            $db,
            $visualizadorId,
            $perfilId
        ) ||
        existePasseAtivoPerfil(
            $db,
            $visualizadorId,
            $perfilId
        ) ||
        sessaoTemAcessoAoPerfil($perfilId);

    if (!$podeVerPerfil && $metodo === 'POST') {
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
}

if (!$podeVerPerfil) {
    responderPerfilIndisponivel();
}

/*
 * Depois de aceitar o passe, mudamos para GET. Assim, Atualizar e Voltar não
 * repetem o POST nem perdem o acesso que ficou guardado na sessão.
 */
if ($metodo === 'POST') {
    redirect(
        DOC_ROOT . 'profile/' . rawurlencode($perfilId),
        [],
        303
    );
}

$membro = $cms->getMember()->get($perfilId);

if (!$membro) {
    responderPerfilIndisponivel();
}

/* Estes campos são privados e nunca devem chegar ao Twig. */
unset(
    $membro['telefone'],
    $membro['email'],
    $membro['password']
);

$primeiroGosto = trim(
    (string) ($membro['gostos'][0]['nome'] ?? '')
);

try {
    $idade = calcularIdade(
        (string) ($membro['nascimento'] ?? '')
    );
} catch (Throwable) {
    responderPerfilIndisponivel();
}

echo $twig->render('profile.html', [
    'membro' => $membro,
    'primeiro_gosto' => $primeiroGosto,
    /* Compatibilidade temporária com versões antigas do template. */
    'primerio_gosto' => $primeiroGosto,
    'idade' => $idade,
    'id' => $perfilId,
    'e_perfil_proprio' => $ePerfilProprio
]);