<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
use React\EventLoop\LoopInterface;
use React\EventLoop\TimerInterface;

final class AuthenticatedWebSocket implements MessageComponentInterface
{
    private const AUTENTICACAO_MAXIMA_ESPERA_SEGUNDOS = 8.0;
    private const MENSAGEM_MAXIMA_BYTES = 65536;
    private const INTERVALO_HEY_SEGUNDOS = 300;

    private MessageComponentInterface $aplicacao;
    private $pdoFactory;
    private LoopInterface $loop;
    private array $origensPermitidas;
    private \SplObjectStorage $ligacoesAbertas;
    private array $ligacoesAutenticadas = [];
    private array $temporizadoresAutenticacao = [];
    private array $heyDisponivelEm = [];

    public function __construct(
        MessageComponentInterface $aplicacao,
        callable $pdoFactory,
        LoopInterface $loop,
        array $origensPermitidas
    ) {
        $this->aplicacao = $aplicacao;
        $this->pdoFactory = $pdoFactory;
        $this->loop = $loop;
        $this->ligacoesAbertas = new \SplObjectStorage();

        $this->origensPermitidas = array_values(array_unique(array_filter(array_map(
            fn($origem): string => $this->normalizarOrigem((string) $origem),
            $origensPermitidas
        ))));

        if ($this->origensPermitidas === []) {
            throw new \InvalidArgumentException(
                'É necessária pelo menos uma origem WebSocket permitida.'
            );
        }
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        if (!$this->origemPermitida($conn)) {
            echo sprintf(
                "[ORIGIN REJECTED] Ligação %d recusada.\n",
                $conn->resourceId
            );

            $conn->close();
            return;
        }

        $this->ligacoesAbertas->attach($conn);

        try {
            $this->aplicacao->onOpen($conn);
            $this->agendarLimiteAutenticacao($conn);
        } catch (\Throwable $erro) {
            $this->ligacoesAbertas->detach($conn);
            throw $erro;
        }
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        if (!$this->ligacoesAbertas->contains($from)) {
            $from->close();
            return;
        }

        $mensagem = (string) $msg;

        if (strlen($mensagem) > self::MENSAGEM_MAXIMA_BYTES) {
            $this->enviarErro(
                $from,
                'A mensagem recebida é demasiado grande.'
            );

            $from->close();
            return;
        }

        try {
            $dados = json_decode(
                $mensagem,
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

        if (!is_array($dados)) {
            $this->enviarErro(
                $from,
                'A mensagem recebida não é válida.'
            );

            return;
        }

        $tipo = trim((string) ($dados['type'] ?? ''));

        if ($tipo === '') {
            $this->enviarErro(
                $from,
                'A mensagem não contém um tipo.'
            );

            return;
        }

        $autenticado = isset(
            $this->ligacoesAutenticadas[$from->resourceId]
        );

        if ($autenticado) {
            if ($tipo === 'auth') {
                $this->enviarErro(
                    $from,
                    'A ligação já está autenticada.'
                );

                $from->close();
                return;
            }

            if (
                $tipo === 'notify' &&
                !$this->autorizarHey($from, $dados)
            ) {
                return;
            }

            $this->aplicacao->onMessage($from, $mensagem);
            return;
        }

        if ($tipo !== 'auth') {
            $this->enviarErro(
                $from,
                'A ligação não está autenticada.'
            );

            $from->close();
            return;
        }

        $token = trim((string) ($dados['token'] ?? ''));

        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            $this->enviarErro(
                $from,
                'O token de ligação não é válido.'
            );

            $from->close();
            return;
        }

        try {
            $membroId = $this->consumirToken($token);
        } catch (\Throwable $erro) {
            echo sprintf(
                "[AUTH TOKEN ERROR] Ligação %d: %s\n",
                $from->resourceId,
                $erro->getMessage()
            );

            $this->enviarErro(
                $from,
                'Não foi possível autenticar a ligação.'
            );

            $from->close();
            return;
        }

        if ($membroId === false) {
            $this->enviarErro(
                $from,
                'O token de ligação expirou ou já foi utilizado.'
            );

            $from->close();
            return;
        }

        $this->cancelarLimiteAutenticacao($from);
        $this->ligacoesAutenticadas[$from->resourceId] = $membroId;
        $dados['membro_id'] = $membroId;

        unset($dados['token']);

        try {
            $mensagemAutenticada = json_encode(
                $dados,
                JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_THROW_ON_ERROR
            );

            $this->aplicacao->onMessage(
                $from,
                $mensagemAutenticada
            );
        } catch (\Throwable $erro) {
            unset(
                $this->ligacoesAutenticadas[$from->resourceId]
            );

            echo sprintf(
                "[AUTH FORWARD ERROR] Ligação %d: %s\n",
                $from->resourceId,
                $erro->getMessage()
            );

            $this->enviarErro(
                $from,
                'Não foi possível concluir a autenticação.'
            );

            $from->close();
        }
    }

    public function onClose(ConnectionInterface $conn): void
    {
        $this->cancelarLimiteAutenticacao($conn);

        unset(
            $this->ligacoesAutenticadas[$conn->resourceId]
        );

        if (!$this->ligacoesAbertas->contains($conn)) {
            return;
        }

        $this->ligacoesAbertas->detach($conn);
        $this->aplicacao->onClose($conn);
    }

    public function onError(
        ConnectionInterface $conn,
        \Exception $erro
    ): void {
        if ($this->ligacoesAbertas->contains($conn)) {
            $this->aplicacao->onError($conn, $erro);
            return;
        }

        echo sprintf(
            "[GATEWAY ERROR] Ligação %d: %s\n",
            $conn->resourceId,
            $erro->getMessage()
        );

        $conn->close();
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

        $database->setAttribute(
            PDO::ATTR_ERRMODE,
            PDO::ERRMODE_EXCEPTION
        );

        $database->setAttribute(
            PDO::ATTR_DEFAULT_FETCH_MODE,
            PDO::FETCH_ASSOC
        );

        return $database;
    }

    private function consumirToken(string $token): string|false
    {
        $database = $this->getDatabase();
        $tokenHash = hash('sha256', $token);

        try {
            $database->beginTransaction();

            $statement = $database->prepare(
                "SELECT
                    t.id,
                    t.membro_id
                 FROM token AS t
                 INNER JOIN membros AS m
                    ON m.id = t.membro_id
                 WHERE t.token = :token
                 AND t.proposito = 'websocket'
                 AND t.validade > UTC_TIMESTAMP()
                 LIMIT 1
                 FOR UPDATE"
            );

            $statement->execute([
                'token' => $tokenHash
            ]);

            $registo = $statement->fetch(PDO::FETCH_ASSOC);

            if (!$registo) {
                $database->commit();
                return false;
            }

            $delete = $database->prepare(
                "DELETE FROM token
                 WHERE id = :id
                 AND token = :token
                 AND proposito = 'websocket'"
            );

            $delete->execute([
                'id' => $registo['id'],
                'token' => $tokenHash
            ]);

            if ($delete->rowCount() !== 1) {
                $database->rollBack();
                return false;
            }

            $membroId = trim(
                (string) $registo['membro_id']
            );

            $database->commit();

            return $membroId !== ''
                ? $membroId
                : false;
        } catch (\Throwable $erro) {
            if ($database->inTransaction()) {
                $database->rollBack();
            }

            throw $erro;
        }
    }

    private function autorizarHey(
        ConnectionInterface $from,
        array $dados
    ): bool {
        $emissorId = trim((string) (
            $this->ligacoesAutenticadas[
                $from->resourceId
            ] ?? ''
        ));

        $destinatarioId = trim(
            (string) ($dados['destinatario_id'] ?? '')
        );

        /*
         * A aplicação principal continua responsável por validar UUIDs,
         * proximidade, bloqueios e tentativas de enviar um Hey ao próprio.
         */
        if (
            $emissorId === '' ||
            $destinatarioId === ''
        ) {
            return true;
        }

        $chave = hash(
            'sha256',
            $emissorId . "\0" . $destinatarioId
        );

        $agora = microtime(true);

        $disponivelEm = (float) (
            $this->heyDisponivelEm[$chave] ?? 0.0
        );

        if ($disponivelEm > $agora) {
            $this->enviarEsperaHey(
                $from,
                $destinatarioId,
                (int) ceil($disponivelEm - $agora)
            );

            return false;
        }

        try {
            $database = $this->getDatabase();
            $intervalo = self::INTERVALO_HEY_SEGUNDOS;

            $statement = $database->prepare(
                "SELECT TIMESTAMPDIFF(
                    SECOND,
                    NOW(),
                    DATE_ADD(
                        criada_em,
                        INTERVAL {$intervalo} SECOND
                    )
                 ) AS tentar_em
                 FROM notificacao
                 WHERE emissor_id = :emissor_id
                 AND destinatario_id = :destinatario_id
                 AND tipo = 'hey'
                 AND criada_em > DATE_SUB(
                    NOW(),
                    INTERVAL {$intervalo} SECOND
                 )
                 ORDER BY criada_em DESC
                 LIMIT 1"
            );

            $statement->execute([
                'emissor_id' => $emissorId,
                'destinatario_id' => $destinatarioId
            ]);

            $registo = $statement->fetch(
                PDO::FETCH_ASSOC
            );

            $tentarEm = $registo
                ? max(
                    1,
                    (int) ($registo['tentar_em'] ?? 1)
                )
                : 0;

            if ($tentarEm > 0) {
                $this->heyDisponivelEm[$chave] =
                    $agora + $tentarEm;

                $this->limparCacheHeys($agora);

                $this->enviarEsperaHey(
                    $from,
                    $destinatarioId,
                    $tentarEm
                );

                return false;
            }
        } catch (\Throwable $erro) {
            /*
             * Se esta verificação falhar, a aplicação continua funcional e o
             * problema fica visível nos logs do serviço.
             */
            echo sprintf(
                "[HEY RATE LIMIT ERROR] %s\n",
                $erro->getMessage()
            );

            return true;
        }

        /*
         * O envio e a gravação acontecem sincronamente no mesmo event loop.
         * Assim, a próxima tentativa já encontra este Hey na base de dados.
         */
        return true;
    }

    private function enviarEsperaHey(
        ConnectionInterface $conn,
        string $destinatarioId,
        int $segundos
    ): void {
        $segundos = max(1, $segundos);

        if ($segundos >= 60) {
            $minutos = (int) ceil($segundos / 60);

            $espera = $minutos === 1
                ? '1 minuto'
                : $minutos . ' minutos';
        } else {
            $espera = $segundos === 1
                ? '1 segundo'
                : $segundos . ' segundos';
        }

        try {
            $conn->send(json_encode([
                'type' => 'notification_not_delivered',
                'destinatario_id' => $destinatarioId,
                'message' =>
                    'Já enviaste um Hey a esta pessoa. ' .
                    'Podes enviar outro dentro de ' .
                    $espera .
                    '.'
            ], JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_THROW_ON_ERROR));
        } catch (\Throwable) {
            $conn->close();
        }
    }

    private function limparCacheHeys(float $agora): void
    {
        if (count($this->heyDisponivelEm) < 1000) {
            return;
        }

        foreach (
            $this->heyDisponivelEm as
            $chave => $disponivelEm
        ) {
            if ((float) $disponivelEm <= $agora) {
                unset($this->heyDisponivelEm[$chave]);
            }
        }
    }

    private function origemPermitida(
        ConnectionInterface $conn
    ): bool {
        $pedido = $conn->httpRequest ?? null;

        if (
            !is_object($pedido) ||
            !method_exists($pedido, 'getHeaderLine')
        ) {
            return false;
        }

        $origem = $this->normalizarOrigem(
            (string) $pedido->getHeaderLine('Origin')
        );

        return $origem !== '' &&
            in_array(
                $origem,
                $this->origensPermitidas,
                true
            );
    }

    private function normalizarOrigem(
        string $origem
    ): string {
        $componentes = parse_url(trim($origem));

        if (!is_array($componentes)) {
            return '';
        }

        $esquema = strtolower(
            (string) ($componentes['scheme'] ?? '')
        );

        $host = strtolower(
            (string) ($componentes['host'] ?? '')
        );

        if (
            !in_array(
                $esquema,
                ['http', 'https'],
                true
            ) ||
            $host === ''
        ) {
            return '';
        }

        $porta = isset($componentes['port'])
            ? (int) $componentes['port']
            : null;

        if (
            ($esquema === 'http' && $porta === 80) ||
            ($esquema === 'https' && $porta === 443)
        ) {
            $porta = null;
        }

        return $esquema .
            '://' .
            $host .
            ($porta !== null ? ':' . $porta : '');
    }

    private function agendarLimiteAutenticacao(
        ConnectionInterface $conn
    ): void {
        $this->cancelarLimiteAutenticacao($conn);

        $this->temporizadoresAutenticacao[
            $conn->resourceId
        ] = $this->loop->addTimer(
            self::AUTENTICACAO_MAXIMA_ESPERA_SEGUNDOS,
            function () use ($conn): void {
                unset(
                    $this->temporizadoresAutenticacao[
                        $conn->resourceId
                    ]
                );

                if (
                    isset(
                        $this->ligacoesAutenticadas[
                            $conn->resourceId
                        ]
                    )
                ) {
                    return;
                }

                $this->enviarErro(
                    $conn,
                    'A autenticação da ligação expirou.'
                );

                $conn->close();
            }
        );
    }

    private function cancelarLimiteAutenticacao(
        ConnectionInterface $conn
    ): void {
        $temporizador =
            $this->temporizadoresAutenticacao[
                $conn->resourceId
            ] ?? null;

        if ($temporizador instanceof TimerInterface) {
            $this->loop->cancelTimer($temporizador);
        }

        unset(
            $this->temporizadoresAutenticacao[
                $conn->resourceId
            ]
        );
    }

    private function enviarErro(
        ConnectionInterface $conn,
        string $mensagem
    ): void {
        try {
            $conn->send(json_encode([
                'type' => 'error',
                'message' => $mensagem
            ], JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_THROW_ON_ERROR));
        } catch (\Throwable) {
            $conn->close();
        }
    }
}