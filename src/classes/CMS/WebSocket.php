<?php

namespace App\CMS;

require_once './src/bootstrap.php';

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class WebSocket implements MessageComponentInterface
{
    protected \SplObjectStorage $clients;

    private $pdoFactory;

    /**
     * Ligações WebSocket autenticadas.
     *
     * Estrutura:
     *
     * [
     *     resourceId => [
     *         'id' => resourceId,
     *         'membro_id' => UUID do membro,
     *         'nome' => nome,
     *         'src' => foto,
     *         'top' => posição,
     *         'left' => posição
     *     ]
     * ]
     */
    private array $pessoas = [];

    public function __construct(callable $pdoFactory)
    {
        $this->clients = new \SplObjectStorage();

        /*
         * Não mantemos uma ligação permanente à base de dados.
         * Guardamos apenas a função que cria ligações novas.
         */
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

        echo sprintf(
            "Nova conexão (%d)\n",
            $conn->resourceId
        );
    }

    public function onMessage(
        ConnectionInterface $from,
        $msg
    ): void {
        $data = json_decode(
            (string) $msg,
            true
        );

        echo "MENSAGEM RECEBIDA:\n";
        var_dump($data);

        if (
            !is_array($data) ||
            !isset($data['type'])
        ) {
            return;
        }

        try {
            switch ($data['type']) {
                case 'auth':
                    $this->autenticarPessoa(
                        $from,
                        $data
                    );
                    break;

                case 'move':
                    $this->moverPessoa(
                        $from,
                        $data
                    );
                    break;

                case 'notify':
                    $this->notificarPessoa(
                        $from,
                        $data
                    );
                    break;

                default:
                    echo sprintf(
                        "Tipo de mensagem desconhecido: %s\n",
                        (string) $data['type']
                    );
                    break;
            }
        } catch (\Throwable $erro) {
            echo sprintf(
                "Erro ao processar mensagem da conexão %d: %s\n",
                $from->resourceId,
                $erro->getMessage()
            );

            $this->enviarMensagem(
                $from,
                [
                    'type' => 'error',
                    'message' =>
                        'Não foi possível processar o pedido.'
                ]
            );
        }
    }

    private function autenticarPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId = trim(
            (string) ($data['membro_id'] ?? '')
        );

        if ($membroId === '') {
            echo "Autenticação sem membro_id.\n";

            $this->enviarMensagem(
                $conn,
                [
                    'type' => 'error',
                    'message' =>
                        'Não foi possível autenticar o utilizador.'
                ]
            );

            return;
        }

        $sql = "
            SELECT
                m.id AS membro_id,

                CONCAT(
                    m.primeiro_nome,
                    ' ',
                    m.ultimo_nome
                ) AS nome,

                COALESCE(
                    (
                        SELECT fp.nome_arquivo

                        FROM fotos_perfil AS fp

                        WHERE fp.membro_id = m.id

                        AND (
                            fp.status = 'completo'
                            OR fp.status IS NULL
                        )

                        ORDER BY
                            fp.ordem IS NULL ASC,
                            fp.ordem ASC

                        LIMIT 1
                    ),

                    'default.webp'
                ) AS foto_perfil

            FROM membros AS m

            WHERE m.id = :membro_id

            LIMIT 1
        ";

        $db = $this->getDatabase();

        $membro = $db
            ->runSQL(
                $sql,
                [
                    'membro_id' => $membroId
                ]
            )
            ->fetch();

        unset($db);

        if (!$membro) {
            echo "Membro não encontrado: {$membroId}\n";

            $this->enviarMensagem(
                $conn,
                [
                    'type' => 'error',
                    'message' =>
                        'O utilizador não foi encontrado.'
                ]
            );

            return;
        }

        $foto = basename(
            (string) (
                $membro['foto_perfil']
                ?? 'default.webp'
            )
        );

        if ($foto === '') {
            $foto = 'default.webp';
        }

        $this->pessoas[$conn->resourceId] = [
            'id' => $conn->resourceId,

            'membro_id' =>
                (string) $membro['membro_id'],

            'nome' =>
                (string) ($membro['nome'] ?? ''),

            'src' =>
                '/imagens/fotos-perfil/' . $foto,

            'top' =>
                random_int(50, 600),

            'left' =>
                random_int(50, 400)
        ];

        echo sprintf(
            "Ligação %d autenticada como %s com foto %s\n",
            $conn->resourceId,
            $membroId,
            $foto
        );

        $this->broadcastNewState();
    }

    private function moverPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        if (
            !isset(
                $this->pessoas[
                    $conn->resourceId
                ]
            )
        ) {
            return;
        }

        $top = (int) ($data['top'] ?? 0);
        $left = (int) ($data['left'] ?? 0);

        $this->pessoas[
            $conn->resourceId
        ]['top'] += $top;

        $this->pessoas[
            $conn->resourceId
        ]['left'] += $left;

        $this->broadcastNewState();
    }

    private function notificarPessoa(
        ConnectionInterface $from,
        array $data
    ): void {
        /*
         * Nunca confiamos num membro_id do remetente enviado
         * pelo JavaScript.
         *
         * O remetente é obtido através da ligação WebSocket
         * que já foi autenticada.
         */
        $remetente = $this->pessoas[
            $from->resourceId
        ] ?? null;

        if (!$remetente) {
            $this->enviarMensagem(
                $from,
                [
                    'type' => 'error',
                    'message' =>
                        'Tens de estar autenticado para enviar um Hey.'
                ]
            );

            return;
        }

        $destinatarioId = trim(
            (string) (
                $data['destinatario_id']
                ?? ''
            )
        );

        if ($destinatarioId === '') {
            $this->enviarMensagem(
                $from,
                [
                    'type' => 'error',
                    'message' =>
                        'O destinatário não é válido.'
                ]
            );

            return;
        }

        if (
            $destinatarioId ===
            (string) $remetente['membro_id']
        ) {
            $this->enviarMensagem(
                $from,
                [
                    'type' => 'error',
                    'message' =>
                        'Não podes enviar um Hey para ti próprio.'
                ]
            );

            return;
        }

        $entregue = false;

        /*
         * Um membro pode ter mais do que uma ligação:
         * por exemplo, telemóvel e computador.
         *
         * Nesse caso, recebe em todas as ligações abertas.
         */
        foreach ($this->clients as $client) {
            $destinatario = $this->pessoas[
                $client->resourceId
            ] ?? null;

            if (!$destinatario) {
                continue;
            }

            if (
                (string) $destinatario['membro_id']
                !== $destinatarioId
            ) {
                continue;
            }

            $this->enviarMensagem(
                $client,
                [
                    'type' => 'notification',

                    'notification_type' => 'hey',

                    'title' =>
                        'Recebeste um Hey!',

                    'body' => sprintf(
                        '%s enviou-te um Hey.',
                        (string) $remetente['nome']
                    ),

                    'from_member_id' =>
                        (string) $remetente['membro_id'],

                    'from_name' =>
                        (string) $remetente['nome'],

                    'from_photo' =>
                        (string) $remetente['src']
                ]
            );

            $entregue = true;
        }

        if ($entregue) {
            echo sprintf(
                "Hey enviado por %s para %s\n",
                (string) $remetente['membro_id'],
                $destinatarioId
            );

            $this->enviarMensagem(
                $from,
                [
                    'type' => 'notification_sent',
                    'destinatario_id' =>
                        $destinatarioId,

                    'message' =>
                        'Hey enviado.'
                ]
            );

            return;
        }

        /*
         * Nesta fase ainda não temos push notifications.
         * Portanto, se não houver ligação WebSocket ativa,
         * a notificação não pode ser entregue.
         */
        $this->enviarMensagem(
            $from,
            [
                'type' => 'notification_not_delivered',

                'destinatario_id' =>
                    $destinatarioId,

                'message' =>
                    'Este utilizador não está online.'
            ]
        );
    }

    public function onClose(
        ConnectionInterface $conn
    ): void {
        if ($this->clients->contains($conn)) {
            $this->clients->detach($conn);
        }

        unset(
            $this->pessoas[
                $conn->resourceId
            ]
        );

        echo sprintf(
            "Conexão (%d) desconectou-se\n",
            $conn->resourceId
        );

        $this->broadcastNewState();
    }

    public function onError(
        ConnectionInterface $conn,
        \Exception $e
    ): void {
        echo sprintf(
            "Ocorreu um erro na conexão %d: %s\n",
            $conn->resourceId,
            $e->getMessage()
        );

        $conn->close();
    }

    private function broadcastNewState(): void
    {
        $estado = array_values(
            $this->pessoas
        );

        foreach ($this->clients as $client) {
            $this->enviarMensagem(
                $client,
                $estado
            );
        }
    }

    private function enviarMensagem(
        ConnectionInterface $conn,
        array $data
    ): void {
        $conn->send(
            json_encode(
                $data,
                JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES
            )
        );
    }
}