<?php

use App\Validate\Validate;

$pathImagens = APP_ROOT . '/public/imagens/fotos-perfil-temp/';

$membro = [];
$erros = [];
$imagens = [];

function responderJson(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo $twig->render('create-account.html', []);
    exit;
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

ignore_user_abort(true);
set_time_limit(0);

if (!is_dir($pathImagens)) {
    if (!mkdir($pathImagens, 0775, true) && !is_dir($pathImagens)) {
        responderJson([
            'success' => false,
            'message' => 'Não foi possível preparar a pasta das fotografias.'
        ], 500);
    }
}

if (
    isset($_FILES['imagens']) &&
    isset($_FILES['imagens']['tmp_name']) &&
    is_array($_FILES['imagens']['tmp_name'])
) {
    $totalImagens = count($_FILES['imagens']['tmp_name']);

    if ($totalImagens > 6) {
        $erros['imagens'] = 'Podes adicionar no máximo 6 fotografias.';
    }

    foreach ($_FILES['imagens']['tmp_name'] as $key => $temp) {
        if ($key >= 6) {
            break;
        }

        $erroUpload = $_FILES['imagens']['error'][$key] ?? UPLOAD_ERR_NO_FILE;
        $tamanho = $_FILES['imagens']['size'][$key] ?? 0;
        $nomeOriginal = $_FILES['imagens']['name'][$key] ?? '';

        if ($erroUpload === UPLOAD_ERR_NO_FILE) {
            continue;
        }

        if ($erroUpload !== UPLOAD_ERR_OK) {
            $erros['imagens'] = match ($erroUpload) {
                UPLOAD_ERR_INI_SIZE,
                UPLOAD_ERR_FORM_SIZE =>
                    'Uma das fotografias é demasiado grande.',

                UPLOAD_ERR_PARTIAL =>
                    'Uma das fotografias não foi enviada completamente.',

                default =>
                    'Ocorreu um erro ao enviar uma das fotografias.'
            };

            continue;
        }

        if (
            !$temp ||
            !is_uploaded_file($temp)
        ) {
            $erros['imagens'] = 'Uma das fotografias recebidas não é válida.';
            continue;
        }

        if ($tamanho > MAX_SIZE) {
            $erros['imagens'] = 'Uma das fotografias é demasiado grande.';
            continue;
        }

        $mime = mime_content_type($temp);

        if (!in_array($mime, MEDIA_TYPES, true)) {
            $erros['imagens'] =
                'Tipo de imagem não suportado. Usa JPEG, PNG, GIF, WebP ou HEIC.';

            continue;
        }

        $extensao = strtolower(
            pathinfo($nomeOriginal, PATHINFO_EXTENSION)
        );

        if (!in_array($extensao, FILE_EXTENSIONS, true)) {
            $erros['imagens'] =
                'Extensão não suportada. Usa JPEG, JPG, PNG, GIF, WebP ou HEIC.';

            continue;
        }

        $filename = create_filename(
            $nomeOriginal,
            $pathImagens
        );

        $destino = $pathImagens . $filename;

        if (!move_uploaded_file($temp, $destino)) {
            $erros['imagens'] =
                'Não foi possível guardar uma das fotografias.';

            continue;
        }

        $imagens[] = $filename;
    }
}

if (count($imagens) === 0) {
    $erros['imagens'] = 'Adiciona pelo menos uma fotografia.';
}

$membro['primeiro_nome'] = trim(
    $_POST['primeiro_nome'] ?? ''
);

$membro['ultimo_nome'] = trim(
    $_POST['ultimo_nome'] ?? ''
);

$membro['dia'] = $_POST['dia'] ?? '';
$membro['mes'] = $_POST['mes'] ?? '';
$membro['ano'] = $_POST['ano'] ?? '';
$membro['genero'] = $_POST['genero'] ?? '';
$membro['gostos'] = $_POST['gostos'] ?? [];
$membro['sobre_ti'] = trim($_POST['sobre_ti'] ?? '');
$membro['telefone'] = trim($_POST['telefone'] ?? '');
$membro['email'] = trim($_POST['email'] ?? '');
$membro['password'] = $_POST['password'] ?? '';

$confirmaPassword = $_POST['confirma_password'] ?? '';

$nomeCompleto =
    $membro['primeiro_nome'] .
    ' ' .
    $membro['ultimo_nome'];

$membro['nome_seo'] = create_seo_name($nomeCompleto);

$erros['primeiro_nome'] =
    Validate::isText($membro['primeiro_nome'], 1, 60)
        ? ''
        : 'O primeiro nome deve ter entre 1 e 60 caracteres.';

$erros['ultimo_nome'] =
    Validate::isText($membro['ultimo_nome'], 1, 60)
        ? ''
        : 'O último nome deve ter entre 1 e 60 caracteres.';

$erros['dia'] =
    Validate::isNumber($membro['dia'], 1, 31)
        ? ''
        : 'Escolhe um dia válido.';

$erros['mes'] =
    Validate::isNumber($membro['mes'], 1, 12)
        ? ''
        : 'Escolhe um mês válido.';

$erros['ano'] =
    Validate::isNumber(
        $membro['ano'],
        1900,
        (int) date('Y')
    )
        ? ''
        : 'Escolhe um ano válido.';

$erros['genero'] =
    Validate::isGenero($membro['genero'])
        ? ''
        : 'Escolhe um género válido.';

$erros['telefone'] =
    Validate::isNumber(
        $membro['telefone'],
        0,
        99999999999
    )
        ? ''
        : 'Introduz um número de telefone válido.';

$erros['email'] =
    Validate::isEmail($membro['email'])
        ? ''
        : 'Introduz um email válido.';

$erros['password'] =
    Validate::isPassword($membro['password'])
        ? ''
        : 'A palavra-passe deve ter pelo menos 8 caracteres, uma minúscula, uma maiúscula e um número.';

$erros['confirma_password'] =
    hash_equals(
        (string) $membro['password'],
        (string) $confirmaPassword
    )
        ? ''
        : 'As palavras-passe não são idênticas.';

$erros['sobre_ti'] =
    Validate::isText($membro['sobre_ti'], 0, 1000)
        ? ''
        : 'A descrição pode ter no máximo 1000 caracteres.';

$erros = array_filter($erros);

if ($erros) {
    foreach ($imagens as $imagem) {
        $ficheiro = $pathImagens . $imagem;

        if (is_file($ficheiro)) {
            unlink($ficheiro);
        }
    }

    responderJson([
        'success' => false,
        'erros' => $erros
    ], 422);
}

$membro['nascimento'] = sprintf(
    '%04d-%02d-%02d',
    (int) $membro['ano'],
    (int) $membro['mes'],
    (int) $membro['dia']
);

unset(
    $membro['dia'],
    $membro['mes'],
    $membro['ano']
);

$result = $cms->getMember()->create($membro);

if ($result === false) {
    foreach ($imagens as $imagem) {
        $ficheiro = $pathImagens . $imagem;

        if (is_file($ficheiro)) {
            unlink($ficheiro);
        }
    }

    responderJson([
        'success' => false,
        'erros' => [
            'email' => 'O email já está a ser usado.'
        ]
    ], 409);
}

$membroId = (int) $result;

$cms->getImage()->prepareAllImages(
    $membroId,
    $imagens
);

$worker = APP_ROOT . '/src/pages/profile-image-worker.php';

$comando = sprintf(
    'php %s %d > /dev/null 2>&1 &',
    escapeshellarg($worker),
    $membroId
);

exec($comando);

$cms->getSession()->create(
    membro_id: $membroId
);

$tokenLogin = $cms
    ->getToken()
    ->create($membroId, 'login');

responderJson([
    'success' => true,
    'redirect' =>
        DOC_ROOT .
        'index/?loginToken=' .
        urlencode($tokenLogin)
]);