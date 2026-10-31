<?php
declare(strict_types=1);

namespace App\CMS;

require_once __DIR__ . '/HalloweenCalendar.php';

final class HalloweenAnnouncements
{
    public function __construct(
        private \PDO $db,
        private array $settings
    ) {
    }

    private function query(
        string $sql,
        array $args = []
    ): \PDOStatement {
        $q = $this->db->prepare($sql);
        $q->execute($args);

        return $q;
    }

    public function run(
        callable $send,
        bool $dryRun = true,
        ?int $nowMs = null
    ): array {
        $now = $nowMs
            ?? (int) floor(microtime(true) * 1000);

        $c = HalloweenCalendar::build($this->settings);

        $out = [
            'eligible' => 0,
            'sent' => 0,
            'review' => 0,
            'event' => null,
            'dry_run' => $dryRun,
        ];

        if (
            !$c
            || !($this->settings['hunt']['waves_enabled'] ?? false)
            || !(
                $this->settings['hunt']['announcements_enabled']
                ?? false
            )
        ) {
            return $out;
        }

        $winner = $this->query(
            'SELECT membro_id
             FROM halloween_hunt_awards
             WHERE campaign_id=?',
            [$c['campaign_id']]
        )->fetchColumn();

        $events = [];
        $event = null;
        $message = '';

        if (
            $winner
            && $now >= $c['starts_at_ms']
            && $now < $c['ends_at_ms'] + 3600000
        ) {
            $event = 'winner';

            $message = 'Já foi encontrado o vencedor do desafio de Halloween. '
            . 'Entra na Margot para veres o teu resultado. '
            . 'Obrigado por participares!';
        } elseif (
            !$winner
            && $now >= $c['starts_at_ms']
            && $now < $c['ends_at_ms']
        ) {
            $minutes = $c['mode'] === 'pilot'
                ? [0, 4, 9]
                : [0, 95, 160];

            foreach ($minutes as $i => $minute) {
                $at = $c['starts_at_ms'] + $minute * 60000;

                // Não enviar lembretes antigos se o serviço
                // só arrancar depois da respetiva janela.
                if ($now >= $at && $now < $at + 60000) {
                    $event = 'reminder-' . $i;

                    $message = 'Halloween na Margot 🎃🦇 '
                        . 'Apanha 10 abóboras e 10 morcegos '
                        . 'durante o desafio. '
                        . 'Abre a app para participar!';

                    break;
                }
            }
        }

        if ($event !== null) {
            $events[] = [
                'id' => $event,
                'message' => $message,
                'reminder' => str_starts_with(
                    $event,
                    'reminder-'
                ),
            ];
        }

        if (
            $now >= $c['starts_at_ms']
            && $now < $c['ends_at_ms']
        ) {
            $manual = $this->query(
                'SELECT id, payload
                 FROM halloween_hunt_commands
                 WHERE campaign_id=?
                   AND kind=?
                   AND starts_at_ms<=?
                   AND expires_at_ms>?
                 ORDER BY created_at_ms',
                [$c['campaign_id'], 'push', $now, $now]
            )->fetchAll(\PDO::FETCH_ASSOC);

            foreach ($manual as $command) {
                $body = json_decode(
                    $command['payload'],
                    true,
                    8,
                    JSON_THROW_ON_ERROR
                );

                $events[] = [
                    'id' => $command['id'],
                    'message' => $body['message'],
                    'reminder' => false,
                ];
            }
        }

        if (!$events) {
            return $out;
        }

        $out['event'] = array_column($events, 'id');

        // Um dispositivo ativo por conta:
        // o registo ativo com o ID mais recente.
        $devices = $this->query(
            'SELECT d.*
             FROM push_dispositivos d
             WHERE d.ativo=1
               AND NOT EXISTS (
                   SELECT 1
                   FROM push_dispositivos newer
                   WHERE newer.membro_id=d.membro_id
                     AND newer.ativo=1
                     AND newer.id>d.id
               )
             ORDER BY d.id'
        )->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($events as $notice) {
            $event = $notice['id'];
            $message = $notice['message'];

            foreach ($devices as $d) {
                $member = (string) $d['membro_id'];

                if (
                    $c['mode'] === 'pilot'
                    && !in_array(
                        $member,
                        $this->settings['testers'] ?? [],
                        true
                    )
                ) {
                    continue;
                }

                $key = [
                    $c['campaign_id'],
                    $event,
                    $member,
                ];

                $previous = $this->query(
                    'SELECT status
                     FROM halloween_hunt_announcements
                     WHERE campaign_id=?
                       AND event_id=?
                       AND membro_id=?',
                    $key
                )->fetchColumn();

                if ($previous !== false) {
                    continue;
                }

                $out['eligible']++;

                if ($dryRun) {
                    continue;
                }

                // Reservar antes de contactar APNs/FCM.
                $sqlite = $this->db->getAttribute(
                    \PDO::ATTR_DRIVER_NAME
                ) === 'sqlite';

                $sql = 'INSERT INTO halloween_hunt_announcements
                    (
                        campaign_id,
                        event_id,
                        membro_id,
                        status,
                        attempted_at
                    )
                    VALUES (?, ?, ?, ?, ?)';

                $sql .= $sqlite
                    ? ' ON CONFLICT DO NOTHING'
                    : ' ON DUPLICATE KEY UPDATE
                        campaign_id=VALUES(campaign_id)';

                $claim = $this->query(
                    $sql,
                    [
                        ...$key,
                        'review',
                        gmdate(
                            'Y-m-d H:i:s',
                            intdiv($now, 1000)
                        ),
                    ]
                );

                if ($claim->rowCount() !== 1) {
                    continue;
                }

                // Revalidar o dono do dispositivo antes do envio.
                $valid = $this->query(
                    'SELECT COUNT(*)
                     FROM push_dispositivos
                     WHERE id=?
                       AND membro_id=?
                       AND token_hash=?
                       AND ativo=1',
                    [
                        $d['id'],
                        $member,
                        $d['token_hash'],
                    ]
                )->fetchColumn();

                $hasWinner = $this->query(
                    'SELECT membro_id
                     FROM halloween_hunt_awards
                     WHERE campaign_id=?',
                    [$c['campaign_id']]
                )->fetchColumn();

                if (
                    !$valid
                    || ($notice['reminder'] && $hasWinner)
                ) {
                    $this->query(
                        'UPDATE halloween_hunt_announcements
                         SET status=?
                         WHERE campaign_id=?
                           AND event_id=?
                           AND membro_id=?',
                        ['cancelled', ...$key]
                    );

                    continue;
                }

                try {
                    $result = $send([
                        'plataforma' => $d['plataforma'],
                        'ambiente' => $d['ambiente'],
                        'token' => $d['token'],

                        'titulo' => $c['mode'] === 'pilot'
                            ? 'TESTE · Halloween Margot'
                            : 'Halloween Margot',

                        'corpo' => $message,
                        'tipo' => 'halloween',
                        'url' => '/',

                        'dados' => [
                            'campaign_id' => $c['campaign_id'],
                            'event' => $event,
                        ],
                    ]);

                    $ok = ($result['success'] ?? false) === true;
                } catch (\Throwable) {
                    $ok = false;
                }

                if ($ok) {
                    $this->query(
                        'UPDATE halloween_hunt_announcements
                         SET status=?
                         WHERE campaign_id=?
                           AND event_id=?
                           AND membro_id=?',
                        ['sent', ...$key]
                    );

                    $out['sent']++;
                } else {
                    $out['review']++;
                }
            }
        }

        return $out;
    }
}