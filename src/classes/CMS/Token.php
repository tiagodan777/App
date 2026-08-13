<?php

declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;
use Throwable;

final class Token
{
    private Database $db;

    private const DURACOES = [
        'login' => 1200,
        'password_reset' => 1200,
        'delete_account' => 1200,
        'email_verification' => 86400,
        'stay_logged_id' => 1209600,
        'websocket' => 60,
        'background_location' => 2592000
    ];

    private const PROPOSITOS_TOKEN_UNICO = [
        'password_reset',
        'delete_account',
        'email_verification',
        'background_location'
    ];

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public function create(
        string $membroId,
        string $proposito,
        ?int $duracao = null
    ): string {
        $membroId = trim($membroId);
        $this->validarProposito($proposito);

        if ($membroId === '') {
            throw new InvalidArgumentException(
                'O membro do token não é válido.'
            );
        }

        $duracao ??= self::DURACOES[$proposito];

        if ($duracao < 1) {
            throw new InvalidArgumentException(
                'Duração de token inválida.'
            );
        }

        $token = bin2hex(random_bytes(32));
        $gerirTransacao = !$this->db->inTransaction();

        try {
            if ($gerirTransacao) {
                $this->db->beginTransaction();
            }

            if (
                in_array(
                    $proposito,
                    self::PROPOSITOS_TOKEN_UNICO,
                    true
                )
            ) {
                $this->db->runSQL(
                    'DELETE FROM token
                     WHERE membro_id = :membro_id
                     AND proposito = :proposito',
                    [
                        'membro_id' => $membroId,
                        'proposito' => $proposito
                    ]
                );
            }

            $this->db->runSQL(
                'INSERT INTO token (
                    token,
                    validade,
                    membro_id,
                    proposito
                 ) VALUES (
                    :token,
                    :validade,
                    :membro_id,
                    :proposito
                 )',
                [
                    'token' => self::hash($token),
                    'validade' => gmdate(
                        'Y-m-d H:i:s',
                        time() + $duracao
                    ),
                    'membro_id' => $membroId,
                    'proposito' => $proposito
                ]
            );

            if ($gerirTransacao) {
                $this->db->commit();
            }
        } catch (Throwable $erro) {
            if (
                $gerirTransacao &&
                $this->db->inTransaction()
            ) {
                $this->db->rollBack();
            }

            throw $erro;
        }

        return $token;
    }

    public function getMemberId(
        string $token,
        string $proposito
    ): string|false {
        $token = trim($token);

        if (
            $token === '' ||
            !isset(self::DURACOES[$proposito])
        ) {
            return false;
        }

        return $this->db->runSQL(
            'SELECT membro_id
             FROM token
             WHERE token = :token_hash
             AND proposito = :proposito
             AND validade > UTC_TIMESTAMP()
             LIMIT 1',
            [
                'token_hash' => self::hash($token),
                'proposito' => $proposito
            ]
        )->fetchColumn();
    }

    public function consume(
        string $token,
        string $proposito
    ): string|false {
        $token = trim($token);

        if (
            $token === '' ||
            !isset(self::DURACOES[$proposito])
        ) {
            return false;
        }

        $tokenHash = self::hash($token);
        $gerirTransacao = !$this->db->inTransaction();

        try {
            if ($gerirTransacao) {
                $this->db->beginTransaction();
            }

            $registo = $this->db->runSQL(
                'SELECT id, membro_id
                 FROM token
                 WHERE token = :token_hash
                 AND proposito = :proposito
                 AND validade > UTC_TIMESTAMP()
                 LIMIT 1
                 FOR UPDATE',
                [
                    'token_hash' => $tokenHash,
                    'proposito' => $proposito
                ]
            )->fetch();

            if (!$registo) {
                if ($gerirTransacao) {
                    $this->db->commit();
                }

                return false;
            }

            $this->db->runSQL(
                'DELETE FROM token
                 WHERE id = :id
                 AND token = :token_hash',
                [
                    'id' => $registo['id'],
                    'token_hash' => $tokenHash
                ]
            );

            if ($gerirTransacao) {
                $this->db->commit();
            }

            return (string) $registo['membro_id'];
        } catch (Throwable $erro) {
            if (
                $gerirTransacao &&
                $this->db->inTransaction()
            ) {
                $this->db->rollBack();
            }

            throw $erro;
        }
    }

    public function delete(string $token): void
    {
        $token = trim($token);

        if ($token === '') {
            return;
        }

        $this->db->runSQL(
            'DELETE FROM token
             WHERE token = :token_hash',
            ['token_hash' => self::hash($token)]
        );
    }

    public function deleteForMemberAndPurpose(
        string $membroId,
        string $proposito
    ): void {
        $membroId = trim($membroId);
        $this->validarProposito($proposito);

        if ($membroId === '') {
            return;
        }

        $this->db->runSQL(
            'DELETE FROM token
             WHERE membro_id = :membro_id
             AND proposito = :proposito',
            [
                'membro_id' => $membroId,
                'proposito' => $proposito
            ]
        );
    }

    public function deleteForMember(string $membroId): void
    {
        $membroId = trim($membroId);

        if ($membroId === '') {
            return;
        }

        $this->db->runSQL(
            'DELETE FROM token
             WHERE membro_id = :membro_id',
            ['membro_id' => $membroId]
        );
    }

    private function validarProposito(string $proposito): void
    {
        if (!isset(self::DURACOES[$proposito])) {
            throw new InvalidArgumentException(
                'Propósito de token inválido.'
            );
        }
    }
}