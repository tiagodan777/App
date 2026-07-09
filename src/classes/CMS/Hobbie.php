<?php
namespace App\CMS;

class Hobbie {
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    /*public function create($gosto) {
        try {
            $gostos = $membro['gostos'];

            unset($membro['dia']);
            unset($membro['mes']);
            unset($membro['ano']);
            unset($membro['gostos']);

            $sql = "INSERT INTO membros (primeiro_nome, ultimo_nome, nascimento, genero, telefone, email, bio password)
                    VALUES (:primeiro_nome, :ultimo_nome, :nascimento, :genero, :telefone, :email, :sobre_ti, :password);";
            $this->db->runSQL($sql, $membro);

            $sql = "SELECT id FROM membro
                    WHERE email = :email;";
            $id =  $this->db->runSQL($sql, [$membro['email']])->fetchColumn();

            /*$sql = "INSERT INTO membros_gostos (membro_id, hobbie_id)
            VALUES (";
            
            return $id;
        } catch (\PDOException $e) {
            if ($e->errorInfo[1] === 1062) {
                return false;
            }
            throw $e;
        }
    }*/

    public function get($gosto) {
        $sql = "SELECT id, nome FROM hobbies
            WHERE nome LIKE :contains
            ORDER BY
                CASE
                    WHEN nome = :exact THEN 1
                    WHEN nome LIKE :starts THEN 2
                    WHEN nome LIKE :contains1 THEN 3
                    ELSE 4
                END,
                CHAR_LENGTH(nome),
                nome
            LIMIT 8;";
        return $this->db->runSQL($sql, ['contains' => '%' . $gosto . '%',
                                        'contains1' => '%' . $gosto . '%',
                                        'starts' => '%' . $gosto,
                                        'exact' => $gosto,])->fetchAll();
    }

    public function create($gosto) {
        $sql = "INSERT INTO hobbies (nome)
                VALUES (:gosto);";

        $this->db->runSQL($sql, ['gosto' => $gosto]);
    }
}