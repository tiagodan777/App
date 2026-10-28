<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('DOC_ROOT', '/');

require APP_ROOT . '/vendor/autoload.php';
require __DIR__ . '/TestDatabase.php';

$checks = 0;

function check(bool $value, string $label): void {
    global $checks;

    if (!$value) {
        throw new RuntimeException($label);
    }

    $checks++;
}

function rejects(
    callable $callback,
    string $class,
    string $label
): void {
    try {
        $callback();
    } catch (Throwable $e) {
        check(
            $e instanceof $class,
            $label . ': ' . get_class($e)
        );
        return;
    }

    throw new RuntimeException($label . ' unexpectedly allowed');
}

$settings = require APP_ROOT . '/config/halloween.php';
[$tiago, $marta, $henrique] = $settings['testers'];

$outside = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

$wardrobe = new App\CMS\HalloweenWardrobe([
    'mode' => 'pilot',
    'testers' => $settings['testers'],
]);

foreach ([$tiago, $marta, $henrique] as $id) {
    check($wardrobe->allowed($id), 'Tester allowed');
}

check(!$wardrobe->allowed($outside), 'Fourth account denied');

check(
    !$wardrobe->allowed('')
        && !$wardrobe->allowed('Tiago Daniel'),
    'Names and anonymous denied'
);

check(
    $marta === '2eca97ae-a46c-11f1-9863-42010a840002',
    'Marta ID matches supplied database screenshot'
);

$off = new App\CMS\HalloweenWardrobe([
    'mode' => 'off',
    'testers' => [$tiago],
]);

$public = new App\CMS\HalloweenWardrobe([
    'mode' => 'public',
]);

check(
    !$off->allowed($tiago)
        && $public->allowed($outside)
        && !$public->allowed(''),
    'Manual switches, still authenticated'
);

$catalog = $wardrobe->clientCatalog($tiago, '/halloween/');

check(
    count($catalog['items']) === 240
        && count($catalog['groups']) === 20,
    'Full catalog'
);

check(
    !str_contains(json_encode($catalog), $marta),
    'Tester IDs absent from public response'
);

foreach ($catalog['items'] as $item) {
    check(
        $item['cell'] >= 0 && $item['cell'] < 12,
        'Valid sprite cell'
    );

    check(
        str_starts_with($item['asset'], '/halloween/'),
        'Protected URL'
    );
}

rejects(
    fn() => $wardrobe->clientCatalog($outside, '/halloween/'),
    DomainException::class,
    'Catalog restricted'
);

check(
    $wardrobe->assetPath($outside, 'cinema') === null,
    'Asset restricted'
);

check(
    $wardrobe->assetPath($tiago, '../../config/config') === null,
    'Path traversal rejected'
);

check(
    $wardrobe->assetPath($tiago, 'not-a-sheet') === null,
    'Unknown asset rejected'
);

check(
    is_file($wardrobe->assetPath($tiago, 'cinema')),
    'Tester can load image'
);

$db = new TestDatabase();

foreach ([$tiago, $marta, $henrique, $outside] as $i => $id) {
    $db->runSQL(
        'INSERT INTO membros
            (id, primeiro_nome, ultimo_nome, nascimento, genero,
                email, password, nome_seo)
         VALUES
            (:id, :first, :last, :birth, :gender, :email, :pass, :seo)',
        [
            'id' => $id,
            'first' => 'Tester',
            'last' => (string) $i,
            'birth' => '1990-01-01',
            'gender' => 'M',
            'email' => $i . '@test.example',
            'pass' => 'unused',
            'seo' => 'tester' . $i,
        ]
    );
}

$today = new App\CMS\TodayStatus($db, $wardrobe);
$version = App\CMS\HalloweenWardrobe::VERSION;

$costume = [
    'type' => 'hw26_sobreviventes_05',
    'color' => 'red',
    'label' => 'forged',
];

$hat = ['type' => 'hw26_cabeca_01'];
$normal = ['type' => 'shirt', 'color' => 'blue'];

rejects(
    fn() => $today->normaliseClothes([$costume], $outside),
    DomainException::class,
    'Non-tester cannot save'
);

rejects(
    fn() => $today->normaliseClothes(
        [['type' => 'hw26_missing_99']],
        $tiago
    ),
    InvalidArgumentException::class,
    'Unknown Halloween ID rejected'
);

rejects(
    fn() => $today->normaliseClothes(
        [$costume, ['type' => 'hw26_cinema_01']],
        $tiago
    ),
    InvalidArgumentException::class,
    'Two costumes rejected'
);

rejects(
    fn() => $today->normaliseClothes(
        array_fill(0, 6, $costume),
        $tiago
    ),
    InvalidArgumentException::class,
    'Six entries rejected'
);

$state = $today->save(
    $tiago,
    'Nota normal',
    [$costume, $hat, $normal],
    $version
);

check(
    count($state['clothes']) === 3
        && $state['clothes'][0]['label'] === 'Ellie'
        && $state['clothes'][0]['color'] === '',
    'Canonical data and fixed Halloween colors'
);

foreach ([$tiago, $marta, $henrique] as $viewer) {
    check(
        count(
            $today->getForViewer($tiago, $viewer, $version)['clothes']
        ) === 3,
        'Testers see each other'
    );
}

$filtered = $today->getForViewer($tiago, $outside, $version);

check(
    count($filtered['clothes']) === 1
        && $filtered['clothes'][0]['type'] === 'shirt'
        && $filtered['note'] === 'Nota normal',
    'Outsider sees only normal clothes and note'
);

check(
    count($today->getForViewer($tiago, $tiago)['clothes']) === 1,
    'Old web client gets no unknown types'
);

rejects(
    fn() => $today->save($tiago, 'Legacy note', [$normal]),
    LogicException::class,
    'Legacy save cannot remove costume'
);

check(
    $today->get($tiago)['note'] === 'Nota normal',
    'Rejected legacy request did not mutate state'
);

$today->save($tiago, '', [$costume], $version);

check(
    $today->getForViewer($tiago, $outside, $version) === null,
    'Costume-only bubble absent for outsider'
);

$offToday = new App\CMS\TodayStatus($db, $off);

check(
    $offToday->getForViewer($tiago, $tiago, $version) === null,
    'Off hides saved costumes'
);

$normalState = $today->save($outside, 'Normal', [$normal]);

check(
    $normalState['clothes'][0]['color'] === 'blue',
    'Ordinary account workflow unchanged'
);

check(
    count(
        $today->normaliseClothes([$normal, $normal], $outside)
    ) === 1,
    'Normal deduplication'
);

$today->save(
    $tiago,
    'Nota sem fantasia',
    [$normal],
    $version
);

check(
    count($today->get($tiago)['clothes']) === 1,
    'New client can explicitly remove costume'
);

$today->save($tiago, '', [$costume], $version);

$db->runSQL(
    'UPDATE membro_hoje SET expira_em = :time WHERE membro_id = :id',
    [
        'time' => '2000-01-01 00:00:00',
        'id' => $tiago,
    ]
);

check(
    $today->getForViewer($tiago, $marta, $version) === null,
    '24-hour expiry retained'
);

$today->delete($tiago);

check(
    $today->get($tiago) === null,
    'Explicit delete retained'
);

foreach ($db->statements as $statement) {
    check(
        !preg_match('/^\\s*(ALTER|CREATE|DROP) /i', $statement),
        'No schema mutations'
    );
}

echo 'PASS: '
    . $checks
    . ' Halloween server checks (local SQLite).'
    . PHP_EOL;