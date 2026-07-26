<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;
use Throwable;

final class WebSocketTicket
{
    public const TTL_SEGUNDOS = 30;

    public function __construct(private PDO $database)
    {
        $this->database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->database->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    public function issue(string $membroId): string
    {
        $membroId = trim($membroId);

        if ($membroId === '' || strlen($membroId) > 64) {
            throw new \InvalidArgumentException('O membro indicado não é válido.');
        }

        $ticket = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $ticket);

        $this->database
            ->prepare('DELETE FROM websocket_tickets WHERE expira_em <= UTC_TIMESTAMP(6)')
            ->execute();

        $statement = $this->database->prepare(
            'INSERT INTO websocket_tickets (token_hash, membro_id, criado_em, expira_em)
             VALUES (
                 :token_hash,
                 :membro_id,
                 UTC_TIMESTAMP(6),
                 DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ' . self::TTL_SEGUNDOS . ' SECOND)
             )'
        );

        $statement->execute([
            'token_hash' => $tokenHash,
            'membro_id' => $membroId
        ]);

        return $ticket;
    }

    public function consume(string $ticket): string|false
    {
        $ticket = strtolower(trim($ticket));

        if (!preg_match('/\A[a-f0-9]{64}\z/D', $ticket)) {
            return false;
        }

        $tokenHash = hash('sha256', $ticket);

        try {
            $this->database->beginTransaction();

            $statement = $this->database->prepare(
                'SELECT
                    membro_id,
                    CASE WHEN expira_em > UTC_TIMESTAMP(6) THEN 1 ELSE 0 END AS valido
                 FROM websocket_tickets
                 WHERE token_hash = :token_hash
                 LIMIT 1
                 FOR UPDATE'
            );
            $statement->execute(['token_hash' => $tokenHash]);
            $registo = $statement->fetch(PDO::FETCH_ASSOC);

            if ($registo) {
                $statement = $this->database->prepare(
                    'DELETE FROM websocket_tickets WHERE token_hash = :token_hash'
                );
                $statement->execute(['token_hash' => $tokenHash]);
            }

            $this->database->commit();

            if (!$registo || (int) ($registo['valido'] ?? 0) !== 1) {
                return false;
            }

            $membroId = trim((string) ($registo['membro_id'] ?? ''));

            return $membroId !== '' && strlen($membroId) <= 64
                ? $membroId
                : false;
        } catch (Throwable $erro) {
            if ($this->database->inTransaction()) {
                $this->database->rollBack();
            }

            throw $erro;
        }
    }
}
