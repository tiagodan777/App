<?php
// Executado por run.php: sem servidor, sockets reais ou notificações externas.

final class TestConnection implements Ratchet\ConnectionInterface {
    public array $events = [];
    public bool $closed = false;
    public object $httpRequest;

    public function __construct(public int $resourceId, string $origin = 'https://example.test') {
        $this->httpRequest = new GuzzleHttp\Psr7\Request('GET', '/', ['Origin' => $origin]);
    }

    public function send($data) {
        $this->events[] = json_decode((string) $data, true, 512, JSON_THROW_ON_ERROR);
        return $this;
    }

    public function close() { $this->closed = true; }

    public function last(string $type): ?array {
        foreach (array_reverse($this->events) as $event) if ($event['type'] === $type) return $event;
        return null;
    }
}

$loop = new React\EventLoop\StreamSelectLoop();
$app = new App\CMS\WebSocket(fn() => $db, $loop);
$gateway = new App\CMS\AuthenticatedWebSocket($app, fn() => $db, $loop, ['https://example.test']);
$tokens = new App\CMS\Token($db);
$socketA = new TestConnection(1);
$socketB = new TestConnection(2);
ob_start();
try {
    $badOrigin = new TestConnection(3, 'https://untrusted.test');
    $gateway->onOpen($badOrigin);
    check($badOrigin->closed, 'WebSocket recusa outra origem');
    $unauthenticated = new TestConnection(4);
    $gateway->onOpen($unauthenticated);
    $gateway->onMessage($unauthenticated, '{"type":"chat_read"}');
    check($unauthenticated->closed, 'WebSocket exige autenticação');
    $gateway->onClose($unauthenticated);
    $tokenA = $tokens->create($a, 'websocket');
    foreach ([[$socketA, $tokenA], [$socketB, $tokens->create($b, 'websocket')]] as [$socket, $token]) {
        $gateway->onOpen($socket);
        $gateway->onMessage($socket, json_encode(['type' => 'auth', 'token' => $token,
            'membro_id' => $c, 'location_enabled' => true, 'map_presence' => true]));
        check(!$socket->closed, 'WebSocket autenticado mantém ligação');
        check($socket->last('state') !== null, 'WebSocket envia estado inicial');
    }
    same($a, $socketA->last('authenticated')['membro_id'], 'Identidade vem do token, não do pedido');
    $reuse = new TestConnection(5);
    $gateway->onOpen($reuse);
    $gateway->onMessage($reuse, json_encode(['type' => 'auth', 'token' => $tokenA]));
    check($reuse->closed, 'Token WebSocket não pode ser reutilizado');
    $gateway->onClose($reuse);
    $gateway->onMessage($socketA, '{bad json');
    check($socketA->last('error') !== null && !$socketA->closed, 'JSON inválido não interrompe servidor');
    $gateway->onMessage($socketA, '{"type":"ping"}');
    check($socketA->last('pong') !== null, 'Ping/pong');

    foreach ([$socketA, $socketB] as $socket) {
        $gateway->onMessage($socket, json_encode(['type' => 'location', 'latitude' => 38.72, 'longitude' => -9.14, 'accuracy' => 5]));
    }
    same(2, count($socketA->last('state')['people']), 'Pessoas próximas aparecem no mapa');
    $other = array_values(array_filter($socketA->last('state')['people'], fn($person) => $person['id'] === $b))[0];
    check((bool) preg_match('/^[a-f0-9]{64}$/', $other['profile_access_token']), 'Proximidade emite acesso ao perfil');
    $gateway->onMessage($socketA, json_encode(['type' => 'connection_attempt', 'destinatario_id' => $b]));
    check($socketA->last('connection_waiting') !== null, 'Ligação espera a outra pessoa');
    $gateway->onMessage($socketB, json_encode(['type' => 'connection_attempt', 'destinatario_id' => $a]));
    check($connections->areConnected($a, $b), 'Duas tentativas simultâneas criam ligação');
    check($socketA->last('connection_created') !== null, 'Evento de nova ligação');

    $messageId = $messages->send($a, $b, 'Mensagem em tempo real', []);
    $gateway->onMessage($socketA, json_encode(['type' => 'chat_publish', 'message_id' => $messageId]));
    same($messageId, $socketB->last('chat_message')['message']['id'], 'Publicar envia mensagem ao destinatário');
    $gateway->onMessage($socketB, json_encode(['type' => 'chat_publish', 'message_id' => $messageId]));
    check($socketB->last('chat_error') !== null, 'Destinatário não publica mensagem como autor');
    $messages->react($messageId, $b, '❤️', false);
    $gateway->onMessage($socketB, json_encode(['type' => 'chat_reaction', 'message_id' => $messageId]));
    same('❤️', $socketA->last('chat_reaction')['reactions'][0]['emoji'], 'Reações propagadas');
    $gateway->onMessage($socketB, json_encode(['type' => 'chat_read', 'with_member_id' => $a]));
    same($messageId, $socketA->last('chat_messages_read')['last_message_id'], 'Leitura propagada');
    same(0, $messages->unreadCount($b), 'Leitura WebSocket atualiza a base');
    $messages->deleteSent($messageId, $a, $b);
    $gateway->onMessage($socketA, json_encode(['type' => 'chat_delete', 'message_id' => $messageId]));
    same(true, $socketB->last('chat_reaction')['deleted'], 'Eliminação propagada');
    $gateway->onMessage($socketB, '{"type":"presence_update","map_presence":false}');
    same(false, $socketB->last('presence_updated')['map_presence'], 'Modo invisível');
    same(1, count($socketA->last('state')['people']), 'Pessoa invisível sai do mapa');
    $gateway->onMessage($socketA, json_encode(['type' => 'connection_disconnect', 'destinatario_id' => $b]));
    check(!$connections->areConnected($a, $b), 'Desligar remove relação');
    check($socketB->last('connection_removed') !== null, 'Remoção propagada');
    $gateway->onClose($socketA);
    $gateway->onClose($socketB);
} finally {
    $socketLog = ob_get_clean();
}
check(!str_contains($socketLog, 'ERROR]'), 'Sem falhas internas WebSocket: ' . $socketLog);
