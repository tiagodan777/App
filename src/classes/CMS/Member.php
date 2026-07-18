<?php

declare(strict_types=1);

namespace App\CMS;

class Member
{
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function get($id) {

        $sql = "SELECT m.id,CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome, m.nascimento, m.objetivo, m.bio
                FROM membros AS m
                WHERE m.id = :id
                LIMIT 1";
        $membro = $this->db->runSQL($sql, ['id' => $id])->fetch();

        $sql = "SELECT fp.id, fp.nome_arquivo, fp.ordem
                FROM fotos_perfil AS fp
                WHERE fp.membro_id = :membro_id
                AND (fp.status = 'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC";

        $membro['fotos'] = $this->db->runSQL($sql, ['membro_id' => $id])->fetchAll();

        $sql = "SELECT h.id, h.nome
                FROM hobbies AS h
                INNER JOIN membros_gostos AS mg ON mg.hobbie_id = h.id
                WHERE mg.membro_id = :membro_id
                ORDER BY h.nome ASC";

        

        $membro['gostos'] = $this->db->runSQL($sql, ['membro_id' => $id])->fetchAll();

        if (empty($membro['fotos'])) {
            $membro['fotos'] = [
                [
                    'id' => null,
                    'nome_arquivo' => 'default.webp',
                    'ordem' => 1
                ]
            ];
        }

        return $membro;
    }

    public function create(array $membro): string|false
    {
        $gostos = $membro['gostos'] ?? [];

        if (!is_array($gostos)) $gostos = [];

        unset($membro['dia'], $membro['mes'], $membro['ano'], $membro['gostos']);

        $membro['password'] = password_hash((string) $membro['password'], PASSWORD_DEFAULT);

        try {
            $this->db->beginTransaction();

            $sql = "INSERT INTO membros (primeiro_nome, ultimo_nome, nascimento, genero, objetivo, telefone, email, bio, password, nome_seo)
                    VALUES (:primeiro_nome, :ultimo_nome, :nascimento, :genero, :objetivo, :telefone,:email, :sobre_ti, :password, :nome_seo)";

            $this->db->runSQL($sql, ['primeiro_nome' => $membro['primeiro_nome'], 'ultimo_nome' => $membro['ultimo_nome'],
                                     'nascimento' => $membro['nascimento'], 'genero' => $membro['genero'], 'objetivo' => $membro['objetivo'],
                                     'telefone' => $membro['telefone'], 'email' => $membro['email'], 'sobre_ti' => $membro['sobre_ti'],
                                    'password' => $membro['password'], 'nome_seo' => $membro['nome_seo']]);

            $id = $this->db->runSQL('SELECT id FROM membros WHERE email = :email LIMIT 1', ['email' => $membro['email']])->fetchColumn();

            if (!$id) {
                throw new \RuntimeException('Não foi possível obter o ID do membro criado.');
            }

            $id = (string) $id;

            foreach ($gostos as $gosto) {
                $gosto = trim((string) $gosto);

                if ($gosto === '') continue;

                $hobbieId = $this->db->runSQL('SELECT id FROM hobbies WHERE nome = :gosto LIMIT 1',['gosto' => $gosto])->fetchColumn();

                if (!$hobbieId) continue;

                $this->db->runSQL('INSERT IGNORE INTO membros_gostos (membro_id, hobbie_id) VALUES (:membro_id, :hobbie_id)', ['membro_id' => $id,
                        'hobbie_id' => $hobbieId]);
            }

            $this->db->commit();

            return $id;
        } catch (\PDOException $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            if ((int) ($erro->errorInfo[1] ?? 0) === 1062) return false;

            throw $erro;
        } catch (\Throwable $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();

            throw $erro;
        }
    }

    public function login(string $utilizador, string $password): array|false
    {
        $sql = "SELECT m.id, m.primeiro_nome, m.ultimo_nome, m.nascimento, m.genero, m.objetivo, m.email, m.telefone, m.password, m.adesao, m.bio,
                m.nome_seo, COALESCE(  
                            (SELECT fp.nome_arquivo
                             FROM fotos_perfil AS fp
                             WHERE fp.membro_id = m.id
                             AND (fp.status = 'completo' OR fp.status IS NULL)
                             ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
                             LIMIT 1),
                             'default.webp') AS foto_perfil
                FROM membros AS m
                WHERE m.email = :utilizador_email OR m.telefone = :utilizador_telefone
                LIMIT 1";

        $membro = $this->db->runSQL($sql, ['utilizador_email' => $utilizador, 'utilizador_telefone' => $utilizador])->fetch();

        if (!$membro) return false;

        if (!password_verify($password, (string) $membro['password'])) {
            return false;
        }

        return $membro;
    }

    public function delete(string $id): bool
    {
        try {
            $this->db->beginTransaction();

            $this->db->runSQL(
                'DELETE FROM membros_gostos WHERE membro_id = :id',
                ['id' => $id]
            );

            $this->db->runSQL('DELETE FROM fotos_perfil WHERE membro_id = :id', ['id' => $id]);

            $this->db->runSQL('DELETE FROM notificacao WHERE emissor_id = :id1 OR destinatario_id = :id2',['id1' => $id, 'id2' => $id]);

            // $this->db->runSQL('DELETE FROM seguir WHERE membro_id_1 = :id1 OR membro_id_2 = :id2', ['id1' => $id, 'id2' => $id]);

            $this->db->runSQL('DELETE FROM membros WHERE id = :id', ['id' => $id]);

            $this->db->commit();

            return true;
        } catch (\Throwable $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();

            throw $erro;
        }
    }
}