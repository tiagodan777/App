<?php

declare(strict_types=1);

use App\Validate\Validate;

$pathImagensTemporarias =
    APP_ROOT . '/public/imagens/fotos-perfil-temp/';

function responderJson(
    array $resposta,
    int $status = 200
): never {
    http_response_code($status);

    header(
        'Content-Type: application/json; charset=UTF-8'
    );

    echo json_encode(
        $resposta,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}

function apagarImagensTemporarias(
    array $imagens,
    string $pasta
): void {
    foreach ($imagens as $imagem) {
        $nomeFicheiro = basename(
            (string) $imagem
        );

        if ($nomeFicheiro === '') {
            continue;
        }

        $caminho = $pasta . $nomeFicheiro;

        if (is_file($caminho)) {
            unlink($caminho);
        }
    }
}

/*
|--------------------------------------------------------------------------
| Apresentar a página
|--------------------------------------------------------------------------
*/

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo $twig->render(
        'create-account.html',
        []
    );

    exit;
}

ignore_user_abort(true);
set_time_limit(0);

$membro = [];
$erros = [];
$imagens = [];

/*
|--------------------------------------------------------------------------
| Preparar pasta temporária
|--------------------------------------------------------------------------
*/

if (!is_dir($pathImagensTemporarias)) {
    $pastaCriada = mkdir(
        $pathImagensTemporarias,
        0775,
        true
    );

    if (
        !$pastaCriada &&
        !is_dir($pathImagensTemporarias)
    ) {
        responderJson([
            'success' => false,
            'message' =>
                'Não foi possível preparar a pasta das fotografias.'
        ], 500);
    }
}

/*
|--------------------------------------------------------------------------
| Upload opcional das fotografias
|--------------------------------------------------------------------------
*/

if (
    isset($_FILES['imagens']) &&
    isset($_FILES['imagens']['tmp_name']) &&
    is_array($_FILES['imagens']['tmp_name'])
) {
    $totalImagens = count(
        $_FILES['imagens']['tmp_name']
    );

    if ($totalImagens > 6) {
        $erros['imagens'] =
            'Podes adicionar no máximo 6 fotografias.';
    }

    foreach (
        $_FILES['imagens']['tmp_name']
        as $indice => $temp
    ) {
        if ($indice >= 6) {
            break;
        }

        $erroUpload =
            $_FILES['imagens']['error'][$indice]
            ?? UPLOAD_ERR_NO_FILE;

        $tamanho =
            (int) (
                $_FILES['imagens']['size'][$indice]
                ?? 0
            );

        $nomeOriginal = trim(
            (string) (
                $_FILES['imagens']['name'][$indice]
                ?? ''
            )
        );

        /*
         * Não enviar fotografias é permitido.
         */
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

                UPLOAD_ERR_NO_TMP_DIR =>
                    'O servidor não tem uma pasta temporária disponível.',

                UPLOAD_ERR_CANT_WRITE =>
                    'Não foi possível guardar a fotografia no servidor.',

                UPLOAD_ERR_EXTENSION =>
                    'O envio da fotografia foi interrompido pelo servidor.',

                default =>
                    'Ocorreu um erro ao enviar uma das fotografias.'
            };

            continue;
        }

        if (
            $temp === '' ||
            !is_uploaded_file($temp)
        ) {
            $erros['imagens'] =
                'Uma das fotografias recebidas não é válida.';

            continue;
        }

        if (
            $tamanho <= 0 ||
            $tamanho > MAX_SIZE
        ) {
            $erros['imagens'] =
                'Uma das fotografias é demasiado grande ou está vazia.';

            continue;
        }

        $finfo = finfo_open(
            FILEINFO_MIME_TYPE
        );

        if ($finfo === false) {
            $erros['imagens'] =
                'Não foi possível verificar uma das fotografias.';

            continue;
        }

        $mime = finfo_file(
            $finfo,
            $temp
        );

        finfo_close($finfo);

        $mimesPermitidos = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic',
            'image/heif'
        ];

        if (
            !is_string($mime) ||
            !in_array(
                $mime,
                $mimesPermitidos,
                true
            )
        ) {
            $erros['imagens'] =
                'Tipo de imagem não suportado. Usa JPEG, PNG, GIF, WebP ou HEIC.';

            continue;
        }

        $extensao = strtolower(
            pathinfo(
                $nomeOriginal,
                PATHINFO_EXTENSION
            )
        );

        $extensoesPermitidas = [
            'jpg',
            'jpeg',
            'png',
            'gif',
            'webp',
            'heic',
            'heif'
        ];

        if (
            !in_array(
                $extensao,
                $extensoesPermitidas,
                true
            )
        ) {
            $erros['imagens'] =
                'A extensão de uma das fotografias não é suportada.';

            continue;
        }

        $filename = create_filename(
            $nomeOriginal,
            $pathImagensTemporarias
        );

        $filename = basename(
            (string) $filename
        );

        if ($filename === '') {
            $erros['imagens'] =
                'Não foi possível criar o nome de uma das fotografias.';

            continue;
        }

        $destino =
            $pathImagensTemporarias .
            $filename;

        if (
            !move_uploaded_file(
                $temp,
                $destino
            )
        ) {
            $erros['imagens'] =
                'Não foi possível guardar uma das fotografias.';

            continue;
        }

        $imagens[] = $filename;
    }
}

/*
|--------------------------------------------------------------------------
| Dados do membro
|--------------------------------------------------------------------------
*/

$membro['primeiro_nome'] = trim(
    (string) (
        $_POST['primeiro_nome']
        ?? ''
    )
);

$membro['ultimo_nome'] = trim(
    (string) (
        $_POST['ultimo_nome']
        ?? ''
    )
);

$membro['dia'] =
    $_POST['dia'] ?? '';

$membro['mes'] =
    $_POST['mes'] ?? '';

$membro['ano'] =
    $_POST['ano'] ?? '';

$membro['genero'] = trim(
    (string) (
        $_POST['genero']
        ?? ''
    )
);

$membro['gostos'] =
    $_POST['gostos'] ?? [];

$membro['sobre_ti'] = trim(
    (string) (
        $_POST['sobre_ti']
        ?? ''
    )
);

$membro['telefone'] = trim(
    (string) (
        $_POST['telefone']
        ?? ''
    )
);

$membro['email'] = trim(
    (string) (
        $_POST['email']
        ?? ''
    )
);

$membro['password'] =
    (string) (
        $_POST['password']
        ?? ''
    );

$confirmaPassword =
    (string) (
        $_POST['confirma_password']
        ?? ''
    );

$nomeCompleto = trim(
    $membro['primeiro_nome'] .
    ' ' .
    $membro['ultimo_nome']
);

$membro['nome_seo'] =
    create_seo_name(
        $nomeCompleto
    );

/*
|--------------------------------------------------------------------------
| Normalizar gostos
|--------------------------------------------------------------------------
*/

if (!is_array($membro['gostos'])) {
    $membro['gostos'] = [];
}

$membro['gostos'] = array_values(
    array_unique(
        array_filter(
            array_map(
                static function ($gosto): string {
                    return trim(
                        (string) $gosto
                    );
                },
                $membro['gostos']
            ),
            static function (string $gosto): bool {
                return $gosto !== '';
            }
        )
    )
);

/*
|--------------------------------------------------------------------------
| Validação
|--------------------------------------------------------------------------
*/

$erros['primeiro_nome'] =
    Validate::isText(
        $membro['primeiro_nome'],
        1,
        60
    )
        ? ''
        : 'O primeiro nome deve ter entre 1 e 60 caracteres.';

$erros['ultimo_nome'] =
    Validate::isText(
        $membro['ultimo_nome'],
        1,
        60
    )
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
    checkdate(
        $mes,
        $dia,
        $ano
    );

$erros['nascimento'] =
    $dataNascimentoValida
        ? ''
        : 'Escolhe uma data de nascimento válida.';

$erros['genero'] =
    Validate::isGenero(
        $membro['genero']
    )
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
    Validate::isEmail(
        $membro['email']
    )
        ? ''
        : 'Introduz um email válido.';

$erros['password'] =
    Validate::isPassword(
        $membro['password']
    )
        ? ''
        : 'A palavra-passe deve ter pelo menos 8 caracteres, uma minúscula, uma maiúscula e um número.';

$erros['confirma_password'] =
    hash_equals(
        $membro['password'],
        $confirmaPassword
    )
        ? ''
        : 'As palavras-passe não são idênticas.';

$erros['sobre_ti'] =
    Validate::isText(
        $membro['sobre_ti'],
        0,
        1000
    )
        ? ''
        : 'A descrição pode ter no máximo 1000 caracteres.';

$erros = array_filter(
    $erros,
    static function ($erro): bool {
        return $erro !== '';
    }
);

if ($erros !== []) {
    apagarImagensTemporarias(
        $imagens,
        $pathImagensTemporarias
    );

    responderJson([
        'success' => false,
        'erros' => $erros
    ], 422);
}

/*
|--------------------------------------------------------------------------
| Preparar dados finais
|--------------------------------------------------------------------------
*/

$membro['nascimento'] = sprintf(
    '%04d-%02d-%02d',
    $ano,
    $mes,
    $dia
);

unset(
    $membro['dia'],
    $membro['mes'],
    $membro['ano']
);

/*
|--------------------------------------------------------------------------
| Criar conta
|--------------------------------------------------------------------------
*/

try {
    $membroId = $cms
        ->getMember()
        ->create($membro);

    if ($membroId === false) {
        apagarImagensTemporarias(
            $imagens,
            $pathImagensTemporarias
        );

        responderJson([
            'success' => false,
            'erros' => [
                'email' =>
                    'O email ou o número de telefone já está a ser usado.'
            ]
        ], 409);
    }

    $membroId = (string) $membroId;

    /*
     * As fotografias são opcionais.
     *
     * Sem fotografias, não é criado nenhum registo em fotos_perfil.
     * As consultas usam default.webp através de COALESCE().
     */
    if ($imagens !== []) {
        $cms
            ->getImage()
            ->prepareAllImages(
                $membroId,
                $imagens
            );

        $worker =
            APP_ROOT .
            '/src/pages/profile-image-worker.php';

        if (is_file($worker)) {
            $comando = sprintf(
                '%s %s %s > /dev/null 2>&1 &',
                escapeshellarg(
                    PHP_BINARY
                ),
                escapeshellarg(
                    $worker
                ),
                escapeshellarg(
                    $membroId
                )
            );

            exec($comando);
        } else {
            error_log(
                'Worker de imagens não encontrado: ' .
                $worker
            );
        }
    }

    $cms
        ->getSession()
        ->create(
            membro_id: $membroId
        );

    $tokenLogin = $cms
        ->getToken()
        ->create(
            $membroId,
            'login'
        );

    responderJson([
        'success' => true,
        'redirect' =>
            DOC_ROOT .
            'index/?loginToken=' .
            urlencode(
                (string) $tokenLogin
            )
    ]);
} catch (\Throwable $erro) {
    apagarImagensTemporarias(
        $imagens,
        $pathImagensTemporarias
    );

    error_log(
        'Erro ao criar conta: ' .
        $erro->getMessage()
    );

    responderJson([
        'success' => false,
        'message' =>
            'Ocorreu um erro ao criar a conta.'
    ], 500);
}