<?php
namespace App\CMS;

class Member {
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function create($membro) {
        $membro['password'] = password_hash($membro['password'], PASSWORD_DEFAULT);

        try {
            $gostos = $membro['gostos'] ?? [];

            unset($membro['dia'], $membro['mes'], $membro['ano'], $membro['gostos']);

            $sql = "INSERT INTO membros 
                    (primeiro_nome, ultimo_nome, nascimento, genero, telefone, email, bio, password, nome_seo)
                    VALUES 
                    (:primeiro_nome, :ultimo_nome, :nascimento, :genero, :telefone, :email, :sobre_ti, :password, :nome_seo);";

            $this->db->runSQL($sql, $membro);

            $sql = "SELECT id FROM membros WHERE email = :email;";

            $id = $this->db->runSQL($sql, [
                'email' => $membro['email']
            ])->fetchColumn();

            foreach ($gostos as $gosto) {
                $sql = "SELECT id FROM hobbies WHERE nome = :gosto";

                $hobbie_id = $this->db->runSQL($sql, [
                    'gosto' => $gosto
                ])->fetchColumn();

                if ($hobbie_id) {
                    $sql = "INSERT INTO membros_gostos (membro_id, hobbie_id)
                            VALUES (:membro_id, :hobbie_id)";

                    $this->db->runSQL($sql, [
                        'membro_id' => $id,
                        'hobbie_id' => $hobbie_id
                    ]);
                }
            }

            return $id;

        } catch (\PDOException $e) {
            if ($e->errorInfo[1] === 1062) {
                return false;
            }

            throw $e;
        }
    }

    public function login($utilizador, $password) {
        $arguments['utilizador1'] = $utilizador;
        $arguments['utilizador2'] = $utilizador;
        $sql = "SELECT m.id, m.primeiro_nome, m.ultimo_nome, m.nascimento, m.genero, m.email, m.telefone, m.password,
                m.adesao, m.bio, m.nome_seo, f.nome_arquivo AS foto_perfil

                FROM membros AS m
                LEFT JOIN fotos_perfil AS f ON f.membro_id = m.id
                WHERE email = :utilizador1
                OR telefone = :utilizador2;";
        $membro = $this->db->runSQL($sql, $arguments)->fetch();

        if (!$membro) {
            return false;
        }

        $authenticated = password_verify($password, $membro['password']);
        return ($authenticated ? $membro : false);
    }

    public function delete($id) {
        try {
            $this->db->beginTransaction();

            $sql = "DELETE FROM receita WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM publicacao_simples WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM quik WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM video_longo WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM likes WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $arguments['id1'] = $id;
            $sql = "DELETE FROM notificacao WHERE emissor_id = :id1;";
            $this->db->runSQL($sql, $arguments);

            $sql = "DELETE FROM opiniao WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $arguments['id1'] = $id;
            $arguments['id2'] = $id;
            $sql = "DELETE FROM seguir WHERE membro_id_1 = :id1 OR membro_id_2 = :id2;";
            $this->db->runSQL($sql, $arguments);

            $sql = "DELETE FROM membro WHERE id = :id;";
            $this->db->runSQL($sql, [$id]);

            $this->db->commit();
            return true;
        } catch (\PDOException $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}