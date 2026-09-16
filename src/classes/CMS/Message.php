<?php
declare(strict_types=1);

namespace App\CMS;

use RuntimeException;
use InvalidArgumentException;
use Throwable;

final class Message {
    private Database $db;
    private MessageAccess $access;

    public function __construct(Database $db) {
        $this->db = $db;
        $this->access = new MessageAccess($db);
    }

    public function hiddenUntil(string $membroId, string $outroId): int {
        return (int) ($this->db->runSQL(
            'SELECT ocultar_ate_id
                FROM mensagens_conversas_ocultas
                WHERE membro_id = :membro AND outro_id = :outro
                LIMIT 1',
            ['membro' => $membroId, 'outro' => $outroId]
        )->fetchColumn() ?:
        0);
    }

    public function hideConversation(string $membroId, string $outroId): int {
        $ultimoId =
            (int) ($this->db->runSQL(
                'SELECT MAX(id)
                    FROM mensagens_chat
                    WHERE ( emissor_id = :eu1 AND destinatario_id = :outro1 ) OR ( emissor_id = :outro2 AND destinatario_id =
                    :eu2 )',
                ['eu1' => $membroId, 'outro1' => $outroId, 'outro2' => $outroId, 'eu2' => $membroId]
            )->fetchColumn() ?:
            0);
        if ($ultimoId <= 0) {
            return 0;
        }
        $this->db->runSQL(
            'INSERT INTO mensagens_conversas_ocultas ( membro_id, outro_id, ocultar_ate_id, criada_em, atualizada_em )
                VALUES ( :membro, :outro, :ultimo, NOW(6), NOW(6) )
                ON DUPLICATE KEY UPDATE ocultar_ate_id = GREATEST( ocultar_ate_id, VALUES(ocultar_ate_id) ),
                atualizada_em = NOW(6)',
            ['membro' => $membroId, 'outro' => $outroId, 'ultimo' => $ultimoId]
        );
        return $ultimoId;
    }

    public function memberPreview(string $membroId): array|false {
        $sql = "SELECT m.id, CONCAT( m.primeiro_nome, ' ', m.ultimo_nome ) AS nome, COALESCE( ( SELECT fp.nome_arquivo
            FROM fotos_perfil fp
            WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci AND ( fp.status =
            'completo' OR fp.status IS NULL )
            ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
            LIMIT 1 ), 'default.webp' ) AS foto
            FROM membros m
            WHERE m.id COLLATE utf8mb4_unicode_ci = :id COLLATE utf8mb4_unicode_ci
            LIMIT 1";
        $membro = $this->db->runSQL($sql, ['id' => $membroId])->fetch();
        if (!$membro) {
            return false;
        }
        $foto = basename(trim((string) $membro['foto'])) ?: 'default.webp';
        $membro['foto_url'] = DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($foto);
        $membro['perfil_url'] = DOC_ROOT . 'profile/' . rawurlencode((string) $membro['id']);
        unset($membro['foto']);
        return $membro;
    }

    public function allowedReactions(): array {
        return ['❤️', '😂', '😮', '😢', '😍', '🔥'];
    }

    public function belongsToConversation(int $mensagemId, string $membroId, string $outroId): bool {
        return (bool) $this->db->runSQL(
            'SELECT 1
                FROM mensagens_chat
                WHERE id = :mensagem AND ( ( emissor_id = :eu1 AND destinatario_id = :outro1 ) OR ( emissor_id = :outro2
                AND destinatario_id = :eu2 ) )
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

    public function reactions(int $mensagemId): array {
        $linhas = $this->db->runSQL(
            'SELECT membro_id, emoji
                FROM mensagens_reacoes
                WHERE mensagem_id = :mensagem
                ORDER BY atualizada_em ASC, membro_id ASC',
            ['mensagem' => $mensagemId]
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

    public function withReactions(array $mensagens): array {
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
        $linhas = $this->db->runSQL(
            'SELECT mensagem_id, membro_id, emoji
                FROM mensagens_reacoes
                WHERE mensagem_id IN (' .
                implode(', ', $marcadores) .
                ')
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

    public function react(int $mensagemId, string $membroId, string $emoji, bool $alternar): array {
        if (!in_array($emoji, $this->allowedReactions(), true)) {
            throw new InvalidArgumentException('Reação inválida.');
        }
        $existente =
            (string) ($this->db->runSQL(
                'SELECT emoji
                    FROM mensagens_reacoes
                    WHERE mensagem_id = :mensagem AND membro_id = :membro
                    LIMIT 1',
                ['mensagem' => $mensagemId, 'membro' => $membroId]
            )->fetchColumn() ?:
            '');
        if ($alternar && $existente === $emoji) {
            $this->db->runSQL(
                'DELETE
                    FROM mensagens_reacoes
                    WHERE mensagem_id = :mensagem AND membro_id = :membro',
                ['mensagem' => $mensagemId, 'membro' => $membroId]
            );
        } else {
            $this->db->runSQL(
                'INSERT INTO mensagens_reacoes ( mensagem_id, membro_id, emoji, atualizada_em )
                    VALUES ( :mensagem, :membro, :emoji, NOW(6) )
                    ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), atualizada_em = NOW(6)',
                ['mensagem' => $mensagemId, 'membro' => $membroId, 'emoji' => $emoji]
            );
        }
        return $this->reactions($mensagemId);
    }

    public function deleteSent(int $mensagemId, string $membroId, string $outroId): array|false {
        $mensagem = $this->db->runSQL(
            'SELECT id, emissor_id, destinatario_id, ficheiro_nome
                FROM mensagens_chat
                WHERE id = :mensagem AND ( ( emissor_id = :eu1 AND destinatario_id = :outro1 ) OR ( emissor_id = :outro2
                AND destinatario_id = :eu2 ) )
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
        if ((string) ($mensagem['emissor_id'] ?? '') !== $membroId) {
            throw new InvalidArgumentException('Só podes apagar mensagens que enviaste.');
        }
        $ficheiro = basename(trim((string) ($mensagem['ficheiro_nome'] ?? '')));
        $this->db->beginTransaction();
        try {
            $this->db->runSQL(
                'INSERT INTO mensagens_apagadas ( mensagem_id, emissor_id, destinatario_id, apagada_em )
                    VALUES ( :mensagem, :emissor, :destinatario, NOW(6) )
                    ON DUPLICATE KEY UPDATE emissor_id = VALUES(emissor_id), destinatario_id = VALUES(destinatario_id),
                    apagada_em = NOW(6)',
                ['mensagem' => $mensagemId, 'emissor' => $membroId, 'destinatario' => $outroId]
            );
            $this->db->runSQL(
                'DELETE
                    FROM mensagens_reacoes
                    WHERE mensagem_id = :mensagem',
                ['mensagem' => $mensagemId]
            );
            $eliminada = $this->db->runSQL(
                'DELETE
                    FROM mensagens_chat
                    WHERE id = :mensagem AND emissor_id = :emissor AND destinatario_id = :destinatario',
                ['mensagem' => $mensagemId, 'emissor' => $membroId, 'destinatario' => $outroId]
            );
            if ($eliminada->rowCount() !== 1) {
                throw new RuntimeException('A mensagem já não existe.');
            }
            $this->db->commit();
        } catch (Throwable $erro) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $erro;
        }
        if ($ficheiro !== '') {
            $caminho = APP_ROOT . '/public/media/mensagens/' . $ficheiro;
            if (is_file($caminho)) {
                @unlink($caminho);
            }
        }
        return ['id' => $mensagemId, 'emissor_id' => $membroId, 'destinatario_id' => $outroId];
    }

    public function selectSql(): string {
        return " SELECT msg.id, msg.emissor_id, msg.destinatario_id, msg.texto, msg.tipo, msg.ficheiro_nome,
            msg.ficheiro_mime, msg.ficheiro_tamanho, msg.lida, msg.criada_em, msg.lida_em, CONCAT( em.primeiro_nome,
            ' ', em.ultimo_nome ) AS emissor_nome, COALESCE( ( SELECT fp.nome_arquivo
            FROM fotos_perfil fp
            WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = em.id COLLATE utf8mb4_unicode_ci AND ( fp.status =
            'completo' OR fp.status IS NULL )
            ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
            LIMIT 1 ), 'default.webp' ) AS emissor_foto
            FROM mensagens_chat msg
            INNER JOIN membros em ON em.id COLLATE utf8mb4_unicode_ci = msg.emissor_id COLLATE utf8mb4_unicode_ci ";
    }

    public function present(array $mensagem, string $membroId): array {
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

    public function get(int $mensagemId, string $membroId): array|false {
        $sql =
            $this->selectSql() .
            " WHERE msg.id = :id AND ( msg.emissor_id = :membro1 OR msg.destinatario_id = :membro2 )
                LIMIT 1 ";
        $mensagem = $this->db->runSQL($sql, ['id' => $mensagemId, 'membro1' => $membroId, 'membro2' => $membroId])->fetch();
        if (!$mensagem) {
            return false;
        }
        $preparada = $this->present($mensagem, $membroId);
        $comReacoes = $this->withReactions([$preparada]);
        return $comReacoes[0] ?? $preparada;
    }

    public function history(string $membroId, string $outroId, int $depoisDe = 0): array {
        $corte = $this->hiddenUntil($membroId, $outroId);
        $depoisDe = max($depoisDe, $corte);
        $sql =
            $this->selectSql() .
            " WHERE ( ( msg.emissor_id = :eu1 AND msg.destinatario_id = :outro1 ) OR ( msg.emissor_id = :outro2 AND
                msg.destinatario_id = :eu2 ) ) ";
        $parametros = ['eu1' => $membroId, 'outro1' => $outroId, 'outro2' => $outroId, 'eu2' => $membroId];
        if ($depoisDe > 0) {
            $sql .= ' AND msg.id > :depois
                ORDER BY msg.id ASC
                LIMIT 100 ';
            $parametros['depois'] = $depoisDe;
        } else {
            $sql .= ' ORDER BY msg.id DESC
                LIMIT 100 ';
        }
        $mensagens = $this->db->runSQL($sql, $parametros)->fetchAll();
        if ($depoisDe === 0) {
            $mensagens = array_reverse($mensagens);
        }
        $preparadas = array_map(fn(array $mensagem): array => $this->present($mensagem, $membroId), $mensagens);
        return $this->withReactions($preparadas);
    }

    public function conversations(string $membroId): array {
        $membro = $this->access->member($membroId);
        if (!$membro) {
            return [];
        }
        $faixaEtaria = $this->access->ageGroup((string) ($membro['nascimento'] ?? ''));
        if ($faixaEtaria === null) {
            return [];
        }
        $condicaoFaixaEtaria = $this->access->ageCondition($faixaEtaria, 'p');
        $sql = "SELECT ultima.id, ultima.emissor_id, ultima.destinatario_id, ultima.texto, ultima.tipo, ultima.criada_em,
            conversa.outro_id, CONCAT( p.primeiro_nome, ' ', p.ultimo_nome ) AS outro_nome, COALESCE( ( SELECT
            fp.nome_arquivo
            FROM fotos_perfil fp
            WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci AND ( fp.status =
            'completo' OR fp.status IS NULL )
            ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
            LIMIT 1 ), 'default.webp' ) AS outro_foto, ( SELECT COUNT(*)
            FROM mensagens_chat nao_lida
            WHERE nao_lida.emissor_id = conversa.outro_id AND nao_lida.destinatario_id = :eu4 AND nao_lida.lida = 0
            AND nao_lida.id > COALESCE( ocultada.ocultar_ate_id, 0 ) ) AS nao_lidas
            FROM ( SELECT participacao.outro_id, MAX(participacao.id) AS ultima_id
            FROM ( SELECT id, destinatario_id AS outro_id
            FROM mensagens_chat
            WHERE emissor_id = :eu1 UNION ALL SELECT id, emissor_id AS outro_id
            FROM mensagens_chat
            WHERE destinatario_id = :eu2 ) participacao
            GROUP BY participacao.outro_id ) conversa
            INNER JOIN mensagens_chat ultima ON ultima.id = conversa.ultima_id
            INNER JOIN membros p ON p.id COLLATE utf8mb4_unicode_ci = conversa.outro_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN mensagens_conversas_ocultas ocultada ON ocultada.membro_id = :eu7 AND ocultada.outro_id COLLATE
            utf8mb4_unicode_ci = conversa.outro_id COLLATE utf8mb4_unicode_ci
            WHERE {$condicaoFaixaEtaria} AND ultima.id > COALESCE( ocultada.ocultar_ate_id, 0 ) AND NOT EXISTS (
            SELECT 1
            FROM bloqueados b
            WHERE ( b.pessoa_bloqueou_id = :eu5 AND b.pessoa_bloqueada_id COLLATE utf8mb4_unicode_ci =
            conversa.outro_id COLLATE utf8mb4_unicode_ci ) OR ( b.pessoa_bloqueou_id COLLATE utf8mb4_unicode_ci =
            conversa.outro_id COLLATE utf8mb4_unicode_ci AND b.pessoa_bloqueada_id = :eu6 ) )
            ORDER BY ultima.id DESC
            LIMIT 100";
        $linhas = $this->db->runSQL($sql, [
                'eu1' => $membroId,
                'eu2' => $membroId,
                'eu4' => $membroId,
                'eu5' => $membroId,
                'eu6' => $membroId,
                'eu7' => $membroId
            ])->fetchAll();
        $conversas = array_map(static function (array $linha) use ($membroId): array {
            $foto = basename(trim((string) $linha['outro_foto'])) ?: 'default.webp';
            $texto = trim((string) ($linha['texto'] ?? ''));
            if ($texto === '') {
                $texto = match ($linha['tipo']) {
                    'imagem' => 'Fotografia',
                    'video' => 'Vídeo',
                    default => 'Mensagem'
                };
            }
            if ((string) $linha['emissor_id'] === $membroId) {
                $texto = 'Tu: ' . $texto;
            }
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
        $idsVisiveis = [];
        foreach ($conversas as $conversa) {
            $idsVisiveis[(string) $conversa['outro_id']] = true;
        }
        $ligacoes = (new MemberConnection($this->db))->connectionsFor($membroId);
        foreach ($ligacoes as $ligacao) {
            $outroId = trim((string) ($ligacao['outro_id'] ?? ''));
            if ($outroId === '' || isset($idsVisiveis[$outroId]) || $this->access->areBlocked($membroId, $outroId)) {
                continue;
            }
            $outro = $this->memberPreview($outroId);
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
            static fn(array $a, array $b): int => strcmp(
                (string) ($b['criada_em'] ?? ''),
                (string) ($a['criada_em'] ?? '')
            )
        );
        return array_slice($conversas, 0, 100);
    }

    public function unreadCount(string $membroId): int {
        $membro = $this->access->member($membroId);
        if (!$membro) {
            return 0;
        }
        $faixaEtaria = $this->access->ageGroup((string) ($membro['nascimento'] ?? ''));
        if ($faixaEtaria === null) {
            return 0;
        }
        $condicaoFaixaEtaria = $this->access->ageCondition($faixaEtaria, 'em');
        return (int) $this->db->runSQL(
            "SELECT COUNT(*)
                FROM mensagens_chat msg
                INNER JOIN membros em ON em.id COLLATE utf8mb4_unicode_ci = msg.emissor_id COLLATE utf8mb4_unicode_ci
                WHERE msg.destinatario_id = :id AND msg.lida = 0 AND {$condicaoFaixaEtaria} AND msg.id > COALESCE( (
                SELECT ocultada.ocultar_ate_id
                FROM mensagens_conversas_ocultas ocultada
                WHERE ocultada.membro_id = :eu3 AND ocultada.outro_id COLLATE utf8mb4_unicode_ci = msg.emissor_id COLLATE
                utf8mb4_unicode_ci
                LIMIT 1 ), 0 ) AND NOT EXISTS ( SELECT 1
                FROM bloqueados b
                WHERE ( b.pessoa_bloqueou_id = :eu1 AND b.pessoa_bloqueada_id COLLATE utf8mb4_unicode_ci = msg.emissor_id
                COLLATE utf8mb4_unicode_ci ) OR ( b.pessoa_bloqueou_id COLLATE utf8mb4_unicode_ci = msg.emissor_id
                COLLATE utf8mb4_unicode_ci AND b.pessoa_bloqueada_id = :eu2 ) )",
            ['id' => $membroId, 'eu1' => $membroId, 'eu2' => $membroId, 'eu3' => $membroId]
        )->fetchColumn();
    }

    public function markRead(string $memberId, string $otherId): void {
        $this->db->runSQL(
            'UPDATE mensagens_chat
                SET lida = 1, lida_em = COALESCE(lida_em, NOW(6))
                WHERE emissor_id = :other AND destinatario_id = :me AND lida = 0',
            ['other' => $otherId, 'me' => $memberId]
        );
    }

    public function send(string $senderId, string $recipientId, string $text, array $media): int {
        try {
            $this->db->runSQL(
                'INSERT INTO mensagens_chat (emissor_id, destinatario_id, texto, tipo, ficheiro_nome, ficheiro_mime,
                    ficheiro_tamanho, lida, criada_em)
                    VALUES (:sender, :recipient, :text, :type, :file, :mime, :size, 0, NOW(6))',
                [
                    'sender' => $senderId,
                    'recipient' => $recipientId,
                    'text' => $text === '' ? null : $text,
                    'type' => $media['tipo'] ?? 'texto',
                    'file' => $media['nome'] ?? null,
                    'mime' => $media['mime'] ?? null,
                    'size' => $media['tamanho'] ?? null
                ]
            );
            return (int) $this->db->lastInsertId();
        } catch (Throwable $error) {
            if (isset($media['caminho']) && is_file($media['caminho'])) {
                @unlink($media['caminho']);
            }
            throw $error;
        }
    }
}
