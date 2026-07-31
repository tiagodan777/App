<?php
declare(strict_types=1);

use App\CMS\EmailVerification;
use App\Email\Email;
use App\Validate\Validate;

$pathImagensTemporarias = APP_ROOT . '/public/imagens/fotos-perfil-temp/';
$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($metodo === 'POST') ob_start();

function urlCreateAccount(string $caminho): string
{
    return rtrim((string) DOC_ROOT, '/') . '/' . ltrim($caminho, '/');
}

function responderJsonCreateAccount(array $resposta, int $status = 200): never
{
    if (ob_get_level() > 0) ob_clean();

    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');

    echo json_encode(
        $resposta,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );

    exit;
}

function apagarImagensTemporariasCreateAccount(array $imagens, string $pasta): void
{
    foreach ($imagens as $imagem) {
        $nome = basename((string) $imagem);

        if ($nome === '') continue;

        $caminho = $pasta . $nome;

        try {
            if (is_file($caminho)) unlink($caminho);
        } catch (\Throwable $erro) {
            error_log(
                'Não foi possível apagar a imagem temporária ' .
                $caminho .
                ': ' .
                $erro->getMessage()
            );
        }
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

        if ($nome === '' || $nome === 'default.webp') continue;

        foreach ($pastas as $pasta) {
            $caminho = $pasta . $nome;

            try {
                if (is_file($caminho)) unlink($caminho);
            } catch (\Throwable $erro) {
                error_log(
                    'Não foi possível apagar a fotografia ' .
                    $caminho .
                    ': ' .
                    $erro->getMessage()
                );
            }
        }
    }
}

function normalizarListaCreateAccount($valores): array
{
    if (!is_array($valores)) return [];

    $resultado = [];
    $vistos = [];

    foreach ($valores as $valor) {
        $valor = trim((string) $valor);

        if ($valor === '') continue;

        $chave = function_exists('mb_strtolower')
            ? mb_strtolower($valor, 'UTF-8')
            : strtolower($valor);

        if (isset($vistos[$chave])) continue;

        $vistos[$chave] = true;
        $resultado[] = $valor;
    }

    return $resultado;
}

function prepararPastaFotosCreateAccount(string $pasta): void
{
    try {
        if (
            !is_dir($pasta) &&
            !mkdir($pasta, 0775, true) &&
            !is_dir($pasta)
        ) {
            throw new \RuntimeException('Não foi possível criar a pasta.');
        }
    } catch (\Throwable $erro) {
        error_log(
            'Erro ao preparar a pasta de fotografias "' .
            $pasta .
            '": ' .
            $erro->getMessage()
        );

        responderJsonCreateAccount([
            'success' => false,
            'message' => 'Não foi possível preparar a pasta das fotografias.'
        ], 500);
    }

    if (!is_writable($pasta)) {
        error_log(
            'A pasta de fotografias não permite escrita para o processo PHP: ' .
            $pasta
        );

        responderJsonCreateAccount([
            'success' => false,
            'message' => 'A pasta das fotografias não permite escrita.'
        ], 500);
    }
}

function receberImagensCreateAccount(string $pasta, array &$erros): array
{
    $imagens = [];
    $ficheiros = $_FILES['imagens'] ?? null;

    if (
        !is_array($ficheiros) ||
        !isset($ficheiros['tmp_name']) ||
        !is_array($ficheiros['tmp_name'])
    ) {
        return [];
    }

    if (count($ficheiros['tmp_name']) > 6) {
        $erros['imagens'] = 'Podes adicionar no máximo 6 fotografias.';
    }

    $extensoesPorMime = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/heif' => 'heif',
        'image/heic-sequence' => 'heic',
        'image/heif-sequence' => 'heif'
    ];

    $limite = defined('MAX_SIZE')
        ? (int) MAX_SIZE
        : 25 * 1024 * 1024;

    foreach ($ficheiros['tmp_name'] as $indice => $temp) {
        if ($indice >= 6) break;

        $erroUpload = (int) (
            $ficheiros['error'][$indice]
            ?? UPLOAD_ERR_NO_FILE
        );

        $tamanho = (int) (
            $ficheiros['size'][$indice]
            ?? 0
        );

        $nomeOriginal = trim(
            (string) (
                $ficheiros['name'][$indice]
                ?? 'foto'
            )
        );

        if ($erroUpload === UPLOAD_ERR_NO_FILE) continue;

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
            !is_string($temp) ||
            $temp === '' ||
            !is_uploaded_file($temp)
        ) {
            $erros['imagens'] = 'Uma das fotografias recebidas não é válida.';
            continue;
        }

        if ($tamanho <= 0 || $tamanho > $limite) {
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

        if (
            !is_string($mime) ||
            !isset($extensoesPorMime[$mime])
        ) {
            $erros['imagens'] =
                'Tipo de imagem não suportado. Usa JPEG, PNG, GIF, WebP ou HEIC.';

            continue;
        }

        $nomeBase = pathinfo(
            $nomeOriginal,
            PATHINFO_FILENAME
        );

        $nomeSeguro =
            ($nomeBase !== '' ? $nomeBase : 'foto') .
            '.' .
            $extensoesPorMime[$mime];

        $filename = basename(
            (string) create_filename($nomeSeguro)
        );

        if ($filename === '') {
            $erros['imagens'] =
                'Não foi possível criar o nome de uma das fotografias.';

            continue;
        }

        try {
            if (
                !move_uploaded_file(
                    $temp,
                    $pasta . $filename
                )
            ) {
                $erros['imagens'] =
                    'Não foi possível guardar uma das fotografias.';

                continue;
            }
        } catch (\Throwable $erro) {
            error_log(
                'Erro ao mover fotografia para a pasta temporária: ' .
                $erro->getMessage()
            );

            $erros['imagens'] =
                'Não foi possível guardar uma das fotografias.';

            continue;
        }

        $imagens[] = $filename;
    }

    return $imagens;
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
            'SELECT id, nome_arquivo, status
             FROM fotos_perfil
             WHERE membro_id = :membro_id
             FOR UPDATE',
            ['membro_id' => $membroId]
        )->fetchAll();

        $existentes = [];
        $remover = array_fill_keys(
            $idsRemover,
            true
        );

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
            if (
                preg_match(
                    '/^existente:(.+)$/',
                    $token,
                    $partes
                )
            ) {
                $id = trim($partes[1]);

                if (
                    !isset($existentes[$id]) ||
                    isset($remover[$id]) ||
                    isset($existentesUsados[$id])
                ) {
                    continue;
                }

                $existentesUsados[$id] = true;

                $itens[] = [
                    'tipo' => 'existente',
                    'id' => $id
                ];

                continue;
            }

            if (
                preg_match(
                    '/^nova:(\d+)$/',
                    $token,
                    $partes
                )
            ) {
                $indice = (int) $partes[1];

                if (
                    !isset($imagensNovas[$indice]) ||
                    isset($novasUsadas[$indice])
                ) {
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
            if (
                isset($remover[$id]) ||
                isset($existentesUsados[$id])
            ) {
                continue;
            }

            $itens[] = [
                'tipo' => 'existente',
                'id' => $id
            ];
        }

        foreach ($imagensNovas as $indice => $nome) {
            if (!isset($novasUsadas[$indice])) {
                $itens[] = [
                    'tipo' => 'nova',
                    'nome' => $nome
                ];
            }
        }

        if (count($itens) > 6) {
            throw new \LengthException(
                'Podes manter no máximo 6 fotografias.'
            );
        }

        foreach ($remover as $id => $_) {
            if (!isset($existentes[$id])) continue;

            $nomesApagar[] =
                (string) $existentes[$id]['nome_arquivo'];

            $db->runSQL(
                'DELETE FROM fotos_perfil
                 WHERE id = :id
                 AND membro_id = :membro_id',
                [
                    'id' => $id,
                    'membro_id' => $membroId
                ]
            );
        }

        $db->runSQL(
            'UPDATE fotos_perfil
             SET ordem = COALESCE(ordem, 0) + 1000
             WHERE membro_id = :membro_id',
            ['membro_id' => $membroId]
        );

        foreach ($itens as $ordem => $item) {
            if ($item['tipo'] === 'existente') {
                $db->runSQL(
                    'UPDATE fotos_perfil
                     SET ordem = :ordem
                     WHERE id = :id
                     AND membro_id = :membro_id',
                    [
                        'ordem' => $ordem,
                        'id' => $item['id'],
                        'membro_id' => $membroId
                    ]
                );

                continue;
            }

            $db->runSQL(
                'INSERT INTO fotos_perfil
                    (nome_arquivo, membro_id, ordem, status)
                 VALUES
                    (:nome_arquivo, :membro_id, :ordem, :status)',
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
        if (
            $gerirTransacao &&
            $db->inTransaction()
        ) {
            $db->rollBack();
        }

        throw $erro;
    }
}

function iniciarWorkerFotosCreateAccount(string $membroId): void
{
    $worker =
        APP_ROOT .
        '/src/pages/profile-image-worker.php';

    $log =
        APP_ROOT .
        '/var/log/profile-image-worker.log';

    if (!is_file($worker)) {
        error_log(
            'Worker de imagens não encontrado: ' .
            $worker
        );

        return;
    }

    $comando = sprintf(
        'nohup %s %s %s >> %s 2>&1 < /dev/null &',
        escapeshellarg('/usr/bin/php'),
        escapeshellarg($worker),
        escapeshellarg($membroId),
        escapeshellarg($log)
    );

    try {
        $saida = [];
        $codigo = 0;

        exec(
            $comando,
            $saida,
            $codigo
        );

        if ($codigo !== 0) {
            error_log(
                'Não foi possível iniciar o worker das fotografias. Código: ' .
                $codigo
            );
        }
    } catch (\Throwable $erro) {
        error_log(
            'Erro ao iniciar o worker das fotografias: ' .
            $erro->getMessage()
        );
    }
}

$modoEdicao = $metodo === 'POST'
    ? (($_POST['modo'] ?? '') === 'editar')
    : (($_GET['editar'] ?? '') === '1');

$membroIdSessao = trim(
    (string) ($session->id ?? '')
);

if ($metodo !== 'POST') {
    $dadosIniciais = [
        'gostos' => []
    ];

    $fotosExistentes = [];

    if ($modoEdicao) {
        if ($membroIdSessao === '') {
            header(
                'Location: ' .
                urlCreateAccount('login')
            );

            exit;
        }

        $membroAtual = $cms
            ->getMember()
            ->get($membroIdSessao);

        if (!$membroAtual) {
            http_response_code(404);
            exit('Membro não encontrado.');
        }

        $nascimento =
            \DateTimeImmutable::createFromFormat(
                '!Y-m-d',
                (string) (
                    $membroAtual['nascimento']
                    ?? ''
                )
            );

        $dadosIniciais = [
            'primeiro_nome' =>
                (string) (
                    $membroAtual['primeiro_nome']
                    ?? ''
                ),
            'ultimo_nome' =>
                (string) (
                    $membroAtual['ultimo_nome']
                    ?? ''
                ),
            'dia' =>
                $nascimento
                    ? $nascimento->format('d')
                    : '',
            'mes' =>
                $nascimento
                    ? $nascimento->format('m')
                    : '01',
            'ano' =>
                $nascimento
                    ? $nascimento->format('Y')
                    : '',
            'genero' =>
                (string) (
                    $membroAtual['genero']
                    ?? ''
                ),
            'gostos' => array_values(
                array_map(
                    static fn(array $gosto): string =>
                        (string) (
                            $gosto['nome']
                            ?? ''
                        ),
                    $membroAtual['gostos']
                    ?? []
                )
            ),
            'objetivo' =>
                (string) (
                    $membroAtual['objetivo']
                    ?? ''
                ),
            'sobre_ti' =>
                (string) (
                    $membroAtual['bio']
                    ?? ''
                ),
            'telefone' =>
                (string) (
                    $membroAtual['telefone']
                    ?? ''
                ),
            'email' =>
                (string) (
                    $membroAtual['email']
                    ?? ''
                )
        ];

        foreach (
            $membroAtual['fotos'] ?? []
            as $foto
        ) {
            if (
                empty($foto['id']) ||
                ($foto['nome_arquivo'] ?? '') ===
                    'default.webp'
            ) {
                continue;
            }

            $nome = basename(
                (string) $foto['nome_arquivo']
            );

            $fotosExistentes[] = [
                'id' =>
                    (string) $foto['id'],
                'nome' =>
                    $nome,
                'url' =>
                    urlCreateAccount(
                        'imagens/fotos-perfil-originais/' .
                        rawurlencode($nome)
                    ),
                'fallback' =>
                    urlCreateAccount(
                        'imagens/fotos-perfil/' .
                        rawurlencode($nome)
                    )
            ];
        }
    }

    echo $twig->render(
        'create-account.html',
        [
            'modo_edicao' =>
                $modoEdicao,
            'membro_id_edicao' =>
                $modoEdicao
                    ? $membroIdSessao
                    : '',
            'dados_iniciais' =>
                $dadosIniciais,
            'fotos_existentes' =>
                $fotosExistentes,
            'campos_url' =>
                urlCreateAccount(
                    'create-account-campos' .
                    (
                        $modoEdicao
                            ? '?editar=1'
                            : ''
                    )
                ),
            'perfil_url' =>
                $modoEdicao
                    ? urlCreateAccount(
                        'profile/' .
                        rawurlencode(
                            $membroIdSessao
                        )
                    )
                    : ''
        ]
    );

    exit;
}

if (
    $modoEdicao &&
    $membroIdSessao === ''
) {
    responderJsonCreateAccount([
        'success' => false,
        'message' => 'A sessão terminou.'
    ], 401);
}

ignore_user_abort(true);
set_time_limit(0);

$secoesPermitidas = [
    'nome',
    'nascimento',
    'sexo',
    'gostos',
    'objetivo',
    'contactos',
    'descricao',
    'fotos',
    'permissoes',
    'palavra-passe',
    'tudo'
];

$secao = $modoEdicao
    ? trim(
        (string) (
            $_POST['secao']
            ?? 'tudo'
        )
    )
    : 'tudo';

if (
    $modoEdicao &&
    !in_array(
        $secao,
        $secoesPermitidas,
        true
    )
) {
    responderJsonCreateAccount([
        'success' => false,
        'message' => 'A área de edição não é válida.'
    ], 422);
}

$editar = static function (
    string $nome
) use (
    $modoEdicao,
    $secao
): bool {
    return
        !$modoEdicao ||
        $secao === 'tudo' ||
        $secao === $nome;
};

$erros = [];
$imagens = [];
$editaFotos = $editar('fotos');

if ($editaFotos) {
    prepararPastaFotosCreateAccount(
        $pathImagensTemporarias
    );

    $imagens =
        receberImagensCreateAccount(
            $pathImagensTemporarias,
            $erros
        );
}

$membro = [
    'primeiro_nome' =>
        trim(
            (string) (
                $_POST['primeiro_nome']
                ?? ''
            )
        ),
    'ultimo_nome' =>
        trim(
            (string) (
                $_POST['ultimo_nome']
                ?? ''
            )
        ),
    'dia' =>
        (string) (
            $_POST['dia']
            ?? ''
        ),
    'mes' =>
        (string) (
            $_POST['mes']
            ?? ''
        ),
    'ano' =>
        (string) (
            $_POST['ano']
            ?? ''
        ),
    'genero' =>
        trim(
            (string) (
                $_POST['genero']
                ?? ''
            )
        ),
    'gostos' =>
        normalizarListaCreateAccount(
            $_POST['gostos']
            ?? []
        ),
    'objetivo' =>
        trim(
            (string) (
                $_POST['objetivo']
                ?? ''
            )
        ),
    'sobre_ti' =>
        trim(
            (string) (
                $_POST['sobre_ti']
                ?? ''
            )
        ),
    'telefone' =>
        trim(
            (string) (
                $_POST['telefone']
                ?? ''
            )
        ),
    'email' =>
        trim(
            (string) (
                $_POST['email']
                ?? ''
            )
        ),
    'password' =>
        (string) (
            $_POST['password']
            ?? ''
        )
];

$confirmaPassword =
    (string) (
        $_POST['confirma_password']
        ?? ''
    );

$dia = (int) $membro['dia'];
$mes = (int) $membro['mes'];
$ano = (int) $membro['ano'];

$nascimentoValido =
    $dia >= 1 &&
    $mes >= 1 &&
    $ano >= 1900 &&
    $ano <= (int) date('Y') &&
    checkdate(
        $mes,
        $dia,
        $ano
    );

if ($editar('nome')) {
    if (
        !Validate::isText(
            $membro['primeiro_nome'],
            1,
            60
        )
    ) {
        $erros['primeiro_nome'] =
            'O primeiro nome deve ter entre 1 e 60 caracteres.';
    }

    if (
        !Validate::isText(
            $membro['ultimo_nome'],
            1,
            60
        )
    ) {
        $erros['ultimo_nome'] =
            'O último nome deve ter entre 1 e 60 caracteres.';
    }
}

if (
    $editar('nascimento') &&
    !$nascimentoValido
) {
    $erros['nascimento'] =
        'Escolhe uma data de nascimento válida.';
}

if (
    $editar('sexo') &&
    !Validate::isGenero(
        $membro['genero']
    )
) {
    $erros['genero'] =
        'Escolhe um género válido.';
}

if ($editar('gostos')) {
    if (count($membro['gostos']) > 30) {
        $erros['gostos'] =
            'Podes adicionar no máximo 30 gostos.';
    } else {
        foreach (
            $membro['gostos']
            as $gosto
        ) {
            if (
                !Validate::isText(
                    $gosto,
                    1,
                    80
                )
            ) {
                $erros['gostos'] =
                    'Cada gosto deve ter entre 1 e 80 caracteres.';

                break;
            }
        }
    }
}

$objetivosPermitidos = [
    'amizade',
    'conhecer_pessoas',
    'relacao_seria',
    'algo_casual',
    'conversar',
    'ainda_nao_sei'
];

if (
    $editar('objetivo') &&
    !in_array(
        $membro['objetivo'],
        $objetivosPermitidos,
        true
    )
) {
    $erros['objetivo'] =
        'Escolhe o que procuras na Margot.';
}

if ($editar('contactos')) {
    if (
        $membro['telefone'] !== '' &&
        !Validate::isPhone(
            $membro['telefone']
        )
    ) {
        $erros['telefone'] =
            'Introduz um número de telefone válido.';
    }

    if (
        !Validate::isEmail(
            $membro['email']
        )
    ) {
        $erros['email'] =
            'Introduz um email válido.';
    }
}

if (
    $editar('descricao') &&
    !Validate::isText(
        $membro['sobre_ti'],
        0,
        1000
    )
) {
    $erros['sobre_ti'] =
        'A descrição pode ter no máximo 1000 caracteres.';
}

$alterarPassword =
    !$modoEdicao ||
    $secao === 'palavra-passe' ||
    (
        $secao === 'tudo' &&
        (
            $membro['password'] !== '' ||
            $confirmaPassword !== ''
        )
    );

if ($alterarPassword) {
    if (
        $modoEdicao &&
        $membro['password'] === '' &&
        $confirmaPassword === ''
    ) {
        $erros['password'] =
            'Escreve a nova palavra-passe.';
    } elseif (
        !Validate::isPassword(
            $membro['password']
        )
    ) {
        $erros['password'] =
            'A palavra-passe deve ter pelo menos 8 caracteres, uma minúscula, uma maiúscula e um número.';
    }

    if (
        !isset($erros['password']) &&
        !hash_equals(
            $membro['password'],
            $confirmaPassword
        )
    ) {
        $erros['confirma_password'] =
            'As palavras-passe não são idênticas.';
    }
}

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

$alteracoes = [];

if ($editar('nome')) {
    $alteracoes['primeiro_nome'] =
        $membro['primeiro_nome'];

    $alteracoes['ultimo_nome'] =
        $membro['ultimo_nome'];

    $alteracoes['nome_seo'] =
        create_seo_name(
            trim(
                $membro['primeiro_nome'] .
                ' ' .
                $membro['ultimo_nome']
            )
        );
}

if ($editar('nascimento')) {
    $alteracoes['nascimento'] =
        sprintf(
            '%04d-%02d-%02d',
            $ano,
            $mes,
            $dia
        );
}

if ($editar('sexo')) {
    $alteracoes['genero'] =
        $membro['genero'];
}

if ($editar('gostos')) {
    $alteracoes['gostos'] =
        $membro['gostos'];
}

if ($editar('objetivo')) {
    $alteracoes['objetivo'] =
        $membro['objetivo'];
}

if ($editar('contactos')) {
    $alteracoes['telefone'] =
        $membro['telefone'];

    $alteracoes['email'] =
        $membro['email'];
}

if ($editar('descricao')) {
    $alteracoes['sobre_ti'] =
        $membro['sobre_ti'];
}

if ($alterarPassword) {
    $alteracoes['password'] =
        $membro['password'];
}

$ordemFotos = $editaFotos
    ? normalizarListaCreateAccount(
        $_POST['ordem_fotos']
        ?? []
    )
    : [];

$fotosRemover = $editaFotos
    ? normalizarListaCreateAccount(
        $_POST['fotos_remover']
        ?? []
    )
    : [];

$fotosAlteradas =
    $editaFotos &&
    (
        $imagens !== [] ||
        $fotosRemover !== [] ||
        (
            ($_POST['fotos_alteradas'] ?? '')
            === '1'
        )
    );

$transacaoAberta = false;
$nomesFotosApagar = [];

try {
    $db->beginTransaction();
    $transacaoAberta = true;

    if ($modoEdicao) {
        $membroId = $membroIdSessao;

        if ($alteracoes && !$cms->getMember()->update($membroId, $alteracoes)) {
            throw new \DomainException('DUPLICADO');
        }
    } else {
        $membroId = $cms->getMember()->create($alteracoes);

        if ($membroId === false) {
            throw new \DomainException('DUPLICADO');
        }

        $membroId = (string) $membroId;
    }

    if ($fotosAlteradas) {
        $nomesFotosApagar = sincronizarFotosCreateAccount(
            $db,
            $membroId,
            $imagens,
            $ordemFotos,
            $fotosRemover
        );
    }

    $db->commit();
    $transacaoAberta = false;
} catch (\DomainException $erro) {
    if ($transacaoAberta && $db->inTransaction()) {
        $db->rollBack();
    }

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
} catch (\LengthException $erro) {
    if ($transacaoAberta && $db->inTransaction()) {
        $db->rollBack();
    }

    apagarImagensTemporariasCreateAccount(
        $imagens,
        $pathImagensTemporarias
    );

    responderJsonCreateAccount([
        'success' => false,
        'erros' => [
            'imagens' => $erro->getMessage()
        ]
    ], 422);
} catch (\Throwable $erro) {
    if ($transacaoAberta && $db->inTransaction()) {
        $db->rollBack();
    }

    apagarImagensTemporariasCreateAccount(
        $imagens,
        $pathImagensTemporarias
    );

    $referencia = bin2hex(random_bytes(4));

    error_log(sprintf(
        '[create-account:%s] %s: %s em %s:%d%s%s',
        $referencia,
        $modoEdicao ? 'Erro ao atualizar perfil' : 'Erro ao criar conta',
        $erro->getMessage(),
        $erro->getFile(),
        $erro->getLine(),
        PHP_EOL,
        $erro->getTraceAsString()
    ));

    responderJsonCreateAccount([
        'success' => false,
        'message' =>
            (
                $modoEdicao
                    ? 'Ocorreu um erro ao guardar as alterações.'
                    : 'Ocorreu um erro ao criar a conta.'
            ) .
            ' Referência: ' .
            $referencia
    ], 500);
}

if ($nomesFotosApagar) {
    try {
        apagarFicheirosDePerfil(
            $nomesFotosApagar
        );
    } catch (\Throwable $erro) {
        error_log(
            '[create-account] Não foi possível apagar ficheiros antigos: ' .
            $erro->getMessage()
        );
    }
}

if ($imagens) {
    try {
        iniciarWorkerFotosCreateAccount(
            $membroId
        );
    } catch (\Throwable $erro) {
        error_log(
            '[create-account] Não foi possível iniciar o worker das fotografias: ' .
            $erro->getMessage()
        );
    }
}

if ($modoEdicao) {
    responderJsonCreateAccount([
        'success' => true,
        'redirect' => urlCreateAccount(
            'profile/' .
            rawurlencode($membroId)
        )
    ]);
}

$verification = new EmailVerification($db);

try {
    $pedido = $verification->createRequest(
        (string) $membro['email']
    );

    if ($pedido !== false) {
        $link =
            rtrim((string) DOMAIN, '/') .
            '/verify-email/?token=' .
            rawurlencode(
                (string) $pedido['token']
            );

        $nome = htmlspecialchars(
            (string) $pedido['primeiro_nome'],
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );

        $linkSeguro = htmlspecialchars(
            $link,
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );

        $corpo =
            '<p>Olá ' . $nome . ',</p>' .
            '<p>Confirma o teu endereço de email para começares a utilizar a Margot.</p>' .
            '<p><a href="' . $linkSeguro . '">Confirmar o meu email</a></p>' .
            '<p>Esta ligação é válida durante 24 horas e só pode ser utilizada uma vez.</p>' .
            '<p>Se não criaste uma conta na Margot, ignora este email.</p>' .
            '<p>Ligação: ' . $linkSeguro . '</p>';

        try {
            $mail = new Email(
                $email_config
            );

            $mail->sendEmail(
                (string) $email_config['admin_email'],
                (string) $pedido['email'],
                'Confirma o teu email na Margot',
                $corpo
            );
        } catch (\Throwable $erroEmail) {
            $verification->cancelRequest(
                (string) $pedido['token']
            );

            error_log(
                '[create-account] Conta criada, mas o email de confirmação falhou: ' .
                $erroEmail->getMessage()
            );
        }
    }
} catch (\Throwable $erro) {
    error_log(
        '[create-account] Conta criada, mas não foi possível preparar a confirmação: ' .
        $erro->getMessage()
    );
}

responderJsonCreateAccount([
    'success' => true,
    'redirect' => urlCreateAccount(
        'login?sucesso=confirma-email'
    ),
    'message' =>
        'A conta foi criada. Confirma o teu email antes de entrares.'
]);