<?php
namespace App\CMS;

class Member {
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    /*public function get($id) {
        $arguments['id1'] = $id;
        $arguments['id2'] = $id;
        $arguments['id3'] = $id;
        $arguments['id4'] = $id;

        $sql = "SELECT id, CONCAT(forename, ' ', surname) AS nome, joined, bio, picture, seo_name,
                (SELECT COUNT(membro_id_2) 
                FROM seguir
                WHERE membro_id_2 = :id1) AS followers,
                (SELECT COUNT(membro_id_1)
                FROM seguir
                WHERE membro_id_1 = :id2) AS following,
                (SELECT COUNT(id) FROM receita
                WHERE membro_id = :id3) AS tot_receitas
                FROM membro
                WHERE id = :id4;";
        return $this->db->runSQL($sql, $arguments)->fetch();
    }

    public function getPeople($myId) {
        $sql = "SELECT id, CONCAT(forename, ' ', surname) AS nome, bio, picture, seo_name,
                (SELECT COUNT(*) FROM seguir
                WHERE (membro_id_1 = :myId AND membro_id_2 = id)) as sigo
                FROM membro
                ORDER BY joined
                LIMIT 10;";
        return $this->db->runSQL($sql, ['myId' => $myId])->fetchAll();
    }

    public function getFull($id) {
        $sql = "SELECT id, forename, surname, joined, bio, picture, email, telefone, nascimento, genero, role
                FROM membro
                WHERE id = :id;";
        return $this->db->runSQL($sql, [$id])->fetch();
    }

    public function getAll() {
        $sql = "SELECT id, CONCAT(forename, ' ', surname) AS nome, joined, bio, picture, email, role
                FROM membro;";
        return $this->db->runSQL($sql)->fetchAll();
    }

    public function count() {
        $sql = "SELECT COUNT(*) FROM membro;";
        return $this->db->runSQL($sql)->fetchColumn();
    }*/

    public function create($member) {
        $member['password'] = password_hash($member['password'], PASSWORD_DEFAULT);

        try {
            unset($member['dia']);
            unset($member['mes']);
            unset($member['ano']);
            $sql = "INSERT INTO membro (primeiro_nome, ultimo_nome, nascimento, genero, telefone, email, password)
                    VALUES (:primeiro_nome, :ultimo_nome, :nascimento, :genero, :email, :telemovel, :password);";
            $this->db->runSQL($sql, $member);

            $sql = "SELECT id FROM membro
                    WHERE email = :email;";
            return $this->db->runSQL($sql, [$member['email']])->fetchColumn();
        } catch (\PDOException $e) {
            if ($e->errorInfo[1] === 1062) {
                return false;
            }
            throw $e;
        }
    }

    public function update($member, $admin = false) {
        try {
            unset($member['dia']);
            unset($member['mes']);
            unset($member['ano']);
            unset($member['joined']);
            unset($member['picture']);
            if (!$admin) {
                unset($member['role']);
            }
            $sql = "UPDATE membro
                    SET forename = :forename, surname = :surname, telefone = :telefone, email = :email, bio = :bio,
                                    nascimento = :nascimento, genero = :genero, seo_name = :seo_name";
                    if ($admin) {
                        $sql .= ", role = :role ";
                    }
                    $sql .= " WHERE id = :id;";
            $this->db->runSQL($sql, $member);
            return true;
        } catch (\PDOException $e) {
            if ($e->errorInfo[1] == 1062) {
                return false;
            }
            echo "<pre>";
            var_dump($member);
            echo "</pre>";
            throw $e;
        }
    }

    public function login($user, $password) {
        $arguments['user1'] = $user;
        $arguments['user2'] = $user;
        $sql = "SELECT id, forename, surname, nascimento, genero, email, telefone, password, joined, bio, picture, role, seo_name
                FROM membro
                WHERE email = :user1
                OR telefone = :user2;";
        $member = $this->db->runSQL($sql, $arguments)->fetch();
        if (!$member) {
            return false;
        }
        $authenticated = password_verify($password, $member['password']);
        return ($authenticated ? $member : false);
    }

    public function getIdByEmail($email) {
        $sql = "SELECT id FROM membro
                WHERE email = :email;";
        return $this->db->runSQL($sql, [$email])->fetchColumn();
    }

    public function passwordUpdate($id, $password) {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $sql = "UPDATE membro
                SET password = :hash
                WHERE id = :id;";
        $this->db->runSQL($sql, ['id' => $id, 'hash' => $hash,]);
        return true;
    }

    public function pictureCreate($member, $temp, $destination) {
        try {   
            $imagick = new \Imagick($temp);
            $imagick->cropThumbnailImage(300, 300);
            $imagick->writeImage($destination);

            $sql = "UPDATE membro
                    SET picture = :picture
                    WHERE id = :id;";
            $this->db->runSQL($sql, [$member['picture'], $member['id']]);
            return true;
        } catch (\Exception $e) {
            if (file_exists($destination)) {
                unlink($destination);
            }
            throw $e;
        }
    }

    public function pictureDelete($id, $path) {
        $sql = "SELECT picture FROM membro WHERE id = :id";
        $file = $this->db->runSQL($sql, [$id])->fetchColumn();

        $path .= $file;

        if (file_exists($path)) {
            unlink($path);
        } else {
            return false;
        }

        $sql = "UPDATE membro SET picture = 'blank.jpg' WHERE id = :id;";
        $this->db->runSQL($sql, [$id]);
        return true;
    }

    public function delete($id) {
        try {
            $this->db->beginTransaction();

            $sql = "DELETE FROM receita 
                    WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM publicacao_simples 
                    WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM quik
                    WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM video_longo
                    WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $sql = "DELETE FROM likes 
                    WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $arguments['id1'] = $id;
            $sql = "DELETE FROM notificacao 
                    WHERE emissor_id = :id1;";
            $this->db->runSQL($sql, $arguments);

            $sql = "DELETE FROM opiniao
                    WHERE membro_id = :id;";
            $this->db->runSQL($sql, [$id]);

            $arguments['id1'] = $id;
            $arguments['id2'] = $id;
            $sql = "DELETE FROM seguir
                    WHERE membro_id_1 = :id1
                    OR membro_id_2 = :id2;";
            $this->db->runSQL($sql, $arguments);

            $sql = "DELETE FROM membro
                    WHERE id = :id;";
            $this->db->runSQL($sql, [$id]);

            $this->db->commit();
            return true;
        } catch (\PDOException $e) {
            $this->db->rollBack();

            throw $e;
        }
    }
}