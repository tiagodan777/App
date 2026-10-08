<?php
declare(strict_types=1);

namespace App\CMS;

use RuntimeException;
use Throwable;

final class EmailVerification {
    private Database $db;
    private Token $tokens;

    public function __construct(Database $db) {
        $this->db = $db;
        $this->tokens = new Token($db);
    }

    public function createRequest(string $email): array|false {
        $email = $this->normalizarEmail($email);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        $gerirTransacao = !$this->db->inTransaction();
        try {
            if ($gerirTransacao) $this->db->beginTransaction();
            $membro = $this->db->runSQL(
                'SELECT id, primeiro_nome, email, email_verificado_em
                    FROM membros
                    WHERE LOWER(TRIM(email)) = :email
                    LIMIT 1 FOR UPDATE',
                ['email' => $email]
            )->fetch();
            if (!$membro || !empty($membro['email_verificado_em'])) {
                if ($gerirTransacao) $this->db->commit();
                return false;
            }
            $token = $this->tokens->create((string) $membro['id'], 'email_verification');
            if ($gerirTransacao) $this->db->commit();
            return [
                'membro_id' => (string) $membro['id'],
                'primeiro_nome' => trim((string) $membro['primeiro_nome']),
                'email' => $this->normalizarEmail((string) $membro['email']),
                'token' => $token
            ];
        } catch (Throwable $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) $this->db->rollBack();
            throw $erro;
        }
    }

    public function cancelRequest(string $token): void {
        $this->tokens->delete($token);
    }

    public function verify(string $token): bool {
        $token = strtolower(trim($token));
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return false;
        }
        $gerirTransacao = !$this->db->inTransaction();
        try {
            if ($gerirTransacao) {
                $this->db->beginTransaction();
            }
            $membroId = $this->tokens->getMemberId($token, 'email_verification');
            if ($membroId !== false) {
                $locked = $this->db->runSQL(
                    'SELECT id FROM membros WHERE id = :id FOR UPDATE',
                    ['id' => $membroId]
                )->fetchColumn();
                $consumido = $locked === false
                    ? false : $this->tokens->consume($token, 'email_verification');
                $membroId = $consumido === $membroId ? $membroId : false;
            }
            if ($membroId === false) {
                if ($gerirTransacao) {
                    $this->db->commit();
                }
                return false;
            }
            $atualizados = $this->db->runSQL(
                'UPDATE membros
                    SET email_verificado_em = UTC_TIMESTAMP()
                    WHERE id = :id AND email_verificado_em IS NULL',
                ['id' => $membroId]
            )->rowCount();
            if ($atualizados !== 1) {
                throw new RuntimeException('Não foi possível confirmar o email.');
            }
            $this->tokens->deleteForMemberAndPurpose($membroId, 'email_verification');
            if ($gerirTransacao) {
                $this->db->commit();
            }
            return true;
        } catch (Throwable $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $erro;
        }
    }

    /** Only call with a member ID authorised by the registration/login session. */
    public function correctPendingEmail(string $memberId, string $expectedEmail, string $email): array|false {
        $email = $this->normalizarEmail($email);
        if (strlen($email) > 64 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('invalid_email');
        }
        $gerirTransacao = !$this->db->inTransaction();
        try {
            if ($gerirTransacao) $this->db->beginTransaction();
            $member = $this->db->runSQL(
                'SELECT id, primeiro_nome, email, email_verificado_em
                 FROM membros WHERE id = :id LIMIT 1 FOR UPDATE',
                ['id' => $memberId]
            )->fetch();
            if (!$member || !empty($member['email_verificado_em'])) {
                if ($gerirTransacao) $this->db->commit();
                return false;
            }
            if ($this->normalizarEmail((string) $member['email']) !== $this->normalizarEmail($expectedEmail)) {
                throw new \DomainException('stale_email');
            }
            $duplicate = $this->db->runSQL(
                'SELECT id FROM membros WHERE LOWER(TRIM(email)) = :email AND id <> :id LIMIT 1',
                ['email' => $email, 'id' => $memberId]
            )->fetchColumn();
            if ($duplicate !== false) throw new \DomainException('duplicate_email');
            $this->db->runSQL(
                'UPDATE membros SET email = :email WHERE id = :id AND email_verificado_em IS NULL',
                ['email' => $email, 'id' => $memberId]
            );
            // Also revoke password recovery links sent to the old address.
            $this->tokens->deleteForMember($memberId);
            $token = $this->tokens->create($memberId, 'email_verification');
            if ($gerirTransacao) $this->db->commit();
            return [
                'membro_id' => $memberId,
                'primeiro_nome' => trim((string) $member['primeiro_nome']),
                'email' => $email,
                'token' => $token
            ];
        } catch (Throwable $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) $this->db->rollBack();
            if ($erro instanceof \PDOException && (int) ($erro->errorInfo[1] ?? 0) === 1062) {
                throw new \DomainException('duplicate_email', 0, $erro);
            }
            throw $erro;
        }
    }

    private function normalizarEmail(string $email): string {
        $email = trim($email);
        return function_exists('mb_strtolower') ? mb_strtolower($email, 'UTF-8') : strtolower($email);
    }
}