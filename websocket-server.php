<?php
require_once APP_ROOT . '/vendor/autoload.php';
    
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new WebSocket()
        )
    ), 3306
);

echo "O WebSocket foi ligado na porta 3306\n";
$server->run();
?>