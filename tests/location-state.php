<?php
// Rede, Apple/Google e produção não são usados. Testar também em MySQL/MariaDB.
(function () {
    $db = new TestDatabase();
    $member = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    $other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    foreach ([$member, $other] as $index => $id) {
        $db->runSQL("INSERT INTO membros (id,primeiro_nome,ultimo_nome,nascimento,genero,email,password,nome_seo)
            VALUES (:id,'Audit','Location','1990-01-01','F',:email,'unused','audit')",
            ['id' => $id, 'email' => 'state' . $index . '@example.test']);
    }
    $location = new App\CMS\Location($db);
    $tokens = new App\CMS\Token($db);
    $firstToken = $tokens->create($member, 'background_location');
    $secondToken = $tokens->create($member, 'background_location');
    $payload = ['location_policy_version' => 1, 'latitude' => 37.7, 'longitude' => -25.6,
        'accuracy' => 10, 'timestamp' => floor((microtime(true) - 30) * 1000)];
    same(['active' => false, 'visible' => false, 'revision' => 0], $location->state($member), 'Token não inventa consentimento');
    same(false, $location->saveLocationPush($member, $firstToken, $payload), 'GPS antes de consentimento recusado');
    same('collection_disabled', $location->rejectionReason($member, $firstToken), 'Recusa identifica estado desativado');
    check($location->setState($member, 0, true, true), 'Consentimento HTTP funciona sem WebSocket');
    check($location->saveLocationPush($member, $firstToken, $payload), 'Primeira amostra após consentimento aceite');
    $row = fn() => $db->runSQL('SELECT * FROM localizacao_membro WHERE membro_id=:member', ['member' => $member])->fetch();
    $captured = $row()['capturada_em'];
    same(false, $location->saveLocationPush($member, $firstToken, $payload), 'Duplicado não atualiza localização');
    same('duplicate_or_older_location', $location->rejectionReason($member, $firstToken), 'Duplicado é distinguível de recolha desativada');
    check($location->setState($member, 1, true, false), 'Invisibilidade explícita mantém recolha');
    same($captured, $row()['capturada_em'], 'Mudar estado não renova captura');
    check($location->setState($member, 2, true, true), 'Mostrar avança revisão');
    same(false, $location->setState($member, 1, true, false), 'Hide atrasado não ultrapassa show mais recente');
    same(true, $location->state($member)['visible'], 'CAS mantém decisão recente');
    $location->saveBackground($member, null, null, null, true, false);
    same(true, $location->state($member)['visible'], 'Hide legado não ultrapassa estado versionado');
    check($location->setState($member, 3, true, false), 'Ocultar novamente');
    $payload['timestamp'] += 1000;
    check($location->saveLocationPush($member, $firstToken, $payload), 'Invisível continua a atualizar posição');
    same(false, $location->state($member)['visible'], 'GPS não torna visível');
    $payload['timestamp'] -= 2000;
    same(false, $location->saveLocationPush($member, $firstToken, $payload), 'Amostra antiga não substitui nova');
    $location->revokeBackgroundGrant($member, $firstToken);
    same(false, $tokens->getMemberId($firstToken, 'background_location'), 'Logout revoga concessão própria');
    same($member, $tokens->getMemberId($secondToken, 'background_location'), 'Logout preserva concessão de outro aparelho');
    same(true, $location->state($member)['active'], 'Logout não desativa outro aparelho');
    same('authorization_revoked', $location->rejectionReason($member, $firstToken), 'Revogação distinguível');
    $location->revokeBackgroundGrant($member, $secondToken);
    same(true, $location->state($member)['active'], 'Logout preserva preferência para o próximo login');
    same('1970-01-01 00:00:00', $row()['atualizada_em'], 'Último aparelho sai e posição deixa de ser recente');
    $location->setState($member, $location->state($member)['revision'], false, false);
    $before = $row();
    $location->saveBackground($member, 40, -20, 5, true, true, null, 'foreground');
    same($before, $row(), 'Cliente legado não reativa nem renova posição desativada');
    $thirdToken = $tokens->create($member, 'background_location');
    same(false, $location->state($member)['active'], 'Nova credencial sozinha não reativa recolha');
    $revision = $location->state($member)['revision'];
    check($location->setState($member, $revision, true, false), 'Reativação exige consentimento atual');
    $payload['timestamp'] = floor((microtime(true) - 10) * 1000);
    check($location->saveLocationPush($member, $thirdToken, $payload), 'Reativação retoma coordenadas recentes');
    foreach ([['accuracy' => 101], ['accuracy' => 0], ['timestamp' => (microtime(true) - 121) * 1000],
        ['timestamp' => (microtime(true) + 6) * 1000], ['latitude' => 91]] as $invalid) {
        try {
            $location->saveLocationPush($member, $thirdToken, array_replace($payload, $invalid));
            check(false, 'Amostra inválida deve ser recusada');
        } catch (InvalidArgumentException) { check(true, 'Amostra inválida recusada'); }
    }

    // Exercita a seleção real do canvas com estado de socket deliberadamente antigo.
    $loop = new React\EventLoop\StreamSelectLoop();
    $app = new App\CMS\WebSocket(fn() => $db, $loop);
    $connection = new class(100) implements Ratchet\ConnectionInterface {
        public array $events = [];
        public function __construct(public int $resourceId) {}
        public function send($data) { $this->events[] = json_decode((string) $data, true); return $this; }
        public function close() {}
        public function lastState(): array {
            foreach (array_reverse($this->events) as $event) if ($event['type'] === 'state') return $event;
            return [];
        }
    };
    $otherToken = $tokens->create($other, 'background_location');
    $location->setState($other, 0, true, true);
    $location->saveLocationPush($other, $otherToken, $payload);
    $invoke = static fn($object, $method, ...$args) => (new ReflectionMethod($object, $method))->invoke($object, ...$args);
    ob_start();
    try {
        $app->onOpen($connection);
        $app->onMessage($connection, json_encode(['type' => 'auth', 'membro_id' => $member,
            'location_enabled' => false, 'map_presence' => true]));
        $invoke($app, 'sincronizarLocalizacoesPersistidas', true);
        $invoke($app, 'enviarEstadosIndividuais');
        $state = $connection->lastState();
    } finally { $log = ob_get_clean(); }
    check(!str_contains($log, 'ERROR]'), 'Canvas sem erros SQL: ' . $log);
    same(true, $state['location_filter_active'], 'Observador invisível usa coordenada nativa recente');
    same(false, $state['map_presence'], 'Socket antigo não desfaz invisibilidade');
    same([$other], array_column($state['people'], 'id'), 'Observador invisível vê pessoa próxima sem aparecer');

    $marker = $tokens->create($member, 'websocket_session');
    $socketToken = $tokens->create($member, 'websocket', null, App\CMS\Token::hash($marker));
    $gateway = new App\CMS\AuthenticatedWebSocket($app, fn() => $db, $loop, ['https://example.test']);
    $authenticated = $invoke($gateway, 'consumirToken', $socketToken);
    same($member, $authenticated['member_id'], 'Token WebSocket está ligado à sessão certa');
    same(App\CMS\Token::hash($marker), $authenticated['session_hash'], 'Gateway conserva identificação de sessão');
    $pending = $tokens->create($member, 'websocket', null, App\CMS\Token::hash($marker));
    $tokens->delete($marker);
    same(false, $invoke($gateway, 'consumirToken', $pending), 'Token pendente não autentica depois do logout');
    $makeSocket = static fn(int $id) => new class($id) implements Ratchet\ConnectionInterface {
        public array $events = [];
        public bool $closed = false;
        public object $httpRequest;
        public function __construct(public int $resourceId) {
            $this->httpRequest = new GuzzleHttp\Psr7\Request('GET', '/', ['Origin' => 'https://example.test']);
        }
        public function send($data) { $this->events[] = json_decode((string) $data, true); return $this; }
        public function close() { $this->closed = true; }
    };
    $socketOne = $makeSocket(101);
    $socketTwo = $makeSocket(102);
    $markerOne = $tokens->create($member, 'websocket_session');
    $markerTwo = $tokens->create($member, 'websocket_session');
    ob_start();
    try {
        foreach ([[$socketOne, $markerOne], [$socketTwo, $markerTwo]] as [$socket, $sessionToken]) {
            $gateway->onOpen($socket);
            $gateway->onMessage($socket, json_encode(['type' => 'auth',
                'token' => $tokens->create($member, 'websocket', null, App\CMS\Token::hash($sessionToken))]));
        }
        $tokens->delete($markerOne);
        $gateway->onMessage($socketOne, '{"type":"ping"}');
        $gateway->onMessage($socketTwo, '{"type":"ping"}');
    } finally { $log = ob_get_clean(); }
    check(!str_contains($log, 'ERROR]'), 'Gateway não gera erro interno no logout');
    same(true, $socketOne->closed, 'Logout fecha socket já autenticado dessa sessão');
    same(false, $socketTwo->closed, 'Logout mantém socket de outra sessão');
    same('pong', end($socketTwo->events)['type'], 'Outra sessão continua funcional');

    $groupA = str_repeat('a', 64);
    $groupB = str_repeat('b', 64);
    $legacy = $tokens->create($member, 'background_location');
    $tokens->bindBackgroundSession($legacy, $member, $groupA);
    $rotated = $tokens->create($member, 'background_location', null, $groupA);
    $otherDevice = $tokens->create($member, 'background_location', null, $groupB);
    $location->revokeBackgroundGrant($member, $legacy);
    same($member, $tokens->getMemberId($rotated, 'background_location'), 'Stop nativo antigo não revoga token renovado');
    $olderRotation = $tokens->create($member, 'background_location', null, $groupA);
    $location->revokeBackgroundGrant($member, $rotated);
    $location->revokeBackgroundGrant($member, $rotated, $groupA);
    same(false, $tokens->getMemberId($olderRotation, 'background_location'), 'Logout revoga rotações antigas mesmo após stop nativo');
    same($member, $tokens->getMemberId($otherDevice, 'background_location'), 'Logout por grupo conserva outra sessão do mesmo membro');

    $revision = $location->state($member)['revision'];
    check($location->setState($member, $revision, true, true), 'Preparar conta v2 visível');
    $before = $row();
    $location->hideFromLegacyClient($member);
    same(['active' => true, 'visible' => false, 'revision' => $revision + 2], $location->state($member),
        'Hide HTTP antigo oculta conta v2 e avança revisão');
    $after = $row();
    foreach (['latitude', 'longitude', 'precisao_m', 'capturada_em', 'recebida_em', 'atualizada_em'] as $field) {
        same($before[$field], $after[$field], 'Hide HTTP antigo preserva ' . $field);
    }
    $location->hideFromLegacyClient($member);
    same($after, $row(), 'Repetir hide antigo não altera revisão nem posição');
    same(false, $location->setState($member, $revision + 1, true, true),
        'Show v2 pendente não desfaz hide antigo confirmado entretanto');
    check($location->setState($member, $revision + 2, true, true), 'Show v2 com revisão atual funciona');
    $location->setState($member, $revision + 3, false, false);
    $before = $row();
    $location->hideFromLegacyClient($member);
    same($before, $row(), 'Hide antigo não reativa recolha desligada');

    // Uma conta ainda sem estado v2 mantém também o caminho antigo de voltar a mostrar.
    $db->runSQL('UPDATE localizacao_membro SET estado_versao=0, localizacao_ativa=1, visivel=1 WHERE membro_id=:member',
        ['member' => $other]);
    $location->hideFromLegacyClient($other);
    same(['active' => true, 'visible' => false, 'revision' => 0], $location->state($other),
        'Hide legado não migra conta implicitamente');
    $location->saveBackground($other, 37.7, -25.6, 10, true, true, null, 'foreground');
    same(['active' => true, 'visible' => true, 'revision' => 0], $location->state($other),
        'Conta só com interface antiga ainda consegue voltar a mostrar');
})();