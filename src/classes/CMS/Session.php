<?php

declare(strict_types=1);

namespace App\CMS;

use App\Validate\Validate;

class Session
{
    private Database $db;

    public string $id = '';
    public string $primeiro_nome = '';
    public string $foto_perfil = '';
    public string $seo_name = '';
    public string $token = '';

    public function __construct(Database $db)
    {
        $this->db = $db;

        if (PHP_SAPI !== 'cli') {
            $this->iniciar();
            $this->carregar();
        }
    }

    public function create(string $token = '', string $proposito = 'stay_logged_id', string $membro_id = ''): bool
    {
        if ($membro_id === '') {
            $membro_id = (string) (new Token($this->db))->getMemberId($token, $proposito);

            if ($membro_id === '') {
                return false;
            }
        }

        $membro = $this->db->runSQL(
            "SELECT m.id, m.primeiro_nome, m.nome_seo, COALESCE((SELECT f.nome_arquivo FROM fotos_perfil AS f WHERE f.membro_id = m.id AND (f.status = 'completo' OR f.status IS NULL) ORDER BY COALESCE(f.ordem, 2147483647), f.id LIMIT 1), 'default.webp') AS foto_perfil FROM membros AS m WHERE m.id = :membro_id AND " . Validate::adultSqlColumnCondition('m.nascimento') . " LIMIT 1",
            ['membro_id' => $membro_id]
        )->fetch();

        if (!$membro) {
            return false;
        }

        if (PHP_SAPI !== 'cli' && session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }

        $_SESSION['id'] = (string) $membro['id'];
        $_SESSION['primeiro_nome'] = (string) $membro['primeiro_nome'];
        $_SESSION['foto_perfil'] = (string) $membro['foto_perfil'];
        $_SESSION['seo_name'] = (string) $membro['nome_seo'];

        $this->token = $token;
        $this->carregar();

        return true;
    }

    public function update(string $token): bool
    {
        return $this->create($token);
    }

    public function delete(): void
    {
        if (PHP_SAPI === 'cli' || session_status() !== PHP_SESSION_ACTIVE) {
            return;
        }

        $_SESSION = [];
        $parametros = session_get_cookie_params();

        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $parametros['path'],
            'domain' => $parametros['domain'],
            'secure' => $parametros['secure'],
            'httponly' => $parametros['httponly'],
            'samesite' => $parametros['samesite'] ?: 'Lax'
        ]);

        session_destroy();

        $this->id = '';
        $this->primeiro_nome = '';
        $this->foto_perfil = '';
        $this->seo_name = '';
        $this->token = '';
    }

    private function iniciar(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_strict_mode', '1');

        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);

        session_start();
    }

    private function carregar(): void
    {
        $this->id = (string) ($_SESSION['id'] ?? '');
        $this->primeiro_nome = (string) ($_SESSION['primeiro_nome'] ?? '');
        $this->foto_perfil = (string) ($_SESSION['foto_perfil'] ?? '');
        $this->seo_name = (string) ($_SESSION['seo_name'] ?? '');
    }
}