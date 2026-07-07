<?php
namespace TiagoDaniel\CMS;

class Token {
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function create($id, $purpose) {
        $arguments['token'] = bin2hex(random_bytes(64));
        $arguments['expires'] = date('Y-m-d H:i:s', strtotime('+20 mins'));
        $arguments['member_id'] = $id;
        $arguments['purpose'] = $purpose;

        $sql = "INSERT INTO token (token, expires, member_id, purpose)
                VALUES (:token, :expires, :member_id, :purpose);";
        $this->db->runSQL($sql, $arguments);
        return $arguments['token'];
    }

    public function getMemberId($token, $purpose) {
        $arguments = ['token' => $token, 'purpose' => $purpose];
        $sql = "SELECT member_id FROM token
                WHERE token = :token AND purpose = :purpose AND expires > NOW();";
        return $this->db->runSQL($sql, $arguments)->fetchColumn();
    }
}
