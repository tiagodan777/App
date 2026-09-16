<?php
declare(strict_types=1);

namespace App\CMS;

use App\Validate\Validate;

final class MessageAccess {
    private Database $db;

    public function __construct(Database $db) {
        $this->db = $db;
    }

    public function validId(string $membroId): bool {
        return (bool) preg_match(
            '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i',
            $membroId
        );
    }

    public function ageGroup(string $nascimento): ?string {
        return Validate::ageGroup($nascimento);
    }

    public function member(string $membroId): array|false {
        if (!$this->validId($membroId)) {
            return false;
        }
        return $this->db->runSQL(
            'SELECT id, nascimento
                FROM membros
                WHERE id = :id
                LIMIT 1',
            ['id' => $membroId]
        )->fetch();
    }

    public function areBlocked(string $primeiroMembroId, string $segundoMembroId): bool {
        return (bool) $this->db->runSQL(
            'SELECT 1
                FROM bloqueados
                WHERE ( pessoa_bloqueou_id = :primeiro1 AND pessoa_bloqueada_id = :segundo1 ) OR ( pessoa_bloqueou_id =
                :segundo2 AND pessoa_bloqueada_id = :primeiro2 )
                LIMIT 1',
            [
                'primeiro1' => $primeiroMembroId,
                'segundo1' => $segundoMembroId,
                'segundo2' => $segundoMembroId,
                'primeiro2' => $primeiroMembroId
            ]
        )->fetchColumn();
    }

    public function haveConversation(string $primeiroMembroId, string $segundoMembroId): bool {
        return (bool) $this->db->runSQL(
            'SELECT 1
                FROM mensagens_chat
                WHERE ( emissor_id = :primeiro1 AND destinatario_id = :segundo1 ) OR ( emissor_id = :segundo2 AND
                destinatario_id = :primeiro2 )
                LIMIT 1',
            [
                'primeiro1' => $primeiroMembroId,
                'segundo1' => $segundoMembroId,
                'segundo2' => $segundoMembroId,
                'primeiro2' => $primeiroMembroId
            ]
        )->fetchColumn();
    }

    public function purpose(string $visualizadorId): string {
        return 'profile:' . substr(hash('sha256', $visualizadorId), 0, 24);
    }

    public function validProximityToken(string $visualizadorId, string $destinatarioId, string $token): bool {
        $token = strtolower(trim($token));
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return false;
        }
        return (bool) $this->db->runSQL(
            'SELECT 1
                FROM token
                WHERE token = :token AND membro_id = :destinatario AND proposito = :proposito AND validade >
                UTC_TIMESTAMP()
                LIMIT 1',
            [
                'token' => hash('sha256', $token),
                'destinatario' => $destinatarioId,
                'proposito' => $this->purpose($visualizadorId)
            ]
        )->fetchColumn();
    }

    public function areConnected(string $primeiroMembroId, string $segundoMembroId): bool {
        return (new MemberConnection($this->db))->areConnected($primeiroMembroId, $segundoMembroId);
    }

    public function hasReply(string $membroId, string $outroId): bool {
        $respondeuMensagem = (bool) $this->db->runSQL(
            'SELECT 1
                FROM mensagens_chat
                WHERE emissor_id = :outro AND destinatario_id = :eu
                LIMIT 1',
            ['outro' => $outroId, 'eu' => $membroId]
        )->fetchColumn();
        if ($respondeuMensagem) {
            return true;
        }
        return (bool) $this->db->runSQL(
            "SELECT 1
                FROM notificacao
                WHERE tipo = 'hey' AND emissor_id = :outro AND destinatario_id = :eu
                LIMIT 1",
            ['outro' => $outroId, 'eu' => $membroId]
        )->fetchColumn();
    }

    public function sentBeforeReply(string $membroId, string $outroId): int {
        return (int) $this->db->runSQL(
            'SELECT COUNT(*)
                FROM mensagens_chat
                WHERE emissor_id = :eu AND destinatario_id = :outro',
            ['eu' => $membroId, 'outro' => $outroId]
        )->fetchColumn();
    }

    public function context(string $membroId, string $outroId): array|false {
        if (!$this->validId($membroId) || !$this->validId($outroId) || hash_equals($membroId, $outroId)) {
            return false;
        }
        $membro = $this->member($membroId);
        $outro = $this->member($outroId);
        if (!$membro || !$outro) {
            return false;
        }
        $membroId = (string) $membro['id'];
        $outroId = (string) $outro['id'];
        $faixaMembro = $this->ageGroup((string) ($membro['nascimento'] ?? ''));
        $faixaOutro = $this->ageGroup((string) ($outro['nascimento'] ?? ''));
        if ($faixaMembro === null || $faixaOutro === null || $faixaMembro !== $faixaOutro) {
            return false;
        }
        if ($this->areBlocked($membroId, $outroId)) {
            return false;
        }
        return [
            'membro_id' => $membroId,
            'outro_id' => $outroId,
            'faixa_etaria' => $faixaMembro,
            'conversa_existente' => $this->haveConversation($membroId, $outroId),
            'ligados' => $this->areConnected($membroId, $outroId)
        ];
    }

    public function ageCondition(string $faixaEtaria, string $alias): string {
        if ($faixaEtaria !== Validate::ADULT_GROUP) {
            return '(1 = 0)';
        }
        return Validate::adultSqlCondition($alias);
    }
}
