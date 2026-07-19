<?php

declare(strict_types=1);

use App\Validate\Validate;

$pathImagensTemporarias = APP_ROOT . '/public/imagens/fotos-perfil-temp/';

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
        if ($nome !== '' && is_file($pasta . $nome)) @unlink($pasta . $nome);
    }
}

function apagarFicheirosDePerfil(array $nomes): void
{
    $pastas = [
        APP_ROOT . '/public/imagens/fotos-perfil-temp/',
        APP_ROOT . '/public/imagens/fotos-perfil/',
        APP_ROOT . '/public/imagens/fotos-perfil-originais/'
    ];

    foreach ($nomes as $nome) {
        $nome = basename((string) $nome);

        if ($nome === '') continue;

        foreach ($pastas as $pasta) {
            if (is_file($pasta . $nome)) @unlink($pasta . $nome);
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
): void {
    $nomesApagar = [];

    try {
        $db->beginTransaction();

        $registos = $db->runSQL(
            'SELECT id, nome_arquivo, status FROM fotos_perfil WHERE membro_id = :membro_id FOR UPDATE',
            ['membro_id' => $membroId]
        )->fetchAll();

        $existentes = [];
        $remover = array_fill_keys($idsRemover, true);

        foreach ($registos as $registo) {
            $id = (string) $registo['id'];
            $existentes[$id] = $registo;

            if (($registo['status'] ?? '') === 'erro') $remover[$id] = true;
        }

        $itens = [];
        $existentesUsados = [];
        $novasUsadas = [];

        foreach ($ordemPedida as $token) {
            if (preg_match('/^existente:(.+)$/', $token, $partes)) {
                $id = trim($partes[1]);

                if (!isset($existentes[$id]) || isset($remover[$id]) || isset($existentesUsados[$id])) continue;

                $existentesUsados[$id] = true;
                $itens[] = ['tipo' => 'existente', 'id' => $id];
                continue;
            }

            if (preg_match('/^nova:(\d+)$/', $token, $partes)) {
                $indice = (int) $partes[1];

                if (!isset($imagensNovas[$indice]) || isset($novasUsadas[$indice])) continue;

                $novasUsadas[$indice] = true;
                $itens[] = ['tipo' => 'nova', 'nome' => $imagensNovas[$indice]];
            }
        }

        foreach ($existentes as $id => $registo) {
            if (isset($remover[$id]) || isset($existentesUsados[$id])) continue;
            $itens[] = ['tipo' => 'existente', 'id' => $id];
        }

        foreach ($imagensNovas as $indice => $nome) {
            if (!isset($novasUsadas[$indice])) $itens[] = ['tipo' => 'nova', 'nome' => $nome];
        }

        if (count($itens) > 6) throw new \LengthException('Podes manter no máximo 6 fotografias.');

        foreach ($remover as $id => $_) {
            if (!isset($existentes[$id])) continue;

            $nomesApagar[] = $existentes[$id]['nome_arquivo'];

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
                    ['ordem' => $ordem, 'id' => $item['id'], 'membro_id' => $membroId]
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

        $db->commit();
        apagarFicheirosDePerfil($nomesApagar);
    } catch (\Throwable $erro) {
        if ($db->inTransaction()) $db->rollBack();
        throw $erro;
    }
}

function iniciarWorkerFotosCreateAccount(string $membroId): void
{
    $worker = APP_ROOT . '/src/pages/profile-image-worker.php';
    $log = APP_ROOT . '/var/log/profile-image-worker.log';

    if (!is_file($worker)) {
        error_log('Worker de imagens não encontrado: ' . $worker);
        return;
    }

    $comando = sprintf(
        'nohup %s %s %s >> %s 2>&1 &',
        escapeshellarg('/usr/bin/php'),
        escapeshellarg($worker),
        escapeshellarg($membroId),
        escapeshellarg($log)
    );

    exec($comando);
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
            if (empty($foto['id']) || ($foto['nome_arquivo'] ?? '') === 'default.webp') continue;

            $nome = basename((string) $foto['nome_arquivo']);

            $fotosExistentes[] = [
                'id' => (string) $foto['id'],
                'nome' => $nome,
                'url' => urlCreateAccount('imagens/fotos-perfil-originais/' . rawurlencode($nome)),
                'fallback' => urlCreateAccount('imagens/fotos-perfil/' . rawurlencode($nome))
            ];
        }
    }

    echo $twig->render('create-account.html', [
        'modo_edicao' => $modoEdicao,
        'membro_id_edicao' => $modoEdicao ? $membroIdSessao : '',
        'dados_iniciais' => $dadosIniciais,
        'fotos_existentes' => $fotosExistentes,
        'campos_url' => urlCreateAccount('create-account-campos' . ($modoEdicao ? '?editar=1' : '')),
        'perfil_url' => $modoEdicao ? urlCreateAccount('profile/' . rawurlencode($membroIdSessao)) : ''
    ]);

    exit;
}

if ($modoEdicao && $membroIdSessao === '') {
    responderJsonCreateAccount([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

ignore_user_abort(true);
set_time_limit(0);

$membro = [];
$erros = [];
$imagens = [];

if (
    !is_dir($pathImagensTemporarias) &&
    !mkdir($pathImagensTemporarias, 0775, true) &&
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
        $extensoesPermitidas = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];

        if (!is_string($mime) || !in_array($mime, $mimesPermitidos, true)) {
            $erros['imagens'] = 'Tipo de imagem não suportado. Usa JPEG, PNG, GIF, WebP ou HEIC.';
            continue;
        }

        if (!in_array($extensao, $extensoesPermitidas, true)) {
            $erros['imagens'] = 'A extensão de uma das fotografias não é suportada.';
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

$erros['nascimento'] = $dataNascimentoValida
    ? ''
    : 'Escolhe uma data de nascimento válida.';

$erros['genero'] = Validate::isGenero($membro['genero'])
    ? ''
    : 'Escolhe um género válido.';

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

$erros['telefone'] = Validate::isNumber($membro['telefone'], 0, 99999999999)
    ? ''
    : 'Introduz um número de telefone válido.';

$erros['email'] = Validate::isEmail($membro['email'])
    ? ''
    : 'Introduz um email válido.';

$erros['sobre_ti'] = Validate::isText($membro['sobre_ti'], 0, 1000)
    ? ''
    : 'A descrição pode ter no máximo 1000 caracteres.';

$alterarPassword = !$modoEdicao || $membro['password'] !== '' || $confirmaPassword !== '';

if ($alterarPassword) {
    $erros['password'] = Validate::isPassword($membro['password'])
        ? ''
        : 'A palavra-passe deve ter pelo menos 8 caracteres, uma minúscula, uma maiúscula e um número.';

    $erros['confirma_password'] = hash_equals($membro['password'], $confirmaPassword)
        ? ''
        : 'As palavras-passe não são idênticas.';
}

$erros = array_filter($erros, static fn($erro): bool => $erro !== '');

if ($erros) {
    apagarImagensTemporariasCreateAccount($imagens, $pathImagensTemporarias);
    responderJsonCreateAccount(['success' => false, 'erros' => $erros], 422);
}

$membro['nascimento'] = sprintf('%04d-%02d-%02d', $ano, $mes, $dia);
unset($membro['dia'], $membro['mes'], $membro['ano']);

try {
    if ($modoEdicao) {
        $membroId = $membroIdSessao;
        $atualizado = $cms->getMember()->update($membroId, $membro);

        if (!$atualizado) {
            apagarImagensTemporariasCreateAccount($imagens, $pathImagensTemporarias);

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
            apagarImagensTemporariasCreateAccount($imagens, $pathImagensTemporarias);

            responderJsonCreateAccount([
                'success' => false,
                'erros' => [
                    'email' => 'O email ou o número de telefone já está a ser usado.'
                ]
            ], 409);
        }

        $membroId = (string) $membroId;
    }

    $ordemFotos = normalizarListaCreateAccount($_POST['ordem_fotos'] ?? []);
    $fotosRemover = normalizarListaCreateAccount($_POST['fotos_remover'] ?? []);

    if ($modoEdicao || $imagens) {
        sincronizarFotosCreateAccount(
            $db,
            $membroId,
            $imagens,
            $ordemFotos,
            $fotosRemover
        );
    }

    if ($imagens) iniciarWorkerFotosCreateAccount($membroId);

    if ($modoEdicao) {
        responderJsonCreateAccount([
            'success' => true,
            'redirect' => urlCreateAccount('profile/' . rawurlencode($membroId))
        ]);
    }

    $cms->getSession()->create(membro_id: $membroId);
    $tokenLogin = $cms->getToken()->create($membroId, 'login');

    responderJsonCreateAccount([
        'success' => true,
        'redirect' => urlCreateAccount(
            'index/?loginToken=' . urlencode((string) $tokenLogin)
        )
    ]);
} catch (\LengthException $erro) {
    apagarImagensTemporariasCreateAccount($imagens, $pathImagensTemporarias);

    responderJsonCreateAccount([
        'success' => false,
        'erros' => ['imagens' => $erro->getMessage()]
    ], 422);
} catch (\Throwable $erro) {
    apagarImagensTemporariasCreateAccount($imagens, $pathImagensTemporarias);

    error_log(
        ($modoEdicao ? 'Erro ao atualizar perfil: ' : 'Erro ao criar conta: ') .
        $erro->getMessage()
    );

    responderJsonCreateAccount([
        'success' => false,
        'message' => $modoEdicao
            ? 'Ocorreu um erro ao guardar as alterações.'
            : 'Ocorreu um erro ao criar a conta.'
    ], 500);
}