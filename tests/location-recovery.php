<?php
declare(strict_types=1);

// Standalone, in-memory regression checks. No application configuration or network.
// SQLite adapts SQL syntax only; validate MySQL locking separately before deployment.
require_once dirname(__DIR__) . '/vendor/autoload.php';

require_once __DIR__ . '/fixtures/RecoveryTestDatabase.php';

$checks = 0;
$check = static function (bool $condition, string $name) use (&$checks): void {
    if (!$condition) throw new RuntimeException('FAIL: ' . $name);
    $checks++;
    echo 'PASS: ' . $name . PHP_EOL;
};
$db = new RecoveryTestDatabase();
$recovery = new App\CMS\LocationRecovery($db);
$member = 'member-one';
$token = str_repeat('a', 64);
$newToken = str_repeat('b', 64);
$apns = str_repeat('c', 64);
$grant = static function (string $owner, string $raw) use ($db): void {
    $db->prepare('INSERT INTO token VALUES (:token, :owner, :expiry, :purpose)')->execute([
        'token' => App\CMS\Token::hash($raw), 'owner' => $owner,
        'expiry' => gmdate('Y-m-d H:i:s', time() + 86400), 'purpose' => 'background_location']);
};
$grant($member, $token);
$grant($member, $newToken);
$stale = static function (int $age = 600) use ($db, $member): void {
    $stamp = gmdate('Y-m-d H:i:s', time() - $age) . '.000';
    $db->prepare('UPDATE localizacao_membro SET capturada_em=:capture, atualizada_em=:fresh WHERE membro_id=:member')
        ->execute(['capture' => $stamp, 'fresh' => $stamp, 'member' => $member]);
};
$db->prepare("INSERT INTO localizacao_membro VALUES (:member, 38, -9, 5, 1, 0, 'foreground', NULL, NULL, NULL)")
    ->execute(['member' => $member]);
$stale();
$row = static fn() => $db->query('SELECT * FROM localizacao_membro')->fetch();
$device = static fn() => $db->query('SELECT * FROM location_recovery_devices')->fetch();
$due = static function () use ($db): void {
    $db->exec("UPDATE location_recovery_devices SET next_at=0, attempts_json='[]'");
};
$sample = static fn() => ['location_policy_version' => 1, 'latitude' => 38.1, 'longitude' => -9.1,
    'accuracy' => 5, 'timestamp' => floor((microtime(true) - 2) * 1000)];
$registration = $recovery->register($member, $token, $apns, 'sandbox', 2);
putenv('MARGOT_LOCATION_RECOVERY_MEMBERS=member-one');
putenv('MARGOT_LOCATION_RECOVERY_ENABLED=0');
$check($recovery->nextRequest() === null, 'feature switch prevents new requests');
putenv('MARGOT_LOCATION_RECOVERY_ENABLED=1');
$stale(179);
$check($recovery->nextRequest() === null, 'fresh native sample avoids GPS wake');
$stale(181);
$job = $recovery->nextRequest();
$check($job !== null && (int) $device()['failures'] === 1, 'stale sample reserves one recovery attempt');
$check($recovery->nextRequest() === null, 'immediate repeat preserves backoff');
$payload = ['registration_id' => $registration['registration_id'], 'request_id' => $job['request_id']];
$check($recovery->shouldCapture($member, $token, $payload), 'hidden member remains eligible');
$check(!$recovery->shouldCapture('other', $token, $payload), 'foreign member rejected');
$check(!$recovery->shouldCapture($member, $newToken, $payload), 'different valid grant rejected');
$check(!$recovery->shouldCapture($member, $token, ['request_id' => [], 'registration_id' => $registration['registration_id']]),
    'malformed request rejected');
$before = $device();
$again = $recovery->register($member, $token, $apns, 'sandbox', 2);
$check($again['registration_id'] === $registration['registration_id'] && $before === $device(),
    'same grant preserves request, backoff and rolling budget');
$db->exec('UPDATE location_recovery_devices SET request_until=0');
$check(!$recovery->shouldCapture($member, $token, $payload), 'expired request rejected');
$db->exec('UPDATE location_recovery_devices SET request_until=' . (time() + 180));
$stale(1);
$check(!$recovery->shouldCapture($member, $token, $payload), 'sample arriving after push cancels extra capture');
$stale();
$db->exec('UPDATE localizacao_membro SET localizacao_ativa=0');
$check(!$recovery->upload($member, $token, $payload + $sample()), 'collection disabled before upload rejected');
$db->exec('UPDATE localizacao_membro SET localizacao_ativa=1');
$db->exec("UPDATE token SET validade='2000-01-01 00:00:00'");
$check(!$recovery->shouldCapture($member, $token, $payload), 'expired grant rejected');
$db->exec("UPDATE token SET validade='2099-01-01 00:00:00'");
$before = $row();
$fix = $sample();
$check($recovery->upload($member, $token, $payload + $fix), 'fresh recovery upload accepted');
$check((int) $row()['visivel'] === 0 && (int) $row()['localizacao_ativa'] === 1,
    'recovery does not change visibility or collection');
$check($row()['capturada_em'] === App\CMS\LocationSample::capturedAt($fix)
    && $row()['atualizada_em'] === $row()['capturada_em'], 'freshness uses actual capture time');
$check($device()['request_id'] === null && (int) $device()['failures'] === 0, 'accepted upload clears pending request and failures');
$after = $row();
$check(!$recovery->upload($member, $token, $payload + $sample()) && $row() === $after, 'replayed upload cannot renew freshness');
$stale(); $due();
$job = $recovery->nextRequest();
$payload['request_id'] = $job['request_id'];
$before = $device();
$registration = $recovery->register($member, $newToken, $apns, 'sandbox', 2);
$after = $device();
$check($registration['registration_id'] !== $payload['registration_id'] && $after['request_id'] === null
    && (int) $after['request_until'] === 0, 'rotated grant invalidates pending request');
$check((int) $after['next_at'] === 0 && (int) $after['failures'] === 0 && $after['last_capture'] === null,
    'rotated grant starts without previous recovery backoff');
$check($after['attempts_json'] === $before['attempts_json'], 'rotation preserves rolling device energy budget');
$check($recovery->nextRequest() === null, 'rotation cannot bypass minimum wake interval');
$recovery->failed($job, true, 'Unregistered');
$check((int) $device()['enabled'] === 1, 'late APNs failure cannot disable newer registration');
$check(!$recovery->upload($member, $token, $payload + $sample()), 'old grant cannot upload for newer registration');

// Interleave a valid registration change between request lookup and eligibility lookup.
$due(); $stale();
$job = $recovery->nextRequest();
$payload = ['registration_id' => $registration['registration_id'], 'request_id' => $job['request_id']];
$db->beforeEligibility = static function () use ($recovery, $member, $token, $apns): void {
    $recovery->register($member, $token, $apns, 'sandbox', 2);
};
$check(!$recovery->shouldCapture($member, $newToken, $payload), 'registration race cannot authorize obsolete GPS request');

$registration = $recovery->register($member, $token, $apns, 'sandbox', 2);
$due(); $stale();
$job = $recovery->nextRequest();
$payload = ['registration_id' => $registration['registration_id'], 'request_id' => $job['request_id']];
$originalExpiry = $device()['expires_at'];
$db->exec('UPDATE location_recovery_devices SET expires_at=0');
$check(!$recovery->shouldCapture($member, $token, $payload), 'expired device registration rejected');
$db->exec('UPDATE location_recovery_devices SET expires_at=' . $originalExpiry);
$db->beforeUpload = static function (PDO $db): void {
    $db->exec("UPDATE localizacao_membro SET latitude=39, capturada_em=UTC_TIMESTAMP(), atualizada_em=UTC_TIMESTAMP()");
};
$check(!$recovery->upload($member, $token, $payload + $sample()) && (float) $row()['latitude'] === 39.0,
    'newer native point arriving during upload wins');
$stale();
$db->beforeUpload = static function (PDO $db) use ($token): void {
    $db->prepare('DELETE FROM token WHERE token=:hash')->execute(['hash' => App\CMS\Token::hash($token)]);
};
$before = $row();
$check(!$recovery->upload($member, $token, $payload + $sample()) && $before === $row(),
    'logout before location write cannot renew freshness');
$grant($member, $token);
$grant('member-two', str_repeat('f', 64));
$db->exec("INSERT INTO localizacao_membro SELECT 'member-two',latitude,longitude,precisao_m,
    localizacao_ativa,visivel,origem,capturada_em,atualizada_em,recebida_em FROM localizacao_membro");
$before = $device();
$otherRegistration = $recovery->register('member-two', str_repeat('f', 64), $apns, 'sandbox', 2);
$check($device()['membro_id'] === 'member-two' && $device()['request_id'] === null
    && $device()['attempts_json'] === $before['attempts_json'], 'owner change clears request and preserves device budget');
$check(!$recovery->shouldCapture($member, $token, $payload), 'previous owner cannot capture after account switch');

$now = 1000000;
$check(App\CMS\LocationRecovery::nextBudget([$now - 180], $now, 180) === [$now - 180, $now],
    'minimum interval boundary permits one attempt');
foreach ([[$now - 179], [$now + 1], array_fill(0, 180, $now - 180)] as $history) {
    $rejected = false;
    try { App\CMS\LocationRecovery::nextBudget($history, $now, 180); }
    catch (RuntimeException) { $rejected = true; }
    $check($rejected, 'minimum interval, future history and daily budget fail closed');
}
$check(App\CMS\LocationRecovery::nextBudget(array_fill(0, 180, $now - 86400), $now, 180) === [$now],
    'expired attempts leave rolling daily budget');
$check(App\CMS\LocationRecovery::delay(0, 180) === 180 && App\CMS\LocationRecovery::delay(1, 180) === 360
    && App\CMS\LocationRecovery::delay(100, 180) === 3600, 'exponential retries capped at one hour');
echo "OK: $checks recovery checks (SQLite adapter; no MySQL locking claim).\n";
