<?php
declare(strict_types=1);

return [
    'mode' => 'pilot',

    'testers' => [
        'bcad0cb1-9cec-11f1-9863-42010a840002', // Tiago Daniel
        '2eca97ae-a46c-11f1-9863-42010a840002', // Marta Raposo
        '3ccf53b0-a46f-11f1-9863-42010a840002', // Henrique Ponte
        'd737e08e-b2c1-11f1-9863-42010a840002', // Isabel Sousa
    ],

    'hunt' => [
        'extras_enabled' => true,

        'pilot_min_seconds' => 20,
        'pilot_max_seconds' => 20,

        'public_min_seconds' => 120,
        'public_max_seconds' => 240,

        'winner_email' => 'tiagoamdaniel488@gmail.com',

        'notify_campaigns' => [
            'hw26-hunt-v1-pilot-20s-test-1107',
            'hw26-hunt-v1-public',
        ],

        'pilot_run' => 'test-1107',
        'pilot_interval_seconds' => 20,
        'public_interval_seconds' => 180,

        'timezone' => 'Atlantic/Azores',

        'pilot_starts_at' => '2026-10-31 11:07:00',
        'pilot_ends_at' => '2026-10-31 11:17:00',

        'public_starts_at' => '2026-10-31 22:00:00',
        'public_ends_at' => '2026-11-01 03:33:00',
    ],
];