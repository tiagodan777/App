<?php
namespace App\CMS;

require_once './src/bootstrap.php';
    
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
        echo "Nova conexção!! - ({$conn->resourceId})\n";
        // var_dump($this->pdo);
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);
        
        if ($data['type'] === 'move') {
            
        }

        $this->broadcastNewState($data);
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);
        echo "Conexção ({$conn->resouceId}) desconectou-se";
    }

    public function onError(ConnectionInterface $conn, \Exception $e) {
        echo "Ocorreu um erro: ({$e->getMessage()})\n";
        $conn->close();
    }

    private function broadcastNewState($data) {
        foreach ($this->clients as $client) {
            $this->sendNewState($client, $data);
        }
    }

    private function sendNewState(ConnectionInterface $conn, $data) {
        $conn->send(json_encode($data));
    }
}

?>