<?php

declare(strict_types=1);

use App\Security\RateLimiter;
use App\Security\InteractionPolicy;

function responderSeguranca(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function preservarMediaEvidencia(string $origem): array
{
    if (
        !is_file($origem) ||
        is_link($origem) ||
        (new finfo(FILEINFO_MIME_TYPE))->file($origem) !== 'image/webp'
    ) {
        throw new RuntimeException('A prova multimédia já não está disponível.');
    }

    $tamanhoOrigem = filesize($origem);

    if (
        $tamanhoOrigem === false ||
        $tamanhoOrigem < 1 ||
        $tamanhoOrigem > 25 * 1024 * 1024
    ) {
        throw new RuntimeException('A prova multimédia não tem um tamanho válido.');
    }

    if (is_link(REPORT_EVIDENCE_DIR)) {
        throw new RuntimeException('A pasta de evidência não pode ser um link simbólico.');
    }

    if (
        !is_dir(REPORT_EVIDENCE_DIR) &&
        !mkdir(REPORT_EVIDENCE_DIR, 0750, true) &&
        !is_dir(REPORT_EVIDENCE_DIR)
    ) {
        throw new RuntimeException('Não foi possível preparar a pasta de evidência.');
    }

    @chmod(REPORT_EVIDENCE_DIR, 0750);
    clearstatcache(true, REPORT_EVIDENCE_DIR);
    $evidenceDirectoryMode = fileperms(REPORT_EVIDENCE_DIR);
    $realEvidenceDirectory = realpath(REPORT_EVIDENCE_DIR);
    $realPrivateRoot = realpath(APP_ROOT . '/var');

    if (
        $evidenceDirectoryMode === false ||
        ($evidenceDirectoryMode & 0027) !== 0 ||
        $realEvidenceDirectory === false ||
        $realPrivateRoot === false ||
        !str_starts_with(
            rtrim(str_replace('\\', '/', $realEvidenceDirectory), '/') . '/',
            rtrim(str_replace('\\', '/', $realPrivateRoot), '/') . '/'
        )
    ) {
        throw new RuntimeException('A pasta de evidência não é privada.');
    }

    $nome = bin2hex(random_bytes(20)) . '.webp';
    $destino = rtrim(REPORT_EVIDENCE_DIR, '/') . '/' . $nome;
    $temporario = $destino . '.processing-' . bin2hex(random_bytes(8));

    try {
        if (!copy($origem, $temporario)) {
            throw new RuntimeException('Não foi possível copiar a prova multimédia.');
        }

        @chmod($temporario, 0640);
        clearstatcache(true, $temporario);
        $temporaryMode = fileperms($temporario);

        if (
            $temporaryMode === false ||
            ($temporaryMode & 0027) !== 0 ||
            !rename($temporario, $destino)
        ) {
            throw new RuntimeException('Não foi possível preservar a prova multimédia.');
        }

        $tamanho = filesize($destino);
        $hash = hash_file('sha256', $destino);

        if (
            $tamanho === false ||
            $tamanho < 1 ||
            $tamanho !== $tamanhoOrigem ||
            !is_string($hash) ||
            preg_match('/\A[0-9a-f]{64}\z/D', $hash) !== 1
        ) {
            throw new RuntimeException('A prova multimédia ficou incompleta.');
        }

        return [
            'nome' => $nome,
            'mime' => 'image/webp',
            'tamanho' => $tamanho,
            'sha256' => $hash,
            'caminho' => $destino
        ];
    } catch (Throwable $erro) {
        if (is_file($temporario)) @unlink($temporario);
        if (is_file($destino)) @unlink($destino);

        throw $erro;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    responderSeguranca(['success' => false, 'message' => 'Método não permitido.'], 405);
}

require_csrf();

if (strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) !== 'xmlhttprequest') {
    responderSeguranca(['success' => false, 'message' => 'Pedido inválido.'], 403);
}

$membroId = trim((string) ($session->id ?? ''));
$acao = trim((string) ($_POST['action'] ?? ''));
$destinatarioId = trim((string) ($_POST['target_id'] ?? ''));
$contextoTipo = trim((string) ($_POST['context_type'] ?? 'perfil'));
$contextoIdRecebido = trim((string) ($_POST['context_id'] ?? ''));
$proximityToken = trim((string) ($_POST['proximity_token'] ?? ''));

if ($membroId === '' || $membroId === '0') {
    responderSeguranca(['success' => false, 'message' => 'A sessão terminou.'], 401);
}

if ($destinatarioId === '' || strlen($destinatarioId) > 64) {
    responderSeguranca(['success' => false, 'message' => 'A pessoa selecionada não é válida.'], 422);
}

if (hash_equals($membroId, $destinatarioId)) {
    responderSeguranca(['success' => false, 'message' => 'Não podes executar esta ação sobre o teu perfil.'], 422);
}

$ficheiroEvidenciaCriado = null;

try {
    $membroExiste = (bool) $db->runSQL(
        "SELECT 1
         FROM membros
         WHERE id = :id
         AND estado = 'ativo'
         LIMIT 1",
        ['id' => $destinatarioId]
    )->fetchColumn();

    if (!$membroExiste) {
        responderSeguranca(['success' => false, 'message' => 'Esta pessoa já não existe.'], 404);
    }

    $interactionPolicy = new InteractionPolicy($db, APP_KEY);
    $alreadyBlockedInEitherDirection = $interactionPolicy->areBlocked(
        $membroId,
        $destinatarioId
    );

    if (
        !$alreadyBlockedInEitherDirection &&
        !$interactionPolicy->canInteract(
            $membroId,
            $destinatarioId,
            $proximityToken
        )
    ) {
        responderSeguranca([
            'success' => false,
            'message' => 'Esta pessoa já não está disponível.'
        ], 404);
    }

    if ($acao === 'block') {
        if (!RateLimiter::allow(
            'block',
            privacy_hash('member:' . $membroId),
            20,
            3600
        )) {
            header('Retry-After: 3600');
            responderSeguranca([
                'success' => false,
                'message' => 'Atingiste o limite temporário de bloqueios.'
            ], 429);
        }

        $blockArguments = [
            'membro_id' => $membroId,
            'destinatario_id' => $destinatarioId
        ];
        $alreadyBlocked = (bool) $db->runSQL(
            'SELECT 1
             FROM bloqueados
             WHERE pessoa_bloqueou_id = :membro_id
             AND pessoa_bloqueada_id = :destinatario_id
             LIMIT 1',
            $blockArguments
        )->fetchColumn();

        if (!$alreadyBlocked) {
            try {
                $db->runSQL(
                    'INSERT INTO bloqueados (
                        pessoa_bloqueou_id,
                        pessoa_bloqueada_id
                     ) VALUES (
                        :membro_id,
                        :destinatario_id
                     )',
                    $blockArguments
                );
            } catch (Throwable $blockError) {
                /*
                 * Uma corrida de dois pedidos iguais é sucesso. Qualquer outro
                 * erro (incluindo uma FK falhada por conta eliminada) propaga.
                 */
                $alreadyBlocked = (bool) $db->runSQL(
                    'SELECT 1
                     FROM bloqueados
                     WHERE pessoa_bloqueou_id = :membro_id
                     AND pessoa_bloqueada_id = :destinatario_id
                     LIMIT 1',
                    $blockArguments
                )->fetchColumn();

                if (!$alreadyBlocked) throw $blockError;
            }
        }

        $db->runSQL(
            'UPDATE notificacao
             SET ocultada_para_emissor_em = CASE
                    WHEN emissor_id = :membro1 THEN COALESCE(ocultada_para_emissor_em, NOW())
                    ELSE ocultada_para_emissor_em
                 END,
                 ocultada_para_destinatario_em = CASE
                    WHEN destinatario_id = :membro2 THEN COALESCE(ocultada_para_destinatario_em, NOW())
                    ELSE ocultada_para_destinatario_em
                 END
             WHERE (
                 emissor_id = :membro3 AND destinatario_id = :destinatario1
             ) OR (
                 emissor_id = :destinatario2 AND destinatario_id = :membro4
             )',
            [
                'membro1' => $membroId,
                'membro2' => $membroId,
                'membro3' => $membroId,
                'destinatario1' => $destinatarioId,
                'destinatario2' => $destinatarioId,
                'membro4' => $membroId
            ]
        );

        responderSeguranca([
            'success' => true,
            'blocked' => true,
            'already_blocked' => $alreadyBlocked,
            'target_id' => $destinatarioId
        ]);
    }

    if ($acao === 'report') {
        $reporterKey = privacy_hash('reporter:' . $membroId);
        $pairKey = privacy_hash('report:' . $membroId . ':' . $destinatarioId);

        if (
            !RateLimiter::allow('report-member', $reporterKey, 20, 86400) ||
            !RateLimiter::allow('report-pair', $pairKey, 5, 3600)
        ) {
            header('Retry-After: 3600');
            responderSeguranca([
                'success' => false,
                'message' => 'Atingiste o limite temporário de denúncias.'
            ], 429);
        }

        $motivo = trim((string) ($_POST['motivo'] ?? ''));
        $mensagem = trim((string) ($_POST['mensagem'] ?? ''));
        $motivosPermitidos = [
            'comportamento_inadequado',
            'assedio',
            'conteudo_inadequado',
            'perfil_falso',
            'spam',
            'seguranca',
            'outro'
        ];

        if (!in_array($motivo, $motivosPermitidos, true)) {
            responderSeguranca(['success' => false, 'message' => 'Escolhe um motivo válido.'], 422);
        }

        if (mb_strlen($mensagem) > 2048) {
            responderSeguranca(['success' => false, 'message' => 'A descrição pode ter no máximo 2048 caracteres.'], 422);
        }

        if (!in_array($contextoTipo, ['perfil', 'mensagem'], true)) {
            responderSeguranca(['success' => false, 'message' => 'O contexto da denúncia não é válido.'], 422);
        }

        $contextoId = null;

        if ($contextoTipo === 'mensagem') {
            $mensagemId = filter_var($contextoIdRecebido, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1]
            ]);

            if ($mensagemId === false) {
                responderSeguranca(['success' => false, 'message' => 'A mensagem selecionada não é válida.'], 422);
            }

            $snapshotMensagem = $db->runSQL(
                'SELECT id, texto, tipo, ficheiro_nome, ficheiro_mime,
                        ficheiro_tamanho, criada_em
                 FROM mensagens_chat
                 WHERE id = :id
                 AND emissor_id = :denunciado
                 AND destinatario_id = :denunciante
                 LIMIT 1',
                [
                    'id' => $mensagemId,
                    'denunciado' => $destinatarioId,
                    'denunciante' => $membroId
                ]
            )->fetch();

            if (!$snapshotMensagem) {
                responderSeguranca(['success' => false, 'message' => 'A mensagem já não está disponível.'], 404);
            }

            $contextoId = (string) $mensagemId;
            $evidenciaMediaNome = null;
            $evidenciaMediaMime = null;
            $evidenciaMediaTamanho = null;
            $evidenciaMediaSha256 = null;

            $mediaOriginalGuardado = trim((string) (
                $snapshotMensagem['ficheiro_nome'] ?? ''
            ));
            $mediaOriginalNome = basename($mediaOriginalGuardado);

            if ($mediaOriginalNome !== '') {
                try {
                    if ($mediaOriginalNome !== $mediaOriginalGuardado) {
                        throw new RuntimeException(
                            'A referência da prova multimédia não é válida.'
                        );
                    }

                    $mediaOriginal =
                        rtrim(MESSAGE_MEDIA_DIR, '/') .
                        '/' .
                        $mediaOriginalNome;
                    $mediaPreservada = preservarMediaEvidencia($mediaOriginal);
                    $evidenciaMediaNome = $mediaPreservada['nome'];
                    $evidenciaMediaMime = $mediaPreservada['mime'];
                    $evidenciaMediaTamanho = $mediaPreservada['tamanho'];
                    $evidenciaMediaSha256 = $mediaPreservada['sha256'];
                    $ficheiroEvidenciaCriado = $mediaPreservada['caminho'];
                } catch (Throwable) {
                    /*
                     * A indisponibilidade da media não pode impedir a denúncia
                     * do texto ou do comportamento. O painel verá que a cópia
                     * não foi preservada e a operação recebe um alerta.
                     */
                    error_log('[safety] Não foi possível preservar a media de uma denúncia.');
                }
            }

            $evidencia = [
                'capturada_em' => gmdate(DATE_ATOM),
                'mensagem' => [
                    'id' => (int) $snapshotMensagem['id'],
                    'texto' => (string) ($snapshotMensagem['texto'] ?? ''),
                    'tipo' => (string) ($snapshotMensagem['tipo'] ?? 'texto'),
                    'tem_media' => trim((string) ($snapshotMensagem['ficheiro_mime'] ?? '')) !== '',
                    'media_mime' => (string) ($snapshotMensagem['ficheiro_mime'] ?? ''),
                    'media_tamanho' => (int) ($snapshotMensagem['ficheiro_tamanho'] ?? 0),
                    'media_preservada' => $evidenciaMediaNome !== null,
                    'criada_em' => (string) ($snapshotMensagem['criada_em'] ?? '')
                ]
            ];
        } else {
            $evidenciaMediaNome = null;
            $evidenciaMediaMime = null;
            $evidenciaMediaTamanho = null;
            $evidenciaMediaSha256 = null;
            $snapshot = $db->runSQL(
                "SELECT m.primeiro_nome, m.objetivo, m.bio,
                        (
                            SELECT fp.nome_arquivo
                            FROM fotos_perfil AS fp
                            WHERE fp.membro_id = m.id
                            AND fp.status = 'completo'
                            ORDER BY fp.ordem IS NULL, fp.ordem ASC, fp.id ASC
                            LIMIT 1
                        ) AS foto_nome
                 FROM membros AS m
                 WHERE m.id = :id
                 LIMIT 1",
                ['id' => $destinatarioId]
            )->fetch() ?: [];
            $fotoGuardada = trim((string) ($snapshot['foto_nome'] ?? ''));
            $fotoNome = basename($fotoGuardada);

            if ($fotoGuardada !== '') {
                try {
                    if ($fotoNome !== $fotoGuardada) {
                        throw new RuntimeException(
                            'A referência da fotografia não é válida.'
                        );
                    }

                    $fotoOriginal =
                        rtrim(PROFILE_PHOTO_ORIGINAL_DIR, '/') .
                        '/' .
                        $fotoNome;
                    $fotoPreservada = preservarMediaEvidencia($fotoOriginal);
                    $evidenciaMediaNome = $fotoPreservada['nome'];
                    $evidenciaMediaMime = $fotoPreservada['mime'];
                    $evidenciaMediaTamanho = $fotoPreservada['tamanho'];
                    $evidenciaMediaSha256 = $fotoPreservada['sha256'];
                    $ficheiroEvidenciaCriado = $fotoPreservada['caminho'];
                } catch (Throwable) {
                    error_log('[safety] Não foi possível preservar a foto de uma denúncia.');
                }
            }

            $evidencia = [
                'capturada_em' => gmdate(DATE_ATOM),
                'perfil' => [
                    'nome' => (string) ($snapshot['primeiro_nome'] ?? ''),
                    'objetivo' => (string) ($snapshot['objetivo'] ?? ''),
                    'bio' => (string) ($snapshot['bio'] ?? ''),
                    'foto_preservada' => $evidenciaMediaNome !== null,
                    'foto_mime' => $evidenciaMediaMime,
                    'foto_tamanho' => $evidenciaMediaTamanho
                ]
            ];
        }

        $reportId = (string) $db->runSQL('SELECT UUID()')->fetchColumn();

        $db->runSQL(
            'INSERT INTO denuncias (
                id,
                membro_denuncia,
                membro_denunciado,
                motivo,
                mensagem,
                criada_em,
                estado,
                contexto_tipo,
                contexto_id,
                evidencia_json,
                evidencia_media_nome,
                evidencia_media_mime,
                evidencia_media_tamanho,
                evidencia_media_sha256
             ) VALUES (
                :id,
                :membro_id,
                :destinatario_id,
                :motivo,
                :mensagem,
                UTC_TIMESTAMP(6),
                :estado,
                :contexto_tipo,
                :contexto_id,
                :evidencia_json,
                :evidencia_media_nome,
                :evidencia_media_mime,
                :evidencia_media_tamanho,
                :evidencia_media_sha256
             )',
            [
                'id' => $reportId,
                'membro_id' => $membroId,
                'destinatario_id' => $destinatarioId,
                'motivo' => $motivo,
                'mensagem' => $mensagem !== '' ? $mensagem : null,
                'estado' => 'nova',
                'contexto_tipo' => $contextoTipo,
                'contexto_id' => $contextoId,
                'evidencia_json' => json_encode(
                    $evidencia,
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
                ),
                'evidencia_media_nome' => $evidenciaMediaNome,
                'evidencia_media_mime' => $evidenciaMediaMime,
                'evidencia_media_tamanho' => $evidenciaMediaTamanho,
                'evidencia_media_sha256' => $evidenciaMediaSha256
            ]
        );

        responderSeguranca([
            'success' => true,
            'reported' => true,
            'reference' => $reportId
        ]);
    }

    responderSeguranca(['success' => false, 'message' => 'Ação inválida.'], 422);
} catch (Throwable $erro) {
    if (
        is_string($ficheiroEvidenciaCriado) &&
        $ficheiroEvidenciaCriado !== '' &&
        is_file($ficheiroEvidenciaCriado)
    ) {
        @unlink($ficheiroEvidenciaCriado);
    }

    error_log('[safety] ' . $erro->getMessage());
    responderSeguranca(['success' => false, 'message' => 'Não foi possível concluir o pedido.'], 500);
}
