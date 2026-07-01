<?php
require_once __DIR__ . '/src/bootstrap.php';

use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use App\CMS\WebSocket;

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new WebSocket()
        )
    ),
    8080
);

echo "WebSocket ligado na porta 8080\n";

$server->run();