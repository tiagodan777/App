<?php
declare(strict_types=1);

namespace App\CMS;

/**
 * Calendário absoluto: não depende de abrir, fechar ou reinstalar a app.
 */
final class HalloweenCalendar
{
    public static function build(array $settings): array
    {
        $mode = $settings['mode'] ?? 'off';

        if (!in_array($mode, ['pilot', 'public'], true)) {
            return [];
        }

        $h = $settings['hunt'];
        $tz = new \DateTimeZone($h['timezone']);

        $parse = static function (string $s) use ($tz): int {
            $d = \DateTimeImmutable::createFromFormat(
                '!Y-m-d H:i:s',
                $s,
                $tz
            );

            if (!$d || $d->format('Y-m-d H:i:s') !== $s) {
                throw new \LogicException('Data inválida.');
            }

            return $d->getTimestamp() * 1000;
        };

        $start = $parse($h[$mode . '_starts_at']);
        $end = $parse($h[$mode . '_ends_at']);

        if ($end <= $start) {
            throw new \LogicException('Fim anterior ao início.');
        }

        $run = $mode === 'pilot'
            ? (string) $h['pilot_run']
            : 'public';

        if (!preg_match('/^[a-z0-9-]{1,40}$/D', $run)) {
            throw new \LogicException('Campanha inválida.');
        }

        $campaign = 'hw26-waves-v20-'
            . ($mode === 'pilot' ? 'pilot-' : '')
            . $run;

        // 19 oportunidades antes de 23:30:
        // 10 abóboras e 9 morcegos.
        $minutes = [
            0, 6, 12, 19, 25,
            32, 38, 44, 50, 57,
            64, 71, 79, 88, 90,
        ];

        for ($m = 95, $i = 0; $m < 329; $i++) {
            $minutes[] = $m;
            $m += [4, 5, 4, 6, 5][$i % 5];
        }

        $waves = [];
        $ordinal = 0;

        foreach ($minutes as $i => $minute) {
            // No teste, mantêm-se os grupos e movimentos.
            // Apenas as pausas são comprimidas.
            $at = $start + (
                $mode === 'pilot'
                    ? $i * 45000
                    : $minute * 60000
            );

            if ($at >= $end) {
                break;
            }

            $count = $i < 14
                ? [3, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2][$i]
                : (
                    $i === 14
                        ? 3
                        : [2, 3, 2, 4][$i % 4]
                );

            $waveId = substr(
                hash('sha256', $campaign . ':wave:' . $i),
                0,
                32
            );

            $objects = [];

            for ($j = 0; $j < $count; $j++) {
                // Um único trio simultâneo.
                // Pares ocasionais; restantes alvos isolados.
                $offset = $i === 14
                    ? 0
                    : (
                        $i % 4 === 1 && $j < 2
                            ? 0
                            : $j * 11000
                    );

                $open = $at + $offset;

                if ($open + 9500 > $end) {
                    continue;
                }

                $id = substr(
                    hash(
                        'sha256',
                        $campaign . ':object:' . $ordinal
                    ),
                    0,
                    32
                );

                $difficulty = hexdec(
                    substr(
                        hash('sha256', 'tier:' . $ordinal),
                        0,
                        6
                    )
                ) % 100;

                $kindOrdinal = [
                    2 => 3,
                    3 => 2,
                    14 => 15,
                    15 => 14,
                ][$ordinal] ?? $ordinal;

                $objects[] = [
                    'id' => $id,

                    'kind' => $kindOrdinal % 2 === 0
                        ? 'pumpkin'
                        : 'bat',

                    'difficulty' => $i === 14
                        ? 3
                        : (
                            $difficulty < 15
                                ? 0
                                : (
                                    $difficulty < 40
                                        ? 1
                                        : (
                                            $difficulty < 65
                                                ? 2
                                                : 3
                                        )
                                )
                        ),

                    'opens_at_ms' => $open,
                    'expires_at_ms' => $open + 9500,
                ];

                $ordinal++;
            }

            if ($objects) {
                $waves[] = [
                    'id' => $waveId,
                    'started_at_ms' => $at,
                    'objects' => $objects,
                ];
            }
        }

        return [
            'campaign_id' => $campaign,
            'mode' => $mode,
            'starts_at_ms' => $start,
            'ends_at_ms' => $end,
            'waves' => $waves,
        ];
    }
}