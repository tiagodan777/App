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

    public function __construct($pdoFactory)
    {
        $this->clients = new \SplObjectStorage;
        $this->pdo = $pdoFactory();
    }

    public function onOpen(ConnectionInterface $conn)
    {
        $this->clients->attach($conn);

        echo "Nova conexão ({$conn->resourceId})\n";
    }

   public function onMessage(ConnectionInterface $from, $msg)
    {
        $data = json_decode($msg, true);

        echo "MENSAGEM RECEBIDA:\n";
        var_dump($data);

        if (!is_array($data) || !isset($data['type'])) {
            return;
        }

        if ($data['type'] === 'auth') {
            $membro_id = $data['membro_id'] ?? '';

            if ($membro_id === '') {
                return;
            }

            $sql = "SELECT
                        COALESCE(f.nome_arquivo, 'default.webp') AS foto_perfil
                    FROM membros AS m
                    LEFT JOIN fotos_perfil AS f
                        ON f.membro_id = m.id
                        AND f.ordem = 1
                    WHERE m.id = :membro_id
                    LIMIT 1";

            $foto = $this->pdo->runSQL($sql, [
                'membro_id' => $membro_id
            ])->fetchColumn();

            if (!$foto) {
                $foto = 'default.webp';
            }

            $this->pessoas[$from->resourceId] = [
                'id' => $from->resourceId,
                'src' => '/imagens/fotos-perfil/' . $foto,
                'top' => random_int(50, 600),
                'left' => random_int(50, 400),
            ];

            $this->broadcastNewState(array_values($this->pessoas));

            return;
        }

        if ($data['type'] === 'move') {
            if (!isset($this->pessoas[$from->resourceId])) {
                return;
            }

            $top = (int) ($data['top'] ?? 0);
            $left = (int) ($data['left'] ?? 0);

            $this->pessoas[$from->resourceId]['top'] += $top;
            $this->pessoas[$from->resourceId]['left'] += $left;

            $this->broadcastNewState(array_values($this->pessoas));
        }
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);

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