<?php

namespace App\CMS;

class Token
{
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function create(
        string $id,
        string $proposito
    ): string {
        $arguments = [
            'token' => bin2hex(random_bytes(64)),
            'validade' => date(
                'Y-m-d H:i:s',
                strtotime('+20 minutes')
            ),
            'membro_id' => $id,
            'proposito' => $proposito
        ];

        $sql = "
            INSERT INTO token (
                token,
                validade,
                membro_id,
                proposito
            )
            VALUES (
                :token,
                :validade,
                :membro_id,
                :proposito
            )
        ";

        $this->db->runSQL($sql, $arguments);

        return $arguments['token'];
    }

    public function getMemberId(
        string $token,
        string $proposito
    ): string|false {
        $arguments = [
            'token' => $token,
            'proposito' => $proposito
        ];

        $sql = "
            SELECT membro_id
            FROM token
            WHERE token = :token
            AND proposito = :proposito
            AND validade > NOW()
            LIMIT 1
        ";

        return $this->db
            ->runSQL($sql, $arguments)
            ->fetchColumn();
    }

    public function delete(
        string $token
    ): void {
        $sql = "
            DELETE FROM token
            WHERE token = :token
        ";

        $this->db->runSQL($sql, [
            'token' => $token
        ]);
    }
}