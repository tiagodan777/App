<?php

namespace App\CMS;

require_once './src/bootstrap.php';

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class WebSocket implements MessageComponentInterface
{
    protected \SplObjectStorage $clients;
    private $pdoFactory;
    private array $pessoas = [];

    public function __construct(callable $pdoFactory)
    {
        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
    }

    private function getDatabase()
    {
        $factory = $this->pdoFactory;
        return $factory();
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        $this->clients->attach($conn);
        echo sprintf("Nova conexão (%d)\n", $conn->resourceId);
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        $data = json_decode((string) $msg, true);

        // Ignorar o log de PING para não sujar o ecrã do terminal
        if (isset($data['type']) && $data['type'] !== 'ping') {
            echo "MENSAGEM RECEBIDA:\n";
            var_dump($data);
        }

        if (!is_array($data) || !isset($data['type'])) {
            return;
        }

        try {
            switch ($data['type']) {
                case 'ping':
                    // Apenas serve para impedir que a ligação caia por inatividade
                    break;
                case 'auth':
                    $this->autenticarPessoa($from, $data);
                    break;
                case 'move':
                    $this->moverPessoa($from, $data);
                    break;
                case 'location':
                    $this->atualizarLocalizacao($from, $data);
                    break;
                case 'notify':
                    $this->notificarPessoa($from, $data);
                    break;
                default:
                    echo sprintf("Tipo de mensagem desconhecido: %s\n", (string) $data['type']);
                    break;
            }
        } catch (\Throwable $erro) {
            echo sprintf("Erro ao processar mensagem da conexão %d: %s\n", $from->resourceId, $erro->getMessage());
            $this->enviarMensagem($from, [
                'type' => 'error',
                'message' => 'Não foi possível processar o pedido.'
            ]);
        }
    }

    private function autenticarPessoa(ConnectionInterface $conn, array $data): void
    {
        $membroId = trim((string) ($data['membro_id'] ?? ''));

        if ($membroId === '') {
            $this->enviarMensagem($conn, ['type' => 'error', 'message' => 'Não foi possível autenticar o utilizador.']);
            return;
        }

        $sql = "
            SELECT m.id AS membro_id, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                COALESCE((SELECT fp.nome_arquivo FROM fotos_perfil AS fp WHERE fp.membro_id = m.id AND (fp.status = 'completo' OR fp.status IS NULL) ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC LIMIT 1), 'default.webp') AS foto_perfil
            FROM membros AS m
            WHERE m.id = :membro_id LIMIT 1
        ";

        $db = $this->getDatabase();
        $membro = $db->runSQL($sql, ['membro_id' => $membroId])->fetch();
        unset($db);

        if (!$membro) {
            $this->enviarMensagem($conn, ['type' => 'error', 'message' => 'O utilizador não foi encontrado.']);
            return;
        }

        $foto = basename((string) ($membro['foto_perfil'] ?? 'default.webp'));
        if ($foto === '') $foto = 'default.webp';

        $this->pessoas[$conn->resourceId] = [
            'id' => $conn->resourceId,
            'membro_id' => (string) $membro['membro_id'],
            'nome' => (string) ($membro['nome'] ?? ''),
            'src' => '/imagens/fotos-perfil/' . $foto,
            'top' => random_int(50, 600), // Mantido para renderização UI original
            'left' => random_int(50, 400), 
            'lat' => null,
            'lng' => null
        ];

        $this->broadcastNewState();
    }

    private function moverPessoa(ConnectionInterface $conn, array $data): void
    {
        if (!isset($this->pessoas[$conn->resourceId])) return;

        $top = (int) ($data['top'] ?? 0);
        $left = (int) ($data['left'] ?? 0);

        $this->pessoas[$conn->resourceId]['top'] += $top;
        $this->pessoas[$conn->resourceId]['left'] += $left;

        $this->broadcastNewState();
    }

    private function atualizarLocalizacao(ConnectionInterface $conn, array $data): void 
    {
        if (!isset($this->pessoas[$conn->resourceId])) return;

        $this->pessoas[$conn->resourceId]['lat'] = (float) ($data['lat'] ?? 0);
        $this->pessoas[$conn->resourceId]['lng'] = (float) ($data['lng'] ?? 0);

        $this->broadcastNewState();
    }

    private function calcularDistancia(float $lat1, float $lon1, float $lat2, float $lon2): float 
    {
        // Fórmula de Haversine em Metros
        $earth_radius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat/2) * sin($dLat/2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon/2) * sin($dLon/2);
        $c = 2 * asin(sqrt($a));
        return $earth_radius * $c;
    }

    private function notificarPessoa(ConnectionInterface $from, array $data): void
    {
        $remetente = $this->pessoas[$from->resourceId] ?? null;

        if (!$remetente) {
            $this->enviarMensagem($from, ['type' => 'error', 'message' => 'Tens de estar autenticado para enviar um Hey.']);
            return;
        }

        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));

        if ($destinatarioId === '') {
            $this->enviarMensagem($from, ['type' => 'error', 'message' => 'O destinatário não é válido.']);
            return;
        }

        if ($destinatarioId === (string) $remetente['membro_id']) {
            $this->enviarMensagem($from, ['type' => 'error', 'message' => 'Não podes enviar um Hey para ti próprio.']);
            return;
        }

        $entregue = false;

        foreach ($this->clients as $client) {
            $destinatario = $this->pessoas[$client->resourceId] ?? null;
            if (!$destinatario) continue;
            if ((string) $destinatario['membro_id'] !== $destinatarioId) continue;

            $this->enviarMensagem($client, [
                'type' => 'notification',
                'notification_type' => 'hey',
                'title' => 'Recebeste um Hey!',
                'body' => sprintf('%s enviou-te um Hey.', (string) $remetente['nome']),
                'from_member_id' => (string) $remetente['membro_id'],
                'from_name' => (string) $remetente['nome'],
                'from_photo' => (string) $remetente['src']
            ]);
            $entregue = true;
        }

        if ($entregue) {
            $this->enviarMensagem($from, ['type' => 'notification_sent', 'destinatario_id' => $destinatarioId, 'message' => 'Hey enviado.']);
            return;
        }

        $this->enviarMensagem($from, ['type' => 'notification_not_delivered', 'destinatario_id' => $destinatarioId, 'message' => 'Este utilizador não está online.']);
    }

    public function onClose(ConnectionInterface $conn): void
    {
        if ($this->clients->contains($conn)) $this->clients->detach($conn);
        unset($this->pessoas[$conn->resourceId]);
        $this->broadcastNewState();
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void
    {
        $conn->close();
    }

    private function broadcastNewState(): void
    {
        foreach ($this->clients as $client) {
            $estadoCliente = [];
            $clienteAtual = $this->pessoas[$client->resourceId] ?? null;

            if (!$clienteAtual) {
                continue;
            }

            foreach ($this->pessoas as $pessoa) {
                // Manter o utilizador a ele próprio no array
                if ($pessoa['id'] === $clienteAtual['id']) {
                    $estadoCliente[] = $pessoa;
                    continue;
                }

                $lat1 = $clienteAtual['lat'] ?? null;
                $lng1 = $clienteAtual['lng'] ?? null;
                $lat2 = $pessoa['lat'] ?? null;
                $lng2 = $pessoa['lng'] ?? null;

                // Se ambos tiverem sinal de GPS, testa o Raio de 100m. 
                if ($lat1 !== null && $lat2 !== null) {
                    $distancia = $this->calcularDistancia($lat1, $lng1, $lat2, $lng2);
                    if ($distancia <= 100) {
                        $estadoCliente[] = $pessoa;
                    }
                }
            }

            $this->enviarMensagem($client, $estadoCliente);
        }
    }

    private function enviarMensagem(ConnectionInterface $conn, array $data): void
    {
        $conn->send(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}