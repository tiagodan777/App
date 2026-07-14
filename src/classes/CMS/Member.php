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

    public function create(array $membro): string|false
    {
        $gostos = $membro['gostos'] ?? [];

        if (!is_array($gostos)) {
            $gostos = [];
        }

        unset(
            $membro['dia'],
            $membro['mes'],
            $membro['ano'],
            $membro['gostos']
        );

        $membro['password'] = password_hash(
            (string) $membro['password'],
            PASSWORD_DEFAULT
        );

        try {
            $this->db->beginTransaction();

            $sql = "
                INSERT INTO membros (
                    primeiro_nome,
                    ultimo_nome,
                    nascimento,
                    genero,
                    telefone,
                    email,
                    bio,
                    password,
                    nome_seo
                )
                VALUES (
                    :primeiro_nome,
                    :ultimo_nome,
                    :nascimento,
                    :genero,
                    :telefone,
                    :email,
                    :sobre_ti,
                    :password,
                    :nome_seo
                )
            ";

            $this->db->runSQL($sql, [
                'primeiro_nome' => $membro['primeiro_nome'],
                'ultimo_nome' => $membro['ultimo_nome'],
                'nascimento' => $membro['nascimento'],
                'genero' => $membro['genero'],
                'telefone' => $membro['telefone'],
                'email' => $membro['email'],
                'sobre_ti' => $membro['sobre_ti'],
                'password' => $membro['password'],
                'nome_seo' => $membro['nome_seo']
            ]);

            /*
             * O ID é um UUID criado pela base de dados.
             * Por isso, não usamos lastInsertId().
             */
            $sql = "
                SELECT id
                FROM membros
                WHERE email = :email
                LIMIT 1
            ";

            $id = $this->db
                ->runSQL($sql, [
                    'email' => $membro['email']
                ])
                ->fetchColumn();

            if (!$id) {
                throw new \RuntimeException(
                    'Não foi possível obter o ID do membro criado.'
                );
            }

            $id = (string) $id;

            foreach ($gostos as $gosto) {
                $gosto = trim((string) $gosto);

                if ($gosto === '') {
                    continue;
                }

                $sql = "
                    SELECT id
                    FROM hobbies
                    WHERE nome = :gosto
                    LIMIT 1
                ";

                $hobbieId = $this->db
                    ->runSQL($sql, [
                        'gosto' => $gosto
                    ])
                    ->fetchColumn();

                if (!$hobbieId) {
                    continue;
                }

                $sql = "
                    INSERT IGNORE INTO membros_gostos (
                        membro_id,
                        hobbie_id
                    )
                    VALUES (
                        :membro_id,
                        :hobbie_id
                    )
                ";

                $this->db->runSQL($sql, [
                    'membro_id' => $id,
                    'hobbie_id' => $hobbieId
                ]);
            }

            /*
             * Não inserimos default.webp em fotos_perfil.
             *
             * Se o utilizador não tiver fotografias, as consultas
             * usam COALESCE(..., 'default.webp').
             */
            $this->db->commit();

            return $id;
        } catch (\PDOException $erro) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            $codigoMysql = (int) (
                $erro->errorInfo[1] ?? 0
            );

            if ($codigoMysql === 1062) {
                return false;
            }

            throw $erro;
        } catch (\Throwable $erro) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $erro;
        }
    }

    public function login(
        string $utilizador,
        string $password
    ): array|false {
        $sql = "
            SELECT
                m.id,
                m.primeiro_nome,
                m.ultimo_nome,
                m.nascimento,
                m.genero,
                m.email,
                m.telefone,
                m.password,
                m.adesao,
                m.bio,
                m.nome_seo,

                COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE fp.membro_id = m.id
                        AND (
                            fp.status = 'completo'
                            OR fp.status IS NULL
                        )
                        ORDER BY
                            fp.ordem IS NULL ASC,
                            fp.ordem ASC
                        LIMIT 1
                    ),
                    'default.webp'
                ) AS foto_perfil

            FROM membros AS m

            WHERE
                m.email = :utilizador_email
                OR m.telefone = :utilizador_telefone

            LIMIT 1
        ";

        $membro = $this->db
            ->runSQL($sql, [
                'utilizador_email' => $utilizador,
                'utilizador_telefone' => $utilizador
            ])
            ->fetch();

        if (!$membro) {
            return false;
        }

        $passwordValida = password_verify(
            $password,
            (string) $membro['password']
        );

        if (!$passwordValida) {
            return false;
        }

        return $membro;
    }

    public function delete(string $id): bool
    {
        try {
            $this->db->beginTransaction();

            $sql = "
                DELETE FROM membros_gostos
                WHERE membro_id = :id
            ";

            $this->db->runSQL($sql, [
                'id' => $id
            ]);

            $sql = "
                DELETE FROM fotos_perfil
                WHERE membro_id = :id
            ";

            $this->db->runSQL($sql, [
                'id' => $id
            ]);

            /*
             * Mantém estas eliminações apenas se as tabelas
             * ainda existirem neste projeto.
             */
            $tabelasComMembroId = [
                'receita',
                'publicacao_simples',
                'quik',
                'video_longo',
                'likes',
                'opiniao'
            ];

            foreach ($tabelasComMembroId as $tabela) {
                $sql = "
                    DELETE FROM {$tabela}
                    WHERE membro_id = :id
                ";

                $this->db->runSQL($sql, [
                    'id' => $id
                ]);
            }

            $sql = "
                DELETE FROM notificacao
                WHERE emissor_id = :id
            ";

            $this->db->runSQL($sql, [
                'id' => $id
            ]);

            $sql = "
                DELETE FROM seguir
                WHERE membro_id_1 = :id1
                OR membro_id_2 = :id2
            ";

            $this->db->runSQL($sql, [
                'id1' => $id,
                'id2' => $id
            ]);

            $sql = "
                DELETE FROM membros
                WHERE id = :id
            ";

            $this->db->runSQL($sql, [
                'id' => $id
            ]);

            $this->db->commit();

            return true;
        } catch (\Throwable $erro) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $erro;
        }
    }
}