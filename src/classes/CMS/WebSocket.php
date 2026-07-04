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
    private $pessoas;

    public function __construct($pdoFactory) {
        $this->clients = new \SplObjectStorage;
        $this->pdo = $pdoFactory;
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "Nova conexção!! - ({$conn->resourceId})\n";
        
        $this->pessoas[$conn->resourceId] = [
            'id' => $conn->resourceId,
            'src' => '/imagens/fotos-perfil/tiago.webp',
            'top' => random_int(50, 600),
            'left' => random_int(50, 400),
        ];
        var_dump($this->pessoas);
        $this->broadcastNewState(array_values($this->pessoas));
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);

        var_dump($data);

        if ($data['type'] === 'move') {
            $top = $data['top'] ?? 0;
            $left = $data['left'] ?? 0;

            $this->pessoas[$from->resourceId]['top'] += $top;
            $this->pessoas[$from->resourceId]['left'] += $left;

            $this->broadcastNewState(array_values($this->pessoas));
        }
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);

        $conn->send(json_encode($this->pessoas[$conn->resourceId]));

        unset($this->pessoas[$conn->resourceId]);

        echo "Conexão ({$conn->resourceId}) desconectou-se\n";

        $this->broadcastNewState(array_values($this->pessoas));
    }

    public function onError(ConnectionInterface $conn, \Exception $e) {
        echo "Ocorreu um erro: ({$e->getMessage()})\n";
        $conn->close();
    }

    private function broadcastNewState($pessoas) {
        foreach ($this->clients as $client) {
            $this->sendNewState($client, $pessoas);
        }
    }

    private function sendNewState(ConnectionInterface $conn, $data) {
        $conn->send(json_encode($data));
    }
}

?>