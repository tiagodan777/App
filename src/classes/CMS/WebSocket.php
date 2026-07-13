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

        /*
         * Não abrimos uma ligação permanente aqui.
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

        echo "Nova conexão ({$conn->resourceId})\n";
    }

    public function onMessage(
        ConnectionInterface $from,
        $msg
    ): void {
        $data = json_decode((string) $msg, true);

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
                    $this->autenticarPessoa($from, $data);
                    break;

                case 'move':
                    $this->moverPessoa($from, $data);
                    break;
            }
        } catch (\Throwable $erro) {
            echo sprintf(
                "Erro ao processar mensagem da conexão %d: %s\n",
                $from->resourceId,
                $erro->getMessage()
            );

            /*
             * Um erro SQL não deve necessariamente expulsar
             * imediatamente o utilizador do WebSocket.
             */
            $from->send(json_encode([
                'type' => 'error',
                'message' => 'Não foi possível processar o pedido.'
            ]));
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
            return;
        }

        $sql = "
            SELECT
                m.id AS membro_id, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,

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

        /*
         * Ligação nova para esta consulta.
         */
        $db = $this->getDatabase();

        $membro = $db
            ->runSQL($sql, [
                'membro_id' => $membroId
            ])
            ->fetch();

        /*
         * Liberta a referência à ligação depois da consulta.
         */
        unset($db);

        if (!$membro) {
            echo "Membro não encontrado: {$membroId}\n";
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
            'membro_id' => $membroId,
            'src' => '/imagens/fotos-perfil/' . $foto,
            'top' => random_int(50, 600),
            'left' => random_int(50, 400)
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
                $this->pessoas[$conn->resourceId]
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

    public function onClose(
        ConnectionInterface $conn
    ): void {
        $this->clients->detach($conn);

        unset(
            $this->pessoas[$conn->resourceId]
        );

        echo "Conexão ({$conn->resourceId}) desconectou-se\n";

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
            $this->sendNewState(
                $client,
                $estado
            );
        }
    }

    private function sendNewState(
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