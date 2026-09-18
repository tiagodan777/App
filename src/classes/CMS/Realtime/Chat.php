<?php
declare(strict_types=1);

namespace App\CMS\Realtime;

use App\Validate\Validate;
use PDO;
use Ratchet\ConnectionInterface;

// Métodos de Chat usados exclusivamente pela classe WebSocket.
trait Chat {
    private function publicarMensagemChat(ConnectionInterface $from, array $data): void {
        $membroId = $this->obterMembroDaLigacao($from);
        $mensagemId = filter_var($data['message_id'] ?? null, FILTER_VALIDATE_INT);

        if ($membroId === null) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'A ligação não está autenticada.'
            ]);
            return;
        }

        if ($mensagemId === false || $mensagemId < 1) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'A mensagem não é válida.'
            ]);
            return;
        }

        $sql = \App\CMS\Message::selectSql() . ' WHERE msg.id = :id LIMIT 1';
        $database = $this->getDatabase();
        $statement = $database->prepare($sql);
        $statement->execute(['id' => $mensagemId]);
        $mensagem = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$mensagem || (string) $mensagem['emissor_id'] !== $membroId) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'Não podes publicar esta mensagem.'
            ]);
            return;
        }

        $destinatarioId = trim((string) ($mensagem['destinatario_id'] ?? ''));

        if (!$this->interacaoMensagensPermitida($membroId, $destinatarioId)) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'Esta conversa não está disponível.'
            ]);
            return;
        }

        $mensagem = \App\CMS\Message::present($mensagem, $membroId);

        $participantes = array_unique([
            (string) $mensagem['emissor_id'],
            (string) $mensagem['destinatario_id']
        ]);

        foreach ($participantes as $participanteId) {
            $mensagem['minha'] = $participanteId === (string) $mensagem['emissor_id'];
            $naoLidas = $this->contarMensagensNaoLidas($participanteId);

            foreach ($this->ligacoesPorMembro[$participanteId] ?? [] as $ligacao) {
                $this->enviar($ligacao, [
                    'type' => 'chat_message',
                    'message' => $mensagem,
                    'unread_count' => $naoLidas
                ]);
            }
        }

        echo sprintf(
            "[CHAT] Mensagem %d publicada por %s para %s.\n",
            $mensagem['id'],
            $mensagem['emissor_id'],
            $mensagem['destinatario_id']
        );
    }

    private function publicarEliminacaoChat(ConnectionInterface $from, array $data): void {
        $membroId = $this->obterMembroDaLigacao($from);
        $mensagemId = filter_var($data['message_id'] ?? null, FILTER_VALIDATE_INT);

        if ($membroId === null) {
            return;
        }

        if ($mensagemId === false || $mensagemId < 1) {
            return;
        }

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare('SELECT emissor_id, destinatario_id
                FROM mensagens_apagadas
                WHERE mensagem_id = :mensagem AND emissor_id = :emissor
                LIMIT 1');

            $statement->execute([
                'mensagem' => (int) $mensagemId,
                'emissor' => $membroId
            ]);

            $apagada = $statement->fetch(PDO::FETCH_ASSOC);

            if (!$apagada) {
                return;
            }

            $emissorId = trim((string) ($apagada['emissor_id'] ?? ''));
            $destinatarioId = trim((string) ($apagada['destinatario_id'] ?? ''));

            if ($emissorId === '' || $destinatarioId === '' || $emissorId !== $membroId) {
                return;
            }

            $evento = [
                'type' => 'chat_reaction',
                'message_id' => (int) $mensagemId,
                'deleted' => true,
                'deleted_by' => $membroId
            ];

            foreach (array_unique([$emissorId, $destinatarioId]) as $participanteId) {
                foreach ($this->ligacoesPorMembro[$participanteId] ?? [] as $client) {
                    $this->enviar($client, $evento);
                    $this->enviarContadorMensagens($client, $participanteId);
                }
            }

            echo sprintf(
                "[CHAT DELETE] Mensagem %d apagada por %s.\n",
                (int) $mensagemId,
                $membroId
            );
        } catch (\Throwable $erro) {
            echo sprintf("[CHAT DELETE ERROR] %s\n", $erro->getMessage());
        }
    }

    private function publicarReacaoChat(ConnectionInterface $from, array $data): void {
        $membroId = $this->obterMembroDaLigacao($from);
        $mensagemId = filter_var($data['message_id'] ?? null, FILTER_VALIDATE_INT);

        if ($membroId === null) {
            return;
        }

        if ($mensagemId === false || $mensagemId < 1) {
            return;
        }

        try {
            $database = $this->getDatabase();
            $mensagem = $database->prepare('SELECT emissor_id, destinatario_id
                FROM mensagens_chat
                WHERE id = :id AND (emissor_id = :membro1 OR destinatario_id = :membro2)
                LIMIT 1');

            $mensagem->execute([
                'id' => (int) $mensagemId,
                'membro1' => $membroId,
                'membro2' => $membroId
            ]);

            $linhaMensagem = $mensagem->fetch(PDO::FETCH_ASSOC);

            if (!$linhaMensagem) {
                return;
            }

            $reacoes = $database->prepare('SELECT membro_id, emoji
                FROM mensagens_reacoes
                WHERE mensagem_id = :mensagem
                ORDER BY atualizada_em ASC, membro_id ASC');

            $reacoes->execute(['mensagem' => (int) $mensagemId]);

            $lista = [];

            foreach ($reacoes->fetchAll(PDO::FETCH_ASSOC) as $reacao) {
                $lista[] = [
                    'member_id' => (string) ($reacao['membro_id'] ?? ''),
                    'emoji' => (string) ($reacao['emoji'] ?? '')
                ];
            }

            $evento = [
                'type' => 'chat_reaction',
                'message_id' => (int) $mensagemId,
                'reactions' => $lista
            ];

            $destinatarios = [
                (string) ($linhaMensagem['emissor_id'] ?? ''),
                (string) ($linhaMensagem['destinatario_id'] ?? '')
            ];

            foreach (array_unique($destinatarios) as $destinatarioId) {
                if ($destinatarioId === '') {
                    continue;
                }

                foreach ($this->ligacoesPorMembro[$destinatarioId] ?? [] as $client) {
                    $this->enviar($client, $evento);
                }
            }
        } catch (\Throwable $erro) {
            echo sprintf("[CHAT REACTION ERROR] %s\n", $erro->getMessage());
        }
    }

    private function marcarMensagensChatComoLidas(ConnectionInterface $from, array $data): void {
        $leitorId = $this->obterMembroDaLigacao($from);
        $outroId = trim((string) ($data['with_member_id'] ?? ''));

        if ($leitorId === null || $outroId === '' || $outroId === $leitorId) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'A conversa não é válida.'
            ]);
            return;
        }

        if (!$this->interacaoMensagensPermitida($leitorId, $outroId)) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'Esta conversa não está disponível.'
            ]);
            return;
        }

        // Uma conversa recém-aberta pode ainda não ter mensagens para marcar.
        if (!$this->existeConversaMensagens($leitorId, $outroId)) {
            return;
        }

        $database = $this->getDatabase();

        $statement = $database->prepare("UPDATE mensagens_chat
            SET lida = 1, lida_em = COALESCE(lida_em, NOW(6))
            WHERE emissor_id = :outro AND destinatario_id = :leitor AND lida = 0");

        $statement->execute(['outro' => $outroId, 'leitor' => $leitorId]);

        $statement = $database->prepare("SELECT COALESCE(MAX(id), 0)
            FROM mensagens_chat
            WHERE emissor_id = :outro AND destinatario_id = :leitor AND lida = 1");

        $statement->execute(['outro' => $outroId, 'leitor' => $leitorId]);

        $ultimaMensagemId = (int) $statement->fetchColumn();

        foreach ($this->ligacoesPorMembro[$outroId] ?? [] as $ligacao) {
            $this->enviar($ligacao, [
                'type' => 'chat_messages_read',
                'reader_id' => $leitorId,
                'last_message_id' => $ultimaMensagemId
            ]);
        }

        foreach ($this->ligacoesPorMembro[$leitorId] ?? [] as $ligacao) {
            $this->enviarContadorMensagens($ligacao, $leitorId);
        }
    }

    private function contarMensagensNaoLidas(string $membroId): int {
        $membro = $this->obterMembro($membroId);

        if (!$membro) {
            return 0;
        }

        $faixaEtaria = $this->obterFaixaEtaria((string) ($membro['nascimento'] ?? ''));

        if ($faixaEtaria === null) {
            return 0;
        }

        $condicaoFaixaEtaria = Validate::adultSqlCondition('em');
        $database = $this->getDatabase();

        $statement = $database->prepare("SELECT COUNT(*)
            FROM mensagens_chat msg
            INNER JOIN membros em
                ON em.id COLLATE utf8mb4_unicode_ci = msg.emissor_id COLLATE utf8mb4_unicode_ci
            WHERE msg.destinatario_id = :id
                AND msg.lida = 0
                AND {$condicaoFaixaEtaria}
                AND NOT EXISTS (
                    SELECT 1
                    FROM bloqueados b
                    WHERE (
                        b.pessoa_bloqueou_id = :eu1
                        AND b.pessoa_bloqueada_id COLLATE utf8mb4_unicode_ci
                            = msg.emissor_id COLLATE utf8mb4_unicode_ci
                    ) OR (
                        b.pessoa_bloqueou_id COLLATE utf8mb4_unicode_ci
                            = msg.emissor_id COLLATE utf8mb4_unicode_ci
                        AND b.pessoa_bloqueada_id = :eu2
                    )
                )");

        $statement->execute([
            'id' => $membroId,
            'eu1' => $membroId,
            'eu2' => $membroId
        ]);

        return (int) $statement->fetchColumn();
    }

    private function enviarContadorMensagens(ConnectionInterface $conn, string $membroId): void {
        $this->enviar($conn, [
            'type' => 'chat_unread_count',
            'unread_count' => $this->contarMensagensNaoLidas($membroId)
        ]);
    }

    private function interacaoMensagensPermitida(string $primeiroMembroId, string $segundoMembroId): bool {
        $primeiroMembroId = trim($primeiroMembroId);
        $segundoMembroId = trim($segundoMembroId);

        if ($primeiroMembroId === '' || $segundoMembroId === '' || hash_equals($primeiroMembroId, $segundoMembroId)) {
            return false;
        }

        $database = $this->getDatabase();

        $statement = $database->prepare("SELECT id, nascimento
            FROM membros
            WHERE id = :primeiro OR id = :segundo");

        $statement->execute([
            'primeiro' => $primeiroMembroId,
            'segundo' => $segundoMembroId
        ]);

        $membros = [];

        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $membro) {
            $id = trim((string) ($membro['id'] ?? ''));

            if ($id !== '') {
                $membros[$id] = $membro;
            }
        }

        if (!isset($membros[$primeiroMembroId], $membros[$segundoMembroId])) {
            return false;
        }

        $primeiraFaixa = $this->obterFaixaEtaria(
            (string) ($membros[$primeiroMembroId]['nascimento'] ?? '')
        );

        $segundaFaixa = $this->obterFaixaEtaria(
            (string) ($membros[$segundoMembroId]['nascimento'] ?? '')
        );

        if ($primeiraFaixa === null || $segundaFaixa === null || $primeiraFaixa !== $segundaFaixa) {
            return false;
        }

        $statement = $database->prepare("SELECT 1
            FROM bloqueados
            WHERE (
                pessoa_bloqueou_id = :primeiro1
                AND pessoa_bloqueada_id = :segundo1
            ) OR (
                pessoa_bloqueou_id = :segundo2
                AND pessoa_bloqueada_id = :primeiro2
            )
            LIMIT 1");

        $statement->execute([
            'primeiro1' => $primeiroMembroId,
            'segundo1' => $segundoMembroId,
            'segundo2' => $segundoMembroId,
            'primeiro2' => $primeiroMembroId
        ]);

        return !$statement->fetchColumn();
    }

    private function existeConversaMensagens(string $primeiroMembroId, string $segundoMembroId): bool {
        $database = $this->getDatabase();

        $statement = $database->prepare("SELECT 1
            FROM mensagens_chat
            WHERE (
                emissor_id = :primeiro1
                AND destinatario_id = :segundo1
            ) OR (
                emissor_id = :segundo2
                AND destinatario_id = :primeiro2
            )
            LIMIT 1");

        $statement->execute([
            'primeiro1' => $primeiroMembroId,
            'segundo1' => $segundoMembroId,
            'segundo2' => $segundoMembroId,
            'primeiro2' => $primeiroMembroId
        ]);

        return (bool) $statement->fetchColumn();
    }
}