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
        
        $nova_pessoa = [
            'src' => '{{ doc_root }}imagens/fotos-perfil/tiago.webp',
            'top' => random_int(50, 600),
            'left' => random_int(50, 400),
        ];

        $this->pessoas[] = $nova_pessoa;
        var_dump($this->pessoas);
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);

        echo "ENVIAR\n";
        var_dump($data);

        if ($data[0]['type'] === 'move') {
            $top = $data[0]['top'] ?? null;
            $left = $data[0]['left'] ?? null;

            echo "TOP: $top || LEFT: $left\n";

            $data[1]['pessoas'][0]['top'] += $top;
            $data[1]['pessoas'][0]['left'] += $left;

            echo "NEW TOTAL TOP: ";
            var_dump($data[1]['pessoas'][0]['top']);
            echo "\nNEW TOTAL LEFT: ";
            var_dump($data[1]['pessoas'][0]['left']);
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