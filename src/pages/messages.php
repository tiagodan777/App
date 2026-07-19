<?php

declare(strict_types=1);

const MENSAGEM_TEXTO_MAXIMO = 2000;
const MENSAGEM_IMAGEM_MAXIMA = 15 * 1024 * 1024;
const MENSAGEM_VIDEO_MAXIMO = 100 * 1024 * 1024;

function responderMensagensJson(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function obterMembroChat($db, string $membroId): array|false
{
    $sql = "SELECT m.id, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
            COALESCE((SELECT fp.nome_arquivo FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
                AND (fp.status = 'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC LIMIT 1), 'default.webp') AS foto
            FROM membros m
            WHERE m.id COLLATE utf8mb4_unicode_ci = :id COLLATE utf8mb4_unicode_ci
            LIMIT 1";

    $membro = $db->runSQL($sql, ['id' => $membroId])->fetch();

    if (!$membro) return false;

    $foto = basename(trim((string) $membro['foto'])) ?: 'default.webp';
    $membro['foto_url'] = DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($foto);
    $membro['perfil_url'] = DOC_ROOT . 'profile/' . rawurlencode((string) $membro['id']);

    unset($membro['foto']);

    return $membro;
}

function sqlMensagemBase(): string
{
    return "SELECT msg.id, msg.emissor_id, msg.destinatario_id, msg.texto, msg.tipo,
            msg.ficheiro_nome, msg.ficheiro_mime, msg.ficheiro_tamanho,
            msg.lida, msg.criada_em, msg.lida_em,
            CONCAT(em.primeiro_nome, ' ', em.ultimo_nome) AS emissor_nome,
            COALESCE((SELECT fp.nome_arquivo FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = em.id COLLATE utf8mb4_unicode_ci
                AND (fp.status = 'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC LIMIT 1), 'default.webp') AS emissor_foto
            FROM mensagens_chat msg
            INNER JOIN membros em
                ON em.id COLLATE utf8mb4_unicode_ci = msg.emissor_id COLLATE utf8mb4_unicode_ci";
}

function prepararMensagem(array $mensagem, string $membroId): array
{
    $ficheiro = basename(trim((string) ($mensagem['ficheiro_nome'] ?? '')));
    $foto = basename(trim((string) ($mensagem['emissor_foto'] ?? 'default.webp'))) ?: 'default.webp';

    $mensagem['id'] = (int) $mensagem['id'];
    $mensagem['lida'] = (bool) $mensagem['lida'];
    $mensagem['minha'] = (string) $mensagem['emissor_id'] === $membroId;
    $mensagem['texto'] = (string) ($mensagem['texto'] ?? '');
    $mensagem['media_url'] = $ficheiro === '' ? null : DOC_ROOT . 'media/mensagens/' . rawurlencode($ficheiro);
    $mensagem['emissor_foto_url'] = DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($foto);
    $mensagem['emissor_perfil_url'] = DOC_ROOT . 'profile/' . rawurlencode((string) $mensagem['emissor_id']);

    unset($mensagem['ficheiro_nome'], $mensagem['emissor_foto']);

    return $mensagem;
}

function obterMensagem($db, int $mensagemId, string $membroId): array|false
{
    $sql = sqlMensagemBase() . "
        WHERE msg.id = :id
        AND (
            msg.emissor_id = :membro1
            OR msg.destinatario_id = :membro2
        )
        LIMIT 1
    ";

    $mensagem = $db->runSQL($sql, [
        'id' => $mensagemId,
        'membro1' => $membroId,
        'membro2' => $membroId
    ])->fetch();

    return $mensagem ? prepararMensagem($mensagem, $membroId) : false;
}

function obterHistorico($db, string $membroId, string $outroId, int $depoisDe = 0): array
{
    $sql = sqlMensagemBase() . "
        WHERE (
            (msg.emissor_id = :eu1 AND msg.destinatario_id = :outro1)
            OR
            (msg.emissor_id = :outro2 AND msg.destinatario_id = :eu2)
        )
    ";

    $parametros = [
        'eu1' => $membroId,
        'outro1' => $outroId,
        'outro2' => $outroId,
        'eu2' => $membroId
    ];

    if ($depoisDe > 0) {
        $sql .= ' AND msg.id > :depois ORDER BY msg.id ASC LIMIT 100';
        $parametros['depois'] = $depoisDe;
    } else {
        $sql .= ' ORDER BY msg.id DESC LIMIT 100';
    }

    $mensagens = $db->runSQL($sql, $parametros)->fetchAll();

    if ($depoisDe === 0) $mensagens = array_reverse($mensagens);

    return array_map(
        static fn(array $mensagem): array => prepararMensagem($mensagem, $membroId),
        $mensagens
    );
}

function obterConversas($db, string $membroId): array
{
    $sql = "SELECT ultima.id, ultima.emissor_id, ultima.destinatario_id,
            ultima.texto, ultima.tipo, ultima.criada_em,
            conversa.outro_id,
            CONCAT(p.primeiro_nome, ' ', p.ultimo_nome) AS outro_nome,
            COALESCE((SELECT fp.nome_arquivo FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                AND (fp.status = 'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC LIMIT 1), 'default.webp') AS outro_foto,
            (SELECT COUNT(*) FROM mensagens_chat nao_lida
                WHERE nao_lida.emissor_id = conversa.outro_id
                AND nao_lida.destinatario_id = :eu4
                AND nao_lida.lida = 0) AS nao_lidas
            FROM (
                SELECT participacao.outro_id, MAX(participacao.id) AS ultima_id
                FROM (
                    SELECT id, destinatario_id AS outro_id
                    FROM mensagens_chat
                    WHERE emissor_id = :eu1

                    UNION ALL

                    SELECT id, emissor_id AS outro_id
                    FROM mensagens_chat
                    WHERE destinatario_id = :eu2
                ) participacao
                GROUP BY participacao.outro_id
            ) conversa
            INNER JOIN mensagens_chat ultima ON ultima.id = conversa.ultima_id
            INNER JOIN membros p
                ON p.id COLLATE utf8mb4_unicode_ci = conversa.outro_id COLLATE utf8mb4_unicode_ci
            ORDER BY ultima.id DESC
            LIMIT 100";

    $linhas = $db->runSQL($sql, [
        'eu1' => $membroId,
        'eu2' => $membroId,
        'eu4' => $membroId
    ])->fetchAll();

    return array_map(static function (array $linha) use ($membroId): array {
        $foto = basename(trim((string) $linha['outro_foto'])) ?: 'default.webp';
        $texto = trim((string) ($linha['texto'] ?? ''));

        if ($texto === '') {
            $texto = match ($linha['tipo']) {
                'imagem' => 'Fotografia',
                'video' => 'Vídeo',
                default => 'Mensagem'
            };
        }

        if ((string) $linha['emissor_id'] === $membroId) $texto = 'Tu: ' . $texto;

        return [
            'id' => (int) $linha['id'],
            'outro_id' => (string) $linha['outro_id'],
            'outro_nome' => (string) $linha['outro_nome'],
            'outro_foto_url' => DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($foto),
            'chat_url' => DOC_ROOT . 'messages/' . rawurlencode((string) $linha['outro_id']),
            'perfil_url' => DOC_ROOT . 'profile/' . rawurlencode((string) $linha['outro_id']),
            'resumo' => $texto,
            'criada_em' => (string) $linha['criada_em'],
            'nao_lidas' => (int) $linha['nao_lidas']
        ];
    }, $linhas);
}

function contarMensagensNaoLidas($db, string $membroId): int
{
    return (int) $db->runSQL(
        'SELECT COUNT(*) FROM mensagens_chat WHERE destinatario_id = :id AND lida = 0',
        ['id' => $membroId]
    )->fetchColumn();
}

function converterImagemIphoneParaWebp(string $origem, string $destino): void
{
    if (!class_exists(Imagick::class)) {
        throw new RuntimeException('O servidor não consegue converter fotografias HEIC/HEIF.');
    }

    $imagem = null;

    try {
        $imagem = new Imagick($origem);

        if ($imagem->getNumberImages() > 1) $imagem->setIteratorIndex(0);

        $imagem->autoOrient();
        $imagem->transformImageColorspace(Imagick::COLORSPACE_SRGB);

        if ($imagem->getImageWidth() > 2400 || $imagem->getImageHeight() > 2400) {
            $imagem->thumbnailImage(2400, 2400, true, true);
        }

        $imagem->setImageFormat('webp');
        $imagem->setImageCompressionQuality(86);
        $imagem->stripImage();

        if (!$imagem->writeImage($destino)) {
            throw new RuntimeException('Não foi possível converter a fotografia.');
        }
    } catch (Throwable $erro) {
        if (is_file($destino)) @unlink($destino);

        throw new RuntimeException(
            'Não foi possível converter a fotografia HEIC/HEIF.',
            0,
            $erro
        );
    } finally {
        if ($imagem instanceof Imagick) {
            $imagem->clear();
            $imagem->destroy();
        }
    }
}

function guardarMediaMensagem(array $ficheiro): array
{
    $erro = (int) ($ficheiro['error'] ?? UPLOAD_ERR_NO_FILE);

    if ($erro === UPLOAD_ERR_NO_FILE) return [];

    if ($erro !== UPLOAD_ERR_OK) {
        throw new RuntimeException('O ficheiro não foi enviado completamente.');
    }

    $temporario = (string) ($ficheiro['tmp_name'] ?? '');
    $tamanho = (int) ($ficheiro['size'] ?? 0);

    if ($temporario === '' || !is_uploaded_file($temporario)) {
        throw new RuntimeException('O ficheiro recebido não é válido.');
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporario);

    $tipos = [
        'image/jpeg' => ['imagem', 'jpg'],
        'image/png' => ['imagem', 'png'],
        'image/webp' => ['imagem', 'webp'],
        'image/gif' => ['imagem', 'gif'],
        'image/avif' => ['imagem', 'avif'],
        'image/heic' => ['imagem', 'heic'],
        'image/heif' => ['imagem', 'heif'],
        'video/mp4' => ['video', 'mp4'],
        'video/webm' => ['video', 'webm'],
        'video/quicktime' => ['video', 'mov'],
        'video/x-m4v' => ['video', 'm4v']
    ];

    if (!is_string($mime) || !isset($tipos[$mime])) {
        throw new RuntimeException('Só podes enviar fotografias ou vídeos.');
    }

    [$tipo, $extensao] = $tipos[$mime];

    $limite = $tipo === 'imagem'
        ? MENSAGEM_IMAGEM_MAXIMA
        : MENSAGEM_VIDEO_MAXIMO;

    if ($tamanho <= 0 || $tamanho > $limite) {
        throw new RuntimeException(
            $tipo === 'imagem'
                ? 'A fotografia pode ter no máximo 15 MB.'
                : 'O vídeo pode ter no máximo 100 MB.'
        );
    }

    $pasta = APP_ROOT . '/public/media/mensagens/';

    if (!is_dir($pasta) && !mkdir($pasta, 0775, true) && !is_dir($pasta)) {
        throw new RuntimeException('Não foi possível preparar a pasta das mensagens.');
    }

    $imagemIphone = $mime === 'image/heic' || $mime === 'image/heif';

    if ($imagemIphone) {
        $extensao = 'webp';
        $mime = 'image/webp';
    }

    $nome = bin2hex(random_bytes(20)) . '.' . $extensao;
    $destino = $pasta . $nome;

    if ($imagemIphone) {
        converterImagemIphoneParaWebp($temporario, $destino);
        $tamanho = (int) filesize($destino);
    } elseif (!move_uploaded_file($temporario, $destino)) {
        throw new RuntimeException('Não foi possível guardar o ficheiro.');
    }

    @chmod($destino, 0664);

    return [
        'tipo' => $tipo,
        'nome' => $nome,
        'mime' => $mime,
        'tamanho' => $tamanho,
        'caminho' => $destino
    ];
}

$membroId = trim((string) ($session->id ?? ''));
$outroId = trim((string) ($id ?? ''));
$api = trim((string) ($_GET['api'] ?? ''));

if ($membroId === '') {
    if ($api !== '' || $_SERVER['REQUEST_METHOD'] === 'POST') {
        responderMensagensJson([
            'success' => false,
            'message' => 'A sessão terminou.'
        ], 401);
    }

    header('Location: ' . DOC_ROOT . 'login');
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if ($outroId === '' || $outroId === $membroId || !obterMembroChat($db, $outroId)) {
            responderMensagensJson([
                'success' => false,
                'message' => 'O destinatário não é válido.'
            ], 422);
        }

        $acao = trim((string) ($_POST['action'] ?? 'send'));

        if ($acao === 'mark_read') {
            $db->runSQL(
                'UPDATE mensagens_chat
                 SET lida = 1, lida_em = COALESCE(lida_em, NOW(6))
                 WHERE emissor_id = :outro
                 AND destinatario_id = :eu
                 AND lida = 0',
                [
                    'outro' => $outroId,
                    'eu' => $membroId
                ]
            );

            responderMensagensJson([
                'success' => true,
                'unread_count' => contarMensagensNaoLidas($db, $membroId)
            ]);
        }

        if ($acao !== 'send') {
            responderMensagensJson([
                'success' => false,
                'message' => 'Ação inválida.'
            ], 422);
        }

        $texto = trim((string) ($_POST['mensagem'] ?? $_POST['texto'] ?? ''));

        if (mb_strlen($texto) > MENSAGEM_TEXTO_MAXIMO) {
            responderMensagensJson([
                'success' => false,
                'message' => 'A mensagem pode ter no máximo 2000 caracteres.'
            ], 422);
        }

        $media = guardarMediaMensagem($_FILES['media'] ?? []);

        if ($texto === '' && $media === []) {
            responderMensagensJson([
                'success' => false,
                'message' => 'Escreve uma mensagem ou escolhe um ficheiro.'
            ], 422);
        }

        $tipo = $media['tipo'] ?? 'texto';

        $parametros = [
            'emissor' => $membroId,
            'destinatario' => $outroId,
            'texto' => $texto === '' ? null : $texto,
            'tipo' => $tipo,
            'ficheiro' => $media['nome'] ?? null,
            'mime' => $media['mime'] ?? null,
            'tamanho' => $media['tamanho'] ?? null
        ];

        try {
            $db->runSQL(
                'INSERT INTO mensagens_chat (
                    emissor_id,
                    destinatario_id,
                    texto,
                    tipo,
                    ficheiro_nome,
                    ficheiro_mime,
                    ficheiro_tamanho,
                    lida,
                    criada_em
                ) VALUES (
                    :emissor,
                    :destinatario,
                    :texto,
                    :tipo,
                    :ficheiro,
                    :mime,
                    :tamanho,
                    0,
                    NOW(6)
                )',
                $parametros
            );

            $mensagemId = (int) $db
                ->runSQL('SELECT LAST_INSERT_ID()')
                ->fetchColumn();
        } catch (Throwable $erro) {
            if (isset($media['caminho']) && is_file($media['caminho'])) {
                @unlink($media['caminho']);
            }

            throw $erro;
        }

        $mensagem = obterMensagem($db, $mensagemId, $membroId);

        responderMensagensJson([
            'success' => true,
            'message' => $mensagem
        ], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        header('Allow: GET, POST');

        responderMensagensJson([
            'success' => false,
            'message' => 'Método não permitido.'
        ], 405);
    }

    if ($api === 'conversations') {
        responderMensagensJson([
            'success' => true,
            'conversations' => obterConversas($db, $membroId),
            'unread_count' => contarMensagensNaoLidas($db, $membroId)
        ]);
    }

    if ($api === 'history') {
        if ($outroId === '' || !obterMembroChat($db, $outroId)) {
            responderMensagensJson([
                'success' => false,
                'message' => 'Conversa inválida.'
            ], 404);
        }

        $depoisDe = max(0, (int) ($_GET['after_id'] ?? 0));

        responderMensagensJson([
            'success' => true,
            'messages' => obterHistorico(
                $db,
                $membroId,
                $outroId,
                $depoisDe
            )
        ]);
    }

    if ($outroId === '') {
        echo $twig->render('messages.html', [
            'membro_id' => $membroId,
            'conversas' => obterConversas($db, $membroId),
            'mensagens_nao_lidas' => contarMensagensNaoLidas($db, $membroId)
        ]);

        exit;
    }

    $outro = obterMembroChat($db, $outroId);

    if (!$outro || $outroId === $membroId) {
        http_response_code(404);

        echo $twig->render('error-page.html', [
            'message' => 'Esta conversa não existe.'
        ]);

        exit;
    }

    $db->runSQL(
        'UPDATE mensagens_chat
         SET lida = 1, lida_em = COALESCE(lida_em, NOW(6))
         WHERE emissor_id = :outro
         AND destinatario_id = :eu
         AND lida = 0',
        [
            'outro' => $outroId,
            'eu' => $membroId
        ]
    );

    echo $twig->render('chat.html', [
        'membro_id' => $membroId,
        'outro' => $outro,
        'mensagens' => obterHistorico($db, $membroId, $outroId),
        'mensagens_nao_lidas' => contarMensagensNaoLidas($db, $membroId)
    ]);
} catch (Throwable $erro) {
    error_log('[messages] ' . $erro->getMessage());

    if ($api !== '' || $_SERVER['REQUEST_METHOD'] === 'POST') {
        responderMensagensJson([
            'success' => false,
            'message' => 'Não foi possível processar as mensagens.'
        ], 500);
    }

    http_response_code(500);

    echo $twig->render('error-page.html', [
        'message' => 'Não foi possível abrir as mensagens.'
    ]);
}