<?php
namespace App\CMS;

class Cookie {
    private $db;
    public $token;

    public function __construct($db)
    {   
        $this->db = $db;
        $this->token = $_COOKIE['token'] ?? '';
    }

    public function create($member) {
        $arguments['token'] = bin2hex(random_bytes(64));
        $arguments['validade'] = date('Y-m-d H:i:s', strtotime('+14 days'));
        $arguments['membro_id'] = $member['id'];
        $arguments['proposito'] = 'stay_logged_id';

        $sql = "INSERT INTO token (token, validade, membro_id, proposito) VALUES (:token, :validade, :membro_id, :proposito);";
        $this->db->runSQL($sql, $arguments);

        setcookie('token', $arguments['token'], time() + 60 * 60 * 24 * 7 * 2, '/', '', false, true);

        return $arguments['token'];
    }

    public function updade($member) {
        $this->create($member);
    }

    public function delete() {
        $sql = "DELETE FROM token WHERE token = :token;";
        setcookie('token', '', time() - 3600, '/', '', false, true);
    }
}