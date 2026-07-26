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
        string $proposito,
        int $validadeSegundos = 1200
    ): string {
        $plainToken = bin2hex(random_bytes(32));
        $arguments = [
            'token' => hash('sha256', $plainToken),
            'validade' => gmdate(
                'Y-m-d H:i:s',
                time() + max(60, min($validadeSegundos, 86400 * 30))
            ),
            'membro_id' => $id,
            'proposito' => $proposito
        ];

        $this->db->runSQL(
            'DELETE FROM token
             WHERE membro_id = :membro_id
             AND proposito = :proposito',
            [
                'membro_id' => $id,
                'proposito' => $proposito
            ]
        );

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

        return $plainToken;
    }

    public function getMemberId(
        string $token,
        string $proposito
    ): string|false {
        $arguments = [
            'token' => hash('sha256', $token),
            'proposito' => $proposito
        ];

        $sql = "
            SELECT membro_id
            FROM token
            WHERE token = :token
            AND proposito = :proposito
            AND validade > UTC_TIMESTAMP()
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
            'token' => hash('sha256', $token)
        ]);
    }

    public function deleteForMember(string $memberId, ?string $purpose = null): void
    {
        $sql = 'DELETE FROM token WHERE membro_id = :membro_id';
        $arguments = ['membro_id' => $memberId];

        if ($purpose !== null) {
            $sql .= ' AND proposito = :proposito';
            $arguments['proposito'] = $purpose;
        }

        $this->db->runSQL($sql, $arguments);
    }
}
