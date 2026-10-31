<?php
declare(strict_types=1);

return [
    'mode' => 'pilot',

    'testers' => [
        'bcad0cb1-9cec-11f1-9863-42010a840002', // Tiago Daniel
        '2eca97ae-a46c-11f1-9863-42010a840002', // Marta Raposo
        '3ccf53b0-a46f-11f1-9863-42010a840002', // Henrique Ponte
        'd737e08e-b2c1-11f1-9863-42010a840002', // Isabel Sousa
        '15c51c61-9e21-11f1-9863-42010a840002', // Luís Daniel
        '65e19244-a603-11f1-9863-42010a840002', // Tomás Silva
        'eed882c1-aaad-11f1-9863-42010a840002', // André Matos
        '2d6aab13-c3ee-11f1-9863-42010a840002' // André Vieira

    ],

    'hunt' => [
        'extras_enabled' => true,
        'waves_enabled' => true,
        'announcements_enabled' => true,
        'automatic_announcements_enabled' => true,

        'pilot_min_seconds' => 20,
        'pilot_max_seconds' => 20,

        'public_min_seconds' => 120,
        'public_max_seconds' => 240,

        'winner_email' => 'tiagoamdaniel488@gmail.com',

        'notify_campaigns' => [
            'hw26-waves-v20-pilot-notices-2118',
            'hw26-waves-v20-public',
        ],

        'pilot_run' => 'notices-2118',
        'pilot_interval_seconds' => 20,
        'public_interval_seconds' => 180,

        'timezone' => 'Atlantic/Azores',

        'pilot_starts_at' => '2026-10-31 21:18:00',
        'pilot_ends_at' => '2026-10-31 21:30:00',

        'public_starts_at' => '2026-10-31 22:00:00',
        'public_ends_at' => '2026-11-01 03:30:00',
    ],
];