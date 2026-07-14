<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;

class WebSocket implements MessageComponentInterface
{
    /**
     * Todas as ligações WebSocket abertas.
     */
    protected \SplObjectStorage $clients;

    /**
     * Função que cria uma nova ligação PDO.
     */
    private $pdoFactory;

    /**
     * Pessoas autenticadas por resourceId.
     *
     * Exemplo:
     *
     * [
     *     123 => [
     *         'id' => 123,
     *         'membro_id' => 'uuid',
     *         'nome' => 'Tiago Daniel',
     *         'src' => '/imagens/fotos-perfil/foto.webp',
     *         'top' => 200,
     *         'left' => 300
     *     ]
     * ]
     */
    private array $pessoas = [];

    public function __construct(callable $pdoFactory)
    {
        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
    }

    /**
     * Cria uma nova ligação à base de dados.
     */
    private function getDatabase(): PDO
    {
        $factory = $this->pdoFactory;

        return $factory();
    }

    /**
     * Nova ligação WebSocket.
     */
    public function onOpen(
        ConnectionInterface $conn
    ): void {
        $this->clients->attach($conn);

        echo sprintf(
            "[OPEN] Ligação %d aberta\n",
            $conn->resourceId
        );

        $this->enviar($conn, [
            'type' => 'connected',
            'resource_id' => $conn->resourceId
        ]);
    }

    /**
     * Receção de uma mensagem WebSocket.
     */
    public function onMessage(
        ConnectionInterface $from,
        $msg
    ): void {
        $data = json_decode(
            (string) $msg,
            true
        );

        if (!is_array($data)) {
            $this->enviarErro(
                $from,
                'A mensagem recebida não é válida.'
            );

            return;
        }

        $type = trim(
            (string) ($data['type'] ?? '')
        );

        if ($type === '') {
            $this->enviarErro(
                $from,
                'A mensagem não contém um tipo.'
            );

            return;
        }

        try {
            switch ($type) {
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

                case 'ping':
                    $this->enviar($from, [
                        'type' => 'pong',
                        'timestamp' => time()
                    ]);
                    break;

                default:
                    $this->enviarErro(
                        $from,
                        'Tipo de mensagem desconhecido.'
                    );
                    break;
            }
        } catch (\Throwable $erro) {
            echo sprintf(
                "[ERROR] Ligação %d: %s\n",
                $from->resourceId,
                $erro->getMessage()
            );

            $this->enviarErro(
                $from,
                'Não foi possível processar o pedido.'
            );
        }
    }

    /**
     * Autentica uma ligação através do membro_id.
     */
    private function autenticarPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId = trim(
            (string) ($data['membro_id'] ?? '')
        );

        if ($membroId === '') {
            $this->enviarErro(
                $conn,
                'Não foi recebido um membro válido.'
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
                        SELECT
                            fp.nome_arquivo

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

        $db = null;
        $stmt = null;

        try {
            $db = $this->getDatabase();

            $stmt = $db->prepare($sql);

            $stmt->execute([
                'membro_id' => $membroId
            ]);

            $membro = $stmt->fetch(
                PDO::FETCH_ASSOC
            );
        } finally {
            $stmt = null;
            $db = null;
        }

        if (!$membro) {
            echo sprintf(
                "[AUTH ERROR] Membro não encontrado: %s\n",
                $membroId
            );

            $this->enviarErro(
                $conn,
                'O membro não foi encontrado.'
            );

            return;
        }

        $foto = basename(
            trim(
                (string) (
                    $membro['foto_perfil']
                    ?? 'default.webp'
                )
            )
        );

        if ($foto === '') {
            $foto = 'default.webp';
        }

        /*
         * Preserva a posição caso a mesma ligação
         * seja autenticada novamente.
         */
        $pessoaAnterior =
            $this->pessoas[
                $conn->resourceId
            ] ?? null;

        $this->pessoas[
            $conn->resourceId
        ] = [
            'id' =>
                $conn->resourceId,

            'membro_id' =>
                (string) $membro['membro_id'],

            'nome' =>
                trim(
                    (string) (
                        $membro['nome']
                        ?? ''
                    )
                ),

            'src' =>
                '/imagens/fotos-perfil/' .
                $foto,

            'top' =>
                $pessoaAnterior['top']
                ?? random_int(50, 600),

            'left' =>
                $pessoaAnterior['left']
                ?? random_int(50, 400)
        ];

        echo sprintf(
            "[AUTH] Ligação %d autenticada como %s. Pessoas online: %d\n",
            $conn->resourceId,
            $membroId,
            count($this->pessoas)
        );

        $this->enviar($conn, [
            'type' => 'authenticated',
            'membro_id' => $membroId
        ]);

        /*
         * Envia a lista completa para todos.
         */
        $this->broadcastEstado();
    }

    /**
     * Atualiza a posição de uma pessoa.
     */
    private function moverPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        if (!$this->estaAutenticado($conn)) {
            $this->enviarErro(
                $conn,
                'A ligação não está autenticada.'
            );

            return;
        }

        $top = $this->limitarNumero(
            (int) ($data['top'] ?? 0),
            -500,
            500
        );

        $left = $this->limitarNumero(
            (int) ($data['left'] ?? 0),
            -500,
            500
        );

        $this->pessoas[
            $conn->resourceId
        ]['top'] += $top;

        $this->pessoas[
            $conn->resourceId
        ]['left'] += $left;

        $this->broadcastEstado();
    }

    /**
     * Envia um Hey para um membro específico.
     */
    private function notificarPessoa(
        ConnectionInterface $from,
        array $data
    ): void {
        if (!$this->estaAutenticado($from)) {
            $this->enviarErro(
                $from,
                'Tens de estar autenticado para enviar um Hey.'
            );

            return;
        }

        $remetente =
            $this->pessoas[
                $from->resourceId
            ];

        $destinatarioId = trim(
            (string) (
                $data['destinatario_id']
                ?? ''
            )
        );

        if ($destinatarioId === '') {
            $this->enviarErro(
                $from,
                'O destinatário não é válido.'
            );

            return;
        }

        if (
            $destinatarioId ===
            (string) $remetente['membro_id']
        ) {
            $this->enviarErro(
                $from,
                'Não podes enviar um Hey para ti próprio.'
            );

            return;
        }

        $numeroEntregas = 0;

        foreach ($this->clients as $client) {
            $destinatario =
                $this->pessoas[
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

            $this->enviar($client, [
                'type' =>
                    'notification',

                'notification_type' =>
                    'hey',

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
                    (string) $remetente['src'],

                'created_at' =>
                    gmdate('c')
            ]);

            $numeroEntregas++;
        }

        if ($numeroEntregas === 0) {
            $this->enviar($from, [
                'type' =>
                    'notification_not_delivered',

                'destinatario_id' =>
                    $destinatarioId,

                'message' =>
                    'O utilizador não está ligado neste momento.'
            ]);

            return;
        }

        $this->enviar($from, [
            'type' =>
                'notification_sent',

            'destinatario_id' =>
                $destinatarioId,

            'deliveries' =>
                $numeroEntregas,

            'message' =>
                'Hey enviado.'
        ]);

        echo sprintf(
            "[HEY] %s enviou um Hey para %s. Entregas: %d\n",
            (string) $remetente['membro_id'],
            $destinatarioId,
            $numeroEntregas
        );
    }

    /**
     * Ligação terminada.
     */
    public function onClose(
        ConnectionInterface $conn
    ): void {
        if (
            $this->clients->contains($conn)
        ) {
            $this->clients->detach($conn);
        }

        $estavaAutenticado = isset(
            $this->pessoas[
                $conn->resourceId
            ]
        );

        unset(
            $this->pessoas[
                $conn->resourceId
            ]
        );

        echo sprintf(
            "[CLOSE] Ligação %d fechada. Pessoas online: %d\n",
            $conn->resourceId,
            count($this->pessoas)
        );

        if ($estavaAutenticado) {
            $this->broadcastEstado();
        }
    }

    /**
     * Erro numa ligação.
     */
    public function onError(
        ConnectionInterface $conn,
        \Exception $e
    ): void {
        echo sprintf(
            "[CONNECTION ERROR] Ligação %d: %s\n",
            $conn->resourceId,
            $e->getMessage()
        );

        $conn->close();
    }

    /**
     * Envia a lista completa de pessoas para todos os clientes.
     */
    private function broadcastEstado(): void
    {
        $pessoas = array_values(
            $this->pessoas
        );

        $mensagem = [
            'type' => 'state',
            'people' => $pessoas
        ];

        echo sprintf(
            "[STATE] A enviar %d pessoa(s) para %d ligação(ões)\n",
            count($pessoas),
            count($this->clients)
        );

        foreach ($this->clients as $client) {
            $this->enviar(
                $client,
                $mensagem
            );
        }
    }

    /**
     * Verifica se uma ligação está autenticada.
     */
    private function estaAutenticado(
        ConnectionInterface $conn
    ): bool {
        return isset(
            $this->pessoas[
                $conn->resourceId
            ]
        );
    }

    /**
     * Envia uma mensagem de erro.
     */
    private function enviarErro(
        ConnectionInterface $conn,
        string $mensagem
    ): void {
        $this->enviar($conn, [
            'type' => 'error',
            'message' => $mensagem
        ]);
    }

    /**
     * Envia JSON para uma ligação.
     */
    private function enviar(
        ConnectionInterface $conn,
        array $data
    ): void {
        try {
            $json = json_encode(
                $data,
                JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_THROW_ON_ERROR
            );

            $conn->send($json);
        } catch (\Throwable $erro) {
            echo sprintf(
                "[SEND ERROR] Ligação %d: %s\n",
                $conn->resourceId,
                $erro->getMessage()
            );
        }
    }

    /**
     * Limita um número entre um mínimo e um máximo.
     */
    private function limitarNumero(
        int $numero,
        int $minimo,
        int $maximo
    ): int {
        return max(
            $minimo,
            min(
                $maximo,
                $numero
            )
        );
    }
}