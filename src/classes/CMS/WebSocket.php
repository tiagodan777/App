<?php

namespace App\CMS;

require_once './src/bootstrap.php';

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class WebSocket implements MessageComponentInterface
{
    protected \SplObjectStorage $clients;

    private $pdo;

    private array $pessoas = [];

    public function __construct(
        $pdoFactory
    ) {
        $this->clients =
            new \SplObjectStorage();

        $this->pdo =
            $pdoFactory();
    }

    public function onOpen(
        ConnectionInterface $conn
    ): void {
        $this->clients->attach(
            $conn
        );

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
        }
    }

    private function autenticarPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId = trim(
            (string) (
                $data['membro_id']
                ?? ''
            )
        );

        if ($membroId === '') {
            echo "Autenticação sem membro_id.\n";

            return;
        }

        /*
         * A fotografia principal é a de menor ordem.
         *
         * Como as ordens começam normalmente em 0,
         * não usamos f.ordem = 1.
         *
         * A subconsulta funciona também caso a ordem
         * esteja NULL.
         */
        $sql = "
            SELECT
                m.id AS membro_id,

                COALESCE(
                    (
                        SELECT
                            fp.nome_arquivo

                        FROM fotos_perfil AS fp

                        WHERE
                            fp.membro_id = m.id

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

        $membro = $this->pdo
            ->runSQL(
                $sql,
                [
                    'membro_id' =>
                        $membroId
                ]
            )
            ->fetch();

        if (!$membro) {
            echo sprintf(
                "Membro não encontrado: %s\n",
                $membroId
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

        $this->pessoas[
            $conn->resourceId
        ] = [
            /*
             * id identifica a ligação WebSocket.
             * membro_id identifica o utilizador real.
             */
            'id' =>
                $conn->resourceId,

            'membro_id' =>
                $membroId,

            'src' =>
                '/imagens/fotos-perfil/' .
                $foto,

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

        $top = (int) (
            $data['top']
            ?? 0
        );

        $left = (int) (
            $data['left']
            ?? 0
        );

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
        $this->clients->detach(
            $conn
        );

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
            "Erro na conexão %d: %s\n",
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

        foreach (
            $this->clients
            as $client
        ) {
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