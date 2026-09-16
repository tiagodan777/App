<?php
declare(strict_types=1);

namespace App\CMS;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
use React\EventLoop\LoopInterface;
use React\EventLoop\TimerInterface;

class WebSocket implements MessageComponentInterface {
    use Realtime\Chat;
    use Realtime\Connections;
    use Realtime\Discovery;
    /* O iOS envia eventos de movimento/visita, não pings exatos por minuto. */
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS = 180;
    private const LOCALIZACOES_PERSISTIDAS_CACHE_SEGUNDOS = 5;
    private const PERSISTENCIA_LOCALIZACAO_INTERVALO_SEGUNDOS = 5.0;
    private const TOLERANCIA_NAVEGACAO_SEGUNDOS = 8.0;
    private const BLOQUEIOS_CACHE_SEGUNDOS = 10;
    private const ACESSO_PERFIL_VALIDADE_SEGUNDOS = 120;
    private const ACESSO_PERFIL_RENOVAR_ANTES_SEGUNDOS = 30;
    private const ACESSO_PERFIL_LIMPEZA_SEGUNDOS = 60;
    private const JANELA_CONEXAO_SEGUNDOS = 1.5;
    private \SplObjectStorage $clients;
    private $pdoFactory;
    private LoopInterface $loop;
    private array $membroPorLigacao = [];
    private array $localizacaoPorLigacao = [];
    private array $visibilidadePorLigacao = [];
    private array $ligacoesPorMembro = [];
    private array $pessoas = [];
    private array $localizacoes = [];
    private array $temporizadoresSaida = [];
    private array $bloqueiosEntreMembros = [];
    private array $faixaEtariaPorMembro = [];
    private array $acessosPerfil = [];
    private array $membrosVisiveisPorPersistencia = [];
    private array $tentativasConexao = [];
    private array $ultimaPersistenciaLocalizacaoPorMembro = [];
    private int $bloqueiosCarregadosEm = 0;
    private int $acessosPerfilLimposEm = 0;
    private int $localizacoesPersistidasCarregadasEm = 0;
    private string $assinaturaBloqueios = '';

    public function __construct(callable $pdoFactory, LoopInterface $loop) {
        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
        $this->loop = $loop;
        $this->loop->addPeriodicTimer(self::BLOQUEIOS_CACHE_SEGUNDOS, function (): void {
            if (count($this->clients) === 0) {
                return;
            }
            try {
                $this->carregarBloqueios(true);
                $this->enviarEstadosIndividuais();
            } catch (\Throwable $erro) {
                echo sprintf("[BLOCK CACHE ERROR] %s\n", $erro->getMessage());
            }
        });
    }

    private function getDatabase(): PDO {
        $factory = $this->pdoFactory;
        $database = $factory();
        if (!($database instanceof PDO)) {
            throw new \RuntimeException('A fábrica da base de dados não devolveu um PDO.');
        }
        $database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $database->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $database;
    }

    public function onOpen(ConnectionInterface $conn): void {
        $this->clients->attach($conn);
        echo sprintf("[OPEN] Ligação %d aberta. Ligações: %d\n", $conn->resourceId, count($this->clients));
        $this->enviar($conn, ['type' => 'connected', 'resource_id' => $conn->resourceId]);
    }

    public function onMessage(ConnectionInterface $from, $msg): void {
        try {
            $data = json_decode((string) $msg, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            $this->enviarErro($from, 'A mensagem recebida não contém JSON válido.');
            return;
        }
        if (!is_array($data)) {
            $this->enviarErro($from, 'A mensagem recebida não é válida.');
            return;
        }
        $type = trim((string) ($data['type'] ?? ''));
        if ($type === '') {
            $this->enviarErro($from, 'A mensagem não contém um tipo.');
            return;
        }
        try {
            switch ($type) {
                case 'auth':
                    $this->autenticarPessoa($from, $data);
                    break;
                case 'location':
                    $this->atualizarLocalizacao($from, $data);
                    break;
                case 'presence_update':
                    $this->atualizarPresenca($from, $data);
                    break;
                case 'move':
                    $this->moverPessoa($from, $data);
                    break;
                case 'notify':
                    $this->notificarPessoa($from, $data);
                    break;
                case 'connection_attempt':
                    $this->tentarConexao($from, $data);
                    break;
                case 'connection_disconnect':
                    $this->desconectarMembros($from, $data);
                    break;
                case 'chat_publish':
                    $this->publicarMensagemChat($from, $data);
                    break;
                case 'chat_reaction':
                    $this->publicarReacaoChat($from, $data);
                    break;
                case 'chat_delete':
                    $this->publicarEliminacaoChat($from, $data);
                    break;
                case 'chat_read':
                    $this->marcarMensagensChatComoLidas($from, $data);
                    break;
                case 'ping':
                    $this->enviar($from, ['type' => 'pong', 'timestamp' => time()]);
                    break;
                case 'block_refresh':
                    $this->atualizarBloqueios($from, $data);
                    break;
                default:
                    $this->enviarErro($from, 'Tipo de mensagem desconhecido.');
            }
        } catch (\Throwable $erro) {
            echo sprintf("[ERROR] Ligação %d: %s\n", $from->resourceId, $erro->getMessage());
            $this->enviarErro($from, 'Não foi possível processar o pedido.');
        }
    }

    private function autenticarPessoa(ConnectionInterface $conn, array $data): void {
        $membroId = trim((string) ($data['membro_id'] ?? ''));
        if ($membroId === '') {
            $this->enviarErro($conn, 'Não foi recebido um membro válido.');
            return;
        }
        $membroAnterior = $this->membroPorLigacao[$conn->resourceId] ?? null;
        if ($membroAnterior !== null && $membroAnterior !== $membroId) {
            $this->removerLigacaoDoMembro($conn, $membroAnterior);
        }
        $membro = $this->obterMembro($membroId);
        if (!$membro) {
            $this->enviarErro($conn, 'O membro não foi encontrado.');
            return;
        }
        $faixaEtaria = $this->obterFaixaEtaria((string) ($membro['nascimento'] ?? ''));
        if ($faixaEtaria === null) {
            $this->enviarErro(
                $conn,
                'A conta não tem uma idade válida para utilizar a descoberta de pessoas próximas.'
            );
            $conn->close();
            return;
        }
        $this->faixaEtariaPorMembro[$membroId] = $faixaEtaria;
        $localizacaoAtiva = $this->lerBooleano(
            $data,
            'location_enabled',
            $this->lerBooleano($data, 'map_presence', true)
        );
        $visivel = $localizacaoAtiva && $this->lerBooleano($data, 'map_presence', true);
        $this->cancelarSaidaAgendada($membroId);
        $this->membroPorLigacao[$conn->resourceId] = $membroId;
        $this->localizacaoPorLigacao[$conn->resourceId] = $localizacaoAtiva;
        $this->visibilidadePorLigacao[$conn->resourceId] = $visivel;
        $this->ligacoesPorMembro[$membroId] ??= [];
        $this->ligacoesPorMembro[$membroId][$conn->resourceId] = $conn;
        if (!$this->membroTemLigacaoComLocalizacaoAtiva($membroId)) {
            unset($this->localizacoes[$membroId]);
        }
        $this->sincronizarVisibilidadeMembro($membroId, $membro);
        echo sprintf(
            "[AUTH] Ligação %d autenticada como %s. Localização: %s. Visível: %s. Pessoas: %d. Ligações deste membro: %d\n",
            $conn->resourceId,
            $membroId,
            $localizacaoAtiva ? 'ativa' : 'inativa',
            $visivel ? 'sim' : 'não',
            count($this->pessoas),
            count($this->ligacoesPorMembro[$membroId])
        );
        $this->enviar($conn, [
            'type' => 'authenticated',
            'membro_id' => $membroId,
            'location_enabled' => $localizacaoAtiva,
            'map_presence' => $visivel
        ]);
        $this->enviarContadorMensagens($conn, $membroId);
        $this->enviarEstadosIndividuais();
    }

    private function obterMembro(string $membroId): array|false {
        $sql = " SELECT m.id AS membro_id, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome, m.nascimento, COALESCE( (
            SELECT fp.nome_arquivo
            FROM fotos_perfil AS fp
            WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci AND (fp.status =
            'completo' OR fp.status IS NULL)
            ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
            LIMIT 1 ), 'default.webp' ) AS foto_perfil
            FROM membros AS m
            WHERE m.id = :membro_id
            LIMIT 1 ";
        $database = $this->getDatabase();
        $statement = $database->prepare($sql);
        $statement->execute(['membro_id' => $membroId]);
        return $statement->fetch(PDO::FETCH_ASSOC);
    }

    public function onClose(ConnectionInterface $conn): void {
        if ($this->clients->contains($conn)) {
            $this->clients->detach($conn);
        }
        $membroId = $this->obterMembroDaLigacao($conn);
        if ($membroId !== null) {
            $this->removerLigacaoDoMembro($conn, $membroId);
        }
        echo sprintf(
            "[CLOSE] Ligação %d fechada. Pessoas: %d. Ligações: %d\n",
            $conn->resourceId,
            count($this->pessoas),
            count($this->clients)
        );
        $this->enviarEstadosIndividuais();
    }

    private function removerLigacaoDoMembro(ConnectionInterface $conn, string $membroId): void {
        unset(
            $this->membroPorLigacao[$conn->resourceId],
            $this->localizacaoPorLigacao[$conn->resourceId],
            $this->visibilidadePorLigacao[$conn->resourceId],
            $this->ligacoesPorMembro[$membroId][$conn->resourceId]
        );
        if (empty($this->ligacoesPorMembro[$membroId])) {
            unset($this->ligacoesPorMembro[$membroId]);
        }
        if (!$this->membroTemLigacaoVisivel($membroId) || !$this->membroTemLigacaoComLocalizacaoAtiva($membroId)) {
            $this->agendarSaida($membroId);
        }
    }

    private function membroTemLigacaoVisivel(string $membroId): bool {
        foreach ($this->ligacoesPorMembro[$membroId] ?? [] as $resourceId => $ligacao) {
            if ($this->visibilidadePorLigacao[$resourceId] ?? false) {
                return true;
            }
        }
        return false;
    }

    private function membroTemLigacaoComLocalizacaoAtiva(string $membroId): bool {
        foreach ($this->ligacoesPorMembro[$membroId] ?? [] as $resourceId => $ligacao) {
            if ($this->localizacaoPorLigacao[$resourceId] ?? false) {
                return true;
            }
        }
        return false;
    }

    private function agendarSaida(string $membroId): void {
        $this->cancelarSaidaAgendada($membroId);
        $this->temporizadoresSaida[$membroId] = $this->loop->addTimer(
            self::TOLERANCIA_NAVEGACAO_SEGUNDOS,
            function () use ($membroId): void {
                unset($this->temporizadoresSaida[$membroId]);
                $removeuPessoa = false;
                $removeuLocalizacao = false;
                if (
                    !$this->membroTemLigacaoVisivel($membroId) &&
                    !isset($this->membrosVisiveisPorPersistencia[$membroId])
                ) {
                    $removeuPessoa = isset($this->pessoas[$membroId]);
                    unset($this->pessoas[$membroId]);
                }
                if (
                    !$this->membroTemLigacaoComLocalizacaoAtiva($membroId) &&
                    !isset($this->membrosVisiveisPorPersistencia[$membroId])
                ) {
                    $removeuLocalizacao = isset($this->localizacoes[$membroId]);
                    unset($this->localizacoes[$membroId]);
                }
                if (!$removeuPessoa && !$removeuLocalizacao) {
                    return;
                }
                echo sprintf(
                    "[OFFLINE] %s atualizado após o período de tolerância. Pessoas: %d\n",
                    $membroId,
                    count($this->pessoas)
                );
                $this->enviarEstadosIndividuais();
            }
        );
    }

    private function cancelarSaidaAgendada(string $membroId): void {
        $temporizador = $this->temporizadoresSaida[$membroId] ?? null;
        if (!($temporizador instanceof TimerInterface)) {
            return;
        }
        $this->loop->cancelTimer($temporizador);
        unset($this->temporizadoresSaida[$membroId]);
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void {
        echo sprintf("[CONNECTION ERROR] Ligação %d: %s\n", $conn->resourceId, $e->getMessage());
        $conn->close();
    }

    private function obterMembroDaLigacao(ConnectionInterface $conn): ?string {
        return $this->membroPorLigacao[$conn->resourceId] ?? null;
    }

    private function enviarErro(ConnectionInterface $conn, string $mensagem): void {
        $this->enviar($conn, ['type' => 'error', 'message' => $mensagem]);
    }

    private function enviarErroHey(ConnectionInterface $conn, string $destinatarioId, string $mensagem): void {
        $this->enviar($conn, [
            'type' => 'notification_not_delivered',
            'destinatario_id' => $destinatarioId,
            'message' => $mensagem
        ]);
    }

    private function enviar(ConnectionInterface $conn, array $data): void {
        try {
            $conn->send(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        } catch (\Throwable $erro) {
            echo sprintf("[SEND ERROR] Ligação %d: %s\n", $conn->resourceId, $erro->getMessage());
        }
    }

    private function lerBooleano(array $data, string $chave, bool $padrao): bool {
        if (!array_key_exists($chave, $data)) {
            return $padrao;
        }
        $valor = filter_var($data[$chave], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        return $valor ?? $padrao;
    }

    private function limitarNumero(int $numero, int $minimo, int $maximo): int {
        return max($minimo, min($maximo, $numero));
    }
}
