<?php

declare(strict_types=1);

namespace App\CMS;

use RuntimeException;

class Cookie
{
    private const NOME = 'token';
    private const DURACAO = 1209600;

    private Token $tokens;

    public string $token;

    public function __construct(Database $db)
    {
        $this->tokens = new Token($db);
        $this->token = trim((string) ($_COOKIE[self::NOME] ?? ''));
    }

    public function create(array $member): string
    {
        $membroId = trim((string) ($member['id'] ?? ''));

        if ($membroId === '') {
            throw new RuntimeException(
                'Não foi possível criar o cookie de sessão.'
            );
        }

        if ($this->token !== '') {
            $this->tokens->delete($this->token);
        }

        $token = $this->tokens->create(
            $membroId,
            'stay_logged_id',
            self::DURACAO
        );

        if (!$this->guardar($token, time() + self::DURACAO)) {
            $this->tokens->delete($token);

            throw new RuntimeException(
                'Não foi possível guardar o cookie de sessão.'
            );
        }

        $this->token = $token;

        return $token;
    }

    public function updade(array $member): string
    {
        return $this->create($member);
    }

    public function delete(): void
    {
        try {
            if ($this->token !== '') {
                $this->tokens->delete($this->token);
            }
        } finally {
            $this->guardar('', time() - 3600);
            $this->token = '';
            unset($_COOKIE[self::NOME]);
        }
    }

    private function guardar(string $valor, int $validade): bool
    {
        return setcookie(self::NOME, $valor, [
            'expires' => $validade,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    }
}