<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__, 2) . '/vendor/autoload.php';
require __DIR__ . '/RecoveryTestDatabase.php';
$db = new RecoveryTestDatabase();
$case = getenv('RECOVERY_HTTP_CASE');
$raw = str_repeat('a', 64);
$hash = App\CMS\Token::hash($raw);
$member = 'member-one';
$db->prepare('INSERT INTO token VALUES (:hash,:member,:expires,:purpose)')->execute([
    'hash' => $hash, 'member' => $member, 'expires' => '2099-01-01 00:00:00', 'purpose' => 'background_location']);
$captured = gmdate('Y-m-d H:i:s', time() - 600) . '.000';
$db->prepare("INSERT INTO localizacao_membro VALUES (:member,38,-9,5,1,0,'foreground',:captured,:fresh,:received)")
    ->execute(['member' => $member, 'captured' => $captured, 'fresh' => $captured, 'received' => $captured]);
$recovery = new App\CMS\LocationRecovery($db);
$recovery->register($member, $raw, str_repeat('c', 64), 'sandbox', 2);
$db->prepare('UPDATE location_recovery_devices SET registration_id=:registration, request_id=:request,
    request_until=:until')->execute(['registration' => str_repeat('d', 32), 'request' => str_repeat('e', 32),
        'until' => time() + 180]);
$nearbyCalls = 0;
$cms = new class($db, $case) {
    public function __construct(private PDO $db, private string $case) {}
    public function getDatabase(): PDO { return $this->db; }
    public function getToken(): object {
        return new class($this->db) {
            public function __construct(private PDO $db) {}
            public function getMemberId(string $token, string $purpose): string|false {
                $statement = $this->db->prepare('SELECT membro_id FROM token WHERE token=:hash
                    AND proposito=:purpose AND validade > UTC_TIMESTAMP()');
                $statement->execute(['hash' => App\CMS\Token::hash($token), 'purpose' => $purpose]);
                return $statement->fetchColumn();
            }
        };
    }
    public function getNearbyPresenceNotification(): object {
        global $nearbyCalls;
        $nearbyCalls++;
        if ($this->case === 'nearby_constructor_failure') throw new RuntimeException('Synthetic optional service failure');
        return new class($this->case) {
            public function __construct(private string $case) {}
            public function locationSnapshot(string $member): ?array {
                if ($this->case === 'nearby_snapshot_failure') throw new RuntimeException('Synthetic snapshot failure');
                return ['latitude' => 38, 'longitude' => -9];
            }
            public function processLocationChange(...$args): void {
                if ($this->case === 'nearby_notification_failure') throw new RuntimeException('Synthetic notification failure');
            }
        };
    }
};
function authorization_header(): string { return $_SERVER['HTTP_AUTHORIZATION'] ?? ''; }
function json_response(array $data, int $status = 200): never {
    global $db, $nearbyCalls;
    http_response_code($status);
    echo json_encode(['response' => $data, 'nearby_calls' => $nearbyCalls,
        'row' => $db->query('SELECT * FROM localizacao_membro')->fetch()], JSON_THROW_ON_ERROR);
    exit;
}
require dirname(__DIR__, 2) . '/src/pages/location-recovery.php';
