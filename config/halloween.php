<?php
declare(strict_types=1);

return [
    // 'pilot': apenas estas contas; 'off': desligado; 'public': lançamento manual.
    'mode' => 'pilot',
    'testers' => [
        'bcad0cb1-9cec-11f1-9863-42010a840002', // Tiago Daniel
        '2eca97ae-a46c-11f1-9863-42010a840002', // Marta Raposo
        '3ccf53b0-a46f-11f1-9863-42010a840002', // Henrique Ponte
        'd737e08e-b2c1-11f1-9863-42010a840002' // Isabel Sousa
    ],
    'hunt' => [
        // Muda para 'test-2', etc., para recomeçar o piloto sem apagar o histórico.
        'pilot_run' => 'test-1',
        // Piloto imediato, apenas nas contas acima. Usa 300 para ensaiar 5 minutos.
        // Alterar este intervalo cria uma campanha de teste separada, a zero.
        'pilot_interval_seconds' => 30,
        'public_interval_seconds' => 300,
        'timezone' => 'Atlantic/Azores',
        'public_starts_at' => '2026-10-31 22:00:00',
        'public_ends_at' => '2026-11-01 03:30:00',
    ],
];
