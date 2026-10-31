<?php
declare(strict_types=1);

namespace App\CMS;

require_once __DIR__ . '/HalloweenCalendar.php';

final class HalloweenWaves
{
    private array $settings;
    private array $calendar;
    private bool $sqlite;
    private ?\Closure $clock;

    public function __construct(
        private \PDO $db,
        ?array $settings = null,
        ?callable $clock = null
    ) {
        $this->settings = $settings
            ?? require dirname(__DIR__, 3) . '/config/halloween.php';

        $this->calendar = HalloweenCalendar::build($this->settings);

        $this->sqlite = $db->getAttribute(\PDO::ATTR_DRIVER_NAME)
            === 'sqlite';

        $this->clock = $clock === null
            ? null
            : \Closure::fromCallable($clock);

        if ($this->calendar) {
            $manual = $this->sql(
                'SELECT payload
                 FROM halloween_hunt_commands
                 WHERE campaign_id=? AND kind=?
                 ORDER BY starts_at_ms',
                [$this->calendar['campaign_id'], 'wave']
            )->fetchAll(\PDO::FETCH_COLUMN);

            foreach ($manual as $json) {
                $w = json_decode(
                    $json,
                    true,
                    16,
                    JSON_THROW_ON_ERROR
                );

                $w['manual'] = true;
                $this->calendar['waves'][] = $w;
            }

            usort(
                $this->calendar['waves'],
                static fn($a, $b) =>
                    $a['started_at_ms'] <=> $b['started_at_ms']
            );
        }
    }

    private function now(): int
    {
        return $this->clock
            ? (int) ($this->clock)()
            : (int) floor(microtime(true) * 1000);
    }

    private function sql(
        string $sql,
        array $args = []
    ): \PDOStatement {
        $q = $this->db->prepare($sql);
        $q->execute($args);

        return $q;
    }

    private function allowed(string $member): bool
    {
        if (
            !preg_match(
                '/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D',
                $member
            )
        ) {
            throw new \DomainException('Sessão inválida.', 401);
        }

        return $this->calendar && (
            $this->calendar['mode'] === 'public'
            || in_array(
                $member,
                $this->settings['testers'] ?? [],
                true
            )
        );
    }

    private function stamp(int $ms): string
    {
        return gmdate(
            'Y-m-d H:i:s',
            intdiv($ms, 1000)
        ) . sprintf('.%03d000', $ms % 1000);
    }

    private function lock(): string
    {
        return $this->sqlite ? '' : ' FOR UPDATE';
    }

    private function insertIgnore(
        string $sql,
        array $args
    ): void {
        $this->sql(
            $sql . (
                $this->sqlite
                    ? ' ON CONFLICT DO NOTHING'
                    : ' ON DUPLICATE KEY UPDATE
                        campaign_id=VALUES(campaign_id)'
            ),
            $args
        );
    }

    private function winner(bool $locked = false): array|false
    {
        return $this->sql(
            'SELECT membro_id, completed_at
             FROM halloween_hunt_awards
             WHERE campaign_id=?'
                . ($locked ? $this->lock() : ''),
            [$this->calendar['campaign_id']]
        )->fetch(\PDO::FETCH_ASSOC);
    }

    private function activeWave(int $now): ?array
    {
        $active = null;

        foreach ($this->calendar['waves'] as $wave) {
            $last = max(
                array_column(
                    $wave['objects'],
                    'expires_at_ms'
                )
            );

            if (
                $now >= $wave['started_at_ms']
                && $now < $last
                && (
                    $active === null
                    || !empty($wave['manual'])
                )
            ) {
                $active = $wave;
            }
        }

        return $active;
    }

    public function state(string $member): array
    {
        $allowed = $this->allowed($member);
        $now = $this->now();
        $c = $this->calendar;

        $s = [
            'protocol' => 2,
            'campaign_id' => $c['campaign_id'] ?? null,
            'mode' => $c['mode'] ?? 'off',
            'phase' => 'off',
            'starts_at_ms' => $c['starts_at_ms'] ?? null,
            'ends_at_ms' => $c['ends_at_ms'] ?? null,
            'interval_seconds' => 30,
            'server_now_ms' => $now,

            'counts' => [
                'pumpkin' => 0,
                'bat' => 0,
            ],

            'completed_at' => null,
            'next_round_at_ms' => null,
            'round' => null,
            'winner' => null,
        ];

        if (!$allowed) {
            return $s;
        }

        $w = $this->winner($this->db->inTransaction());

        if ($w && $w['membro_id'] !== null) {
            $s['winner'] = [
                'is_you' => $w['membro_id'] === $member,
                'completed_at' => $w['completed_at'],
            ];
        }

        $s['phase'] = $s['winner'] || $now >= $c['ends_at_ms']
            ? 'ended'
            : (
                $now < $c['starts_at_ms']
                    ? 'scheduled'
                    : 'active'
            );

        $p = $this->sql(
            'SELECT pumpkins, bats, completed_at
             FROM halloween_hunt_players
             WHERE campaign_id=? AND membro_id=?',
            [$c['campaign_id'], $member]
        )->fetch(\PDO::FETCH_ASSOC);

        if ($p) {
            $s['counts'] = [
                'pumpkin' => (int) $p['pumpkins'],
                'bat' => (int) $p['bats'],
            ];

            $s['completed_at'] = $p['completed_at'];
        }

        if ($s['phase'] !== 'active') {
            return $s;
        }

        $wave = $this->activeWave($now);

        foreach ($c['waves'] as $candidate) {
            if ($candidate['started_at_ms'] > $now) {
                $s['next_round_at_ms']
                    = $candidate['started_at_ms'];
                break;
            }
        }

        if (!$wave) {
            return $s;
        }

        $objectIds = array_column(
            $wave['objects'],
            'id'
        );

        $placeholders = implode(
            ',',
            array_fill(0, count($objectIds), '?')
        );

        $issued = $this->sql(
            'SELECT object_id, captured_at
             FROM halloween_hunt_wave_captures
             WHERE campaign_id=?
               AND membro_id=?
               AND object_id IN (' . $placeholders . ')',
            [
                $c['campaign_id'],
                $member,
                ...$objectIds,
            ]
        )->fetchAll(\PDO::FETCH_KEY_PAIR);

        $unissued = array_filter(
            $wave['objects'],
            static fn($o) =>
                $o['expires_at_ms'] > $now
                && !array_key_exists($o['id'], $issued)
        );

        if (count($unissued) > 0) {
            $s['next_round_at_ms'] = $now;
            return $s;
        }

        $objects = [];

        foreach ($wave['objects'] as $o) {
            if (!array_key_exists($o['id'], $issued)) {
                continue;
            }

            $o['captured'] = $issued[$o['id']] !== null;
            $objects[] = $o;
        }

        $wave['objects'] = $objects;
        $s['round'] = $wave;

        return $s;
    }

    private function transaction(callable $fn): array
    {
        $this->db->beginTransaction();

        try {
            $out = $fn();
            $this->db->commit();

            return $out;
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $e;
        }
    }

    private function claimCampaign(): array|false
    {
        $id = $this->calendar['campaign_id'];

        $this->insertIgnore(
            'INSERT INTO halloween_hunt_awards
                (campaign_id)
             VALUES (?)',
            [$id]
        );

        return $this->winner(true);
    }

    public function startRound(
        string $member,
        ?string $expectedCampaign = null
    ): array {
        if (!$this->allowed($member)) {
            return $this->state($member);
        }

        if ($expectedCampaign !== $this->calendar['campaign_id']) {
            throw new \DomainException(
                'A campanha mudou.',
                409
            );
        }

        return $this->transaction(function () use ($member): array {
            // Mesma ordem de locks em todos os pedidos.
            $this->claimCampaign();

            $state = $this->state($member);

            if ($state['phase'] !== 'active') {
                return $state;
            }

            $now = $this->now();
            $wave = $this->activeWave($now);

            if (!$wave) {
                return $state;
            }

            $c = $this->calendar['campaign_id'];
            $stamp = $this->stamp($now);

            $this->insertIgnore(
                'INSERT INTO halloween_hunt_players
                    (
                        campaign_id,
                        membro_id,
                        created_at,
                        updated_at
                    )
                 VALUES (?, ?, ?, ?)',
                [$c, $member, $stamp, $stamp]
            );

            foreach ($wave['objects'] as $o) {
                if ($o['expires_at_ms'] <= $now) {
                    continue;
                }

                $this->insertIgnore(
                    'INSERT INTO halloween_hunt_wave_captures
                        (
                            campaign_id,
                            membro_id,
                            wave_id,
                            object_id,
                            issued_at
                        )
                     VALUES (?, ?, ?, ?, ?)',
                    [
                        $c,
                        $member,
                        $wave['id'],
                        $o['id'],
                        $stamp,
                    ]
                );
            }

            return $this->state($member);
        });
    }

    public function capture(
        string $member,
        string $campaign,
        string $round,
        string $kind,
        string $object = ''
    ): array {
        if (!$this->allowed($member)) {
            throw new \DomainException(
                'Conta fora do teste.',
                403
            );
        }

        if ($campaign !== $this->calendar['campaign_id']) {
            throw new \DomainException(
                'Campanha antiga.',
                409
            );
        }

        $target = null;

        foreach ($this->calendar['waves'] as $wave) {
            if ($wave['id'] === $round) {
                foreach ($wave['objects'] as $o) {
                    if (
                        $o['id'] === $object
                        && $o['kind'] === $kind
                    ) {
                        $target = $o;
                    }
                }
            }
        }

        if (!$target) {
            throw new \DomainException(
                'Alvo inválido.',
                422
            );
        }

        return $this->transaction(function () use (
            $member,
            $campaign,
            $round,
            $kind,
            $object,
            $target
        ): array {
            $winner = $this->claimCampaign();

            $issued = $this->sql(
                'SELECT captured_at
                 FROM halloween_hunt_wave_captures
                 WHERE campaign_id=?
                   AND membro_id=?
                   AND object_id=?'
                    . $this->lock(),
                [$campaign, $member, $object]
            )->fetch(\PDO::FETCH_ASSOC);

            if (!$issued) {
                throw new \DomainException(
                    'Alvo não emitido para esta conta.',
                    403
                );
            }

            // Uma captura confirmada não volta a pontuar.
            if ($issued['captured_at'] !== null) {
                return $this->state($member);
            }

            $now = $this->now();

            if ($winner && $winner['membro_id'] !== null) {
                throw new \DomainException(
                    'O desafio terminou: já temos vencedor/a.',
                    409
                );
            }

            if ($now < $target['opens_at_ms']) {
                throw new \DomainException(
                    'O alvo ainda não apareceu.',
                    409
                );
            }

            if (
                $now >= $target['expires_at_ms']
                || $now >= $this->calendar['ends_at_ms']
            ) {
                throw new \DomainException(
                    'O alvo expirou.',
                    410
                );
            }

            $p = $this->sql(
                'SELECT *
                 FROM halloween_hunt_players
                 WHERE campaign_id=? AND membro_id=?'
                    . $this->lock(),
                [$campaign, $member]
            )->fetch(\PDO::FETCH_ASSOC);

            $column = $kind === 'pumpkin'
                ? 'pumpkins'
                : 'bats';

            if (!$p || (int) $p[$column] >= 10) {
                throw new \DomainException(
                    'Coleção completa.',
                    409
                );
            }

            $p[$column] = (int) $p[$column] + 1;
            $stamp = $this->stamp($now);

            $done = (int) $p['pumpkins'] === 10
                && (int) $p['bats'] === 10;

            $this->sql(
                'UPDATE halloween_hunt_wave_captures
                 SET captured_at=?
                 WHERE campaign_id=?
                   AND membro_id=?
                   AND object_id=?',
                [$stamp, $campaign, $member, $object]
            );

            $this->sql(
                'UPDATE halloween_hunt_players
                 SET pumpkins=?,
                     bats=?,
                     updated_at=?,
                     completed_at=?
                 WHERE campaign_id=? AND membro_id=?',
                [
                    $p['pumpkins'],
                    $p['bats'],
                    $stamp,
                    $done ? $stamp : null,
                    $campaign,
                    $member,
                ]
            );

            if ($done) {
                $identity = $this->sql(
                    'SELECT primeiro_nome, ultimo_nome
                     FROM membros
                     WHERE id=?',
                    [$member]
                )->fetch(\PDO::FETCH_ASSOC);

                $name = trim(
                    ($identity['primeiro_nome'] ?? '')
                    . ' '
                    . ($identity['ultimo_nome'] ?? '')
                );

                $this->sql(
                    'UPDATE halloween_hunt_awards
                     SET membro_id=?,
                         winner_name=?,
                         completed_at=?
                     WHERE campaign_id=?
                       AND membro_id IS NULL',
                    [$member, $name, $stamp, $campaign]
                );
            }

            return $this->state($member);
        });
    }
}