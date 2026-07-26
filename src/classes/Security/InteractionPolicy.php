<?php

declare(strict_types=1);

namespace App\Security;

use PDO;

final class InteractionPolicy
{
    private const TOKEN_PREFIX = 'v2';
    private const TOKEN_CIPHER = 'aes-256-gcm';
    private const TOKEN_AAD = 'margot-proximity-v2';
    private const TOKEN_IV_BYTES = 12;
    private const TOKEN_TAG_BYTES = 16;
    private const SESSION_GRANT_KEY = 'margot_proximity_grants_v1';

    public function __construct(
        private PDO $db,
        private string $secret
    ) {
    }

    public static function issueProximityToken(
        string $viewerId,
        string $targetId,
        string $secret,
        int $ttlSeconds = 120
    ): string {
        $payload = [
            'v' => $viewerId,
            't' => $targetId,
            'e' => time() + max(30, min($ttlSeconds, 300))
        ];
        $plaintext = (string) json_encode(
            $payload,
            JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        $iv = random_bytes(self::TOKEN_IV_BYTES);
        $tag = '';
        $ciphertext = openssl_encrypt(
            $plaintext,
            self::TOKEN_CIPHER,
            self::encryptionKey($secret),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            self::TOKEN_AAD,
            self::TOKEN_TAG_BYTES
        );

        if ($ciphertext === false || strlen($tag) !== self::TOKEN_TAG_BYTES) {
            throw new \RuntimeException('Não foi possível emitir o acesso de proximidade.');
        }

        return self::TOKEN_PREFIX . '.' .
            self::base64UrlEncode($iv . $tag . $ciphertext);
    }

    public static function validateProximityToken(
        string $token,
        string $viewerId,
        string $targetId,
        string $secret
    ): bool {
        if ($token === '' || strlen($token) > 1024 || !str_contains($token, '.')) {
            return false;
        }

        [$prefix, $encoded] = explode('.', $token, 2);

        if (!hash_equals(self::TOKEN_PREFIX, $prefix)) return false;

        $binary = self::base64UrlDecode($encoded);

        if (strlen($binary) <= self::TOKEN_IV_BYTES + self::TOKEN_TAG_BYTES) {
            return false;
        }

        $iv = substr($binary, 0, self::TOKEN_IV_BYTES);
        $tag = substr($binary, self::TOKEN_IV_BYTES, self::TOKEN_TAG_BYTES);
        $ciphertext = substr(
            $binary,
            self::TOKEN_IV_BYTES + self::TOKEN_TAG_BYTES
        );
        $plaintext = openssl_decrypt(
            $ciphertext,
            self::TOKEN_CIPHER,
            self::encryptionKey($secret),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            self::TOKEN_AAD
        );

        if ($plaintext === false) return false;

        $payload = json_decode($plaintext, true);
        $now = time();

        return is_array($payload) &&
            isset($payload['v'], $payload['t'], $payload['e']) &&
            hash_equals($viewerId, (string) $payload['v']) &&
            hash_equals($targetId, (string) $payload['t']) &&
            (int) $payload['e'] >= $now &&
            (int) $payload['e'] <= $now + 300;
    }

    public function areBlocked(string $firstId, string $secondId): bool
    {
        $statement = $this->db->prepare(
            'SELECT 1
             FROM bloqueados
             WHERE (
                 pessoa_bloqueou_id = :first1
                 AND pessoa_bloqueada_id = :second1
             ) OR (
                 pessoa_bloqueou_id = :second2
                 AND pessoa_bloqueada_id = :first2
             )
             LIMIT 1'
        );
        $statement->execute([
            'first1' => $firstId,
            'second1' => $secondId,
            'second2' => $secondId,
            'first2' => $firstId
        ]);

        return (bool) $statement->fetchColumn();
    }

    public function hasRelationship(string $firstId, string $secondId): bool
    {
        $statement = $this->db->prepare(
            'SELECT 1
             FROM mensagens_chat
             WHERE (
                 emissor_id = :first1
                 AND destinatario_id = :second1
             ) OR (
                 emissor_id = :second2
                 AND destinatario_id = :first2
             )
             LIMIT 1'
        );
        $statement->execute([
            'first1' => $firstId,
            'second1' => $secondId,
            'second2' => $secondId,
            'first2' => $firstId
        ]);

        if ($statement->fetchColumn()) return true;

        $statement = $this->db->prepare(
            "SELECT 1
             FROM notificacao
             WHERE tipo = 'hey'
             AND (
                 (emissor_id = :first1 AND destinatario_id = :second1)
                 OR
                 (emissor_id = :second2 AND destinatario_id = :first2)
             )
             LIMIT 1"
        );
        $statement->execute([
            'first1' => $firstId,
            'second1' => $secondId,
            'second2' => $secondId,
            'first2' => $firstId
        ]);

        return (bool) $statement->fetchColumn();
    }

    public function canInteract(
        string $viewerId,
        string $targetId,
        string $proximityToken = ''
    ): bool {
        if ($viewerId === '' || $targetId === '' || hash_equals($viewerId, $targetId)) {
            return false;
        }

        if ($this->areBlocked($viewerId, $targetId)) return false;
        if ($this->hasRelationship($viewerId, $targetId)) return true;
        if (self::hasSessionProximityGrant(
            $viewerId,
            $targetId,
            $this->secret
        )) {
            return true;
        }

        return self::validateProximityToken(
            $proximityToken,
            $viewerId,
            $targetId,
            $this->secret
        );
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): string
    {
        $padding = strlen($value) % 4;

        if ($padding !== 0) $value .= str_repeat('=', 4 - $padding);

        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? '' : $decoded;
    }

    public static function grantSessionProximity(
        string $viewerId,
        string $targetId,
        string $secret,
        int $ttlSeconds = 300
    ): void {
        if (
            session_status() !== PHP_SESSION_ACTIVE ||
            $viewerId === '' ||
            $targetId === '' ||
            hash_equals($viewerId, $targetId)
        ) {
            return;
        }

        $now = time();
        $grants = $_SESSION[self::SESSION_GRANT_KEY] ?? [];

        if (!is_array($grants)) $grants = [];

        $grants = array_filter(
            $grants,
            static fn(mixed $expires): bool => is_int($expires) && $expires >= $now
        );

        if (count($grants) >= 50) {
            asort($grants, SORT_NUMERIC);
            $grants = array_slice($grants, -49, null, true);
        }

        $grants[self::sessionGrantId($viewerId, $targetId, $secret)] =
            $now + max(30, min($ttlSeconds, 300));
        $_SESSION[self::SESSION_GRANT_KEY] = $grants;
    }

    public static function hasSessionProximityGrant(
        string $viewerId,
        string $targetId,
        string $secret
    ): bool {
        if (
            session_status() !== PHP_SESSION_ACTIVE ||
            $viewerId === '' ||
            $targetId === ''
        ) {
            return false;
        }

        $grants = $_SESSION[self::SESSION_GRANT_KEY] ?? [];

        if (!is_array($grants)) return false;

        $grantId = self::sessionGrantId($viewerId, $targetId, $secret);
        $expires = $grants[$grantId] ?? 0;

        if (!is_int($expires) || $expires < time()) {
            unset($grants[$grantId]);
            $_SESSION[self::SESSION_GRANT_KEY] = $grants;
            return false;
        }

        return true;
    }

    private static function encryptionKey(string $secret): string
    {
        return hash('sha256', 'proximity-token-v2|' . $secret, true);
    }

    private static function sessionGrantId(
        string $viewerId,
        string $targetId,
        string $secret
    ): string {
        return hash_hmac(
            'sha256',
            'proximity-session|' . $viewerId . '|' . $targetId,
            $secret
        );
    }
}
