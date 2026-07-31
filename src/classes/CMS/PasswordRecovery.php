<?php

declare(strict_types=1);

namespace App\CMS;

use App\Validate\Validate;
use RuntimeException;
use Throwable;

final class PasswordRecovery
{
    private Database $db;
    private Token $tokens;

    public function __construct(Database $db)
    {
        $this->db = $db;
        $this->tokens = new Token($db);
    }

    public function createRequest(string $email): array|false
    {
        $email = $this->normalizarEmail($email);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $membro = $this->db->runSQL(
            'SELECT id, primeiro_nome, email
             FROM membros
             WHERE LOWER(TRIM(email)) = :email
             LIMIT 1',
            ['email' => $email]
        )->fetch();

        if (!$membro) {
            return false;
        }

        $token = $this->tokens->create(
            (string) $membro['id'],
            'password_reset'
        );

        return [
            'membro_id' => (string) $membro['id'],
            'primeiro_nome' => trim((string) $membro['primeiro_nome']),
            'email' => $this->normalizarEmail((string) $membro['email']),
            'token' => $token
        ];
    }

    public function cancelRequest(string $token): void
    {
        $this->tokens->delete($token);
    }

    public function resetPassword(string $token, string $novaPassword): bool
    {
        $token = strtolower(trim($token));

        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return false;
        }

        if (!Validate::isPassword($novaPassword)) {
            return false;
        }

        $passwordHash = password_hash($novaPassword, PASSWORD_DEFAULT);

        if ($passwordHash === false) {
            throw new RuntimeException(
                'Não foi possível proteger a nova palavra-passe.'
            );
        }

        $gerirTransacao = !$this->db->inTransaction();

        try {
            if ($gerirTransacao) {
                $this->db->beginTransaction();
            }

            $membroId = $this->tokens->consume(
                $token,
                'password_reset'
            );

            if ($membroId === false) {
                if ($gerirTransacao) {
                    $this->db->commit();
                }

                return false;
            }

            $atualizados = $this->db->runSQL(
                'UPDATE membros
                 SET password = :password
                 WHERE id = :id',
                [
                    'password' => $passwordHash,
                    'id' => $membroId
                ]
            )->rowCount();

            if ($atualizados !== 1) {
                throw new RuntimeException(
                    'Não foi possível atualizar a palavra-passe.'
                );
            }

            $this->tokens->deleteForMember($membroId);

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

    private function normalizarEmail(string $email): string
    {
        $email = trim($email);

        return function_exists('mb_strtolower')
            ? mb_strtolower($email, 'UTF-8')
            : strtolower($email);
    }
}