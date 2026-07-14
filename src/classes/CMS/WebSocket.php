<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;

class WebSocket implements MessageComponentInterface
{
    private \SplObjectStorage $clients;
    private $pdoFactory;

    /**
     * Liga cada resourceId ao membro autenticado.
     *
     * resourceId => membroId
     */
    private array $membroPorLigacao = [];

    /**
     * Guarda todas as ligações de cada membro.
     *
     * membroId => [
     *     resourceId => ConnectionInterface
     * ]
     */
    private array $ligacoesPorMembro = [];

    /**
     * Guarda uma única presença por membro.
     *
     * membroId => dados da pessoa
     */
    private array $pessoas = [];

    public function __construct(callable $pdoFactory)
    {
        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
    }

    private function getDatabase(): PDO
    {
        $factory = $this->pdoFactory;
        $database = $factory();

        if (!$database instanceof PDO) {
            throw new \RuntimeException(
                'A fábrica da base de dados não devolveu um PDO.'
            );
        }

        return $database;
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        $this->clients->attach($conn);

        echo sprintf(
            "[OPEN] Ligação %d aberta. Ligações: %d\n",
            $conn->resourceId,
            count($this->clients)
        );

        $this->enviar($conn, [
            'type' => 'connected',
            'resource_id' => $conn->resourceId
        ]);
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        try {
            $data = json_decode(
                (string) $msg,
                true,
                512,
                JSON_THROW_ON_ERROR
            );
        } catch (\JsonException) {
            $this->enviarErro(
                $from,
                'A mensagem recebida não contém JSON válido.'
            );

            return;
        }

        if (!is_array($data)) {
            $this->enviarErro(
                $from,
                'A mensagem recebida não é válida.'
            );

            return;
        }

        $type = trim((string) ($data['type'] ?? ''));

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
                    $this->autenticarPessoa($from, $data);
                    break;

                case 'move':
                    $this->moverPessoa($from, $data);
                    break;

                case 'notify':
                    $this->notificarPessoa($from, $data);
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

    private function autenticarPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId = trim((string) ($data['membro_id'] ?? ''));

        if ($membroId === '') {
            $this->enviarErro(
                $conn,
                'Não foi recebido um membro válido.'
            );

            return;
        }

        $membroAnterior = $this->membroPorLigacao[
            $conn->resourceId
        ] ?? null;

        if (
            $membroAnterior !== null &&
            $membroAnterior !== $membroId
        ) {
            $this->removerLigacaoDoMembro(
                $conn,
                $membroAnterior
            );
        }

        $membro = $this->obterMembro($membroId);

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
                    $membro['foto_perfil'] ??
                    'default.webp'
                )
            )
        );

        if ($foto === '') {
            $foto = 'default.webp';
        }

        $this->membroPorLigacao[
            $conn->resourceId
        ] = $membroId;

        if (!isset($this->ligacoesPorMembro[$membroId])) {
            $this->ligacoesPorMembro[$membroId] = [];
        }

        $this->ligacoesPorMembro[
            $membroId
        ][$conn->resourceId] = $conn;

        if (!isset($this->pessoas[$membroId])) {
            $this->pessoas[$membroId] = [
                'id' => $membroId,
                'membro_id' => $membroId,
                'nome' => trim(
                    (string) ($membro['nome'] ?? '')
                ),
                'src' => '/imagens/fotos-perfil/' . $foto,
                'top' => random_int(50, 600),
                'left' => random_int(50, 400)
            ];
        } else {
            $this->pessoas[$membroId]['nome'] = trim(
                (string) ($membro['nome'] ?? '')
            );

            $this->pessoas[$membroId]['src'] =
                '/imagens/fotos-perfil/' . $foto;
        }

        echo sprintf(
            "[AUTH] Ligação %d autenticada como %s. Pessoas únicas: %d. Ligações deste membro: %d\n",
            $conn->resourceId,
            $membroId,
            count($this->pessoas),
            count($this->ligacoesPorMembro[$membroId])
        );

        $this->enviar($conn, [
            'type' => 'authenticated',
            'membro_id' => $membroId
        ]);

        $this->broadcastEstado();
    }

    private function obterMembro(string $membroId): array|false
    {
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

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare($sql);

            $statement->execute([
                'membro_id' => $membroId
            ]);

            return $statement->fetch(PDO::FETCH_ASSOC);
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function moverPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId === null) {
            $this->enviarErro(
                $conn,
                'A ligação não está autenticada.'
            );

            return;
        }

        if (!isset($this->pessoas[$membroId])) {
            return;
        }

        $top = $this->limitarNumero(
            (int) ($data['top'] ?? 0),
            -2000,
            2000
        );

        $left = $this->limitarNumero(
            (int) ($data['left'] ?? 0),
            -2000,
            2000
        );

        if ($top === 0 && $left === 0) {
            return;
        }

        $this->pessoas[$membroId]['top'] += $top;
        $this->pessoas[$membroId]['left'] += $left;

        $this->broadcastEstado();
    }

    private function notificarPessoa(
        ConnectionInterface $from,
        array $data
    ): void {
        $remetenteId = $this->obterMembroDaLigacao($from);

        if ($remetenteId === null) {
            $this->enviarErro(
                $from,
                'Tens de estar autenticado para enviar um Hey.'
            );

            return;
        }

        $remetente = $this->pessoas[$remetenteId] ?? null;

        if (!$remetente) {
            $this->enviarErro(
                $from,
                'O remetente não está disponível.'
            );

            return;
        }

        $destinatarioId = trim(
            (string) ($data['destinatario_id'] ?? '')
        );

        if ($destinatarioId === '') {
            $this->enviarErro(
                $from,
                'O destinatário não é válido.'
            );

            return;
        }

        if ($destinatarioId === $remetenteId) {
            $this->enviarErro(
                $from,
                'Não podes enviar um Hey para ti próprio.'
            );

            return;
        }

        $ligacoesDestinatario =
            $this->ligacoesPorMembro[$destinatarioId] ?? [];

        if ($ligacoesDestinatario === []) {
            $this->enviar($from, [
                'type' => 'notification_not_delivered',
                'destinatario_id' => $destinatarioId,
                'message' =>
                    'O utilizador não está ligado neste momento.'
            ]);

            return;
        }

        $numeroEntregas = 0;

        foreach ($ligacoesDestinatario as $client) {
            $this->enviar($client, [
                'type' => 'notification',
                'notification_type' => 'hey',
                'title' => 'Recebeste um Hey!',
                'body' => sprintf(
                    '%s enviou-te um Hey.',
                    (string) $remetente['nome']
                ),
                'from_member_id' => $remetenteId,
                'from_name' => (string) $remetente['nome'],
                'from_photo' => (string) $remetente['src'],
                'created_at' => gmdate('c')
            ]);

            $numeroEntregas++;
        }

        $this->enviar($from, [
            'type' => 'notification_sent',
            'destinatario_id' => $destinatarioId,
            'deliveries' => $numeroEntregas,
            'message' => 'Hey enviado.'
        ]);

        echo sprintf(
            "[HEY] %s enviou para %s. Entregas: %d\n",
            $remetenteId,
            $destinatarioId,
            $numeroEntregas
        );
    }

    public function onClose(ConnectionInterface $conn): void
    {
        if ($this->clients->contains($conn)) {
            $this->clients->detach($conn);
        }

        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId !== null) {
            $this->removerLigacaoDoMembro(
                $conn,
                $membroId
            );
        }

        echo sprintf(
            "[CLOSE] Ligação %d fechada. Pessoas únicas: %d. Ligações: %d\n",
            $conn->resourceId,
            count($this->pessoas),
            count($this->clients)
        );

        $this->broadcastEstado();
    }

    private function removerLigacaoDoMembro(
        ConnectionInterface $conn,
        string $membroId
    ): void {
        unset(
            $this->membroPorLigacao[
                $conn->resourceId
            ]
        );

        unset(
            $this->ligacoesPorMembro[
                $membroId
            ][$conn->resourceId]
        );

        if (empty($this->ligacoesPorMembro[$membroId])) {
            unset($this->ligacoesPorMembro[$membroId]);
            unset($this->pessoas[$membroId]);
        }
    }

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

    private function broadcastEstado(): void
    {
        $mensagem = [
            'type' => 'state',
            'people' => array_values($this->pessoas)
        ];

        echo sprintf(
            "[STATE] %d pessoa(s) única(s) para %d ligação(ões)\n",
            count($this->pessoas),
            count($this->clients)
        );

        foreach ($this->clients as $client) {
            $this->enviar($client, $mensagem);
        }
    }

    private function obterMembroDaLigacao(
        ConnectionInterface $conn
    ): ?string {
        return $this->membroPorLigacao[
            $conn->resourceId
        ] ?? null;
    }

    private function enviarErro(
        ConnectionInterface $conn,
        string $mensagem
    ): void {
        $this->enviar($conn, [
            'type' => 'error',
            'message' => $mensagem
        ]);
    }

    private function enviar(
        ConnectionInterface $conn,
        array $data
    ): void {
        try {
            $conn->send(
                json_encode(
                    $data,
                    JSON_UNESCAPED_UNICODE |
                    JSON_UNESCAPED_SLASHES |
                    JSON_THROW_ON_ERROR
                )
            );
        } catch (\Throwable $erro) {
            echo sprintf(
                "[SEND ERROR] Ligação %d: %s\n",
                $conn->resourceId,
                $erro->getMessage()
            );
        }
    }

    private function limitarNumero(
        int $numero,
        int $minimo,
        int $maximo
    ): int {
        return max(
            $minimo,
            min($maximo, $numero)
        );
    }
}