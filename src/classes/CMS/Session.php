<?php
namespace App\CMS;

class Session {
    private $db;
    public $id, $primeiro_nome, $foto_perfil, $seo_name, $token;

    public function __construct($db)
    {   
        if (php_sapi_name() !== 'cli') {
            session_start();
        }
        $this->db = $db;
        $token = $_COOKIE['token'] ?? '';
        if ($token) {
            /*echo "<pre>";
            var_dump($_COOKIE);*/
            $this->create($token, 'stay_logged_id');
            /*var_dump($_SESSION);
            echo "</pre>";*/
        }
        $this->id = $_SESSION['id'] ?? 0;
        $this->primeiro_nome = $_SESSION['primeiro_nome'] ?? '';
        $this->foto_perfil = $_SESSION['foto_perfil'] ?? '';
        // $this->role = $_SESSION['role'] ?? 'member';
        $this->seo_name = $_SESSION['nome_seo'] ?? '';
        $this->token = $_SESSION['token'] ?? '';
    }

    public function create($token = '', $proposito = 'stay_logged_id', $membro_id = '') {
        session_regenerate_id(true);
        if (!$membro_id) {
            $arguments = [];
            $sql = "SELECT membro_id FROM token
                    WHERE token = :token AND proposito = :proposito AND validade > NOW()";
            $membro_id = $this->db->runSQL($sql, ['token' => $token, 'proposito' => $proposito])->fetchColumn();

            if (!$membro_id) {
                // Token inválido → não atualiza a sessão
                return;
            }
        }

        $sql = "SELECT m.id, m.primeiro_nome, f.nome_arquivo AS foto_perfil, m.nome_seo
                FROM membros AS m
                LEFT JOIN fotos_perfil AS f ON f.membro_id = m.id
                WHERE m.id = :membro_id
                AND f.ordem = 1;";
        
        $arguments = $this->db->runSQL($sql, ['membro_id' => $membro_id])->fetch();

        if (!$arguments) {
            return false;
        }

        $_SESSION['id'] = $arguments['id'];
        $_SESSION['primeiro_nome'] = $arguments['primeiro_nome'];
        $_SESSION['foto_perfil'] = $arguments['foto_perfil'] ?? 'default.webp';
        $_SESSION['seo_name'] = $arguments['nome_seo'];
        $_SESSION['token'] = $token;

        return true;
    }

    public function update($token) {
        $this->create($token);
    }

    public function delete() {
        $_SESSION = [];
        $param = session_get_cookie_params();
        setcookie(session_name(), '', time() - 3600, $param['path'], $param['domain'], $param['secure'], $param['httponly']);
        session_destroy();
    }
}