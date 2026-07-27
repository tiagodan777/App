<?php

declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;

class Token
{
    private Database $db;

    private const DURACOES = [
        'delete_account' => 1200,
        'stay_logged_id' => 1209600,
        'websocket' => 60
    ];

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public function create(string $id, string $proposito, ?int $duracao = null): string
    {
        if (!isset(self::DURACOES[$proposito])) {
            throw new InvalidArgumentException('Propósito de token inválido.');
        }

        $duracao ??= self::DURACOES[$proposito];

        if ($duracao < 1) {
            throw new InvalidArgumentException('Duração de token inválida.');
        }

        $token = bin2hex(random_bytes(32));

        $this->db->runSQL(
            'INSERT INTO token (token, validade, membro_id, proposito) VALUES (:token, :validade, :membro_id, :proposito)',
            [
                'token' => self::hash($token),
                'validade' => gmdate('Y-m-d H:i:s', time() + $duracao),
                'membro_id' => $id,
                'proposito' => $proposito
            ]
        );

        return $token;
    }

    public function getMemberId(string $token, string $proposito): string|false
    {
        if ($token === '' || !isset(self::DURACOES[$proposito])) {
            return false;
        }

        return $this->db->runSQL(
            'SELECT membro_id FROM token WHERE token = :token_hash AND proposito = :proposito AND validade > UTC_TIMESTAMP() LIMIT 1',
            [
                'token_hash' => self::hash($token),
                'proposito' => $proposito
            ]
        )->fetchColumn();
    }

    public function delete(string $token): void
    {
        if ($token === '') {
            return;
        }

        $this->db->runSQL(
            'DELETE FROM token WHERE token = :token_hash',
            ['token_hash' => self::hash($token)]
        );
    }
}