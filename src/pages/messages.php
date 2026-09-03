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

