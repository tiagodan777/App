<?php

declare(strict_types=1);

use App\Validate\Validate;
use App\CMS\MemberConnection;

const MENSAGEM_TEXTO_MAXIMO = 2000;
const MENSAGEM_IMAGEM_MAXIMA = 15 * 1024 * 1024;
const MENSAGEM_VIDEO_MAXIMO = 100 * 1024 * 1024;

function responderMensagensJson(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');

    echo json_encode(
        $dados,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_THROW_ON_ERROR
    );

    exit;
}

function responderConversaIndisponivel(
    $twig,
    bool $respostaJson = false
): never {
    if ($respostaJson) {
        responderMensagensJson([
            'success' => false,
            'message' => 'Esta conversa não está disponível.'
        ], 404);
    }

    http_response_code(404);

    header(
        'Cache-Control: no-store, no-cache, must-revalidate'
    );

    header(
        'X-Robots-Tag: noindex, nofollow'
    );

    header(
        'Referrer-Policy: no-referrer'
    );

    echo $twig->render(
        'error-page.html',
        [
            'message' =>
                'Esta conversa não está disponível.'
        ]
    );

    exit;
}

function idMembroMensagensValido(
    string $membroId
): bool {
    return (bool) preg_match(
        '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i',
        $membroId
    );
}

function obterFaixaEtariaMensagens(
    string $nascimento
): ?string {
    return Validate::ageGroup(
        $nascimento
    );
}

function obterMembroBaseMensagens(
    $db,
    string $membroId
): array|false {
    if (
        !idMembroMensagensValido(
            $membroId
        )
    ) {
        return false;
    }

    return $db->runSQL(
        'SELECT id, nascimento
         FROM membros
         WHERE id = :id
         LIMIT 1',
        [
            'id' =>
                $membroId
        ]
    )->fetch();
}

/*
 * Guarda até que mensagem cada utilizador
 * decidiu apagar visualmente uma conversa.
 *
 * Não elimina mensagens_chat e não altera
 * o histórico da outra pessoa.
 */
function prepararTabelaConversasOcultas(
    $db
): void {
    static $preparada =
        false;

    if (
        $preparada
    ) {
        return;
    }

    $db->runSQL(
        'CREATE TABLE IF NOT EXISTS mensagens_conversas_ocultas (
            membro_id VARCHAR(64) NOT NULL,
            outro_id VARCHAR(64) NOT NULL,
            ocultar_ate_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            criada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            atualizada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                ON UPDATE CURRENT_TIMESTAMP(6),

            PRIMARY KEY (membro_id, outro_id),
            KEY idx_mensagens_conversas_ocultas_outro (outro_id)
        )
        ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci'
    );

    $preparada =
        true;
}

function obterCorteConversaMensagens(
    $db,
    string $membroId,
    string $outroId
): int {
    prepararTabelaConversasOcultas(
        $db
    );

    return (int) (
        $db->runSQL(
            'SELECT ocultar_ate_id
             FROM mensagens_conversas_ocultas
             WHERE membro_id = :membro
             AND outro_id = :outro
             LIMIT 1',
            [
                'membro' =>
                    $membroId,

                'outro' =>
                    $outroId
            ]
        )->fetchColumn()
        ?: 0
    );
}

function ocultarConversaMensagens(
    $db,
    string $membroId,
    string $outroId
): int {
    prepararTabelaConversasOcultas(
        $db
    );

    $ultimoId =
        (int) (
            $db->runSQL(
                'SELECT MAX(id)
                 FROM mensagens_chat
                 WHERE (
                     emissor_id = :eu1
                     AND destinatario_id = :outro1
                 )
                 OR (
                     emissor_id = :outro2
                     AND destinatario_id = :eu2
                 )',
                [
                    'eu1' =>
                        $membroId,

                    'outro1' =>
                        $outroId,

                    'outro2' =>
                        $outroId,

                    'eu2' =>
                        $membroId
                ]
            )->fetchColumn()
            ?: 0
        );

    if (
        $ultimoId <=
        0
    ) {
        return 0;
    }

    $db->runSQL(
        'INSERT INTO mensagens_conversas_ocultas (
            membro_id,
            outro_id,
            ocultar_ate_id,
            criada_em,
            atualizada_em
        ) VALUES (
            :membro,
            :outro,
            :ultimo,
            NOW(6),
            NOW(6)
        )
        ON DUPLICATE KEY UPDATE
            ocultar_ate_id =
                GREATEST(
                    ocultar_ate_id,
                    VALUES(ocultar_ate_id)
                ),
            atualizada_em = NOW(6)',
        [
            'membro' =>
                $membroId,

            'outro' =>
                $outroId,

            'ultimo' =>
                $ultimoId
        ]
    );

    return $ultimoId;
}

function existeBloqueioEntreMensagens(
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
            'primeiro1' =>
                $primeiroMembroId,

            'segundo1' =>
                $segundoMembroId,

            'segundo2' =>
                $segundoMembroId,

            'primeiro2' =>
                $primeiroMembroId
        ]
    )->fetchColumn();
}

function existeConversaMensagens(
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
            'primeiro1' =>
                $primeiroMembroId,

            'segundo1' =>
                $segundoMembroId,

            'segundo2' =>
                $segundoMembroId,

            'primeiro2' =>
                $primeiroMembroId
        ]
    )->fetchColumn();
}

function propositoAcessoMensagens(
    string $visualizadorId
): string {
    return 'profile:' .
        substr(
            hash(
                'sha256',
                $visualizadorId
            ),
            0,
            24
        );
}

function validarTokenProximidadeMensagens(
    $db,
    string $visualizadorId,
    string $destinatarioId,
    string $token
): bool {
    $token =
        strtolower(
            trim(
                $token
            )
        );

    if (
        !preg_match(
            '/^[a-f0-9]{64}$/',
            $token
        )
    ) {
        return false;
    }

    return (bool) $db->runSQL(
        'SELECT 1
         FROM token
         WHERE token = :token
         AND membro_id = :destinatario
         AND proposito = :proposito
         AND validade > UTC_TIMESTAMP()
         LIMIT 1',
        [
            'token' =>
                hash(
                    'sha256',
                    $token
                ),

            'destinatario' =>
                $destinatarioId,

            'proposito' =>
                propositoAcessoMensagens(
                    $visualizadorId
                )
        ]
    )->fetchColumn();
}

function membrosEstaoLigadosMensagens(
    $db,
    string $primeiroMembroId,
    string $segundoMembroId
): bool {
    return (new MemberConnection($db))->areConnected(
        $primeiroMembroId,
        $segundoMembroId
    );
}

function outraPessoaJaRespondeuMensagens(
    $db,
    string $membroId,
    string $outroId
): bool {
    $respondeuMensagem = (bool) $db->runSQL(
        'SELECT 1
         FROM mensagens_chat
         WHERE emissor_id = :outro
         AND destinatario_id = :eu
         LIMIT 1',
        [
            'outro' => $outroId,
            'eu' => $membroId
        ]
    )->fetchColumn();

    if ($respondeuMensagem) {
        return true;
    }

    return (bool) $db->runSQL(
        "SELECT 1
         FROM notificacao
         WHERE tipo = 'hey'
         AND emissor_id = :outro
         AND destinatario_id = :eu
         LIMIT 1",
        [
            'outro' => $outroId,
            'eu' => $membroId
        ]
    )->fetchColumn();
}

function contarMensagensEnviadasAntesResposta(
    $db,
    string $membroId,
    string $outroId
): int {
    return (int) $db->runSQL(
        'SELECT COUNT(*)
         FROM mensagens_chat
         WHERE emissor_id = :eu
         AND destinatario_id = :outro',
        [
            'eu' => $membroId,
            'outro' => $outroId
        ]
    )->fetchColumn();
}

function obterContextoConversaMensagens(
    $db,
    string $membroId,
    string $outroId
): array|false {
    if (
        !idMembroMensagensValido(
            $membroId
        ) ||
        !idMembroMensagensValido(
            $outroId
        ) ||
        hash_equals(
            $membroId,
            $outroId
        )
    ) {
        return false;
    }

    $membro =
        obterMembroBaseMensagens(
            $db,
            $membroId
        );

    $outro =
        obterMembroBaseMensagens(
            $db,
            $outroId
        );

    if (
        !$membro ||
        !$outro
    ) {
        return false;
    }

    $membroId =
        (string) $membro['id'];

    $outroId =
        (string) $outro['id'];

    $faixaMembro =
        obterFaixaEtariaMensagens(
            (string) (
                $membro['nascimento']
                ?? ''
            )
        );

    $faixaOutro =
        obterFaixaEtariaMensagens(
            (string) (
                $outro['nascimento']
                ?? ''
            )
        );

    if (
        $faixaMembro ===
            null ||
        $faixaOutro ===
            null ||
        $faixaMembro !==
            $faixaOutro
    ) {
        return false;
    }

    if (
        existeBloqueioEntreMensagens(
            $db,
            $membroId,
            $outroId
        )
    ) {
        return false;
    }

    return [
        'membro_id' =>
            $membroId,

        'outro_id' =>
            $outroId,

        'faixa_etaria' =>
            $faixaMembro,

        'conversa_existente' =>
            existeConversaMensagens(
                $db,
                $membroId,
                $outroId
            ),

        'ligados' =>
            membrosEstaoLigadosMensagens(
                $db,
                $membroId,
                $outroId
            )
    ];
}

function condicaoSqlFaixaEtariaMensagens(
    string $faixaEtaria,
    string $alias
): string {
    if (
        $faixaEtaria !==
        Validate::ADULT_GROUP
    ) {
        return '(1 = 0)';
    }

    return Validate::adultSqlCondition(
        $alias
    );
}

function obterMembroChat(
    $db,
    string $membroId
): array|false {
    $sql =
        "SELECT
            m.id,
            CONCAT(
                m.primeiro_nome,
                ' ',
                m.ultimo_nome
            ) AS nome,

            COALESCE(
                (
                    SELECT
                        fp.nome_arquivo
                    FROM fotos_perfil fp
                    WHERE
                        fp.membro_id
                            COLLATE utf8mb4_unicode_ci =
                        m.id
                            COLLATE utf8mb4_unicode_ci
                    AND (
                        fp.status = 'completo'
                        OR fp.status IS NULL
                    )
                    ORDER BY
                        fp.ordem IS NULL ASC,
                        fp.ordem ASC,
                        fp.id ASC
                    LIMIT 1
                ),
                'default.webp'
            ) AS foto

        FROM membros m

        WHERE
            m.id
                COLLATE utf8mb4_unicode_ci =
            :id
                COLLATE utf8mb4_unicode_ci

        LIMIT 1";

    $membro =
        $db->runSQL(
            $sql,
            [
                'id' =>
                    $membroId
            ]
        )->fetch();

    if (
        !$membro
    ) {
        return false;
    }

    $foto =
        basename(
            trim(
                (string) $membro['foto']
            )
        )
        ?: 'default.webp';

    $membro['foto_url'] =
        DOC_ROOT .
        'imagens/fotos-perfil/' .
        rawurlencode(
            $foto
        );

    $membro['perfil_url'] =
        DOC_ROOT .
        'profile/' .
        rawurlencode(
            (string) $membro['id']
        );

    unset(
        $membro['foto']
    );

    return $membro;
}

function prepararTabelaReacoesMensagens(
    $db
): void {
    static $preparada = false;

    if ($preparada) {
        return;
    }

    $db->runSQL(
        'CREATE TABLE IF NOT EXISTS mensagens_reacoes (
            mensagem_id BIGINT UNSIGNED NOT NULL,
            membro_id VARCHAR(64) NOT NULL,
            emoji VARCHAR(16) NOT NULL,
            atualizada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                ON UPDATE CURRENT_TIMESTAMP(6),

            PRIMARY KEY (mensagem_id, membro_id),
            KEY idx_mensagens_reacoes_membro (membro_id),
            KEY idx_mensagens_reacoes_atualizada (atualizada_em)
        )
        ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci'
    );

    $preparada = true;
}

function emojisPermitidosMensagens(): array
{
    return [
        '❤️',
        '😂',
        '😮',
        '😢',
        '😍',
        '🔥'
    ];
}

function mensagemPertenceConversa(
    $db,
    int $mensagemId,
    string $membroId,
    string $outroId
): bool {
    return (bool) $db->runSQL(
        'SELECT 1
         FROM mensagens_chat
         WHERE id = :mensagem
         AND (
             (
                 emissor_id = :eu1
                 AND destinatario_id = :outro1
             )
             OR (
                 emissor_id = :outro2
                 AND destinatario_id = :eu2
             )
         )
         LIMIT 1',
        [
            'mensagem' => $mensagemId,
            'eu1' => $membroId,
            'outro1' => $outroId,
            'outro2' => $outroId,
            'eu2' => $membroId
        ]
    )->fetchColumn();
}

function obterReacoesMensagem(
    $db,
    int $mensagemId
): array {
    prepararTabelaReacoesMensagens($db);

    $linhas = $db->runSQL(
        'SELECT membro_id, emoji
         FROM mensagens_reacoes
         WHERE mensagem_id = :mensagem
         ORDER BY atualizada_em ASC, membro_id ASC',
        [
            'mensagem' => $mensagemId
        ]
    )->fetchAll();

    return array_values(
        array_map(
            static fn(array $linha): array => [
                'member_id' => (string) ($linha['membro_id'] ?? ''),
                'emoji' => (string) ($linha['emoji'] ?? '')
            ],
            $linhas
        )
    );
}

function anexarReacoesMensagens(
    $db,
    array $mensagens
): array {
    prepararTabelaReacoesMensagens($db);

    if ($mensagens === []) {
        return [];
    }

    $ids = [];

    foreach ($mensagens as $mensagem) {
        $id = (int) ($mensagem['id'] ?? 0);

        if ($id > 0) {
            $ids[$id] = true;
        }
    }

    if ($ids === []) {
        return $mensagens;
    }

    $parametros = [];
    $marcadores = [];

    foreach (array_keys($ids) as $indice => $id) {
        $chave = 'reacao_id_' . $indice;
        $marcadores[] = ':' . $chave;
        $parametros[$chave] = (int) $id;
    }

    $linhas = $db->runSQL(
        'SELECT mensagem_id, membro_id, emoji
         FROM mensagens_reacoes
         WHERE mensagem_id IN (' . implode(', ', $marcadores) . ')
         ORDER BY mensagem_id ASC, atualizada_em ASC, membro_id ASC',
        $parametros
    )->fetchAll();

    $porMensagem = [];

    foreach ($linhas as $linha) {
        $mensagemId = (int) ($linha['mensagem_id'] ?? 0);

        if ($mensagemId <= 0) {
            continue;
        }

        $porMensagem[$mensagemId] ??= [];
        $porMensagem[$mensagemId][] = [
            'member_id' => (string) ($linha['membro_id'] ?? ''),
            'emoji' => (string) ($linha['emoji'] ?? '')
        ];
    }

    foreach ($mensagens as &$mensagem) {
        $mensagemId = (int) ($mensagem['id'] ?? 0);
        $mensagem['reactions'] = $porMensagem[$mensagemId] ?? [];
    }
    unset($mensagem);

    return $mensagens;
}

function guardarReacaoMensagem(
    $db,
    int $mensagemId,
    string $membroId,
    string $emoji,
    bool $alternar
): array {
    prepararTabelaReacoesMensagens($db);

    if (!in_array($emoji, emojisPermitidosMensagens(), true)) {
        throw new InvalidArgumentException('Reação inválida.');
    }

    $existente = (string) (
        $db->runSQL(
            'SELECT emoji
             FROM mensagens_reacoes
             WHERE mensagem_id = :mensagem
             AND membro_id = :membro
             LIMIT 1',
            [
                'mensagem' => $mensagemId,
                'membro' => $membroId
            ]
        )->fetchColumn()
        ?: ''
    );

    if ($alternar && $existente === $emoji) {
        $db->runSQL(
            'DELETE FROM mensagens_reacoes
             WHERE mensagem_id = :mensagem
             AND membro_id = :membro',
            [
                'mensagem' => $mensagemId,
                'membro' => $membroId
            ]
        );
    } else {
        $db->runSQL(
            'INSERT INTO mensagens_reacoes (
                mensagem_id,
                membro_id,
                emoji,
                atualizada_em
             ) VALUES (
                :mensagem,
                :membro,
                :emoji,
                NOW(6)
             )
             ON DUPLICATE KEY UPDATE
                emoji = VALUES(emoji),
                atualizada_em = NOW(6)',
            [
                'mensagem' => $mensagemId,
                'membro' => $membroId,
                'emoji' => $emoji
            ]
        );
    }

    return obterReacoesMensagem($db, $mensagemId);
}

function prepararTabelaMensagensApagadas(
    $db
): void {
    static $preparada = false;

    if ($preparada) {
        return;
    }

    $db->runSQL(
        'CREATE TABLE IF NOT EXISTS mensagens_apagadas (
            mensagem_id BIGINT UNSIGNED NOT NULL,
            emissor_id VARCHAR(64) NOT NULL,
            destinatario_id VARCHAR(64) NOT NULL,
            apagada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

            PRIMARY KEY (mensagem_id),
            KEY idx_mensagens_apagadas_emissor (emissor_id),
            KEY idx_mensagens_apagadas_destinatario (destinatario_id),
            KEY idx_mensagens_apagadas_data (apagada_em)
        )
        ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci'
    );

    $preparada = true;
}

function apagarMensagemEnviada(
    $db,
    int $mensagemId,
    string $membroId,
    string $outroId
): array|false {
    $mensagem = $db->runSQL(
        'SELECT
            id,
            emissor_id,
            destinatario_id,
            ficheiro_nome
         FROM mensagens_chat
         WHERE id = :mensagem
         AND (
             (
                 emissor_id = :eu1
                 AND destinatario_id = :outro1
             )
             OR (
                 emissor_id = :outro2
                 AND destinatario_id = :eu2
             )
         )
         LIMIT 1',
        [
            'mensagem' => $mensagemId,
            'eu1' => $membroId,
            'outro1' => $outroId,
            'outro2' => $outroId,
            'eu2' => $membroId
        ]
    )->fetch();

    if (!$mensagem) {
        return false;
    }

    if (
        (string) ($mensagem['emissor_id'] ?? '') !==
        $membroId
    ) {
        throw new InvalidArgumentException(
            'Só podes apagar mensagens que enviaste.'
        );
    }

    prepararTabelaReacoesMensagens($db);
    prepararTabelaMensagensApagadas($db);

    $ficheiro = basename(
        trim(
            (string) (
                $mensagem['ficheiro_nome']
                ?? ''
            )
        )
    );

    $db->beginTransaction();

    try {
        $db->runSQL(
            'INSERT INTO mensagens_apagadas (
                mensagem_id,
                emissor_id,
                destinatario_id,
                apagada_em
             ) VALUES (
                :mensagem,
                :emissor,
                :destinatario,
                NOW(6)
             )
             ON DUPLICATE KEY UPDATE
                emissor_id = VALUES(emissor_id),
                destinatario_id = VALUES(destinatario_id),
                apagada_em = NOW(6)',
            [
                'mensagem' => $mensagemId,
                'emissor' => $membroId,
                'destinatario' => $outroId
            ]
        );

        $db->runSQL(
            'DELETE FROM mensagens_reacoes
             WHERE mensagem_id = :mensagem',
            [
                'mensagem' => $mensagemId
            ]
        );

        $eliminada = $db->runSQL(
            'DELETE FROM mensagens_chat
             WHERE id = :mensagem
             AND emissor_id = :emissor
             AND destinatario_id = :destinatario',
            [
                'mensagem' => $mensagemId,
                'emissor' => $membroId,
                'destinatario' => $outroId
            ]
        );

        if ($eliminada->rowCount() !== 1) {
            throw new RuntimeException(
                'A mensagem já não existe.'
            );
        }

        $db->commit();
    } catch (Throwable $erro) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $erro;
    }

    if ($ficheiro !== '') {
        $caminho =
            APP_ROOT .
            '/public/media/mensagens/' .
            $ficheiro;

        if (is_file($caminho)) {
            @unlink($caminho);
        }
    }

    return [
        'id' => $mensagemId,
        'emissor_id' => $membroId,
        'destinatario_id' => $outroId
    ];
}

function sqlMensagemBase(): string
{
    return "
        SELECT
            msg.id,
            msg.emissor_id,
            msg.destinatario_id,
            msg.texto,
            msg.tipo,
            msg.ficheiro_nome,
            msg.ficheiro_mime,
            msg.ficheiro_tamanho,
            msg.lida,
            msg.criada_em,
            msg.lida_em,

            CONCAT(
                em.primeiro_nome,
                ' ',
                em.ultimo_nome
            ) AS emissor_nome,

            COALESCE(
                (
                    SELECT
                        fp.nome_arquivo

                    FROM fotos_perfil fp

                    WHERE
                        fp.membro_id
                            COLLATE utf8mb4_unicode_ci =
                        em.id
                            COLLATE utf8mb4_unicode_ci

                    AND (
                        fp.status = 'completo'
                        OR fp.status IS NULL
                    )

                    ORDER BY
                        fp.ordem IS NULL ASC,
                        fp.ordem ASC,
                        fp.id ASC

                    LIMIT 1
                ),
                'default.webp'
            ) AS emissor_foto

        FROM mensagens_chat msg

        INNER JOIN membros em
            ON em.id
                COLLATE utf8mb4_unicode_ci =
               msg.emissor_id
                COLLATE utf8mb4_unicode_ci
    ";
}

function prepararMensagem(
    array $mensagem,
    string $membroId
): array {
    $ficheiro =
        basename(
            trim(
                (string) (
                    $mensagem['ficheiro_nome']
                    ?? ''
                )
            )
        );

    $foto =
        basename(
            trim(
                (string) (
                    $mensagem['emissor_foto']
                    ?? 'default.webp'
                )
            )
        )
        ?: 'default.webp';

    $mensagem['id'] =
        (int) $mensagem['id'];

    $mensagem['lida'] =
        (bool) $mensagem['lida'];

    $mensagem['minha'] =
        (string) $mensagem['emissor_id'] ===
        $membroId;

    $mensagem['texto'] =
        (string) (
            $mensagem['texto']
            ?? ''
        );

    $mensagem['media_url'] =
        $ficheiro ===
        ''
            ? null
            : DOC_ROOT .
                'media/mensagens/' .
                rawurlencode(
                    $ficheiro
                );

    $mensagem['emissor_foto_url'] =
        DOC_ROOT .
        'imagens/fotos-perfil/' .
        rawurlencode(
            $foto
        );

    $mensagem['emissor_perfil_url'] =
        DOC_ROOT .
        'profile/' .
        rawurlencode(
            (string) $mensagem['emissor_id']
        );

    unset(
        $mensagem['ficheiro_nome'],
        $mensagem['emissor_foto']
    );

    return $mensagem;
}

function obterMensagem(
    $db,
    int $mensagemId,
    string $membroId
): array|false {
    $sql =
        sqlMensagemBase() .
        "
        WHERE msg.id = :id

        AND (
            msg.emissor_id = :membro1
            OR msg.destinatario_id = :membro2
        )

        LIMIT 1
        ";

    $mensagem =
        $db->runSQL(
            $sql,
            [
                'id' =>
                    $mensagemId,

                'membro1' =>
                    $membroId,

                'membro2' =>
                    $membroId
            ]
        )->fetch();

    if (!$mensagem) {
        return false;
    }

    $preparada = prepararMensagem(
        $mensagem,
        $membroId
    );

    $comReacoes = anexarReacoesMensagens(
        $db,
        [$preparada]
    );

    return $comReacoes[0] ?? $preparada;
}

function obterHistorico(
    $db,
    string $membroId,
    string $outroId,
    int $depoisDe = 0
): array {
    $corte =
        obterCorteConversaMensagens(
            $db,
            $membroId,
            $outroId
        );

    $depoisDe =
        max(
            $depoisDe,
            $corte
        );

    $sql =
        sqlMensagemBase() .
        "
        WHERE (
            (
                msg.emissor_id = :eu1
                AND msg.destinatario_id = :outro1
            )
            OR
            (
                msg.emissor_id = :outro2
                AND msg.destinatario_id = :eu2
            )
        )
        ";

    $parametros = [
        'eu1' =>
            $membroId,

        'outro1' =>
            $outroId,

        'outro2' =>
            $outroId,

        'eu2' =>
            $membroId
    ];

    if (
        $depoisDe >
        0
    ) {
        $sql .=
            '
            AND msg.id > :depois
            ORDER BY msg.id ASC
            LIMIT 100
            ';

        $parametros['depois'] =
            $depoisDe;
    } else {
        $sql .=
            '
            ORDER BY msg.id DESC
            LIMIT 100
            ';
    }

    $mensagens =
        $db->runSQL(
            $sql,
            $parametros
        )->fetchAll();

    if (
        $depoisDe ===
        0
    ) {
        $mensagens =
            array_reverse(
                $mensagens
            );
    }

    $preparadas = array_map(
        static fn(
            array $mensagem
        ): array =>
            prepararMensagem(
                $mensagem,
                $membroId
            ),

        $mensagens
    );

    return anexarReacoesMensagens(
        $db,
        $preparadas
    );
}

function obterConversas(
    $db,
    string $membroId
): array {
    prepararTabelaConversasOcultas(
        $db
    );

    $membro =
        obterMembroBaseMensagens(
            $db,
            $membroId
        );

    if (
        !$membro
    ) {
        return [];
    }

    $faixaEtaria =
        obterFaixaEtariaMensagens(
            (string) (
                $membro['nascimento']
                ?? ''
            )
        );

    if (
        $faixaEtaria ===
        null
    ) {
        return [];
    }

    $condicaoFaixaEtaria =
        condicaoSqlFaixaEtariaMensagens(
            $faixaEtaria,
            'p'
        );

    $sql =
        "SELECT
            ultima.id,
            ultima.emissor_id,
            ultima.destinatario_id,
            ultima.texto,
            ultima.tipo,
            ultima.criada_em,

            conversa.outro_id,

            CONCAT(
                p.primeiro_nome,
                ' ',
                p.ultimo_nome
            ) AS outro_nome,

            COALESCE(
                (
                    SELECT
                        fp.nome_arquivo
                    FROM fotos_perfil fp
                    WHERE
                        fp.membro_id
                            COLLATE utf8mb4_unicode_ci =
                        p.id
                            COLLATE utf8mb4_unicode_ci
                    AND (
                        fp.status = 'completo'
                        OR fp.status IS NULL
                    )
                    ORDER BY
                        fp.ordem IS NULL ASC,
                        fp.ordem ASC,
                        fp.id ASC
                    LIMIT 1
                ),
                'default.webp'
            ) AS outro_foto,

            (
                SELECT COUNT(*)
                FROM mensagens_chat nao_lida
                WHERE
                    nao_lida.emissor_id =
                        conversa.outro_id
                AND nao_lida.destinatario_id =
                        :eu4
                AND nao_lida.lida = 0
                AND nao_lida.id >
                    COALESCE(
                        ocultada.ocultar_ate_id,
                        0
                    )
            ) AS nao_lidas

        FROM (
            SELECT
                participacao.outro_id,
                MAX(participacao.id) AS ultima_id

            FROM (
                SELECT
                    id,
                    destinatario_id AS outro_id
                FROM mensagens_chat
                WHERE emissor_id = :eu1

                UNION ALL

                SELECT
                    id,
                    emissor_id AS outro_id
                FROM mensagens_chat
                WHERE destinatario_id = :eu2
            ) participacao

            GROUP BY
                participacao.outro_id
        ) conversa

        INNER JOIN mensagens_chat ultima
            ON ultima.id =
                conversa.ultima_id

        INNER JOIN membros p
            ON p.id
                COLLATE utf8mb4_unicode_ci =
               conversa.outro_id
                COLLATE utf8mb4_unicode_ci

        LEFT JOIN mensagens_conversas_ocultas ocultada
            ON ocultada.membro_id =
                :eu7
            AND ocultada.outro_id
                COLLATE utf8mb4_unicode_ci =
                conversa.outro_id
                COLLATE utf8mb4_unicode_ci

        WHERE {$condicaoFaixaEtaria}

        AND ultima.id >
            COALESCE(
                ocultada.ocultar_ate_id,
                0
            )

        AND NOT EXISTS (
            SELECT 1

            FROM bloqueados b

            WHERE (
                b.pessoa_bloqueou_id =
                    :eu5

                AND b.pessoa_bloqueada_id
                    COLLATE utf8mb4_unicode_ci =
                    conversa.outro_id
                    COLLATE utf8mb4_unicode_ci
            )

            OR (
                b.pessoa_bloqueou_id
                    COLLATE utf8mb4_unicode_ci =
                    conversa.outro_id
                    COLLATE utf8mb4_unicode_ci

                AND b.pessoa_bloqueada_id =
                    :eu6
            )
        )

        ORDER BY
            ultima.id DESC

        LIMIT 100";

    $linhas =
        $db->runSQL(
            $sql,
            [
                'eu1' =>
                    $membroId,

                'eu2' =>
                    $membroId,

                'eu4' =>
                    $membroId,

                'eu5' =>
                    $membroId,

                'eu6' =>
                    $membroId,

                'eu7' =>
                    $membroId
            ]
        )->fetchAll();

    $conversas = array_map(
        static function (
            array $linha
        ) use (
            $membroId
        ): array {
            $foto =
                basename(
                    trim(
                        (string) $linha['outro_foto']
                    )
                )
                ?: 'default.webp';

            $texto =
                trim(
                    (string) (
                        $linha['texto']
                        ?? ''
                    )
                );

            if (
                $texto ===
                ''
            ) {
                $texto =
                    match (
                        $linha['tipo']
                    ) {
                        'imagem' =>
                            'Fotografia',

                        'video' =>
                            'Vídeo',

                        default =>
                            'Mensagem'
                    };
            }

            if (
                (string) $linha['emissor_id'] ===
                $membroId
            ) {
                $texto =
                    'Tu: ' .
                    $texto;
            }

            return [
                'id' =>
                    (int) $linha['id'],

                'outro_id' =>
                    (string) $linha['outro_id'],

                'outro_nome' =>
                    (string) $linha['outro_nome'],

                'outro_foto_url' =>
                    DOC_ROOT .
                    'imagens/fotos-perfil/' .
                    rawurlencode(
                        $foto
                    ),

                'chat_url' =>
                    DOC_ROOT .
                    'messages/' .
                    rawurlencode(
                        (string) $linha['outro_id']
                    ),

                'perfil_url' =>
                    DOC_ROOT .
                    'profile/' .
                    rawurlencode(
                        (string) $linha['outro_id']
                    ),

                'resumo' =>
                    $texto,

                'criada_em' =>
                    (string) $linha['criada_em'],

                'nao_lidas' =>
                    (int) $linha['nao_lidas']
            ];
        },

        $linhas
    );

    $idsVisiveis = [];

    foreach ($conversas as $conversa) {
        $idsVisiveis[(string) $conversa['outro_id']] = true;
    }

    $ligacoes = (new MemberConnection($db))->connectionsFor($membroId);

    foreach ($ligacoes as $ligacao) {
        $outroId = trim((string) ($ligacao['outro_id'] ?? ''));

        if (
            $outroId === '' ||
            isset($idsVisiveis[$outroId]) ||
            existeBloqueioEntreMensagens($db, $membroId, $outroId)
        ) {
            continue;
        }

        $outro = obterMembroChat($db, $outroId);

        if (!$outro) {
            continue;
        }

        $conversas[] = [
            'id' => 0,
            'outro_id' => $outroId,
            'outro_nome' => (string) $outro['nome'],
            'outro_foto_url' => (string) $outro['foto_url'],
            'chat_url' => DOC_ROOT . 'messages/' . rawurlencode($outroId),
            'perfil_url' => (string) $outro['perfil_url'],
            'resumo' => 'Ligados na Margot',
            'criada_em' => (string) ($ligacao['criada_em'] ?? ''),
            'nao_lidas' => 0,
            'ligados' => true
        ];

        $idsVisiveis[$outroId] = true;
    }

    usort(
        $conversas,
        static fn(array $a, array $b): int =>
            strcmp((string) ($b['criada_em'] ?? ''), (string) ($a['criada_em'] ?? ''))
    );

    return array_slice($conversas, 0, 100);
}

function contarMensagensNaoLidas(
    $db,
    string $membroId
): int {
    prepararTabelaConversasOcultas(
        $db
    );

    $membro =
        obterMembroBaseMensagens(
            $db,
            $membroId
        );

    if (
        !$membro
    ) {
        return 0;
    }

    $faixaEtaria =
        obterFaixaEtariaMensagens(
            (string) (
                $membro['nascimento']
                ?? ''
            )
        );

    if (
        $faixaEtaria ===
        null
    ) {
        return 0;
    }

    $condicaoFaixaEtaria =
        condicaoSqlFaixaEtariaMensagens(
            $faixaEtaria,
            'em'
        );

    return (int) $db->runSQL(
        "SELECT COUNT(*)

         FROM mensagens_chat msg

         INNER JOIN membros em
             ON em.id
                COLLATE utf8mb4_unicode_ci =
                msg.emissor_id
                COLLATE utf8mb4_unicode_ci

         WHERE
             msg.destinatario_id = :id

         AND msg.lida = 0

         AND {$condicaoFaixaEtaria}

         AND msg.id >
             COALESCE(
                 (
                     SELECT
                         ocultada.ocultar_ate_id

                     FROM mensagens_conversas_ocultas ocultada

                     WHERE
                         ocultada.membro_id =
                             :eu3

                     AND ocultada.outro_id
                         COLLATE utf8mb4_unicode_ci =
                         msg.emissor_id
                         COLLATE utf8mb4_unicode_ci

                     LIMIT 1
                 ),
                 0
             )

         AND NOT EXISTS (
             SELECT 1

             FROM bloqueados b

             WHERE (
                 b.pessoa_bloqueou_id =
                     :eu1

                 AND b.pessoa_bloqueada_id
                     COLLATE utf8mb4_unicode_ci =
                     msg.emissor_id
                     COLLATE utf8mb4_unicode_ci
             )

             OR (
                 b.pessoa_bloqueou_id
                     COLLATE utf8mb4_unicode_ci =
                     msg.emissor_id
                     COLLATE utf8mb4_unicode_ci

                 AND b.pessoa_bloqueada_id =
                     :eu2
             )
         )",
        [
            'id' =>
                $membroId,

            'eu1' =>
                $membroId,

            'eu2' =>
                $membroId,

            'eu3' =>
                $membroId
        ]
    )->fetchColumn();
}

function converterImagemIphoneParaWebp(
    string $origem,
    string $destino
): void {
    if (
        !class_exists(
            Imagick::class
        )
    ) {
        throw new RuntimeException(
            'O servidor não consegue converter fotografias HEIC/HEIF.'
        );
    }

    $imagem =
        null;

    try {
        $imagem =
            new Imagick(
                $origem
            );

        if (
            $imagem->getNumberImages() >
            1
        ) {
            $imagem->setIteratorIndex(
                0
            );
        }

        $imagem->autoOrient();

        $imagem->transformImageColorspace(
            Imagick::COLORSPACE_SRGB
        );

        if (
            $imagem->getImageWidth() >
                2400 ||
            $imagem->getImageHeight() >
                2400
        ) {
            $imagem->thumbnailImage(
                2400,
                2400,
                true,
                true
            );
        }

        $imagem->setImageFormat(
            'webp'
        );

        $imagem->setImageCompressionQuality(
            86
        );

        $imagem->stripImage();

        if (
            !$imagem->writeImage(
                $destino
            )
        ) {
            throw new RuntimeException(
                'Não foi possível converter a fotografia.'
            );
        }
    } catch (
        Throwable $erro
    ) {
        if (
            is_file(
                $destino
            )
        ) {
            @unlink(
                $destino
            );
        }

        throw new RuntimeException(
            'Não foi possível converter a fotografia HEIC/HEIF.',
            0,
            $erro
        );
    } finally {
        if (
            $imagem instanceof
            Imagick
        ) {
            $imagem->clear();
            $imagem->destroy();
        }
    }
}

function guardarMediaMensagem(
    array $ficheiro
): array {
    $erro =
        (int) (
            $ficheiro['error']
            ?? UPLOAD_ERR_NO_FILE
        );

    if (
        $erro ===
        UPLOAD_ERR_NO_FILE
    ) {
        return [];
    }

    if (
        $erro !==
        UPLOAD_ERR_OK
    ) {
        throw new RuntimeException(
            'O ficheiro não foi enviado completamente.'
        );
    }

    $temporario =
        (string) (
            $ficheiro['tmp_name']
            ?? ''
        );

    $tamanho =
        (int) (
            $ficheiro['size']
            ?? 0
        );

    if (
        $temporario ===
            '' ||
        !is_uploaded_file(
            $temporario
        )
    ) {
        throw new RuntimeException(
            'O ficheiro recebido não é válido.'
        );
    }

    $mime =
        (
            new finfo(
                FILEINFO_MIME_TYPE
            )
        )->file(
            $temporario
        );

    $tipos = [
        'image/jpeg' =>
            ['imagem', 'jpg'],

        'image/png' =>
            ['imagem', 'png'],

        'image/webp' =>
            ['imagem', 'webp'],

        'image/gif' =>
            ['imagem', 'gif'],

        'image/avif' =>
            ['imagem', 'avif'],

        'image/heic' =>
            ['imagem', 'heic'],

        'image/heif' =>
            ['imagem', 'heif'],

        'video/mp4' =>
            ['video', 'mp4'],

        'video/webm' =>
            ['video', 'webm'],

        'video/quicktime' =>
            ['video', 'mov'],

        'video/x-m4v' =>
            ['video', 'm4v']
    ];

    if (
        !is_string(
            $mime
        ) ||
        !isset(
            $tipos[$mime]
        )
    ) {
        throw new RuntimeException(
            'Só podes enviar fotografias ou vídeos.'
        );
    }

    [
        $tipo,
        $extensao
    ] =
        $tipos[$mime];

    $limite =
        $tipo ===
        'imagem'
            ? MENSAGEM_IMAGEM_MAXIMA
            : MENSAGEM_VIDEO_MAXIMO;

    if (
        $tamanho <=
            0 ||
        $tamanho >
            $limite
    ) {
        throw new RuntimeException(
            $tipo ===
            'imagem'
                ? 'A fotografia pode ter no máximo 15 MB.'
                : 'O vídeo pode ter no máximo 100 MB.'
        );
    }

    $pasta =
        APP_ROOT .
        '/public/media/mensagens/';

    if (
        !is_dir(
            $pasta
        ) &&
        !mkdir(
            $pasta,
            0775,
            true
        ) &&
        !is_dir(
            $pasta
        )
    ) {
        throw new RuntimeException(
            'Não foi possível preparar a pasta das mensagens.'
        );
    }

    $imagemIphone =
        $mime ===
            'image/heic' ||
        $mime ===
            'image/heif';

    if (
        $imagemIphone
    ) {
        $extensao =
            'webp';

        $mime =
            'image/webp';
    }

    $nome =
        bin2hex(
            random_bytes(
                20
            )
        ) .
        '.' .
        $extensao;

    $destino =
        $pasta .
        $nome;

    if (
        $imagemIphone
    ) {
        converterImagemIphoneParaWebp(
            $temporario,
            $destino
        );

        $tamanho =
            (int) filesize(
                $destino
            );
    } elseif (
        !move_uploaded_file(
            $temporario,
            $destino
        )
    ) {
        throw new RuntimeException(
            'Não foi possível guardar o ficheiro.'
        );
    }

    @chmod(
        $destino,
        0664
    );

    return [
        'tipo' =>
            $tipo,

        'nome' =>
            $nome,

        'mime' =>
            $mime,

        'tamanho' =>
            $tamanho,

        'caminho' =>
            $destino
    ];
}

$membroId =
    trim(
        (string) (
            $session->id
            ?? ''
        )
    );

$outroId =
    trim(
        (string) (
            $id
            ?? ''
        )
    );

$api =
    trim(
        (string) (
            $_GET['api']
            ?? ''
        )
    );

$metodo =
    strtoupper(
        (string) (
            $_SERVER['REQUEST_METHOD']
            ?? 'GET'
        )
    );

if (
    $membroId ===
    ''
) {
    if (
        $api !==
            '' ||
        $metodo ===
            'POST'
    ) {
        responderMensagensJson(
            [
                'success' =>
                    false,

                'message' =>
                    'A sessão terminou.'
            ],
            401
        );
    }

    header(
        'Location: ' .
        DOC_ROOT .
        'login'
    );

    exit;
}

try {
    prepararTabelaConversasOcultas(
        $db
    );

    prepararTabelaReacoesMensagens(
        $db
    );

    if (
        $metodo ===
        'POST'
    ) {
        $acao =
            trim(
                (string) (
                    $_POST['action']
                    ?? 'send'
                )
            );

        $contexto =
            obterContextoConversaMensagens(
                $db,
                $membroId,
                $outroId
            );

        if (
            !$contexto
        ) {
            responderConversaIndisponivel(
                $twig,
                true
            );
        }

        $membroId =
            (string) $contexto['membro_id'];

        $outroId =
            (string) $contexto['outro_id'];

        $conversaExistente =
            (bool) $contexto['conversa_existente'];

        $ligados =
            (bool) ($contexto['ligados'] ?? false);

        if (
            $acao ===
            'mark_read'
        ) {
            if (
                !$conversaExistente &&
                !$ligados
            ) {
                responderConversaIndisponivel(
                    $twig,
                    true
                );
            }

            $db->runSQL(
                'UPDATE mensagens_chat

                 SET
                     lida = 1,
                     lida_em =
                         COALESCE(
                             lida_em,
                             NOW(6)
                         )

                 WHERE
                     emissor_id = :outro

                 AND destinatario_id = :eu

                 AND lida = 0',
                [
                    'outro' =>
                        $outroId,

                    'eu' =>
                        $membroId
                ]
            );

            responderMensagensJson([
                'success' =>
                    true,

                'unread_count' =>
                    contarMensagensNaoLidas(
                        $db,
                        $membroId
                    )
            ]);
        }

        if (
            $acao ===
            'delete_conversation'
        ) {
            if (
                !$conversaExistente
            ) {
                responderConversaIndisponivel(
                    $twig,
                    true
                );
            }

            $ocultadaAte =
                ocultarConversaMensagens(
                    $db,
                    $membroId,
                    $outroId
                );

            responderMensagensJson([
                'success' =>
                    true,

                'deleted' =>
                    true,

                'hidden_until_id' =>
                    $ocultadaAte,

                'unread_count' =>
                    contarMensagensNaoLidas(
                        $db,
                        $membroId
                    )
            ]);
        }

        if (
            $acao ===
            'delete_message'
        ) {
            if (
                !$conversaExistente &&
                !$ligados
            ) {
                responderConversaIndisponivel(
                    $twig,
                    true
                );
            }

            $mensagemId = filter_var(
                $_POST['message_id'] ?? null,
                FILTER_VALIDATE_INT
            );

            if (
                $mensagemId === false ||
                $mensagemId < 1
            ) {
                responderMensagensJson(
                    [
                        'success' => false,
                        'message' => 'A mensagem não é válida.'
                    ],
                    422
                );
            }

            try {
                $apagada = apagarMensagemEnviada(
                    $db,
                    (int) $mensagemId,
                    $membroId,
                    $outroId
                );
            } catch (InvalidArgumentException $erro) {
                responderMensagensJson(
                    [
                        'success' => false,
                        'message' => $erro->getMessage()
                    ],
                    403
                );
            }

            if (!$apagada) {
                responderMensagensJson(
                    [
                        'success' => false,
                        'message' => 'A mensagem já não existe.'
                    ],
                    404
                );
            }

            responderMensagensJson([
                'success' => true,
                'deleted' => true,
                'message_id' => (int) $mensagemId,
                'unread_count' => contarMensagensNaoLidas(
                    $db,
                    $membroId
                )
            ]);
        }

        if (
            $acao ===
            'react'
        ) {
            if (
                !$conversaExistente &&
                !$ligados
            ) {
                responderConversaIndisponivel(
                    $twig,
                    true
                );
            }

            $mensagemId = filter_var(
                $_POST['message_id'] ?? null,
                FILTER_VALIDATE_INT
            );

            $emoji = trim(
                (string) (
                    $_POST['emoji']
                    ?? ''
                )
            );

            $alternar = filter_var(
                $_POST['toggle'] ?? false,
                FILTER_VALIDATE_BOOLEAN
            );

            if (
                $mensagemId === false ||
                $mensagemId < 1 ||
                !mensagemPertenceConversa(
                    $db,
                    (int) $mensagemId,
                    $membroId,
                    $outroId
                )
            ) {
                responderMensagensJson(
                    [
                        'success' => false,
                        'message' => 'A mensagem não é válida.'
                    ],
                    422
                );
            }

            if (
                !in_array(
                    $emoji,
                    emojisPermitidosMensagens(),
                    true
                )
            ) {
                responderMensagensJson(
                    [
                        'success' => false,
                        'message' => 'A reação não é válida.'
                    ],
                    422
                );
            }

            $reacoes = guardarReacaoMensagem(
                $db,
                (int) $mensagemId,
                $membroId,
                $emoji,
                $alternar
            );

            responderMensagensJson([
                'success' => true,
                'message_id' => (int) $mensagemId,
                'reactions' => $reacoes
            ]);
        }

        if (
            $acao !==
            'send'
        ) {
            responderMensagensJson(
                [
                    'success' =>
                        false,

                    'message' =>
                        'Ação inválida.'
                ],
                422
            );
        }

        if (
            !$ligados &&
            !validarTokenProximidadeMensagens(
                $db,
                $membroId,
                $outroId,
                (string) (
                    $_POST[
                        'profile_access_token'
                    ]
                    ?? ''
                )
            )
        ) {
            responderMensagensJson(
                [
                    'success' => false,
                    'message' => 'Para continuar a conversar, têm de estar dentro dos 100 metros ou estar ligados na Margot.'
                ],
                403
            );
        }

        if (
            !$ligados &&
            !outraPessoaJaRespondeuMensagens(
                $db,
                $membroId,
                $outroId
            ) &&
            contarMensagensEnviadasAntesResposta(
                $db,
                $membroId,
                $outroId
            ) >= 2
        ) {
            responderMensagensJson(
                [
                    'success' => false,
                    'message' => 'Já enviaste duas mensagens. Quando a outra pessoa responder ou te enviar um Hey, podes continuar.'
                ],
                429
            );
        }

        $texto =
            trim(
                (string) (
                    $_POST['mensagem']
                    ?? $_POST['texto']
                    ?? ''
                )
            );

        if (
            mb_strlen(
                $texto
            ) >
            MENSAGEM_TEXTO_MAXIMO
        ) {
            responderMensagensJson(
                [
                    'success' =>
                        false,

                    'message' =>
                        'A mensagem pode ter no máximo 2000 caracteres.'
                ],
                422
            );
        }

        $media =
            guardarMediaMensagem(
                $_FILES['media']
                ?? []
            );

        if (
            $texto ===
                '' &&
            $media ===
                []
        ) {
            responderMensagensJson(
                [
                    'success' =>
                        false,

                    'message' =>
                        'Escreve uma mensagem ou escolhe um ficheiro.'
                ],
                422
            );
        }

        $tipo =
            $media['tipo']
            ?? 'texto';

        $parametros = [
            'emissor' =>
                $membroId,

            'destinatario' =>
                $outroId,

            'texto' =>
                $texto ===
                ''
                    ? null
                    : $texto,

            'tipo' =>
                $tipo,

            'ficheiro' =>
                $media['nome']
                ?? null,

            'mime' =>
                $media['mime']
                ?? null,

            'tamanho' =>
                $media['tamanho']
                ?? null
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

            $mensagemId =
                (int) $db
                    ->runSQL(
                        'SELECT LAST_INSERT_ID()'
                    )
                    ->fetchColumn();
        } catch (
            Throwable $erro
        ) {
            if (
                isset(
                    $media['caminho']
                ) &&
                is_file(
                    $media['caminho']
                )
            ) {
                @unlink(
                    $media['caminho']
                );
            }

            throw $erro;
        }

        try {
            $cms
                ->getPushNotification()
                ->enqueueMessage(
                    $membroId,
                    $outroId,
                    $mensagemId
                );
        } catch (
            Throwable $erroPush
        ) {
            error_log(
                '[messages-push] ' .
                $erroPush
                    ->getMessage()
            );
        }

        $mensagem =
            obterMensagem(
                $db,
                $mensagemId,
                $membroId
            );

        responderMensagensJson(
            [
                'success' =>
                    true,

                'message' =>
                    $mensagem
            ],
            201
        );
    }

    if (
        $metodo !==
        'GET'
    ) {
        header(
            'Allow: GET, POST'
        );

        responderMensagensJson(
            [
                'success' =>
                    false,

                'message' =>
                    'Método não permitido.'
            ],
            405
        );
    }

    if (
        $api ===
        'conversations'
    ) {
        responderMensagensJson([
            'success' =>
                true,

            'conversations' =>
                obterConversas(
                    $db,
                    $membroId
                ),

            'unread_count' =>
                contarMensagensNaoLidas(
                    $db,
                    $membroId
                )
        ]);
    }

    if (
        $api ===
        'history'
    ) {
        $contexto =
            obterContextoConversaMensagens(
                $db,
                $membroId,
                $outroId
            );

        if (
            !$contexto ||
            (
                !(bool) $contexto['conversa_existente'] &&
                !(bool) ($contexto['ligados'] ?? false)
            )
        ) {
            responderConversaIndisponivel(
                $twig,
                true
            );
        }

        $membroId =
            (string) $contexto[
                'membro_id'
            ];

        $outroId =
            (string) $contexto[
                'outro_id'
            ];

        $depoisDe =
            max(
                0,
                (int) (
                    $_GET['after_id']
                    ?? 0
                )
            );

        responderMensagensJson([
            'success' =>
                true,

            'messages' =>
                obterHistorico(
                    $db,
                    $membroId,
                    $outroId,
                    $depoisDe
                )
        ]);
    }

    if (
        $outroId ===
        ''
    ) {
        echo $twig->render(
            'messages.html',
            [
                'membro_id' =>
                    $membroId,

                'conversas' =>
                    obterConversas(
                        $db,
                        $membroId
                    ),

                'mensagens_nao_lidas' =>
                    contarMensagensNaoLidas(
                        $db,
                        $membroId
                    )
            ]
        );

        exit;
    }

    $contexto =
        obterContextoConversaMensagens(
            $db,
            $membroId,
            $outroId
        );

    if (
        !$contexto ||
        (
            !(bool) $contexto['conversa_existente'] &&
            !(bool) ($contexto['ligados'] ?? false)
        )
    ) {
        responderConversaIndisponivel(
            $twig
        );
    }

    $membroId =
        (string) $contexto[
            'membro_id'
        ];

    $outroId =
        (string) $contexto[
            'outro_id'
        ];

    $outro =
        obterMembroChat(
            $db,
            $outroId
        );

    if (
        !$outro
    ) {
        responderConversaIndisponivel(
            $twig
        );
    }

    $db->runSQL(
        'UPDATE mensagens_chat

         SET
             lida = 1,
             lida_em =
                 COALESCE(
                     lida_em,
                     NOW(6)
                 )

         WHERE
             emissor_id = :outro

         AND destinatario_id = :eu

         AND lida = 0',
        [
            'outro' =>
                $outroId,

            'eu' =>
                $membroId
        ]
    );

    echo $twig->render(
        'chat.html',
        [
            'membro_id' =>
                $membroId,

            'outro' =>
                $outro,

            'mensagens' =>
                obterHistorico(
                    $db,
                    $membroId,
                    $outroId
                ),

            'mensagens_nao_lidas' =>
                contarMensagensNaoLidas(
                    $db,
                    $membroId
                )
        ]
    );
} catch (
    Throwable $erro
) {
    error_log(
        '[messages] ' .
        $erro->getMessage()
    );

    if (
        $api !==
            '' ||
        $metodo ===
            'POST'
    ) {
        responderMensagensJson(
            [
                'success' =>
                    false,

                'message' =>
                    'Não foi possível processar as mensagens.'
            ],
            500
        );
    }

    http_response_code(
        500
    );

    echo $twig->render(
        'error-page.html',
        [
            'message' =>
                'Não foi possível abrir as mensagens.'
        ]
    );
}