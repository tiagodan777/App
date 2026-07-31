<?php
declare(strict_types=1);

namespace App\CMS;

use Throwable;

final class EmailVerification
{
    private Database $db;
    private Token $tokens;

    public function __construct(Database $db)
    {
        $this->db = $db;
        $this->tokens = new Token($db);
    }

    public function createRequestForMember(string $membroId): array|false
    {
        $membroId = trim($membroId);

        if ($membroId === '') {
            return false;
        }

        $membro = $this->db->runSQL(
            'SELECT id, primeiro_nome, email
             FROM membros
             WHERE id = :id
             AND email_verificado_em IS NULL
             LIMIT 1',
            ['id' => $membroId]
        )->fetch();

        return $this->createRequest($membro);
    }

    public function createRequestForEmail(string $email): array|false
    {
        $email = $this->normalizarEmail($email);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $membro = $this->db->runSQL(
            'SELECT id, primeiro_nome, email
             FROM membros
             WHERE LOWER(TRIM(email)) = :email
             AND email_verificado_em IS NULL
             LIMIT 1',
            ['email' => $email]
        )->fetch();

        return $this->createRequest($membro);
    }

    public function verify(string $token): bool
    {
        $token = strtolower(trim($token));

        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return false;
        }

        $gerirTransacao = !$this->db->inTransaction();

        try {
            if ($gerirTransacao) {
                $this->db->beginTransaction();
            }

            $membroId = $this->tokens->consume(
                $token,
                'email_verification'
            );

            if ($membroId === false) {
                if ($gerirTransacao) {
                    $this->db->commit();
                }

                return false;
            }

            $this->db->runSQL(
                'UPDATE membros
                 SET email_verificado_em = COALESCE(
                    email_verificado_em,
                    UTC_TIMESTAMP()
                 )
                 WHERE id = :id',
                ['id' => $membroId]
            );

            $this->tokens->deleteForMemberAndPurpose(
                $membroId,
                'email_verification'
            );

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

    public function isVerified(string $membroId): bool
    {
        $membroId = trim($membroId);

        if ($membroId === '') {
            return false;
        }

        return $this->db->runSQL(
            'SELECT email_verificado_em
             FROM membros
             WHERE id = :id
             LIMIT 1',
            ['id' => $membroId]
        )->fetchColumn() !== false;
    }

    public function cancelRequest(string $token): void
    {
        $this->tokens->delete($token);
    }

    private function createRequest(array|false $membro): array|false
    {
        if (!$membro) {
            return false;
        }

        $token = $this->tokens->create(
            (string) $membro['id'],
            'email_verification'
        );

        return [
            'membro_id' => (string) $membro['id'],
            'primeiro_nome' => trim((string) $membro['primeiro_nome']),
            'email' => $this->normalizarEmail((string) $membro['email']),
            'token' => $token
        ];
    }

    private function normalizarEmail(string $email): string
    {
        $email = trim($email);

        return function_exists('mb_strtolower')
            ? mb_strtolower($email, 'UTF-8')
            : strtolower($email);
    }
}