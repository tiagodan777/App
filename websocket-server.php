<?php

declare(strict_types=1);

use App\CMS\WebSocket;
use Ratchet\Http\HttpServer;
use Ratchet\Http\OriginCheck;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use React\EventLoop\Loop;
use React\Socket\SocketServer;

define('APP_ROOT', __DIR__);

require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/vendor/autoload.php';

$loop = Loop::get();

$pdoFactory = static function () use ($dsn, $username, $password): PDO {
    $database = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
    $database->exec("SET time_zone = '+00:00'");

    return $database;
};

$origensPermitidas = array_values(array_filter(
    WEBSOCKET_ALLOWED_ORIGINS,
    static fn ($origem): bool => is_string($origem) && trim($origem) !== ''
));

if ($origensPermitidas === []) {
    throw new RuntimeException('A lista de origens WebSocket permitidas está vazia.');
}

$webSocket = new WebSocket($pdoFactory, $loop, (string) APP_KEY);
$wsServer = new WsServer($webSocket);
$wsServer->enableKeepAlive($loop, 30);
$originGuard = new OriginCheck($wsServer, $origensPermitidas);

$socket = new SocketServer((string) WEBSOCKET_BIND, [], $loop);

new IoServer(new HttpServer($originGuard), $socket, $loop);

echo sprintf(
    "[%s] WebSocket ligado em %s; origens: %s\n",
    date('Y-m-d H:i:s'),
    WEBSOCKET_BIND,
    implode(', ', $origensPermitidas)
);

$loop->run();
