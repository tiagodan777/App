<?php
declare(strict_types=1);

namespace App\CMS;

/** Um aviso por campanha. Envios incertos ficam para revisão. */
final class HalloweenHuntMail {
    public function __construct(private \PDO $db) {}

    public function sendOne(
        string $campaign,
        string $recipient,
        callable $send
    ): string {
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException(
                'Confirma o destinatário do aviso.'
            );
        }

        $select = $this->db->prepare(
            'SELECT * FROM halloween_hunt_awards
            WHERE campaign_id = ?
                AND membro_id IS NOT NULL
                AND email_state = ?'
        );

        $select->execute([$campaign, 'pending']);
        $winner = $select->fetch(\PDO::FETCH_ASSOC);

        if (!$winner) {
            return 'idle';
        }

        $claim = $this->db->prepare(
            'UPDATE halloween_hunt_awards
            SET email_state = ?,
                email_recipient = ?,
                email_attempted_at = ?
            WHERE campaign_id = ?
                AND email_state = ?
                AND membro_id = ?'
        );

        $claim->execute([
            'sending',
            $recipient,
            gmdate('Y-m-d H:i:s'),
            $campaign,
            'pending',
            $winner['membro_id'],
        ]);

        if ($claim->rowCount() !== 1) {
            return 'idle';
        }

        $escape = static fn($value): string => htmlspecialchars(
            (string) $value,
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );

        $prefix = str_contains($campaign, '-pilot-')
            ? '[TESTE] '
            : '';

        $body = '<h2>'
            . $prefix
            . 'Primeira conclusão do desafio de Halloween</h2>'
            . '<p><strong>'
            . $escape($winner['winner_name'])
            . '</strong></p>'
            . '<p>ID da conta: '
            . $escape($winner['membro_id'])
            . '</p>'
            . '<p>Abóboras: 10 / 10 · Morcegos: 10 / 10</p>'
            . '<p>Conclusão (UTC): '
            . $escape($winner['completed_at'])
            . '</p>'
            . '<p>Campanha: '
            . $escape($campaign)
            . '</p>';

        try {
            $accepted = $send(
                $recipient,
                $prefix . 'Margot — primeira conclusão de Halloween',
                $body
            ) === true;
        } catch (\Throwable $error) {
            $accepted = false;

            error_log(
                '[halloween-mail] envio incerto: ' . get_class($error)
            );
        }

        $state = $accepted ? 'sent' : 'review';

        $update = $this->db->prepare(
            'UPDATE halloween_hunt_awards
            SET email_state = ?, email_sent_at = ?
            WHERE campaign_id = ? AND email_state = ?'
        );

        $update->execute([
            $state,
            $accepted ? gmdate('Y-m-d H:i:s') : null,
            $campaign,
            'sending',
        ]);

        return $state;
    }
}