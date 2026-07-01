<?php
require_once './src/bootstrap.php';
namespace App\CMS;
    
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class WebSocket implements MessageComponentInterface {
    protected $clients;
    private $pdo;

    public function __construct($pdoFactory) {
        $this->clients = new \SplObjectStorage;
        $this->pdo = $pdoFactory;
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "Nova conexção!! - ({$conn->resourceId})";
        var_dump($this->pdo);
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);
        echo "Conexção ({$conn->resouceId}) desconectou-se";
    }

    public function onError(ConnectionInterface $conn, \Exception $e) {
        echo "Ocorreu um erro: ({$e->getMessage()})\n";
        $conn->close();
    }
}

?>