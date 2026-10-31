<?php
declare(strict_types=1);

return [
    // pilot: contas de teste; off: desligado; public: lançamento público.
    'mode' => 'pilot',

    'testers' => [
        'bcad0cb1-9cec-11f1-9863-42010a840002', // Tiago Daniel
        '2eca97ae-a46c-11f1-9863-42010a840002', // Marta Raposo
        '3ccf53b0-a46f-11f1-9863-42010a840002', // Henrique Ponte
        'd737e08e-b2c1-11f1-9863-42010a840002', // Isabel Sousa
    ],

    'hunt' => [
        // As tabelas de halloween-hunt-extras.sql têm de existir primeiro.
        'extras_enabled' => true,

        'pilot_min_seconds' => 20,
        'pilot_max_seconds' => 20,

        'public_min_seconds' => 120,
        'public_max_seconds' => 240,

        'winner_email' => 'tiagoamdaniel488@gmail.com',

        'notify_campaigns' => [
            'hw26-hunt-v1-pilot-20s-test-1055',
            'hw26-hunt-v1-public',
        ],

        // Para outro ensaio a zero, mudar este identificador e o correspondente
        // identificador em notify_campaigns. O histórico anterior é preservado.
        'pilot_run' => 'test-1055',

        'pilot_interval_seconds' => 20,

        // Intervalo de compatibilidade para rondas antigas sem prazo persistido.
        'public_interval_seconds' => 180,

        'timezone' => 'Atlantic/Azores',

        'pilot_starts_at' => '2026-10-31 10:55:00',
        'pilot_ends_at' => '2026-10-31 11:05:00',

        'public_starts_at' => '2026-10-31 22:00:00',
        'public_ends_at' => '2026-11-01 03:33:00',
    ],
];