<?php
namespace App\CMS;

class Cookie {
    public const NAME = 'margot_remember';

    private $db;
    private string $token;

    public function __construct($db)
    {   
        $this->db = $db;
        $this->token = (string) ($_COOKIE[self::NAME] ?? '');
    }

    public function create($member) {
        $plainToken = bin2hex(random_bytes(32));
        $arguments['token'] = hash('sha256', $plainToken);
        $arguments['validade'] = gmdate('Y-m-d H:i:s', time() + 14 * 86400);
        $arguments['membro_id'] = $member['id'];
        $arguments['proposito'] = 'stay_logged_id';

        $this->db->runSQL(
            'DELETE FROM token
             WHERE membro_id = :membro_id
             AND proposito = :proposito',
            [
                'membro_id' => $arguments['membro_id'],
                'proposito' => $arguments['proposito']
            ]
        );

        $sql = "INSERT INTO token (token, validade, membro_id, proposito)
                VALUES (:token, :validade, :membro_id, :proposito);";
        $this->db->runSQL($sql, $arguments);

        setcookie(self::NAME, $plainToken, $this->cookieOptions(time() + 60 * 60 * 24 * 14));
        $this->token = $plainToken;

        return $plainToken;
    }

    public function updade($member) {
        $this->create($member);
    }

    public function delete() {
        try {
            if ($this->token !== '') {
                $this->db->runSQL(
                    'DELETE FROM token WHERE token = :token AND proposito = :proposito',
                    [
                        'token' => hash('sha256', $this->token),
                        'proposito' => 'stay_logged_id'
                    ]
                );
            }
        } finally {
            /*
             * Mesmo que a base de dados esteja indisponível, o browser deixa
             * de apresentar o token. O erro continua a propagar para que a
             * operação possa alertar e repetir a revogação no servidor.
             */
            setcookie(self::NAME, '', $this->cookieOptions(time() - 3600));
            setcookie('token', '', $this->cookieOptions(time() - 3600));
            $this->token = '';
        }
    }

    private function cookieOptions(int $expires): array
    {
        $secure = APP_ENV === 'production' ||
            (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

        return [
            'expires' => $expires,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ];
    }
}
