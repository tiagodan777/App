<?php

declare(strict_types=1);

use App\Validate\Validate;
use App\Security\RateLimiter;
use App\Security\MemberMutex;

$pathImagensTemporarias = rtrim(PROFILE_PHOTO_TEMP_DIR, '/') . '/';

function urlCreateAccount(string $caminho): string
{
    return rtrim((string) DOC_ROOT, '/') . '/' . ltrim($caminho, '/');
}

function responderJsonCreateAccount(array $resposta, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');

    echo json_encode($resposta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function apagarImagensTemporariasCreateAccount(array $imagens, string $pasta): void
{
    foreach ($imagens as $imagem) {
        $nome = basename((string) $imagem);

        if ($nome !== '' && is_file($pasta . $nome)) {
            @unlink($pasta . $nome);
        }
    }
}

function nomesDerivadosPerfilCreateAccount(array $nomes): array
{
    $resultado = [];

    foreach ($nomes as $nome) {
        $nome = basename(trim((string) $nome));

        if ($nome === '' || $nome === '.' || $nome === '..' || $nome === 'default.webp') {
            continue;
        }

        $resultado[$nome] = true;
        $resultado[pathinfo($nome, PATHINFO_FILENAME) . '.webp'] = true;
    }

    return array_keys($resultado);
}

function apagarFicheirosDePerfil($db, array $nomes): void
{
    $pastas = [
        PROFILE_PHOTO_TEMP_DIR . '/',
        PROFILE_PHOTO_THUMB_DIR . '/',
        PROFILE_PHOTO_ORIGINAL_DIR . '/',
        APP_ROOT . '/public/imagens/fotos-perfil-temp/',
        APP_ROOT . '/public/imagens/fotos-perfil/',
        APP_ROOT . '/public/imagens/fotos-perfil-originais/'
    ];

    foreach (nomesDerivadosPerfilCreateAccount($nomes) as $nome) {
        $falhou = false;

        foreach ($pastas as $pasta) {
            $caminho = rtrim($pasta, '/') . '/' . $nome;

            try {
                if (
                    (is_file($caminho) || is_link($caminho)) &&
                    !unlink($caminho)
                ) {
                    $falhou = true;
                }
            } catch (\Throwable) {
                $falhou = true;
            }
        }

        foreach ($pastas as $pasta) {
            $caminho = rtrim($pasta, '/') . '/' . $nome;
            if (is_file($caminho) || is_link($caminho)) $falhou = true;
        }

        try {
            if ($falhou) {
                $db->runSQL(
                    'UPDATE ficheiros_a_apagar
                     SET tentativas = tentativas + 1,
                         ultima_tentativa_em = UTC_TIMESTAMP(6),
                         ultimo_erro = :erro
                     WHERE tipo = :tipo AND nome_arquivo = :nome',
                    [
                        'erro' => 'Falha ao apagar uma fotografia removida.',
                        'tipo' => 'perfil',
                        'nome' => $nome
                    ]
                );
            } else {
                $db->runSQL(
                    'DELETE FROM ficheiros_a_apagar
                     WHERE tipo = :tipo AND nome_arquivo = :nome',
                    ['tipo' => 'perfil', 'nome' => $nome]
                );
            }
        } catch (\Throwable) {
            error_log('[profile-update] A fila de eliminação será reconciliada pelo cron.');
        }
    }
}

function normalizarListaCreateAccount($valores): array
{
    if (!is_array($valores)) return [];

    return array_values(array_unique(array_filter(
        array_map(static fn($valor): string => trim((string) $valor), $valores),
        static fn(string $valor): bool => $valor !== ''
    )));
}

function sincronizarFotosCreateAccount(
    $db,
    string $membroId,
    array $imagensNovas,
    array $ordemPedida,
    array $idsRemover
): array {
    $nomesApagar = [];
    $gerirTransacao = !$db->inTransaction();

    try {
        if ($gerirTransacao) $db->beginTransaction();

        $registos = $db->runSQL(
            'SELECT id, nome_arquivo, status FROM fotos_perfil WHERE membro_id = :membro_id FOR UPDATE',
            ['membro_id' => $membroId]
        )->fetchAll();

        $existentes = [];
        $remover = array_fill_keys($idsRemover, true);

        foreach ($registos as $registo) {
            $id = (string) $registo['id'];
            $existentes[$id] = $registo;

            if (($registo['status'] ?? '') === 'erro') {
                $remover[$id] = true;
            }
        }

        $itens = [];
        $existentesUsados = [];
        $novasUsadas = [];

        foreach ($ordemPedida as $token) {
            if (preg_match('/^existente:(.+)$/', $token, $partes)) {
                $id = trim($partes[1]);

                if (
                    !isset($existentes[$id]) ||
                    isset($remover[$id]) ||
                    isset($existentesUsados[$id])
                ) {
                    continue;
                }

                $existentesUsados[$id] = true;
                $itens[] = ['tipo' => 'existente', 'id' => $id];

                continue;
            }

            if (preg_match('/^nova:(\d+)$/', $token, $partes)) {
                $indice = (int) $partes[1];

                if (!isset($imagensNovas[$indice]) || isset($novasUsadas[$indice])) {
                    continue;
                }

                $novasUsadas[$indice] = true;
                $itens[] = [
                    'tipo' => 'nova',
                    'nome' => $imagensNovas[$indice]
                ];
            }
        }

        foreach ($existentes as $id => $registo) {
            if (isset($remover[$id]) || isset($existentesUsados[$id])) continue;

            $itens[] = ['tipo' => 'existente', 'id' => $id];
        }

        foreach ($imagensNovas as $indice => $nome) {
            if (!isset($novasUsadas[$indice])) {
                $itens[] = ['tipo' => 'nova', 'nome' => $nome];
            }
        }

        if (count($itens) > 6) {
            throw new \LengthException('Podes manter no máximo 6 fotografias.');
        }

        foreach ($remover as $id => $_) {
            if (!isset($existentes[$id])) continue;

            $nomesApagar[] = $existentes[$id]['nome_arquivo'];

            foreach (
                nomesDerivadosPerfilCreateAccount([
                    $existentes[$id]['nome_arquivo']
                ]) as $nomeEnfileirado
            ) {
                $db->runSQL(
                    'INSERT INTO ficheiros_a_apagar (tipo, nome_arquivo)
                     VALUES (:tipo, :nome)
                     ON DUPLICATE KEY UPDATE nome_arquivo = VALUES(nome_arquivo)',
                    [
                        'tipo' => 'perfil',
                        'nome' => $nomeEnfileirado
                    ]
                );
            }

            $db->runSQL(
                'DELETE FROM fotos_perfil WHERE id = :id AND membro_id = :membro_id',
                ['id' => $id, 'membro_id' => $membroId]
            );
        }

        $db->runSQL(
            'UPDATE fotos_perfil SET ordem = COALESCE(ordem, 0) + 1000 WHERE membro_id = :membro_id',
            ['membro_id' => $membroId]
        );

        foreach ($itens as $ordem => $item) {
            if ($item['tipo'] === 'existente') {
                $db->runSQL(
                    'UPDATE fotos_perfil SET ordem = :ordem WHERE id = :id AND membro_id = :membro_id',
                    [
                        'ordem' => $ordem,
                        'id' => $item['id'],
                        'membro_id' => $membroId
                    ]
                );

                continue;
            }

            $db->runSQL(
                'INSERT INTO fotos_perfil (nome_arquivo, membro_id, ordem, status)
                 VALUES (:nome_arquivo, :membro_id, :ordem, :status)',
                [
                    'nome_arquivo' => $item['nome'],
                    'membro_id' => $membroId,
                    'ordem' => $ordem,
                    'status' => 'pendente'
                ]
            );
        }

        if ($gerirTransacao) $db->commit();

        return $nomesApagar;
    } catch (\Throwable $erro) {
        if ($gerirTransacao && $db->inTransaction()) $db->rollBack();

        throw $erro;
    }
}

function iniciarWorkerFotosCreateAccount(string $membroId): bool
{
    $worker = APP_ROOT . '/src/pages/profile-image-worker.php';
    $log = APP_ROOT . '/var/log/profile-image-worker.log';
    $phpCli = trim((string) (
        defined('PHP_CLI_BINARY') ? PHP_CLI_BINARY : ''
    ));

    if (!is_file($worker)) {
        error_log('[profile-worker] O worker de fotografias não está disponível.');
        return false;
    }

    if (
        $phpCli === '' ||
        $phpCli[0] !== '/' ||
        !is_file($phpCli) ||
        !is_executable($phpCli)
    ) {
        error_log('[profile-worker] PHP_CLI_BINARY não está configurado corretamente.');
        return false;
    }

    if (!function_exists('exec')) {
        error_log('[profile-worker] A função exec não está disponível.');
        return false;
    }

    $comando = sprintf(
        'nohup %s %s %s >> %s 2>&1 &',
        escapeshellarg($phpCli),
        escapeshellarg($worker),
        escapeshellarg($membroId),
        escapeshellarg($log)
    );

    $saida = [];
    $codigo = -1;
    exec($comando, $saida, $codigo);

    if ($codigo !== 0) {
        error_log('[profile-worker] Não foi possível iniciar o processamento assíncrono.');
        return false;
    }

    return true;
}

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

$modoEdicao = $metodo === 'POST'
    ? (($_POST['modo'] ?? '') === 'editar')
    : (($_GET['editar'] ?? '') === '1');

$membroIdSessao = trim((string) ($session->id ?? ''));

if ($metodo !== 'POST') {
    $dadosIniciais = ['gostos' => []];
    $fotosExistentes = [];

    if ($modoEdicao) {
        if ($membroIdSessao === '') {
            header('Location: ' . urlCreateAccount('login'));
            exit;
        }

        $membroAtual = $cms->getMember()->get($membroIdSessao);

        if (!$membroAtual) {
            http_response_code(404);
            exit('Membro não encontrado.');
        }

        $nascimento = \DateTimeImmutable::createFromFormat(
            '!Y-m-d',
            (string) $membroAtual['nascimento']
        );

        $dadosIniciais = [
            'primeiro_nome' => (string) $membroAtual['primeiro_nome'],
            'ultimo_nome' => (string) $membroAtual['ultimo_nome'],
            'dia' => $nascimento ? $nascimento->format('d') : '',
            'mes' => $nascimento ? $nascimento->format('m') : '01',
            'ano' => $nascimento ? $nascimento->format('Y') : '',
            'genero' => (string) $membroAtual['genero'],
            'gostos' => array_values(array_map(
                static fn(array $gosto): string => (string) $gosto['nome'],
                $membroAtual['gostos'] ?? []
            )),
            'objetivo' => (string) $membroAtual['objetivo'],
            'sobre_ti' => (string) ($membroAtual['bio'] ?? ''),
            'telefone' => (string) ($membroAtual['telefone'] ?? ''),
            'email' => (string) ($membroAtual['email'] ?? '')
        ];

        foreach ($membroAtual['fotos'] ?? [] as $foto) {
            if (empty($foto['id']) || ($foto['nome_arquivo'] ?? '') === 'default.webp') {
                continue;
            }

            $nome = basename((string) $foto['nome_arquivo']);
            $fotoId = rawurlencode((string) $foto['id']);

            $fotosExistentes[] = [
                'id' => (string) $foto['id'],
                'nome' => $nome,
                'url' => urlCreateAccount(
                    'profile-photo/' . $fotoId . '?size=original'
                ),
                'fallback' => urlCreateAccount(
                    'profile-photo/' . $fotoId . '?size=thumb'
                )
            ];
        }
    }

    echo $twig->render('create-account.html', [
        'modo_edicao' => $modoEdicao,
        'membro_id_edicao' => $modoEdicao ? $membroIdSessao : '',
        'dados_iniciais' => $dadosIniciais,
        'fotos_existentes' => $fotosExistentes,
        'campos_url' => urlCreateAccount(
            'create-account-campos' .
            ($modoEdicao ? '?editar=1' : '')
        ),
        'perfil_url' => $modoEdicao
            ? urlCreateAccount('profile/' . rawurlencode($membroIdSessao))
            : ''
    ]);

    exit;
}

if ($modoEdicao && $membroIdSessao === '') {
    responderJsonCreateAccount([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

require_csrf();

$rateKey = $modoEdicao
    ? privacy_hash('member:' . $membroIdSessao)
    : privacy_hash('ip:' . request_ip());

if (!RateLimiter::allow(
    $modoEdicao ? 'profile-update' : 'account-create',
    $rateKey,
    $modoEdicao ? 20 : 5,
    3600
)) {
    header('Retry-After: 3600');
    responderJsonCreateAccount([
        'success' => false,
        'message' => 'Foram feitos demasiados pedidos. Tenta novamente mais tarde.'
    ], 429);
}

if (!$modoEdicao && REGISTRATION_MODE === 'closed') {
    $codigoRecebido = trim((string) ($_POST['beta_invite_code'] ?? ''));
    $codigoRecebidoHash = hash('sha256', $codigoRecebido);
    $conviteValido = false;

    foreach (BETA_INVITE_CODES as $codigoConfigurado) {
        if (
            $codigoRecebido !== '' &&
            hash_equals(hash('sha256', (string) $codigoConfigurado), $codigoRecebidoHash)
        ) {
            $conviteValido = true;
            break;
        }
    }

    unset($codigoRecebido, $codigoRecebidoHash, $codigoConfigurado);

    if (BETA_INVITE_CODES === []) {
        responderJsonCreateAccount([
            'success' => false,
            'message' => 'Os registos estão temporariamente fechados.'
        ], 503);
    }

    if (!$conviteValido) {
        responderJsonCreateAccount([
            'success' => false,
            'erros' => [
                'beta_invite_code' => 'O código de convite não é válido.'
            ]
        ], 403);
    }
}

ignore_user_abort(true);
set_time_limit(0);

$membro = [];
$erros = [];
$imagens = [];

if (
    !is_dir($pathImagensTemporarias) &&
    !mkdir($pathImagensTemporarias, 0750, true) &&
    !is_dir($pathImagensTemporarias)
) {
    responderJsonCreateAccount([
        'success' => false,
        'message' => 'Não foi possível preparar a pasta das fotografias.'
    ], 500);
}

if (isset($_FILES['imagens']['tmp_name']) && is_array($_FILES['imagens']['tmp_name'])) {
    if (count($_FILES['imagens']['tmp_name']) > 6) {
        $erros['imagens'] = 'Podes adicionar no máximo 6 fotografias.';
    }

    foreach ($_FILES['imagens']['tmp_name'] as $indice => $temp) {
        if ($indice >= 6) break;

        $erroUpload = $_FILES['imagens']['error'][$indice] ?? UPLOAD_ERR_NO_FILE;
        $tamanho = (int) ($_FILES['imagens']['size'][$indice] ?? 0);
        $nomeOriginal = trim((string) ($_FILES['imagens']['name'][$indice] ?? ''));

        if ($erroUpload === UPLOAD_ERR_NO_FILE) continue;

        if ($erroUpload !== UPLOAD_ERR_OK) {
            $erros['imagens'] = match ($erroUpload) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Uma das fotografias é demasiado grande.',
                UPLOAD_ERR_PARTIAL => 'Uma das fotografias não foi enviada completamente.',
                UPLOAD_ERR_NO_TMP_DIR => 'O servidor não tem uma pasta temporária disponível.',
                UPLOAD_ERR_CANT_WRITE => 'Não foi possível guardar a fotografia no servidor.',
                UPLOAD_ERR_EXTENSION => 'O envio da fotografia foi interrompido pelo servidor.',
                default => 'Ocorreu um erro ao enviar uma das fotografias.'
            };

            continue;
        }

        if ($temp === '' || !is_uploaded_file($temp)) {
            $erros['imagens'] = 'Uma das fotografias recebidas não é válida.';
            continue;
        }

        if ($tamanho <= 0 || $tamanho > MAX_SIZE) {
            $erros['imagens'] = 'Uma das fotografias é demasiado grande ou está vazia.';
            continue;
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);

        if ($finfo === false) {
            $erros['imagens'] = 'Não foi possível verificar uma das fotografias.';
            continue;
        }

        $mime = finfo_file($finfo, $temp);

        finfo_close($finfo);

        $mimesPermitidos = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic',
            'image/heif'
        ];

        $extensao = strtolower(pathinfo($nomeOriginal, PATHINFO_EXTENSION));

        $extensoesPermitidas = [
            'jpg',
            'jpeg',
            'png',
            'gif',
            'webp',
            'heic',
            'heif'
        ];

        if (!is_string($mime) || !in_array($mime, $mimesPermitidos, true)) {
            $erros['imagens'] = 'Tipo de imagem não suportado. Usa JPEG, PNG, GIF, WebP ou HEIC.';
            continue;
        }

        if (!in_array($extensao, $extensoesPermitidas, true)) {
            $erros['imagens'] = 'A extensão de uma das fotografias não é suportada.';
            continue;
        }

        try {
            $cms->getImage()->validateProfileImageFile($temp);
        } catch (\Throwable $erro) {
            $erros['imagens'] = $erro->getMessage();
            continue;
        }

        $filename = basename((string) create_filename($nomeOriginal));

        if ($filename === '') {
            $erros['imagens'] = 'Não foi possível criar o nome de uma das fotografias.';
            continue;
        }

        if (!move_uploaded_file($temp, $pathImagensTemporarias . $filename)) {
            $erros['imagens'] = 'Não foi possível guardar uma das fotografias.';
            continue;
        }

        @chmod($pathImagensTemporarias . $filename, 0640);
        $imagens[] = $filename;
    }
}

$membro['primeiro_nome'] = trim((string) ($_POST['primeiro_nome'] ?? ''));
$membro['ultimo_nome'] = trim((string) ($_POST['ultimo_nome'] ?? ''));
$membro['dia'] = $_POST['dia'] ?? '';
$membro['mes'] = $_POST['mes'] ?? '';
$membro['ano'] = $_POST['ano'] ?? '';
$membro['genero'] = trim((string) ($_POST['genero'] ?? ''));
$membro['gostos'] = normalizarListaCreateAccount($_POST['gostos'] ?? []);
$membro['objetivo'] = trim((string) ($_POST['objetivo'] ?? ''));
$membro['sobre_ti'] = trim((string) ($_POST['sobre_ti'] ?? ''));
$membro['telefone'] = trim((string) ($_POST['telefone'] ?? ''));
$membro['email'] = trim((string) ($_POST['email'] ?? ''));
$membro['password'] = (string) ($_POST['password'] ?? '');
$passwordAtual = (string) ($_POST['password_atual'] ?? '');

$confirmaPassword = (string) ($_POST['confirma_password'] ?? '');

$membro['nome_seo'] = create_seo_name(
    trim($membro['primeiro_nome'] . ' ' . $membro['ultimo_nome'])
);

$erros['primeiro_nome'] = Validate::isText($membro['primeiro_nome'], 1, 60)
    ? ''
    : 'O primeiro nome deve ter entre 1 e 60 caracteres.';

$erros['ultimo_nome'] = Validate::isText($membro['ultimo_nome'], 1, 60)
    ? ''
    : 'O último nome deve ter entre 1 e 60 caracteres.';

$dia = (int) $membro['dia'];
$mes = (int) $membro['mes'];
$ano = (int) $membro['ano'];

$dataNascimentoValida =
    $dia >= 1 &&
    $mes >= 1 &&
    $ano >= 1900 &&
    $ano <= (int) date('Y') &&
    checkdate($mes, $dia, $ano);

if ($dataNascimentoValida) {
    $nascimento = DateTimeImmutable::createFromFormat(
        '!Y-m-d',
        sprintf('%04d-%02d-%02d', $ano, $mes, $dia),
        new DateTimeZone('UTC')
    );
    $limiteIdade = new DateTimeImmutable('today', new DateTimeZone('UTC'));
    $limiteIdade = $limiteIdade->modify('-18 years');
    $dataNascimentoValida = $nascimento instanceof DateTimeImmutable &&
        $nascimento <= $limiteIdade;
}

$erros['nascimento'] = $dataNascimentoValida
    ? ''
    : 'Tens de ter pelo menos 18 anos para usar a Margot.';

$erros['genero'] = $membro['genero'] === '' ||
    Validate::isGenero($membro['genero'])
    ? ''
    : 'O género indicado não é válido.';

if ($membro['genero'] === '') {
    $membro['genero'] = null;
}

$objetivosPermitidos = [
    'amizade',
    'conhecer_pessoas',
    'relacao_seria',
    'algo_casual',
    'conversar',
    'ainda_nao_sei'
];

$erros['objetivo'] = in_array($membro['objetivo'], $objetivosPermitidos, true)
    ? ''
    : 'Escolhe o que procuras na Margot.';

$erros['telefone'] = $membro['telefone'] === '' || Validate::isPhone($membro['telefone'])
    ? ''
    : 'Introduz um número de telefone válido.';

$erros['email'] = Validate::isEmail($membro['email'])
    ? ''
    : 'Introduz um email válido.';

$erros['sobre_ti'] = Validate::isText($membro['sobre_ti'], 0, 1000)
    ? ''
    : 'A descrição pode ter no máximo 1000 caracteres.';

$alterarPassword =
    !$modoEdicao ||
    $membro['password'] !== '' ||
    $confirmaPassword !== '';

if ($alterarPassword) {
    $erros['password'] = Validate::isPassword($membro['password'])
        ? ''
        : 'A palavra-passe deve ter pelo menos 8 caracteres, uma minúscula, uma maiúscula e um número.';

    $erros['confirma_password'] = hash_equals(
        $membro['password'],
        $confirmaPassword
    )
        ? ''
        : 'As palavras-passe não são idênticas.';
}

if ($modoEdicao && !$cms->getMember()->verifyPassword($membroIdSessao, $passwordAtual)) {
    $erros['password_atual'] = 'A palavra-passe atual não está correta.';
}

if (!$modoEdicao) {
    $erros['confirmar_18'] = ($_POST['confirmar_18'] ?? '') === '1'
        ? ''
        : 'Tens de confirmar que tens pelo menos 18 anos.';
    $erros['aceitar_termos'] = ($_POST['aceitar_termos'] ?? '') === '1'
        ? ''
        : 'Tens de aceitar os Termos para criar a conta.';
    $erros['reconhecer_privacidade'] = ($_POST['reconhecer_privacidade'] ?? '') === '1'
        ? ''
        : 'Tens de confirmar que leste a Política de Privacidade.';
}

$erros = array_filter(
    $erros,
    static fn($erro): bool => $erro !== ''
);

if ($erros) {
    apagarImagensTemporariasCreateAccount(
        $imagens,
        $pathImagensTemporarias
    );

    responderJsonCreateAccount([
        'success' => false,
        'erros' => $erros
    ], 422);
}

$membro['nascimento'] = sprintf(
    '%04d-%02d-%02d',
    $ano,
    $mes,
    $dia
);

unset($membro['dia'], $membro['mes'], $membro['ano']);

$transacaoEscrita = false;
$commitConcluido = false;
$nomesFotosApagar = [];
$memberMutex = new MemberMutex($db);
$perfilBloqueado = false;

if ($modoEdicao) {
    $perfilBloqueado = $memberMutex->acquire($membroIdSessao, 10);

    if (!$perfilBloqueado) {
        apagarImagensTemporariasCreateAccount(
            $imagens,
            $pathImagensTemporarias
        );

        responderJsonCreateAccount([
            'success' => false,
            'message' => 'O perfil está a terminar outra alteração. Tenta novamente.'
        ], 409);
    }
}

try {
    $db->beginTransaction();
    $transacaoEscrita = true;

    if ($modoEdicao) {
        $membroId = $membroIdSessao;
        $membroAtivo = $db->runSQL(
            "SELECT id
             FROM membros
             WHERE id = :id
             AND estado = 'ativo'
             LIMIT 1
             FOR UPDATE",
            ['id' => $membroId]
        )->fetchColumn();

        if (!$membroAtivo) {
            throw new \RuntimeException('A conta deixou de estar disponível.');
        }

        $atualizado = $cms->getMember()->update($membroId, $membro);

        if (!$atualizado) {
            if ($db->inTransaction()) $db->rollBack();

            $transacaoEscrita = false;

            apagarImagensTemporariasCreateAccount(
                $imagens,
                $pathImagensTemporarias
            );

            $memberMutex->release($membroIdSessao);
            $perfilBloqueado = false;

            responderJsonCreateAccount([
                'success' => false,
                'erros' => [
                    'email' => 'O email ou o número de telefone já está a ser usado.'
                ]
            ], 409);
        }
    } else {
        $membroId = $cms->getMember()->create($membro);

        if ($membroId === false) {
            if ($db->inTransaction()) $db->rollBack();

            $transacaoEscrita = false;

            apagarImagensTemporariasCreateAccount(
                $imagens,
                $pathImagensTemporarias
            );

            responderJsonCreateAccount([
                'success' => false,
                'erros' => [
                    'email' => 'O email ou o número de telefone já está a ser usado.'
                ]
            ], 409);
        }

        $membroId = (string) $membroId;

        $aceitacoes = [
            'termos' => TERMS_VERSION,
            'privacidade' => PRIVACY_VERSION,
            'maior_18' => AGE_DECLARATION_VERSION
        ];

        foreach ($aceitacoes as $documento => $versao) {
            $db->runSQL(
                'INSERT INTO aceitacoes_legais (
                    membro_id,
                    documento,
                    versao,
                    documento_hash,
                    aceite_em,
                    origem
                 ) VALUES (
                    :membro_id,
                    :documento,
                    :versao,
                    :documento_hash,
                    UTC_TIMESTAMP(6),
                    :origem
                 )',
                [
                    'membro_id' => $membroId,
                    'documento' => $documento,
                    'versao' => $versao,
                    'documento_hash' => legal_document_hash($documento),
                    'origem' => 'registo'
                ]
            );
        }
    }

    $db->runSQL(
        'INSERT INTO preferencias_privacidade (
            membro_id,
            localizacao_ativa,
            notificacoes_ativas,
            atualizada_em
         ) VALUES (
            :membro_id,
            :localizacao,
            :notificacoes,
            UTC_TIMESTAMP(6)
         )
         ON DUPLICATE KEY UPDATE
            localizacao_ativa = VALUES(localizacao_ativa),
            notificacoes_ativas = VALUES(notificacoes_ativas),
            atualizada_em = VALUES(atualizada_em)',
        [
            'membro_id' => $membroId,
            'localizacao' => ($_POST['preferencia_localizacao'] ?? '') === '1' ? 1 : 0,
            'notificacoes' => ($_POST['preferencia_notificacoes'] ?? '') === '1' ? 1 : 0
        ]
    );

    if (!$modoEdicao) {
        foreach ([
            'localizacao' => ($_POST['preferencia_localizacao'] ?? '') === '1',
            'notificacoes' => ($_POST['preferencia_notificacoes'] ?? '') === '1'
        ] as $tipoPreferencia => $valorPreferencia) {
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
                    'membro_id' => $membroId,
                    'tipo' => $tipoPreferencia,
                    'valor' => $valorPreferencia ? 1 : 0,
                    'estado_json' => json_encode([
                        'localizacao' => ($_POST['preferencia_localizacao'] ?? '') === '1',
                        'notificacoes' => ($_POST['preferencia_notificacoes'] ?? '') === '1',
                        'invisivel' => false
                    ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                    'origem' => 'registo',
                    'versao_aviso' => PRIVACY_VERSION
                ]
            );
        }
    }

    $ordemFotos = normalizarListaCreateAccount(
        $_POST['ordem_fotos'] ?? []
    );

    $fotosRemover = normalizarListaCreateAccount(
        $_POST['fotos_remover'] ?? []
    );

    $fotosAlteradas =
        $imagens !== [] ||
        $fotosRemover !== [] ||
        (($_POST['fotos_alteradas'] ?? '') === '1');

    if ($fotosAlteradas) {
        $nomesFotosApagar = sincronizarFotosCreateAccount(
            $db,
            $membroId,
            $imagens,
            $ordemFotos,
            $fotosRemover
        );
    }

    if ($modoEdicao && $alterarPassword) {
        /*
         * A nova palavra-passe e a revogação de tokens persistentes são uma só
         * alteração: ou ambas ficam gravadas, ou ambas fazem rollback.
         */
        $cms->getToken()->deleteForMember($membroId);
        $db->runSQL(
            'DELETE FROM websocket_tickets WHERE membro_id = :membro_id',
            ['membro_id' => $membroId]
        );
    }

    if ($transacaoEscrita) {
        $db->commit();
        $transacaoEscrita = false;
        $commitConcluido = true;
    }

    if ($nomesFotosApagar) {
        apagarFicheirosDePerfil($db, $nomesFotosApagar);
    }

    if ($perfilBloqueado) {
        $memberMutex->release($membroIdSessao);
        $perfilBloqueado = false;
    }

    if ($imagens) {
        iniciarWorkerFotosCreateAccount($membroId);
    }

    if ($modoEdicao) {
        if ($alterarPassword) {
            $cms->getCookie()->delete();
            $cms->getSession()->create(membro_id: $membroId);
        }

        responderJsonCreateAccount([
            'success' => true,
            'redirect' => urlCreateAccount(
                'profile/' .
                rawurlencode($membroId)
            )
        ]);
    }

    if (!$cms->getSession()->create(membro_id: $membroId)) {
        throw new \RuntimeException(
            'A conta foi criada, mas não foi possível iniciar a sessão.'
        );
    }

    responderJsonCreateAccount([
        'success' => true,
        'redirect' => urlCreateAccount('index/')
    ]);
} catch (\LengthException $erro) {
    if ($transacaoEscrita && $db->inTransaction()) {
        $db->rollBack();
    }

    if (!$commitConcluido) {
        apagarImagensTemporariasCreateAccount(
            $imagens,
            $pathImagensTemporarias
        );
    }

    if ($perfilBloqueado) {
        $memberMutex->release($membroIdSessao);
        $perfilBloqueado = false;
    }

    if ($commitConcluido) {
        error_log('[profile-save] Falha pós-commit: ' . $erro->getMessage());

        responderJsonCreateAccount([
            'success' => true,
            'redirect' => $modoEdicao
                ? urlCreateAccount('profile/' . rawurlencode($membroId))
                : urlCreateAccount('login'),
            'message' => $modoEdicao
                ? 'As alterações foram guardadas. Atualiza a sessão se necessário.'
                : 'A conta foi criada. Inicia sessão para continuar.'
        ]);
    }

    responderJsonCreateAccount([
        'success' => false,
        'erros' => [
            'imagens' => $erro->getMessage()
        ]
    ], 422);
} catch (\Throwable $erro) {
    if ($transacaoEscrita && $db->inTransaction()) {
        $db->rollBack();
    }

    if (!$commitConcluido) {
        apagarImagensTemporariasCreateAccount(
            $imagens,
            $pathImagensTemporarias
        );
    }

    if ($perfilBloqueado) {
        $memberMutex->release($membroIdSessao);
        $perfilBloqueado = false;
    }

    error_log(
        ($modoEdicao
            ? 'Erro ao atualizar perfil: '
            : 'Erro ao criar conta: '
        ) .
        $erro->getMessage()
    );

    if ($commitConcluido) {
        responderJsonCreateAccount([
            'success' => true,
            'redirect' => $modoEdicao
                ? urlCreateAccount('profile/' . rawurlencode($membroId))
                : urlCreateAccount('login'),
            'message' => $modoEdicao
                ? 'As alterações foram guardadas. Atualiza a sessão se necessário.'
                : 'A conta foi criada. Inicia sessão para continuar.'
        ]);
    }

    responderJsonCreateAccount([
        'success' => false,
        'message' => $modoEdicao
            ? 'Ocorreu um erro ao guardar as alterações.'
            : 'Ocorreu um erro ao criar a conta.'
    ], 500);
}
