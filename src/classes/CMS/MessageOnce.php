<?php
declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;
use RuntimeException;

// As fotografias de visualização única nunca têm um URL público.
final class MessageOnce {
    public static function folder(): string {
        return APP_ROOT . '/var/message-once/';
    }

    public function __construct(private Database $db) {}

    public function consume(int $id, string $recipient, string $sender): array {
        $row = $this->db->runSQL(
            'SELECT ficheiro_nome, ficheiro_mime
                FROM mensagens_chat
                WHERE id = :id
                    AND destinatario_id = :recipient
                    AND emissor_id = :sender
                    AND visualizacao_unica = 1
                    AND aberta_em IS NULL',
            [
                'id' => $id,
                'recipient' => $recipient,
                'sender' => $sender
            ]
        )->fetch();

        if (!$row) {
            throw new InvalidArgumentException(
                'Esta fotografia já foi aberta ou não está disponível.'
            );
        }

        $path = self::folder() . basename($row['ficheiro_nome']);
        $bytes = is_file($path) ? file_get_contents($path) : false;

        if ($bytes === false) {
            throw new RuntimeException('Não foi possível abrir a fotografia.');
        }

        // Só um pedido pode ganhar, mesmo que dois tentem abrir em simultâneo.
        $update = $this->db->runSQL(
            'UPDATE mensagens_chat
                SET aberta_em = NOW(6)
                WHERE id = :id
                    AND destinatario_id = :recipient
                    AND emissor_id = :sender
                    AND visualizacao_unica = 1
                    AND aberta_em IS NULL',
            [
                'id' => $id,
                'recipient' => $recipient,
                'sender' => $sender
            ]
        );

        if ($update->rowCount() !== 1) {
            throw new InvalidArgumentException('Esta fotografia já foi aberta.');
        }

        if (!unlink($path)) {
            error_log('[message-once] Não foi possível remover ' . basename($path));
        }

        return [
            'bytes' => $bytes,
            'mime' => $row['ficheiro_mime']
        ];
    }
}