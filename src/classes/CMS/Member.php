<?php

declare(strict_types=1);

namespace App\CMS;

use App\Validate\Validate;

class Member
{
    public const TERMS_VERSION = '1.0';
    public const PRIVACY_VERSION = '1.0';

    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function recordLegalAcceptance(string $memberId): void
    {
        $this->db->runSQL(
            'INSERT INTO aceitacoes_legais (membro_id, documento, versao)
             VALUES (:id1, :terms, :terms_version), (:id2, :privacy, :privacy_version)',
            [
                'id1' => $memberId,
                'terms' => 'terms',
                'terms_version' => self::TERMS_VERSION,
                'id2' => $memberId,
                'privacy' => 'privacy',
                'privacy_version' => self::PRIVACY_VERSION
            ]
        );
    }

    public function prepareAccountForm(array $input, array $sections, bool $creating): array
    {
        $value = static fn(string $key): string => is_scalar($input[$key] ?? null)
            ? trim((string) $input[$key]) : '';
        $selected = array_fill_keys($sections, true);
        $has = static fn(string $section): bool => isset($selected[$section]);

        $data = [
            'primeiro_nome' => $value('primeiro_nome'),
            'ultimo_nome' => $value('ultimo_nome'),
            'genero' => $value('genero'),
            'gostos' => $this->normalizarGostos($input['gostos'] ?? []),
            'telefone' => $value('telefone'),
            'email' => $value('email'),
            'sobre_ti' => $value('sobre_ti'),
            'password' => is_string($input['password'] ?? null) ? $input['password'] : ''
        ];

        $day = (int) $value('dia');
        $month = (int) $value('mes');
        $year = (int) $value('ano');
        $data['nascimento'] = checkdate($month, $day, $year)
            ? sprintf('%04d-%02d-%02d', $year, $month, $day) : '';

        $errors = [];
        $changes = [];

        if ($has('nome')) {
            if (!Validate::isText($data['primeiro_nome'], 1, 60)) {
                $errors['primeiro_nome'] = 'Indica o primeiro nome.';
            }
            if (!Validate::isText($data['ultimo_nome'], 1, 60)) {
                $errors['ultimo_nome'] = 'Indica o último nome.';
            }
            $changes += [
                'primeiro_nome' => $data['primeiro_nome'],
                'ultimo_nome' => $data['ultimo_nome'],
                'nome_seo' => \create_seo_name($data['primeiro_nome'] . ' ' . $data['ultimo_nome'])
            ];
        }

        if ($has('nascimento')) {
            if (!Validate::isAdult($data['nascimento'])) {
                $errors['nascimento'] = 'Indica uma data válida. Tens de ter pelo menos 18 anos.';
            }
            $changes['nascimento'] = $data['nascimento'];
        }

        if ($has('sexo')) {
            if (!Validate::isGenero($data['genero'])) {
                $errors['genero'] = 'Escolhe um género válido.';
            }
            $changes['genero'] = $data['genero'];
        }

        if ($has('gostos')) $changes['gostos'] = $data['gostos'];

        if ($has('contactos')) {
            if (!Validate::isEmail($data['email'])) $errors['email'] = 'Indica um email válido.';
            if ($data['telefone'] !== '' && !Validate::isPhone($data['telefone'])) {
                $errors['telefone'] = 'Indica um número de telefone válido.';
            }
            $changes += ['telefone' => $data['telefone'], 'email' => $data['email']];
        }

        if ($has('descricao')) $changes['sobre_ti'] = $data['sobre_ti'];

        $confirmation = is_string($input['confirma_password'] ?? null)
            ? $input['confirma_password'] : '';
        $passwordRequested = $has('palavra-passe') && (
            $creating || count($sections) === 1 || $data['password'] !== '' || $confirmation !== ''
        );

        if ($passwordRequested) {
            if (!Validate::isPassword($data['password'])) {
                $errors['password'] = 'Usa pelo menos 8 caracteres, uma maiúscula, uma minúscula e um número.';
            } elseif ($data['password'] !== $confirmation) {
                $errors['confirma_password'] = 'As palavras-passe não são idênticas.';
            }
            $changes['password'] = $data['password'];
        }

        if ($creating) {
            if ($value('aceitou_termos') !== '1') {
                $errors['aceitou_termos'] = 'Aceita os Termos de Utilização.';
            }
            if ($value('aceitou_privacidade') !== '1') {
                $errors['aceitou_privacidade'] = 'Confirma a Política de Privacidade.';
            }
        }

        return ['data' => $data, 'changes' => $changes, 'errors' => $errors];
    }

    public function get(string $id): array|false
    {
        $member = $this->db->runSQL(
            "SELECT m.id, m.primeiro_nome, m.ultimo_nome,
                    CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                    m.nascimento, m.genero, m.objetivo, m.telefone,
                    m.email, m.bio, m.nome_seo
             FROM membros m WHERE m.id = :id LIMIT 1",
            ['id' => $id]
        )->fetch();

        if (!$member) return false;

        $member['fotos'] = $this->db->runSQL(
            "SELECT id, nome_arquivo, ordem FROM fotos_perfil
             WHERE membro_id = :id AND (status = 'completo' OR status IS NULL)
             ORDER BY ordem IS NULL, ordem, id",
            ['id' => $id]
        )->fetchAll();

        $member['gostos'] = $this->db->runSQL(
            'SELECT h.nome FROM hobbies h
             INNER JOIN membros_gostos mg ON mg.hobbie_id = h.id
             WHERE mg.membro_id = :id ORDER BY h.nome',
            ['id' => $id]
        )->fetchAll();

        if (!$member['fotos']) {
            $member['fotos'] = [['id' => null, 'nome_arquivo' => 'default.webp', 'ordem' => 1]];
        }

        return $member;
    }

    public function create(array $member): string|false
    {
        $tastes = $this->normalizarGostos($member['gostos'] ?? []);
        $member['email'] = $this->normalizarEmail((string) ($member['email'] ?? ''));
        $member['telefone'] = $this->normalizarTelefone((string) ($member['telefone'] ?? ''));
        $password = password_hash((string) ($member['password'] ?? ''), PASSWORD_DEFAULT);

        if ($password === false) throw new \RuntimeException('Não foi possível proteger a palavra-passe.');
        $managesTransaction = !$this->db->inTransaction();

        try {
            if ($managesTransaction) $this->db->beginTransaction();
            $this->db->runSQL(
                'INSERT INTO membros
                    (primeiro_nome, ultimo_nome, nascimento, genero,
                     telefone, email, bio, password, nome_seo)
                 VALUES
                    (:primeiro_nome, :ultimo_nome, :nascimento, :genero,
                     :telefone, :email, :bio, :password, :nome_seo)',
                [
                    'primeiro_nome' => $member['primeiro_nome'],
                    'ultimo_nome' => $member['ultimo_nome'],
                    'nascimento' => $member['nascimento'],
                    'genero' => $member['genero'],
                    'telefone' => $member['telefone'],
                    'email' => $member['email'],
                    'bio' => $member['sobre_ti'],
                    'password' => $password,
                    'nome_seo' => $member['nome_seo']
                ]
            );

            $id = $this->db->runSQL(
                'SELECT id FROM membros WHERE email = :email LIMIT 1',
                ['email' => $member['email']]
            )->fetchColumn();
            if (!$id) throw new \RuntimeException('Não foi possível obter o membro criado.');

            $this->sincronizarGostos((string) $id, $tastes);
            if ($managesTransaction) $this->db->commit();
            return (string) $id;
        } catch (\Throwable $error) {
            if ($managesTransaction && $this->db->inTransaction()) $this->db->rollBack();
            if ($error instanceof \PDOException && (int) ($error->errorInfo[1] ?? 0) === 1062) return false;
            throw $error;
        }
    }

    public function update(string $id, array $changes): bool
    {
        if (trim($id) === '') return false;

        $hasTastes = array_key_exists('gostos', $changes);
        $tastes = $hasTastes ? $this->normalizarGostos($changes['gostos']) : [];
        unset($changes['gostos'], $changes['dia'], $changes['mes'], $changes['ano']);

        $columns = [
            'primeiro_nome' => 'primeiro_nome', 'ultimo_nome' => 'ultimo_nome',
            'nascimento' => 'nascimento', 'genero' => 'genero',
            'nome_seo' => 'nome_seo'
        ];
        $sets = [];
        $params = ['id' => $id];

        foreach ($columns as $key => $column) {
            if (!array_key_exists($key, $changes)) continue;
            $sets[] = $column . ' = :' . $key;
            $params[$key] = trim((string) $changes[$key]);
        }

        if (array_key_exists('telefone', $changes)) {
            $sets[] = 'telefone = :telefone';
            $params['telefone'] = $this->normalizarTelefone((string) $changes['telefone']);
        }

        if (array_key_exists('email', $changes)) {
            $sets[] = 'email = :email';
            $params['email'] = $this->normalizarEmail((string) $changes['email']);
        }

        if (array_key_exists('sobre_ti', $changes)) {
            $sets[] = 'bio = :bio';
            $params['bio'] = trim((string) $changes['sobre_ti']);
        }

        if (!empty($changes['password'])) {
            $sets[] = 'password = :password';
            $params['password'] = password_hash((string) $changes['password'], PASSWORD_DEFAULT);

            if ($params['password'] === false) {
                throw new \RuntimeException('Não foi possível proteger a palavra-passe.');
            }
        }

        if (!$sets && !$hasTastes) return true;

        $managesTransaction = !$this->db->inTransaction();

        try {
            if ($managesTransaction) $this->db->beginTransaction();

            if ($sets) {
                $this->db->runSQL(
                    'UPDATE membros SET ' . implode(', ', $sets) . ' WHERE id = :id',
                    $params
                );
            }

            if ($hasTastes) $this->sincronizarGostos($id, $tastes);

            if ($managesTransaction) $this->db->commit();

            return true;
        } catch (\Throwable $error) {
            if ($managesTransaction && $this->db->inTransaction()) {
                $this->db->rollBack();
            }

            if (
                $error instanceof \PDOException &&
                (int) ($error->errorInfo[1] ?? 0) === 1062
            ) {
                return false;
            }

            throw $error;
        }
    }

    private function normalizarEmail(string $email): string
    {
        return mb_strtolower(trim($email), 'UTF-8');
    }

    private function normalizarTelefone(string $phone): string
    {
        return (string) preg_replace('/\D+/', '', $phone);
    }

    private function normalizarGostos($tastes): array
    {
        if (!is_array($tastes)) return [];

        $result = [];

        foreach ($tastes as $taste) {
            if (!is_scalar($taste)) continue;

            $taste = trim((string) $taste);

            if ($taste !== '') {
                $result[mb_strtolower($taste, 'UTF-8')] = $taste;
            }
        }

        return array_values($result);
    }

    private function sincronizarGostos(string $memberId, array $tastes): void
    {
        $this->db->runSQL(
            'DELETE FROM membros_gostos WHERE membro_id = :id',
            ['id' => $memberId]
        );

        foreach ($tastes as $taste) {
            $this->db->runSQL(
                'INSERT IGNORE INTO hobbies (nome) VALUES (:nome)',
                ['nome' => $taste]
            );

            $hobbyId = $this->db->runSQL(
                'SELECT id FROM hobbies WHERE nome = :nome LIMIT 1',
                ['nome' => $taste]
            )->fetchColumn();

            if (!$hobbyId) {
                throw new \RuntimeException('Não foi possível guardar um gosto.');
            }

            $this->db->runSQL(
                'INSERT IGNORE INTO membros_gostos (membro_id, hobbie_id)
                 VALUES (:member, :hobby)',
                [
                    'member' => $memberId,
                    'hobby' => $hobbyId
                ]
            );
        }
    }

    public function login(string $username, string $password): array|false
    {
        $username = trim($username);

        if ($username === '' || $password === '') return false;

        $select = "SELECT m.id, m.primeiro_nome, m.ultimo_nome, m.nascimento,
                          m.genero, m.objetivo, m.email, m.telefone, m.password,
                          m.adesao, m.bio, m.nome_seo,
                          COALESCE((SELECT fp.nome_arquivo FROM fotos_perfil fp
                            WHERE fp.membro_id = m.id
                              AND (fp.status = 'completo' OR fp.status IS NULL)
                            ORDER BY fp.ordem IS NULL, fp.ordem LIMIT 1), 'default.webp') AS foto_perfil
                   FROM membros m WHERE ";

        if (filter_var($username, FILTER_VALIDATE_EMAIL)) {
            $condition = 'LOWER(TRIM(m.email)) = :username';
            $username = $this->normalizarEmail($username);
        } else {
            $condition = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                TRIM(m.telefone), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', '') = :username";

            $username = $this->normalizarTelefone($username);
        }

        if ($username === '') return false;

        $sql = $select .
            $condition .
            ' AND ' .
            Validate::adultSqlColumnCondition('m.nascimento') .
            ' LIMIT 1';

        $member = $this->db->runSQL(
            $sql,
            ['username' => $username]
        )->fetch();

        if (
            !$member ||
            !password_verify(
                $password,
                (string) $member['password']
            )
        ) {
            return false;
        }

        if (
            password_needs_rehash(
                (string) $member['password'],
                PASSWORD_DEFAULT
            )
        ) {
            $hash = password_hash(
                $password,
                PASSWORD_DEFAULT
            );

            if ($hash !== false) {
                $this->db->runSQL(
                    'UPDATE membros
                     SET password = :password
                     WHERE id = :id',
                    [
                        'password' => $hash,
                        'id' => $member['id']
                    ]
                );

                $member['password'] = $hash;
            }
        }

        return $member;
    }

    public function delete(string $id): bool
    {
        if (trim($id) === '') return false;

        $photos = $this->db->runSQL(
            'SELECT nome_arquivo
             FROM fotos_perfil
             WHERE membro_id = :id',
            ['id' => $id]
        )->fetchAll(\PDO::FETCH_COLUMN);

        $messageFiles = $this->db->runSQL(
            'SELECT ficheiro_nome
             FROM mensagens_chat
             WHERE (
                emissor_id = :id1 OR
                destinatario_id = :id2
             )
             AND ficheiro_nome IS NOT NULL',
            [
                'id1' => $id,
                'id2' => $id
            ]
        )->fetchAll(\PDO::FETCH_COLUMN);

        $deletes = [
            [
                'DELETE FROM mensagens_chat
                 WHERE emissor_id = :id1 OR destinatario_id = :id2',
                ['id1' => $id, 'id2' => $id]
            ],
            [
                'DELETE FROM notificacao
                 WHERE emissor_id = :id1 OR destinatario_id = :id2',
                ['id1' => $id, 'id2' => $id]
            ],
            [
                'DELETE FROM bloqueados
                 WHERE pessoa_bloqueou_id = :id1 OR pessoa_bloqueada_id = :id2',
                ['id1' => $id, 'id2' => $id]
            ],
            [
                'DELETE FROM denuncias
                 WHERE membro_denuncia = :id1 OR membro_denunciado = :id2',
                ['id1' => $id, 'id2' => $id]
            ],
            [
                'DELETE FROM token WHERE membro_id = :id',
                ['id' => $id]
            ],
            [
                'DELETE FROM localizacao_membro WHERE membro_id = :id',
                ['id' => $id]
            ],
            [
                'DELETE FROM membros_gostos WHERE membro_id = :id',
                ['id' => $id]
            ],
            [
                'DELETE FROM fotos_perfil WHERE membro_id = :id',
                ['id' => $id]
            ]
        ];

        try {
            $this->db->beginTransaction();

            foreach ($deletes as [$sql, $params]) {
                $this->db->runSQL($sql, $params);
            }

            $deleted = $this->db->runSQL(
                'DELETE FROM membros WHERE id = :id',
                ['id' => $id]
            )->rowCount() === 1;

            $this->db->commit();
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $error;
        }

        if (!$deleted) return false;

        $this->apagarFicheiros(
            $photos,
            [
                APP_ROOT . '/public/imagens/fotos-perfil/',
                APP_ROOT . '/public/imagens/fotos-perfil-originais/',
                APP_ROOT . '/public/imagens/fotos-perfil-temp/'
            ],
            ['default.webp']
        );

        $this->apagarFicheiros(
            $messageFiles,
            [APP_ROOT . '/public/media/mensagens/']
        );

        return true;
    }

    private function apagarFicheiros(
        array $names,
        array $directories,
        array $protected = []
    ): void {
        foreach (array_unique($names) as $name) {
            $name = basename(
                trim((string) $name)
            );

            if (
                $name === '' ||
                in_array($name, $protected, true)
            ) {
                continue;
            }

            foreach ($directories as $directory) {
                $path =
                    rtrim($directory, '/') .
                    '/' .
                    $name;

                if (
                    is_file($path) &&
                    !@unlink($path)
                ) {
                    error_log(
                        'Não foi possível apagar: ' .
                        $path
                    );
                }
            }
        }
    }
}