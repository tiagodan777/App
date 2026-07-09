<?php
namespace App\CMS;

class Token {
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function create($id, $proposito) {
        $arguments['token'] = bin2hex(random_bytes(64));
        $arguments['validade'] = date('Y-m-d H:i:s', strtotime('+20 mins'));
        $arguments['membro_id'] = $id;
        $arguments['proposito'] = $proposito;

        $sql = "INSERT INTO token (token, validade, membro_id, proposito)
                VALUES (:token, :validade, :membro_id, :proposito);";
        $this->db->runSQL($sql, $arguments);
        return $arguments['token'];
    }

    public function getMemberId($token, $proposito) {
        $arguments = ['token' => $token, 'purpose' => $proposito];
        $sql = "SELECT membro_id FROM token
                WHERE token = :token AND proposito = :proposito AND validade > NOW();";
        return $this->db->runSQL($sql, $arguments)->fetchColumn();
    }
}
