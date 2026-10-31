<?php
declare(strict_types=1);

namespace App\CMS;

/** Regras da caça. O cliente nunca decide contagens, rondas ou horários válidos. */
final class HalloweenHunt {
    private const WINDOWS_MS = [
        'pumpkin' => [0, 12000],
        'bat' => [14000, 28000],
    ];

    private array $settings;
    private ?\Closure $clock;
    private bool $sqlite;

    /** $clock, apenas para testes, devolve milissegundos Unix do servidor. */
    public function __construct(
        private \PDO $db,
        ?array $settings = null,
        ?callable $clock = null
    ) {
        $this->settings = $settings
            ?? require dirname(__DIR__, 3) . '/config/halloween.php';
        $this->clock = $clock === null ? null : \Closure::fromCallable($clock);
        $this->sqlite = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite';
    }

    public function state(string $memberId): array {
        $this->validateMember($memberId);
        $now = $this->nowUs();
        $context = $this->context($memberId, $now);
        return $this->snapshot($memberId, $context, $now);
    }

    /** Só o POST explícito do cliente elegível chama este método. */
    public function startRound(
        string $memberId,
        ?string $expectedCampaign = null
    ): array {
        $this->validateMember($memberId);
        $now = $this->nowUs();
        $context = $this->context($memberId, $now);

        if (
            $expectedCampaign !== null
            && $expectedCampaign !== $context['campaign_id']
        ) {
            throw new \DomainException(
                'A campanha mudou. Atualiza o desafio.',
                409
            );
        }

        if ($context['phase'] !== 'active') {
            return $this->snapshot($memberId, $context, $now);
        }

        return $this->transaction(function () use ($memberId, $context): array {
            $stamp = self::dateFromUs($this->nowUs());

            $sql = 'INSERT INTO halloween_hunt_players
                (campaign_id, membro_id, created_at, updated_at)
                VALUES (:campaign, :member, :created, :updated) ';

            $sql .= $this->sqlite
                ? 'ON CONFLICT (campaign_id, membro_id) DO NOTHING'
                : 'ON DUPLICATE KEY UPDATE membro_id = VALUES(membro_id)';

            $this->run($sql, [
                'campaign' => $context['campaign_id'],
                'member' => $memberId,
                'created' => $stamp,
                'updated' => $stamp,
            ]);

            $player = $this->lockPlayer(
                $memberId,
                $context['campaign_id']
            );

            // Relê a hora depois de adquirir o lock.
            $now = $this->nowUs();
            $current = $this->context($memberId, $now);

            if (
                $current['phase'] !== 'active'
                || $player['completed_at'] !== null
            ) {
                return $this->snapshot($memberId, $current, $now);
            }

            $last = self::usFromDate($player['last_round_started_at']);
            $intervalUs = $current['interval_seconds'] * 1000000;
            $savedNext = $this->nextRoundUs($player);

            if ($savedNext !== null && $now < $savedNext) {
                return $this->snapshot($memberId, $current, $now);
            }

            if (
                $savedNext === null
                && $last !== null
                && $now < $last + $intervalUs
            ) {
                return $this->snapshot($memberId, $current, $now);
            }

            $id = bin2hex(random_bytes(16));

            // A hora publicada em ms coincide com a verificada no servidor.
            $stamp = self::dateFromUs(intdiv($now, 1000) * 1000);

            $this->run(
                'INSERT INTO halloween_hunt_rounds
                (id, campaign_id, membro_id, started_at, pumpkin_issued, bat_issued)
                VALUES (:id, :campaign, :member, :started, :pumpkin, :bat)',
                [
                    'id' => $id,
                    'campaign' => $current['campaign_id'],
                    'member' => $memberId,
                    'started' => $stamp,
                    'pumpkin' => (int) ((int) $player['pumpkins'] < 10),
                    'bat' => (int) ((int) $player['bats'] < 10),
                ]
            );

            if ($this->extrasEnabled()) {
                $ordinal = (int) $this->run(
                    'SELECT COUNT(*) FROM halloween_hunt_rounds
                    WHERE campaign_id = :campaign AND membro_id = :member',
                    [
                        'campaign' => $current['campaign_id'],
                        'member' => $memberId,
                    ]
                )->fetchColumn();

                $hunt = $this->settings['hunt'];
                $prefix = $current['mode'] === 'pilot' ? 'pilot' : 'public';
                $min = $hunt[$prefix . '_min_seconds']
                    ?? $current['interval_seconds'];
                $max = $hunt[$prefix . '_max_seconds']
                    ?? $current['interval_seconds'];

                $minimumAllowed = (
                    $current['mode'] === 'pilot'
                    && $current['interval_seconds'] < 30
                ) ? 20 : 30;

                if (
                    !is_int($min)
                    || !is_int($max)
                    || $min < $minimumAllowed
                    || $max < $min
                    || $max > 86400
                ) {
                    throw new \LogicException(
                        'Intervalos variáveis inválidos.'
                    );
                }

                // Mesma sequência para todos. O prazo fica guardado na BD.
                $hash = hash(
                    'sha256',
                    $current['campaign_id'] . ':' . $ordinal
                );

                $wait = $min + (int) (
                    hexdec(substr($hash, 0, 8)) % ($max - $min + 1)
                );

                $this->run(
                    'INSERT INTO halloween_hunt_timing
                    (round_id, next_round_at)
                    VALUES (:round, :next)',
                    [
                        'round' => $id,
                        'next' => self::dateFromUs(
                            self::usFromDate($stamp) + $wait * 1000000
                        ),
                    ]
                );
            }

            $this->run(
                'UPDATE halloween_hunt_players
                SET last_round_id = :round,
                    last_round_started_at = :started,
                    updated_at = :updated
                WHERE campaign_id = :campaign AND membro_id = :member',
                [
                    'round' => $id,
                    'started' => $stamp,
                    'updated' => $stamp,
                    'campaign' => $current['campaign_id'],
                    'member' => $memberId,
                ]
            );

            return $this->snapshot($memberId, $current, $now);
        });
    }

    public function capture(
        string $memberId,
        string $campaignId,
        string $roundId,
        string $kind
    ): array {
        $this->validateMember($memberId);

        if (
            !isset(self::WINDOWS_MS[$kind])
            || !preg_match('/^[a-f0-9]{32}$/D', $roundId)
        ) {
            throw new \InvalidArgumentException(
                'Objeto ou ronda inválidos.',
                422
            );
        }

        $context = $this->context($memberId, $this->nowUs());

        if ($context['phase'] === 'off') {
            throw new \DomainException(
                'O desafio está indisponível nesta conta.',
                403
            );
        }

        if ($campaignId !== $context['campaign_id']) {
            throw new \DomainException(
                'Esta ronda pertence a outra campanha.',
                409
            );
        }

        return $this->transaction(function () use (
            $memberId,
            $campaignId,
            $roundId,
            $kind
        ): array {
            $player = $this->lockPlayer($memberId, $campaignId);

            if (!$player) {
                throw new \DomainException('Ronda indisponível.', 404);
            }

            $round = $this->run(
                'SELECT * FROM halloween_hunt_rounds
                WHERE id = :id
                    AND campaign_id = :campaign
                    AND membro_id = :member',
                [
                    'id' => $roundId,
                    'campaign' => $campaignId,
                    'member' => $memberId,
                ]
            )->fetch(\PDO::FETCH_ASSOC);

            if (!$round || !(int) $round[$kind . '_issued']) {
                throw new \DomainException(
                    'Objeto indisponível nesta ronda.',
                    404
                );
            }

            if (
                $this->extrasEnabled()
                && $player['completed_at'] === null
                && (int) $player['pumpkins'] + (int) $player['bats'] === 19
            ) {
                // Serializa as últimas capturas antes da hora oficial.
                $insert = 'INSERT INTO halloween_hunt_awards
                    (campaign_id) VALUES (:campaign) ';

                $insert .= $this->sqlite
                    ? 'ON CONFLICT(campaign_id) DO NOTHING'
                    : 'ON DUPLICATE KEY UPDATE campaign_id = VALUES(campaign_id)';

                $this->run($insert, ['campaign' => $campaignId]);

                $this->run(
                    'SELECT campaign_id FROM halloween_hunt_awards
                    WHERE campaign_id = :campaign'
                    . ($this->sqlite ? '' : ' FOR UPDATE'),
                    ['campaign' => $campaignId]
                )->fetch();
            }

            $now = $this->nowUs();
            $current = $this->context($memberId, $now);

            // Uma repetição confirmada nunca volta a somar pontos.
            if ($round[$kind . '_captured_at'] !== null) {
                return $this->snapshot($memberId, $current, $now);
            }

            if ($current['phase'] !== 'active') {
                throw new \DomainException(
                    'O desafio não está a decorrer.',
                    409
                );
            }

            $started = self::usFromDate($round['started_at']);
            [$opens, $expires] = $this->windows($current)[$kind];

            if ($now < $started + $opens * 1000) {
                throw new \DomainException(
                    'Este objeto ainda não apareceu.',
                    409
                );
            }

            if ($now >= $started + $expires * 1000) {
                throw new \DomainException(
                    'Já terminou o tempo para apanhar este objeto.',
                    410
                );
            }

            $column = $kind === 'pumpkin' ? 'pumpkins' : 'bats';

            if ((int) $player[$column] >= 10) {
                throw new \DomainException(
                    'Já completaste esta coleção.',
                    409
                );
            }

            $player[$column] = (int) $player[$column] + 1;
            $stamp = self::dateFromUs($now);
            $completed = $player['completed_at'];

            if (
                $completed === null
                && (int) $player['pumpkins'] === 10
                && (int) $player['bats'] === 10
            ) {
                $completed = $stamp;

                if ($this->extrasEnabled()) {
                    $previous = $this->run(
                        'SELECT p.membro_id, p.completed_at,
                            m.primeiro_nome, m.ultimo_nome
                        FROM halloween_hunt_players p
                        JOIN membros m ON m.id = p.membro_id
                        WHERE p.campaign_id = :campaign
                            AND p.completed_at IS NOT NULL
                        ORDER BY p.completed_at, p.membro_id
                        LIMIT 1',
                        ['campaign' => $campaignId]
                    )->fetch(\PDO::FETCH_ASSOC);

                    $identity = $this->run(
                        'SELECT primeiro_nome, ultimo_nome
                        FROM membros WHERE id = :id',
                        ['id' => $memberId]
                    )->fetch(\PDO::FETCH_ASSOC);

                    if ($previous) {
                        $identity = $previous;
                    }

                    $this->run(
                        'UPDATE halloween_hunt_awards
                        SET membro_id = :member,
                            winner_name = :name,
                            completed_at = :completed
                        WHERE campaign_id = :campaign
                            AND membro_id IS NULL',
                        [
                            'member' => $previous
                                ? $previous['membro_id']
                                : $memberId,
                            'name' => trim(
                                ($identity['primeiro_nome'] ?? '')
                                . ' '
                                . ($identity['ultimo_nome'] ?? '')
                            ),
                            'completed' => $previous
                                ? $previous['completed_at']
                                : $completed,
                            'campaign' => $campaignId,
                        ]
                    );
                }
            }

            // $kind foi validado pela lista fechada no início.
            $this->run(
                'UPDATE halloween_hunt_rounds
                SET ' . $kind . '_captured_at = :captured
                WHERE id = :id
                    AND campaign_id = :campaign
                    AND membro_id = :member',
                [
                    'captured' => $stamp,
                    'id' => $roundId,
                    'campaign' => $campaignId,
                    'member' => $memberId,
                ]
            );

            $this->run(
                'UPDATE halloween_hunt_players
                SET pumpkins = :pumpkins,
                    bats = :bats,
                    completed_at = :completed,
                    updated_at = :updated
                WHERE campaign_id = :campaign AND membro_id = :member',
                [
                    'pumpkins' => $player['pumpkins'],
                    'bats' => $player['bats'],
                    'completed' => $completed,
                    'updated' => $stamp,
                    'campaign' => $campaignId,
                    'member' => $memberId,
                ]
            );

            return $this->snapshot($memberId, $current, $now);
        });
    }

    private function context(string $memberId, int $now): array {
        $mode = $this->settings['mode'] ?? 'off';
        $mode = in_array($mode, ['pilot', 'public'], true) ? $mode : 'off';
        $hunt = $this->settings['hunt'] ?? [];

        $interval = $hunt[
            $mode === 'pilot'
                ? 'pilot_interval_seconds'
                : 'public_interval_seconds'
        ] ?? ($mode === 'pilot' ? 30 : 300);

        if (
            !is_int($interval)
            || $interval < ($mode === 'pilot' ? 20 : 30)
            || $interval > 86400
        ) {
            throw new \LogicException('Intervalo da caça inválido.');
        }

        $pilotRun = $hunt['pilot_run'] ?? 'test-1';

        if (
            !is_string($pilotRun)
            || !preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/D', $pilotRun)
        ) {
            throw new \LogicException('Identificador do piloto inválido.');
        }

        $campaign = $mode === 'off'
            ? null
            : 'hw26-hunt-v1-' . (
                $mode === 'pilot'
                    ? 'pilot-' . $interval . 's-' . $pilotRun
                    : 'public'
            );

        $starts = $ends = null;

        if ($mode === 'public') {
            $tz = new \DateTimeZone(
                $hunt['timezone'] ?? 'Atlantic/Azores'
            );

            $starts = self::configuredTime(
                $hunt['public_starts_at'] ?? '2026-10-31 22:00:00',
                $tz
            );

            $ends = self::configuredTime(
                $hunt['public_ends_at'] ?? '2026-11-01 03:30:00',
                $tz
            );

            if ($ends <= $starts) {
                throw new \LogicException('Datas da caça inválidas.');
            }
        }

        if (
            $mode === 'pilot'
            && (
                isset($hunt['pilot_starts_at'])
                || isset($hunt['pilot_ends_at'])
            )
        ) {
            if (
                !is_string($hunt['pilot_starts_at'] ?? null)
                || !is_string($hunt['pilot_ends_at'] ?? null)
            ) {
                throw new \LogicException(
                    'Define o início e o fim do piloto.'
                );
            }

            $tz = new \DateTimeZone(
                $hunt['timezone'] ?? 'Atlantic/Azores'
            );

            $starts = self::configuredTime(
                $hunt['pilot_starts_at'],
                $tz
            );

            $ends = self::configuredTime(
                $hunt['pilot_ends_at'],
                $tz
            );

            if ($ends <= $starts) {
                throw new \LogicException('Datas do piloto inválidas.');
            }
        }

        $allowed = $mode === 'public'
            || (
                $mode === 'pilot'
                && in_array(
                    $memberId,
                    $this->settings['testers'] ?? [],
                    true
                )
            );

        $phase = !$allowed
            ? 'off'
            : (
                $starts !== null && $now < $starts
                    ? 'scheduled'
                    : (
                        $ends !== null && $now >= $ends
                            ? 'ended'
                            : 'active'
                    )
            );

        return [
            'campaign_id' => $campaign,
            'mode' => $mode,
            'phase' => $phase,
            'starts_at_ms' => $starts === null
                ? null : intdiv($starts, 1000),
            'ends_at_ms' => $ends === null
                ? null : intdiv($ends, 1000),
            'interval_seconds' => $interval,
        ];
    }

    private function snapshot(
        string $memberId,
        array $context,
        int $now
    ): array {
        $state = $context + [
            'server_now_ms' => intdiv($now, 1000),
            'counts' => ['pumpkin' => 0, 'bat' => 0],
            'completed_at' => null,
            'next_round_at_ms' => null,
            'round' => null,
        ];

        if ($context['phase'] === 'off') {
            return $state;
        }

        $row = $this->run(
            'SELECT p.*,
                r.id AS round_id,
                r.started_at AS round_started_at,
                r.pumpkin_issued,
                r.bat_issued,
                r.pumpkin_captured_at,
                r.bat_captured_at
            FROM halloween_hunt_players p
            LEFT JOIN halloween_hunt_rounds r
                ON r.id = p.last_round_id
                AND r.campaign_id = p.campaign_id
                AND r.membro_id = p.membro_id
            WHERE p.campaign_id = :campaign AND p.membro_id = :member',
            [
                'campaign' => $context['campaign_id'],
                'member' => $memberId,
            ]
        )->fetch(\PDO::FETCH_ASSOC);

        if ($row) {
            $state['counts'] = [
                'pumpkin' => (int) $row['pumpkins'],
                'bat' => (int) $row['bats'],
            ];

            $state['completed_at'] = $row['completed_at'] === null
                ? null
                : str_replace(' ', 'T', $row['completed_at']) . 'Z';
        }

        if (
            $context['phase'] !== 'active'
            || $state['completed_at'] !== null
        ) {
            return $state;
        }

        $last = $row
            ? self::usFromDate($row['last_round_started_at'])
            : null;

        $state['next_round_at_ms'] = $last === null
            ? intdiv($now, 1000)
            : intdiv($last, 1000)
                + $context['interval_seconds'] * 1000;

        $savedNext = $row ? $this->nextRoundUs($row) : null;

        if ($savedNext !== null) {
            $state['next_round_at_ms'] = intdiv($savedNext, 1000);
        }

        if (!$row || $row['round_id'] === null) {
            return $state;
        }

        $startedMs = intdiv(
            self::usFromDate($row['round_started_at']),
            1000
        );

        $objects = [];

        foreach ($this->windows($context) as $kind => [$opens, $expires]) {
            if (!(int) $row[$kind . '_issued']) {
                continue;
            }

            $end = $startedMs + $expires;

            if ($context['ends_at_ms'] !== null) {
                $end = min($end, $context['ends_at_ms']);
            }

            if ($end <= $startedMs + $opens) {
                continue;
            }

            $objects[] = [
                'kind' => $kind,
                'opens_at_ms' => $startedMs + $opens,
                'expires_at_ms' => $end,
                'captured' => $row[$kind . '_captured_at'] !== null,
            ];
        }

        $state['round'] = [
            'id' => $row['round_id'],
            'started_at_ms' => $startedMs,
            'objects' => $objects,
        ];

        return $state;
    }

    private function windows(array $context): array {
        if (
            $context['mode'] === 'pilot'
            && $context['interval_seconds'] < 30
        ) {
            return [
                'pumpkin' => [0, 9000],
                'bat' => [10000, 19000],
            ];
        }

        return self::WINDOWS_MS;
    }

    private function extrasEnabled(): bool {
        return ($this->settings['hunt']['extras_enabled'] ?? false) === true;
    }

    private function nextRoundUs(array $player): ?int {
        if (
            !$this->extrasEnabled()
            || $player['last_round_id'] === null
        ) {
            return null;
        }

        $date = $this->run(
            'SELECT next_round_at FROM halloween_hunt_timing
            WHERE round_id = :id',
            ['id' => $player['last_round_id']]
        )->fetchColumn();

        return $date === false ? null : self::usFromDate($date);
    }

    private function lockPlayer(
        string $memberId,
        string $campaign
    ): array|false {
        return $this->run(
            'SELECT * FROM halloween_hunt_players
            WHERE campaign_id = :campaign AND membro_id = :member'
            . ($this->sqlite ? '' : ' FOR UPDATE'),
            [
                'campaign' => $campaign,
                'member' => $memberId,
            ]
        )->fetch(\PDO::FETCH_ASSOC);
    }

    private function transaction(callable $work): array {
        $this->db->beginTransaction();

        try {
            $result = $work();
            $this->db->commit();
            return $result;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $error;
        }
    }

    private function run(
        string $sql,
        array $arguments
    ): \PDOStatement {
        $statement = $this->db->prepare($sql);
        $statement->execute($arguments);
        return $statement;
    }

    private function validateMember(string $memberId): void {
        if (
            !preg_match(
                '/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D',
                $memberId
            )
        ) {
            throw new \DomainException('Precisas de iniciar sessão.', 401);
        }
    }

    private function nowUs(): int {
        return $this->clock === null
            ? (int) floor(microtime(true) * 1000000)
            : (int) round(($this->clock)() * 1000);
    }

    private static function dateFromUs(int $us): string {
        return gmdate('Y-m-d H:i:s', intdiv($us, 1000000))
            . '.'
            . str_pad(
                (string) ($us % 1000000),
                6,
                '0',
                STR_PAD_LEFT
            );
    }

    private static function usFromDate(?string $date): ?int {
        if ($date === null) {
            return null;
        }

        $parsed = new \DateTimeImmutable(
            $date,
            new \DateTimeZone('UTC')
        );

        return (int) $parsed->format('U') * 1000000
            + (int) $parsed->format('u');
    }

    private static function configuredTime(
        string $value,
        \DateTimeZone $timezone
    ): int {
        $date = \DateTimeImmutable::createFromFormat(
            '!Y-m-d H:i:s',
            $value,
            $timezone
        );

        if (!$date || $date->format('Y-m-d H:i:s') !== $value) {
            throw new \LogicException('Data da caça inválida.');
        }

        return (int) $date->format('U') * 1000000;
    }
}