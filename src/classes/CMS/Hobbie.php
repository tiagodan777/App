<?php
namespace App\CMS;

class Hobbie {
    private $db;

    public function __construct($db) {
        $this->db = $db;
    }

    public function get($gosto) {
        $sql = "SELECT id, nome
            FROM hobbies
            WHERE nome LIKE :contains
            ORDER BY CASE WHEN nome = :exact THEN 1 WHEN nome LIKE :starts THEN 2 WHEN nome LIKE :contains1 THEN 3
            ELSE 4 END, CHAR_LENGTH(nome), nome
            LIMIT 8;";
        return $this->db->runSQL($sql, [
                'contains' => '%' . $gosto . '%',
                'contains1' => '%' . $gosto . '%',
                'starts' => '%' . $gosto,
                'exact' => $gosto
            ])->fetchAll();
    }

    public function create($gosto) {
        $sql = "INSERT INTO hobbies (nome)
            VALUES (:gosto);";
        $this->db->runSQL($sql, ['gosto' => $gosto]);
    }
}
