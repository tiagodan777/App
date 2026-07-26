<?php
namespace App\CMS;

class Session {
    private $db;
    public $id, $primeiro_nome, $foto_perfil, $seo_name, $auth_version;

    public function __construct($db)
    {
        if (php_sapi_name() !== 'cli') {
            $secure = APP_ENV === 'production' ||
                (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

            ini_set('session.use_strict_mode', '1');
            ini_set('session.use_only_cookies', '1');
            ini_set('session.cookie_httponly', '1');
            ini_set('session.cookie_secure', $secure ? '1' : '0');
            ini_set('session.cookie_samesite', 'Lax');
            session_name('margot_session');
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'secure' => $secure,
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            session_start();
        }

        $this->db = $db;
        $token = $_COOKIE[Cookie::NAME] ?? '';
        $sessionMemberId = trim((string) ($_SESSION['id'] ?? ''));

        if (
            $token !== '' &&
            ($sessionMemberId === '' || $sessionMemberId === '0')
        ) {
            if ($this->create($token, 'stay_logged_id')) {
                /*
                 * Um token persistente é de utilização rotativa: depois de
                 * restaurar a sessão, o valor apresentado deixa de ser válido.
                 */
                (new Cookie($this->db))->create([
                    'id' => (string) $this->id
                ]);
            }
        }

        $this->id = $_SESSION['id'] ?? '';
        $this->primeiro_nome = $_SESSION['primeiro_nome'] ?? '';
        $this->foto_perfil = $_SESSION['foto_perfil'] ?? '';
        $this->seo_name = $_SESSION['seo_name'] ?? '';
        $this->auth_version = (int) ($_SESSION['auth_version'] ?? 0);
    }

    public function create(
        $token = '',
        $proposito = 'stay_logged_id',
        $membro_id = ''
    ) {
        if (!$membro_id) {
            $sql = "SELECT membro_id
                    FROM token
                    WHERE token = :token
                    AND proposito = :proposito
                    AND validade > UTC_TIMESTAMP()
                    LIMIT 1";

            $membro_id = $this->db->runSQL($sql, [
                'token' => hash('sha256', (string) $token),
                'proposito' => $proposito
            ])->fetchColumn();

            if (!$membro_id) {
                return false;
            }
        }

        $sql = "SELECT
                    m.id,
                    m.primeiro_nome,
                    f.nome_arquivo AS foto_perfil,
                    m.nome_seo,
                    m.auth_version
                FROM membros AS m
                LEFT JOIN fotos_perfil AS f
                    ON f.membro_id = m.id
                    AND f.ordem = 0
                    AND f.status = 'completo'
                WHERE m.id = :membro_id
                AND m.estado = 'ativo'
                LIMIT 1";

        $arguments = $this->db->runSQL($sql, [
            'membro_id' => $membro_id
        ])->fetch();

        if (!$arguments) {
            return false;
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }

        $_SESSION['id'] = $arguments['id'];
        $_SESSION['primeiro_nome'] = $arguments['primeiro_nome'];
        $_SESSION['foto_perfil'] = $arguments['foto_perfil'] ?? 'default.webp';
        $_SESSION['seo_name'] = $arguments['nome_seo'];
        $_SESSION['auth_version'] = (int) $arguments['auth_version'];

        $this->id = $_SESSION['id'];
        $this->primeiro_nome = $_SESSION['primeiro_nome'];
        $this->foto_perfil = $_SESSION['foto_perfil'];
        $this->seo_name = $_SESSION['seo_name'];
        $this->auth_version = $_SESSION['auth_version'];

        return true;
    }

    public function update($token) {
        $this->create($token);
    }

    public function delete() {
        $_SESSION = [];

        if (session_status() === PHP_SESSION_ACTIVE) {
            $param = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 3600,
                'path' => $param['path'] ?: '/',
                'secure' => (bool) $param['secure'],
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            session_destroy();
        }

        $this->id = 0;
        $this->primeiro_nome = '';
        $this->foto_perfil = '';
        $this->seo_name = '';
        $this->auth_version = 0;
    }
}
