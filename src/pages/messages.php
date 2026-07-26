<?php

declare(strict_types=1);

use App\Security\InteractionPolicy;
use App\Security\RateLimiter;

const MENSAGEM_TEXTO_MAXIMO = 2000;

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
            (SELECT fp.id FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
                AND fp.status = 'completo'
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC LIMIT 1) AS foto_id
            FROM membros m
            WHERE m.id COLLATE utf8mb4_unicode_ci = :id COLLATE utf8mb4_unicode_ci
            AND m.estado = 'ativo'
            LIMIT 1";

    $membro = $db->runSQL($sql, ['id' => $membroId])->fetch();

    if (!$membro) return false;

    $photoId = trim((string) ($membro['foto_id'] ?? ''));
    $membro['foto_url'] = $photoId === ''
        ? DOC_ROOT . 'imagens/fotos-perfil/default.webp'
        : DOC_ROOT . 'profile-photo/' . rawurlencode($photoId) . '?size=thumb';
    $membro['perfil_url'] = DOC_ROOT . 'profile/' . rawurlencode((string) $membro['id']);

    unset($membro['foto_id']);

    return $membro;
}

function sqlMensagemBase(): string
{
    return "SELECT msg.id, msg.emissor_id, msg.destinatario_id, msg.texto, msg.tipo,
            msg.ficheiro_nome, msg.ficheiro_mime, msg.ficheiro_tamanho,
            msg.lida, msg.criada_em, msg.lida_em,
            CONCAT(em.primeiro_nome, ' ', em.ultimo_nome) AS emissor_nome,
            (SELECT fp.id FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = em.id COLLATE utf8mb4_unicode_ci
                AND fp.status = 'completo'
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC LIMIT 1) AS emissor_foto_id
            FROM mensagens_chat msg
            INNER JOIN membros em
                ON em.id COLLATE utf8mb4_unicode_ci = msg.emissor_id COLLATE utf8mb4_unicode_ci";
}

function prepararMensagem(array $mensagem, string $membroId): array
{
    $ficheiro = basename(trim((string) ($mensagem['ficheiro_nome'] ?? '')));
    $photoId = trim((string) ($mensagem['emissor_foto_id'] ?? ''));

    $mensagem['id'] = (int) $mensagem['id'];
    $mensagem['lida'] = (bool) $mensagem['lida'];
    $mensagem['minha'] = (string) $mensagem['emissor_id'] === $membroId;
    $mensagem['texto'] = (string) ($mensagem['texto'] ?? '');
    $mensagem['media_url'] = $ficheiro === ''
        ? null
        : DOC_ROOT . 'message-media/' . rawurlencode((string) $mensagem['id']);
    $mensagem['emissor_foto_url'] = $photoId === ''
        ? DOC_ROOT . 'imagens/fotos-perfil/default.webp'
        : DOC_ROOT . 'profile-photo/' . rawurlencode($photoId) . '?size=thumb';
    $mensagem['emissor_perfil_url'] = DOC_ROOT . 'profile/' . rawurlencode((string) $mensagem['emissor_id']);

    unset($mensagem['ficheiro_nome'], $mensagem['emissor_foto_id']);

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
            (SELECT fp.id FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
                AND fp.status = 'completo'
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC LIMIT 1) AS outro_foto_id,
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
            WHERE p.estado = 'ativo'
            AND NOT EXISTS (
                SELECT 1
                FROM bloqueados b
                WHERE (
                    b.pessoa_bloqueou_id = :eu_bloqueio1
                    AND b.pessoa_bloqueada_id = conversa.outro_id
                ) OR (
                    b.pessoa_bloqueou_id = conversa.outro_id
                    AND b.pessoa_bloqueada_id = :eu_bloqueio2
                )
            )
            ORDER BY ultima.id DESC
            LIMIT 100";

    $linhas = $db->runSQL($sql, [
        'eu1' => $membroId,
        'eu2' => $membroId,
        'eu4' => $membroId,
        'eu_bloqueio1' => $membroId,
        'eu_bloqueio2' => $membroId
    ])->fetchAll();

    return array_map(static function (array $linha) use ($membroId): array {
        $photoId = trim((string) ($linha['outro_foto_id'] ?? ''));
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
            'outro_foto_url' => $photoId === ''
                ? DOC_ROOT . 'imagens/fotos-perfil/default.webp'
                : DOC_ROOT . 'profile-photo/' . rawurlencode($photoId) . '?size=thumb',
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
        'SELECT COUNT(*)
         FROM mensagens_chat msg
         WHERE msg.destinatario_id = :id
         AND msg.lida = 0
         AND NOT EXISTS (
             SELECT 1
             FROM bloqueados b
             WHERE (
                 b.pessoa_bloqueou_id = :id_bloqueio1
                 AND b.pessoa_bloqueada_id = msg.emissor_id
             ) OR (
                 b.pessoa_bloqueou_id = msg.emissor_id
                 AND b.pessoa_bloqueada_id = :id_bloqueio2
             )
         )',
        [
            'id' => $membroId,
            'id_bloqueio1' => $membroId,
            'id_bloqueio2' => $membroId
        ]
    )->fetchColumn();
}

function normalizarImagemMensagem(string $origem, string $destino): void
{
    if (!class_exists(Imagick::class)) {
        throw new RuntimeException('O servidor não consegue processar fotografias em segurança.');
    }

    $limits = [
        'RESOURCETYPE_MEMORY' => 128 * 1024 * 1024,
        'RESOURCETYPE_MAP' => 256 * 1024 * 1024,
        'RESOURCETYPE_DISK' => 512 * 1024 * 1024,
        'RESOURCETYPE_AREA' => 128 * 1024 * 1024,
        'RESOURCETYPE_THREAD' => 1,
        'RESOURCETYPE_TIME' => 30
    ];

    foreach ($limits as $constantName => $limit) {
        $constant = Imagick::class . '::' . $constantName;

        if (
            defined($constant) &&
            !Imagick::setResourceLimit((int) constant($constant), $limit)
        ) {
            throw new RuntimeException('O servidor não conseguiu limitar o processamento da fotografia.');
        }
    }

    $imagem = null;
    $probe = null;

    try {
        $probe = new Imagick();
        if (!$probe->pingImage($origem)) {
            throw new RuntimeException('Não foi possível validar a fotografia.');
        }

        if ($probe->getNumberImages() !== 1) {
            throw new RuntimeException('Fotografias animadas ou com várias páginas não são permitidas.');
        }

        $width = $probe->getImageWidth();
        $height = $probe->getImageHeight();

        if (
            $width < 1 ||
            $height < 1 ||
            $width > 12_000 ||
            $height > 12_000 ||
            ($width * $height) > 40_000_000
        ) {
            throw new RuntimeException('A fotografia tem dimensões demasiado grandes.');
        }

        $probe->clear();
        $probe->destroy();
        $probe = null;

        $imagem = new Imagick($origem);

        if ($imagem->getNumberImages() !== 1) {
            throw new RuntimeException('Fotografias animadas ou com várias páginas não são permitidas.');
        }

        $imagem->autoOrient();
        $imagem->transformImageColorspace(Imagick::COLORSPACE_SRGB);

        if ($imagem->getImageWidth() > 1600 || $imagem->getImageHeight() > 1600) {
            $imagem->thumbnailImage(1600, 1600, true, true);
        }

        $imagem->setImageFormat('webp');
        $imagem->setImageCompressionQuality(84);
        $imagem->stripImage();

        if (!$imagem->writeImage($destino)) {
            throw new RuntimeException('Não foi possível converter a fotografia.');
        }
    } catch (Throwable $erro) {
        if (is_file($destino)) @unlink($destino);

        throw new RuntimeException(
            'Não foi possível processar a fotografia.',
            0,
            $erro
        );
    } finally {
        if ($probe instanceof Imagick) {
            $probe->clear();
            $probe->destroy();
        }

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

    $tiposPermitidos = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
    ];

    if (!is_string($mime) || !in_array($mime, $tiposPermitidos, true)) {
        throw new RuntimeException('Nesta beta, só podes enviar fotografias JPEG, PNG, WebP ou HEIC.');
    }

    if ($tamanho <= 0 || $tamanho > MESSAGE_IMAGE_MAX_SIZE) {
        throw new RuntimeException('A fotografia pode ter no máximo 10 MB.');
    }

    $pasta = rtrim(MESSAGE_MEDIA_DIR, '/') . '/';

    if (!is_dir($pasta) && !mkdir($pasta, 0750, true) && !is_dir($pasta)) {
        throw new RuntimeException('Não foi possível preparar a pasta das mensagens.');
    }

    @chmod($pasta, 0750);
    clearstatcache(true, $pasta);
    $mode = fileperms($pasta);

    if ($mode === false || ($mode & 0027) !== 0) {
        throw new RuntimeException('A pasta das mensagens não tem permissões privadas.');
    }

    $nome = bin2hex(random_bytes(20)) . '.webp';
    $destino = $pasta . $nome;

    normalizarImagemMensagem($temporario, $destino);
    $tamanho = (int) filesize($destino);
    $mime = 'image/webp';

    @chmod($destino, 0640);

    return [
        'tipo' => 'imagem',
        'nome' => $nome,
        'mime' => $mime,
        'tamanho' => $tamanho,
        'caminho' => $destino
    ];
}

$membroId = trim((string) ($session->id ?? ''));
$outroId = trim((string) ($id ?? ''));
$api = trim((string) ($_GET['api'] ?? ''));
$proximityToken = trim((string) (
    $_POST['proximity_token'] ??
    $_GET['proximity_token'] ??
    ''
));
$policy = new InteractionPolicy($db, APP_KEY);

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
        require_csrf();

        if ($outroId === '' || $outroId === $membroId || !obterMembroChat($db, $outroId)) {
            responderMensagensJson([
                'success' => false,
                'message' => 'O destinatário não é válido.'
            ], 422);
        }

        $acao = trim((string) ($_POST['action'] ?? 'send'));

        if (!$policy->canInteract($membroId, $outroId, $proximityToken)) {
            responderMensagensJson([
                'success' => false,
                'message' => 'Esta conversa não está disponível.'
            ], 403);
        }

        $rateMemberKey = privacy_hash('member:' . $membroId);
        $ratePairKey = privacy_hash('pair:' . $membroId . ':' . $outroId);

        if ($acao === 'mark_read') {
            if (!RateLimiter::allow('message-read', $rateMemberKey, 60, 60)) {
                header('Retry-After: 60');
                responderMensagensJson([
                    'success' => false,
                    'message' => 'Estás a atualizar a conversa demasiado depressa.'
                ], 429);
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

        if (
            !RateLimiter::allow('message-member', $rateMemberKey, 30, 60) ||
            !RateLimiter::allow('message-pair', $ratePairKey, 10, 60)
        ) {
            header('Retry-After: 60');
            responderMensagensJson([
                'success' => false,
                'message' => 'Estás a enviar mensagens demasiado depressa.'
            ], 429);
        }

        $texto = trim((string) ($_POST['mensagem'] ?? $_POST['texto'] ?? ''));

        if (mb_strlen($texto) > MENSAGEM_TEXTO_MAXIMO) {
            responderMensagensJson([
                'success' => false,
                'message' => 'A mensagem pode ter no máximo 2000 caracteres.'
            ], 422);
        }

        $hasUpload = (int) ($_FILES['media']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

        if (
            $hasUpload &&
            !RateLimiter::allow('message-upload', $rateMemberKey, 10, 3600)
        ) {
            header('Retry-After: 3600');
            responderMensagensJson([
                'success' => false,
                'message' => 'Atingiste o limite de fotografias por hora.'
            ], 429);
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
        if (
            $outroId === '' ||
            !obterMembroChat($db, $outroId) ||
            !$policy->canInteract($membroId, $outroId, $proximityToken)
        ) {
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

    if (
        !$outro ||
        $outroId === $membroId ||
        !$policy->canInteract($membroId, $outroId, $proximityToken)
    ) {
        http_response_code(404);

        echo $twig->render('error-page.html', [
            'message' => 'Esta conversa não existe.'
        ]);

        exit;
    }

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
