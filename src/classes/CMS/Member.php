<?php

declare(strict_types=1);

namespace App\CMS;

use App\Security\MemberMutex;

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
                AND fp.status = 'completo'
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

    public function getPublic(string $id): array|false
    {
        $sql = "SELECT m.id, m.primeiro_nome, m.ultimo_nome,
                       CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                       m.nascimento, m.objetivo, m.bio, m.nome_seo
                FROM membros AS m
                WHERE m.id = :id
                AND m.estado = 'ativo'
                LIMIT 1";

        $membro = $this->db->runSQL($sql, ['id' => $id])->fetch();

        if (!$membro) return false;

        $membro['fotos'] = $this->db->runSQL(
            "SELECT fp.id, fp.nome_arquivo, fp.ordem
             FROM fotos_perfil AS fp
             WHERE fp.membro_id = :membro_id
             AND fp.status = 'completo'
             ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC",
            ['membro_id' => $id]
        )->fetchAll();

        $membro['gostos'] = $this->db->runSQL(
            "SELECT h.nome
             FROM hobbies AS h
             INNER JOIN membros_gostos AS mg ON mg.hobbie_id = h.id
             WHERE mg.membro_id = :membro_id
             ORDER BY h.nome ASC",
            ['membro_id' => $id]
        )->fetchAll();

        if (!$membro['fotos']) {
            $membro['fotos'] = [[
                'id' => null,
                'nome_arquivo' => 'default.webp',
                'ordem' => 1
            ]];
        }

        return $membro;
    }

    public function create(array $membro): string|false
    {
        $gostos = $this->normalizarGostos($membro['gostos'] ?? []);
        unset($membro['dia'], $membro['mes'], $membro['ano'], $membro['gostos']);

        $membro['email'] = $this->normalizarEmail((string) ($membro['email'] ?? ''));
        $membro['telefone'] = $this->normalizarTelefone((string) ($membro['telefone'] ?? ''));

        $passwordHash = password_hash((string) $membro['password'], PASSWORD_DEFAULT);

        if ($passwordHash === false) {
            throw new \RuntimeException('Não foi possível proteger a palavra-passe.');
        }

        $membro['password'] = $passwordHash;
        $gerirTransacao = !$this->db->inTransaction();

        try {
            if ($gerirTransacao) $this->db->beginTransaction();

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

            if (!$id) {
                throw new \RuntimeException('Não foi possível obter o ID do membro criado.');
            }

            $id = (string) $id;

            $this->sincronizarGostos($id, $gostos);

            if ($gerirTransacao) $this->db->commit();

            return $id;
        } catch (\PDOException $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) $this->db->rollBack();

            if ((int) ($erro->errorInfo[1] ?? 0) === 1062) return false;

            throw $erro;
        } catch (\Throwable $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) $this->db->rollBack();

            throw $erro;
        }
    }

    public function update(string $id, array $membro): bool
    {
        $gostos = $this->normalizarGostos($membro['gostos'] ?? []);
        unset($membro['dia'], $membro['mes'], $membro['ano'], $membro['gostos']);

        $membro['email'] = $this->normalizarEmail((string) ($membro['email'] ?? ''));
        $membro['telefone'] = $this->normalizarTelefone((string) ($membro['telefone'] ?? ''));

        $alterarPassword = (string) ($membro['password'] ?? '') !== '';
        $gerirTransacao = !$this->db->inTransaction();

        try {
            if ($gerirTransacao) $this->db->beginTransaction();

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
                $passwordHash = password_hash((string) $membro['password'], PASSWORD_DEFAULT);

                if ($passwordHash === false) {
                    throw new \RuntimeException('Não foi possível proteger a nova palavra-passe.');
                }

                $sql .=
                    ', password = :password, ' .
                    'auth_version = auth_version + 1';
                $parametros['password'] = $passwordHash;
            }

            $sql .= ' WHERE id = :id';

            $this->db->runSQL($sql, $parametros);
            $this->sincronizarGostos($id, $gostos);

            if ($gerirTransacao) $this->db->commit();

            return true;
        } catch (\PDOException $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) $this->db->rollBack();

            if ((int) ($erro->errorInfo[1] ?? 0) === 1062) return false;

            throw $erro;
        } catch (\Throwable $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) $this->db->rollBack();

            throw $erro;
        }
    }

    private function normalizarEmail(string $email): string
    {
        $email = trim($email);

        return function_exists('mb_strtolower')
            ? mb_strtolower($email, 'UTF-8')
            : strtolower($email);
    }

    private function normalizarTelefone(string $telefone): ?string
    {
        $telefone = (string) preg_replace('/\D+/', '', trim($telefone));

        return $telefone === '' ? null : $telefone;
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
        $utilizador = trim($utilizador);

        if ($utilizador === '' || $password === '') return false;

        $sql = "SELECT m.id, m.primeiro_nome, m.ultimo_nome, m.nascimento, m.genero, m.objetivo, m.email, m.telefone, m.password, m.adesao, m.bio,
                m.nome_seo, m.estado, COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE fp.membro_id = m.id
                        AND fp.status = 'completo'
                        ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
                        LIMIT 1
                    ),
                    'default.webp'
                ) AS foto_perfil
                FROM membros AS m";

        if (filter_var($utilizador, FILTER_VALIDATE_EMAIL)) {
            $sql .= ' WHERE LOWER(TRIM(m.email)) = :utilizador LIMIT 1';
            $identificador = $this->normalizarEmail($utilizador);
        } else {
            $sql .= " WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                        TRIM(m.telefone), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', '') = :utilizador
                    LIMIT 1";

            $identificador = $this->normalizarTelefone($utilizador);
        }

        if ($identificador === '' || $identificador === null) return false;

        $membro = $this->db->runSQL($sql, ['utilizador' => $identificador])->fetch();

        if (
            !$membro ||
            (string) ($membro['estado'] ?? '') !== 'ativo' ||
            !password_verify($password, (string) $membro['password'])
        ) {
            return false;
        }

        if (password_needs_rehash((string) $membro['password'], PASSWORD_DEFAULT)) {
            $novoHash = password_hash($password, PASSWORD_DEFAULT);

            if ($novoHash !== false) {
                $this->db->runSQL(
                    'UPDATE membros SET password = :password WHERE id = :id',
                    ['password' => $novoHash, 'id' => $membro['id']]
                );
            }
        }

        unset($membro['password'], $membro['estado']);

        return $membro;
    }

    public function verifyPassword(string $id, string $password): bool
    {
        if ($id === '' || $password === '') return false;

        $hash = $this->db->runSQL(
            'SELECT password FROM membros WHERE id = :id LIMIT 1',
            ['id' => $id]
        )->fetchColumn();

        return is_string($hash) && password_verify($password, $hash);
    }

    public function delete(string $id): bool
    {
        $id = trim($id);

        if ($id === '') return false;

        $mutex = new MemberMutex($this->db);

        if (!$mutex->acquire($id, 10)) {
            throw new \RuntimeException('A conta está a terminar outra alteração. Tenta novamente.');
        }

        $fotos = [];
        $ficheirosMensagens = [];

        try {
            try {
                $this->db->beginTransaction();

                $membroExiste = $this->db->runSQL(
                    'SELECT id FROM membros WHERE id = :id LIMIT 1 FOR UPDATE',
                    ['id' => $id]
                )->fetchColumn();

                if (!$membroExiste) {
                    $this->db->rollBack();

                    return false;
                }

                $fotos = $this->db->runSQL(
                    'SELECT nome_arquivo FROM fotos_perfil WHERE membro_id = :id',
                    ['id' => $id]
                )->fetchAll(\PDO::FETCH_COLUMN);

                $ficheirosMensagens = $this->db->runSQL(
                    'SELECT ficheiro_nome FROM mensagens_chat WHERE (emissor_id = :id1 OR destinatario_id = :id2) AND ficheiro_nome IS NOT NULL',
                    ['id1' => $id, 'id2' => $id]
                )->fetchAll(\PDO::FETCH_COLUMN);

                $this->enfileirarFicheiros($fotos, 'perfil', ['default.webp']);
                $this->enfileirarFicheiros($ficheirosMensagens, 'mensagem');

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

                $pseudonimo = hash_hmac('sha256', $id, APP_KEY);

                $this->db->runSQL(
                    'UPDATE denuncias
                     SET denunciante_pseudonimo = COALESCE(denunciante_pseudonimo, :pseudonimo),
                         membro_denuncia = NULL
                     WHERE membro_denuncia = :id',
                    ['pseudonimo' => $pseudonimo, 'id' => $id]
                );

                $this->db->runSQL(
                    "UPDATE denuncias
                     SET denunciado_pseudonimo = COALESCE(denunciado_pseudonimo, :pseudonimo),
                         membro_denunciado = NULL,
                         evidencia_json = JSON_SET(
                             JSON_REMOVE(
                                 COALESCE(evidencia_json, JSON_OBJECT()),
                                 '$.perfil.nome',
                                 '$.perfil.objetivo',
                                 '$.perfil.bio'
                             ),
                             '$.perfil_redigido',
                             TRUE
                         )
                     WHERE membro_denunciado = :id",
                    ['pseudonimo' => $pseudonimo, 'id' => $id]
                );

                $this->db->runSQL(
                    'UPDATE moderacao_acoes
                     SET moderador_pseudonimo = COALESCE(moderador_pseudonimo, :pseudonimo),
                         moderador_id = NULL
                     WHERE moderador_id = :id',
                    ['pseudonimo' => $pseudonimo, 'id' => $id]
                );

                $this->db->runSQL('DELETE FROM token WHERE membro_id = :id', ['id' => $id]);
                $this->db->runSQL('DELETE FROM websocket_tickets WHERE membro_id = :id', ['id' => $id]);
                $this->db->runSQL('DELETE FROM preferencias_privacidade_eventos WHERE membro_id = :id', ['id' => $id]);
                $this->db->runSQL('DELETE FROM preferencias_privacidade WHERE membro_id = :id', ['id' => $id]);
                $this->db->runSQL('DELETE FROM aceitacoes_legais WHERE membro_id = :id', ['id' => $id]);
                $this->db->runSQL('DELETE FROM membros_gostos WHERE membro_id = :id', ['id' => $id]);
                $this->db->runSQL('DELETE FROM fotos_perfil WHERE membro_id = :id', ['id' => $id]);

                $membroApagado = $this->db->runSQL(
                    'DELETE FROM membros WHERE id = :id',
                    ['id' => $id]
                )->rowCount() === 1;

                if (!$membroApagado) {
                    $this->db->rollBack();

                    return false;
                }

                $this->db->commit();
            } catch (\Throwable $erro) {
                if ($this->db->inTransaction()) $this->db->rollBack();

                throw $erro;
            }

            try {
                $this->apagarFicheiros($fotos, [
                    PROFILE_PHOTO_THUMB_DIR . '/',
                    PROFILE_PHOTO_ORIGINAL_DIR . '/',
                    PROFILE_PHOTO_TEMP_DIR . '/',
                    APP_ROOT . '/public/imagens/fotos-perfil/',
                    APP_ROOT . '/public/imagens/fotos-perfil-originais/',
                    APP_ROOT . '/public/imagens/fotos-perfil-temp/'
                ], 'perfil', ['default.webp']);

                $this->apagarFicheiros($ficheirosMensagens, [
                    MESSAGE_MEDIA_DIR . '/',
                    APP_ROOT . '/public/media/mensagens/'
                ], 'mensagem');
            } catch (\Throwable $erro) {
                error_log('[member-delete] A conta foi apagada; a limpeza física seguirá pela fila.');
            }

            return true;
        } finally {
            $mutex->release($id);
        }
    }

    private function enfileirarFicheiros(
        array $nomes,
        string $tipo,
        array $protegidos = []
    ): void {
        foreach ($this->normalizarNomesFicheiro($nomes, $tipo) as $nome) {
            $nome = basename(trim((string) $nome));

            if ($nome === '' || in_array($nome, $protegidos, true)) continue;

            $this->db->runSQL(
                'INSERT INTO ficheiros_a_apagar (tipo, nome_arquivo)
                 VALUES (:tipo, :nome)
                 ON DUPLICATE KEY UPDATE nome_arquivo = VALUES(nome_arquivo)',
                ['tipo' => $tipo, 'nome' => $nome]
            );
        }
    }

    private function apagarFicheiros(
        array $nomes,
        array $pastas,
        string $tipo,
        array $protegidos = []
    ): void
    {
        foreach ($this->normalizarNomesFicheiro($nomes, $tipo) as $nome) {
            $nome = basename(trim((string) $nome));

            if ($nome === '' || in_array($nome, $protegidos, true)) continue;

            $falhou = false;

            foreach ($pastas as $pasta) {
                $caminho = rtrim($pasta, '/') . '/' . $nome;

                try {
                    if (
                        (is_file($caminho) || is_link($caminho)) &&
                        !unlink($caminho)
                    ) {
                        $falhou = true;
                    }
                } catch (\Throwable $erro) {
                    $falhou = true;
                }
            }

            foreach ($pastas as $pasta) {
                $caminho = rtrim($pasta, '/') . '/' . $nome;
                if (is_file($caminho) || is_link($caminho)) $falhou = true;
            }

            if (!$falhou) {
                try {
                    $this->db->runSQL(
                        'DELETE FROM ficheiros_a_apagar
                         WHERE tipo = :tipo AND nome_arquivo = :nome',
                        ['tipo' => $tipo, 'nome' => $nome]
                    );
                } catch (\Throwable) {
                    error_log('[member-delete] A fila de eliminação será reconciliada pelo cron.');
                }

                continue;
            }

            try {
                $this->db->runSQL(
                    'UPDATE ficheiros_a_apagar
                     SET tentativas = tentativas + 1,
                         ultima_tentativa_em = UTC_TIMESTAMP(6),
                         ultimo_erro = :erro
                     WHERE tipo = :tipo AND nome_arquivo = :nome',
                    [
                        'erro' => 'Falha ao apagar um ou mais ficheiros.',
                        'tipo' => $tipo,
                        'nome' => $nome
                    ]
                );
            } catch (\Throwable) {
                // A operação lógica já terminou; nunca reverte a eliminação da conta.
            }

            error_log('[member-delete] Ficou media pendente na fila de eliminação.');
        }
    }

    private function normalizarNomesFicheiro(array $nomes, string $tipo): array
    {
        $resultado = [];

        foreach ($nomes as $nome) {
            $nome = basename(trim((string) $nome));

            if ($nome === '' || $nome === '.' || $nome === '..') continue;

            $resultado[$nome] = true;

            if ($tipo === 'perfil') {
                $webp = pathinfo($nome, PATHINFO_FILENAME) . '.webp';
                $resultado[$webp] = true;
            }
        }

        return array_keys($resultado);
    }
}
