<?php
require_once './vendor/autoload.php';
    
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class WebSocket implements MessageComponentInterface {
    protected $clients;

    public function __construct() {
        $this->clients = new \SplObjectStorage;
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "Nova conexção!! - ({$conn->resourceId})";
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);
        echo "Conexção ({$conn->resouceId}) desconectou-se";
    }

    public function onError(ConnectionInterface $conn, Exception $e) {
        echo "Ocorreu um erro: ({$e->getMessage()})\n";
        $conn->close();
    }
}

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