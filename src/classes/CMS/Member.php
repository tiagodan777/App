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

    public function get(string $id): array|false
    {
        $sql = "SELECT m.id, m.primeiro_nome, m.ultimo_nome, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome, m.nascimento, m.genero, m.objetivo, m.telefone, m.email, m.bio, m.nome_seo
                FROM membros AS m
                WHERE m.id = :id
                LIMIT 1";

        $membro = $this->db->runSQL($sql, ['id' => $id])->fetch();

        if (!$membro) return false;

        $sql = "SELECT fp.id, fp.nome_arquivo, fp.ordem
                FROM fotos_perfil AS fp
                WHERE fp.membro_id = :membro_id
                AND (fp.status = 'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC";

        $membro['fotos'] = $this->db->runSQL($sql, ['membro_id' => $id])->fetchAll();

        $sql = "SELECT h.nome
                FROM hobbies AS h
                INNER JOIN membros_gostos AS mg ON mg.hobbie_id = h.id
                WHERE mg.membro_id = :membro_id
                ORDER BY h.nome ASC";

        $membro['gostos'] = $this->db->runSQL($sql, ['membro_id' => $id])->fetchAll();

        if (!$membro['fotos']) {
            $membro['fotos'] = [['id' => null, 'nome_arquivo' => 'default.webp', 'ordem' => 1]];
        }

        return $membro;
    }

    public function create(array $membro): string|false
    {
        $gostos = $this->normalizarGostos($membro['gostos'] ?? []);
        unset($membro['dia'], $membro['mes'], $membro['ano'], $membro['gostos']);

        $membro['password'] = password_hash((string) $membro['password'], PASSWORD_DEFAULT);

        try {
            $this->db->beginTransaction();

            $sql = "INSERT INTO membros (primeiro_nome, ultimo_nome, nascimento, genero, objetivo, telefone, email, bio, password, nome_seo)
                    VALUES (:primeiro_nome, :ultimo_nome, :nascimento, :genero, :objetivo, :telefone, :email, :bio, :password, :nome_seo)";

            $this->db->runSQL($sql, [
                'primeiro_nome' => $membro['primeiro_nome'],
                'ultimo_nome' => $membro['ultimo_nome'],
                'nascimento' => $membro['nascimento'],
                'genero' => $membro['genero'],
                'objetivo' => $membro['objetivo'],
                'telefone' => $membro['telefone'],
                'email' => $membro['email'],
                'bio' => $membro['sobre_ti'],
                'password' => $membro['password'],
                'nome_seo' => $membro['nome_seo']
            ]);

            $id = $this->db->runSQL(
                'SELECT id FROM membros WHERE email = :email LIMIT 1',
                ['email' => $membro['email']]
            )->fetchColumn();

            if (!$id) throw new \RuntimeException('Não foi possível obter o ID do membro criado.');

            $id = (string) $id;
            $this->sincronizarGostos($id, $gostos);
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

    public function update(string $id, array $membro): bool
    {
        $gostos = $this->normalizarGostos($membro['gostos'] ?? []);
        unset($membro['dia'], $membro['mes'], $membro['ano'], $membro['gostos']);

        $alterarPassword = (string) ($membro['password'] ?? '') !== '';

        try {
            $this->db->beginTransaction();

            $sql = "UPDATE membros SET primeiro_nome = :primeiro_nome, ultimo_nome = :ultimo_nome, nascimento = :nascimento, genero = :genero,
                    objetivo = :objetivo, telefone = :telefone, email = :email, bio = :bio, nome_seo = :nome_seo";

            $parametros = [
                'id' => $id,
                'primeiro_nome' => $membro['primeiro_nome'],
                'ultimo_nome' => $membro['ultimo_nome'],
                'nascimento' => $membro['nascimento'],
                'genero' => $membro['genero'],
                'objetivo' => $membro['objetivo'],
                'telefone' => $membro['telefone'],
                'email' => $membro['email'],
                'bio' => $membro['sobre_ti'],
                'nome_seo' => $membro['nome_seo']
            ];

            if ($alterarPassword) {
                $sql .= ', password = :password';
                $parametros['password'] = password_hash((string) $membro['password'], PASSWORD_DEFAULT);
            }

            $sql .= ' WHERE id = :id';

            $this->db->runSQL($sql, $parametros);
            $this->sincronizarGostos($id, $gostos);
            $this->db->commit();

            return true;
        } catch (\PDOException $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            if ((int) ($erro->errorInfo[1] ?? 0) === 1062) return false;
            throw $erro;
        } catch (\Throwable $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $erro;
        }
    }

    private function normalizarGostos($gostos): array
    {
        if (!is_array($gostos)) return [];

        return array_values(array_unique(array_filter(
            array_map(static fn($gosto): string => trim((string) $gosto), $gostos),
            static fn(string $gosto): bool => $gosto !== ''
        )));
    }

    private function sincronizarGostos(string $membroId, array $gostos): void
    {
        $this->db->runSQL(
            'DELETE FROM membros_gostos WHERE membro_id = :membro_id',
            ['membro_id' => $membroId]
        );

        foreach ($gostos as $gosto) {
            $hobbieId = $this->db->runSQL(
                'SELECT id FROM hobbies WHERE nome = :gosto LIMIT 1',
                ['gosto' => $gosto]
            )->fetchColumn();

            if (!$hobbieId) continue;

            $this->db->runSQL(
                'INSERT IGNORE INTO membros_gostos (membro_id, hobbie_id) VALUES (:membro_id, :hobbie_id)',
                ['membro_id' => $membroId, 'hobbie_id' => $hobbieId]
            );
        }
    }

    public function login(string $utilizador, string $password): array|false
    {
        $sql = "SELECT m.id, m.primeiro_nome, m.ultimo_nome, m.nascimento, m.genero, m.objetivo, m.email, m.telefone, m.password, m.adesao, m.bio,
                m.nome_seo, COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE fp.membro_id = m.id
                        AND (fp.status = 'completo' OR fp.status IS NULL)
                        ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
                        LIMIT 1
                    ),
                    'default.webp'
                ) AS foto_perfil
                FROM membros AS m
                WHERE m.email = :utilizador_email OR m.telefone = :utilizador_telefone
                LIMIT 1";

        $membro = $this->db->runSQL($sql, [
            'utilizador_email' => $utilizador,
            'utilizador_telefone' => $utilizador
        ])->fetch();

        if (!$membro || !password_verify($password, (string) $membro['password'])) return false;

        return $membro;
    }

    public function delete(string $id): bool
    {
        $id = trim($id);
        if ($id === '') return false;

        $fotos = [];
        $ficheirosMensagens = [];
        $membroApagado = false;

        try {
            $this->db->beginTransaction();

            $fotos = $this->db->runSQL(
                'SELECT nome_arquivo FROM fotos_perfil WHERE membro_id = :id',
                ['id' => $id]
            )->fetchAll(\PDO::FETCH_COLUMN);

            $ficheirosMensagens = $this->db->runSQL(
                'SELECT ficheiro_nome FROM mensagens_chat WHERE (emissor_id = :id1 OR destinatario_id = :id2) AND ficheiro_nome IS NOT NULL',
                ['id1' => $id, 'id2' => $id]
            )->fetchAll(\PDO::FETCH_COLUMN);

            $this->db->runSQL(
                'DELETE FROM mensagens_chat WHERE emissor_id = :id1 OR destinatario_id = :id2',
                ['id1' => $id, 'id2' => $id]
            );

            $this->db->runSQL(
                'DELETE FROM notificacao WHERE emissor_id = :id1 OR destinatario_id = :id2',
                ['id1' => $id, 'id2' => $id]
            );

            $this->db->runSQL(
                'DELETE FROM bloqueados WHERE pessoa_bloqueou_id = :id1 OR pessoa_bloqueada_id = :id2',
                ['id1' => $id, 'id2' => $id]
            );

            $this->db->runSQL(
                'DELETE FROM denuncias WHERE membro_denuncia = :id1 OR membro_denunciado = :id2',
                ['id1' => $id, 'id2' => $id]
            );

            $this->db->runSQL('DELETE FROM token WHERE membro_id = :id', ['id' => $id]);
            $this->db->runSQL('DELETE FROM localizacoes WHERE membro_id = :id', ['id' => $id]);
            $this->db->runSQL('DELETE FROM membros_gostos WHERE membro_id = :id', ['id' => $id]);
            $this->db->runSQL('DELETE FROM fotos_perfil WHERE membro_id = :id', ['id' => $id]);

            $membroApagado = $this->db->runSQL(
                'DELETE FROM membros WHERE id = :id',
                ['id' => $id]
            )->rowCount() === 1;

            $this->db->commit();
        } catch (\Throwable $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $erro;
        }

        if (!$membroApagado) return false;

        $this->apagarFicheiros($fotos, [
            APP_ROOT . '/public/imagens/fotos-perfil/',
            APP_ROOT . '/public/imagens/fotos-perfil-originais/',
            APP_ROOT . '/public/imagens/fotos-perfil-temp/'
        ], ['default.webp']);

        $this->apagarFicheiros($ficheirosMensagens, [
            APP_ROOT . '/public/media/mensagens/'
        ]);

        return true;
    }

    private function apagarFicheiros(array $nomes, array $pastas, array $protegidos = []): void
    {
        foreach (array_unique($nomes) as $nome) {
            $nome = basename(trim((string) $nome));
            if ($nome === '' || in_array($nome, $protegidos, true)) continue;

            foreach ($pastas as $pasta) {
                $caminho = rtrim($pasta, '/') . '/' . $nome;

                try {
                    if (is_file($caminho) && !unlink($caminho)) {
                        error_log('Não foi possível apagar o ficheiro: ' . $caminho);
                    }
                } catch (\Throwable $erro) {
                    error_log('Não foi possível apagar o ficheiro ' . $caminho . ': ' . $erro->getMessage());
                }
            }
        }
    }
}