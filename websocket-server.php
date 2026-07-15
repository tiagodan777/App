<?php

declare(strict_types=1);

use App\CMS\WebSocket;
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use React\EventLoop\Loop;
use React\Socket\SocketServer;

define('APP_ROOT', __DIR__);

require_once APP_ROOT . '/config/config.php';

require_once APP_ROOT . '/vendor/autoload.php';

$loop = Loop::get();

$pdoFactory = static function () use ($dsn, $username, $password): PDO {
    return new PDO($dsn, $username, $password,[
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,

                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,

                PDO::ATTR_EMULATE_PREPARES => false
            ]
        );
    };

$webSocket = new WebSocket($pdoFactory);

$wsServer = new WsServer($webSocket);

$wsServer->enableKeepAlive($loop, 30);

$socket = new SocketServer('0.0.0.0:8080',[], $loop);

new IoServer(
    new HttpServer(
        $wsServer
    ),
    $socket,
    $loop
);

echo sprintf(
    "[%s] WebSocket ligado em 0.0.0.0:8080\n",
    date('Y-m-d H:i:s')
);

$loop->run();