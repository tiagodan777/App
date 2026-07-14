<?php

declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

use App\CMS\WebSocket;
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use React\EventLoop\Loop;
use React\Socket\SocketServer;

$loop = Loop::get();

$pdoFactory = function () use ($cms): \PDO {
    $pdo = $cms->getDatabase();

    if (!$pdo instanceof \PDO) {
        throw new \RuntimeException(
            'getDatabase() não devolveu um PDO.'
        );
    }

    $pdo->setAttribute(
        \PDO::ATTR_ERRMODE,
        \PDO::ERRMODE_EXCEPTION
    );

    $pdo->setAttribute(
        \PDO::ATTR_DEFAULT_FETCH_MODE,
        \PDO::FETCH_ASSOC
    );

    return $pdo;
};

$webSocket = new WebSocket($pdoFactory);
$wsServer = new WsServer($webSocket);

/*
 * Mantém as ligações ativas e deteta clientes mortos.
 */
$wsServer->enableKeepAlive($loop, 30);

$socket = new SocketServer(
    '0.0.0.0:8080',
    [],
    $loop
);

new IoServer(
    new HttpServer($wsServer),
    $socket,
    $loop
);

echo sprintf(
    "[%s] WebSocket ligado em 0.0.0.0:8080\n",
    date('Y-m-d H:i:s')
);

$loop->run();