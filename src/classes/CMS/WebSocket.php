<?php

declare(strict_types=1);

namespace App\CMS;

use App\Security\InteractionPolicy;
use App\Security\RateLimiter;
use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
use React\EventLoop\LoopInterface;
use React\EventLoop\TimerInterface;

class WebSocket implements MessageComponentInterface
{
    private const RAIO_MAXIMO_METROS = 100;
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS = 30;
    private const GUARDA_LOCALIZACAO_SEGUNDOS = 600;
    private const PRECISAO_MAXIMA_METROS = 75.0;
    private const VELOCIDADE_MAXIMA_METROS_SEGUNDO = 80.0;
    private const INTERVALO_MINIMO_LOCALIZACAO_SEGUNDOS = 2.0;
    private const TIMEOUT_AUTENTICACAO_SEGUNDOS = 5.0;
    private const MAXIMO_LIGACOES_POR_MEMBRO = 5;
    private const MAXIMO_BYTES_MENSAGEM = 32768;
    private const PROXIMIDADE_TOKEN_TTL_SEGUNDOS = 45;
    private const TOLERANCIA_NAVEGACAO_SEGUNDOS = 8.0;
    private const BLOQUEIOS_CACHE_SEGUNDOS = 10;
    private const LIMPEZA_LOCALIZACOES_SEGUNDOS = 5;
    private const VERIFICACAO_MEMBROS_ATIVOS_SEGUNDOS = 15;
    private const VERIFICACAO_PREFERENCIAS_SEGUNDOS = 3;

    private \SplObjectStorage $clients;
    private $pdoFactory;
    private LoopInterface $loop;
    private string $proximitySecret;

    private array $membroPorLigacao = [];
    private array $authVersionPorLigacao = [];
    private array $localizacaoSolicitadaPorLigacao = [];
    private array $visibilidadeSolicitadaPorLigacao = [];
    private array $localizacaoPorLigacao = [];
    private array $visibilidadePorLigacao = [];
    private array $ultimaLocalizacaoPorLigacao = [];
    private array $ligacoesPorMembro = [];
    private array $pessoas = [];
    private array $localizacoes = [];
    private array $guardasLocalizacao = [];
    private array $temporizadoresAutenticacao = [];
    private array $temporizadoresSaida = [];
    private array $bloqueiosEntreMembros = [];
    private int $bloqueiosCarregadosEm = 0;
    private string $assinaturaBloqueios = '';

    public function __construct(
        callable $pdoFactory,
        LoopInterface $loop,
        string $proximitySecret
    )
    {
        if (trim($proximitySecret) === '') {
            throw new \InvalidArgumentException('A chave de proximidade não está configurada.');
        }

        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
        $this->loop = $loop;
        $this->proximitySecret = $proximitySecret;

        $this->loop->addPeriodicTimer(self::BLOQUEIOS_CACHE_SEGUNDOS, function (): void {
            if (count($this->clients) === 0) return;

            try {
                if ($this->carregarBloqueios(true)) $this->enviarEstadosIndividuais();
            } catch (\Throwable $erro) {
                $this->registarErro('block_cache', $erro);
            }
        });

        $this->loop->addPeriodicTimer(
            self::LIMPEZA_LOCALIZACOES_SEGUNDOS,
            function (): void {
                if ($this->removerLocalizacoesExpiradas()) {
                    $this->enviarEstadosIndividuais();
                }
            }
        );

        $this->loop->addPeriodicTimer(
            self::VERIFICACAO_MEMBROS_ATIVOS_SEGUNDOS,
            function (): void {
                if ($this->ligacoesPorMembro === []) return;

                try {
                    $this->terminarLigacoesDeMembrosInativos();
                } catch (\Throwable $erro) {
                    $this->registarErro('active_member_check', $erro);
                }
            }
        );

        $this->loop->addPeriodicTimer(
            self::VERIFICACAO_PREFERENCIAS_SEGUNDOS,
            function (): void {
                if ($this->ligacoesPorMembro === []) return;

                try {
                    $this->revalidarPreferenciasDeLigacoes();
                } catch (\Throwable $erro) {
                    $this->registarErro('privacy_preferences_check', $erro);
                }
            }
        );
    }

    private function getDatabase(): PDO
    {
        $factory = $this->pdoFactory;
        $database = $factory();

        if (!$database instanceof PDO) {
            throw new \RuntimeException('A fábrica da base de dados não devolveu um PDO.');
        }

        $database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $database->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        return $database;
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        $this->clients->attach($conn);
        $resourceId = $conn->resourceId;

        $this->temporizadoresAutenticacao[$resourceId] = $this->loop->addTimer(
            self::TIMEOUT_AUTENTICACAO_SEGUNDOS,
            function () use ($conn, $resourceId): void {
                unset($this->temporizadoresAutenticacao[$resourceId]);

                if (isset($this->membroPorLigacao[$resourceId])) return;

                $this->enviarErro($conn, 'A ligação não foi autenticada a tempo.');
                $conn->close(1008);
            }
        );

        $this->registarDebug(sprintf(
            '[OPEN] Ligação aberta. Ligações: %d',
            count($this->clients)
        ));

        $this->enviar($conn, [
            'type' => 'connected',
            'auth_timeout_seconds' => (int) self::TIMEOUT_AUTENTICACAO_SEGUNDOS
        ]);
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        $mensagem = (string) $msg;

        if (strlen($mensagem) > self::MAXIMO_BYTES_MENSAGEM) {
            $this->enviarErro($from, 'A mensagem recebida é demasiado grande.');
            $from->close(1009);
            return;
        }

        if (!RateLimiter::allow(
            'websocket_frames',
            'ligacao:' . (string) $from->resourceId,
            120,
            60
        )) {
            $this->enviarErro($from, 'A ligação enviou demasiadas mensagens.');
            $from->close(1008);
            return;
        }

        try {
            $data = json_decode($mensagem, true, 64, JSON_THROW_ON_ERROR);
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

        $membroId = $this->obterMembroDaLigacao($from);

        if ($type !== 'auth' && $membroId === null) {
            $this->enviarErro($from, 'A ligação não está autenticada.');
            $from->close(1008);
            return;
        }

        if ($type === 'auth' && $membroId !== null) {
            $this->enviarErro($from, 'A ligação já está autenticada.');
            $from->close(1008);
            return;
        }

        if (!$this->mensagemDentroDoLimite($from, $type, $membroId)) {
            $this->enviarErro($from, 'Foram enviados demasiados pedidos. Tenta novamente dentro de instantes.');
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

                case 'notify':
                    $this->notificarPessoa($from, $data);
                    break;

                case 'chat_publish':
                    $this->publicarMensagemChat($from, $data);
                    break;

                case 'chat_read':
                    $this->marcarMensagensChatComoLidas($from, $data);
                    break;

                case 'ping':
                    $this->enviar($from, [
                        'type' => 'pong',
                        'timestamp' => time()
                    ]);
                    break;
                case 'block_refresh':
                    $this->atualizarBloqueios($from, $data);
                    break;

                default:
                    $this->enviarErro($from, 'Tipo de mensagem desconhecido.');
            }
        } catch (\Throwable $erro) {
            $this->registarErro('message_processing', $erro);
            $this->enviarErro($from, 'Não foi possível processar o pedido.');
        }
    }

    private function autenticarPessoa(ConnectionInterface $conn, array $data): void
    {
        $ticket = strtolower(trim((string) ($data['ticket'] ?? '')));

        if (!preg_match('/\A[a-f0-9]{64}\z/D', $ticket)) {
            $this->enviarErro($conn, 'O bilhete de ligação não é válido.');
            $conn->close(1008);
            return;
        }

        try {
            $database = $this->getDatabase();
            $membroId = (new WebSocketTicket($database))->consume($ticket);
        } catch (\Throwable $erro) {
            $this->registarErro('authentication', $erro);
            $this->enviarErro($conn, 'Não foi possível validar a ligação segura.');
            $conn->close(1011);
            return;
        } finally {
            $database = null;
        }

        if ($membroId === false) {
            $this->enviarErro($conn, 'O bilhete de ligação expirou ou já foi utilizado.');
            $conn->close(1008);
            return;
        }

        $membro = $this->obterMembro($membroId);

        if (!$membro) {
            $this->enviarErro($conn, 'O membro não foi encontrado.');
            $conn->close(1008);
            return;
        }

        if (count($this->ligacoesPorMembro[$membroId] ?? []) >= self::MAXIMO_LIGACOES_POR_MEMBRO) {
            $this->enviarErro($conn, 'Já existem demasiadas ligações abertas para esta conta.');
            $conn->close(1008);
            return;
        }

        $localizacaoSolicitada = $this->lerBooleano(
            $data,
            'location_enabled',
            false
        );

        $visibilidadeSolicitada = $this->lerBooleano(
            $data,
            'map_presence',
            false
        );

        $localizacaoAtiva =
            (bool) ($membro['localizacao_ativa'] ?? false) &&
            $localizacaoSolicitada;

        $visivel =
            $localizacaoAtiva &&
            !(bool) ($membro['invisivel'] ?? false) &&
            $visibilidadeSolicitada;

        $this->cancelarSaidaAgendada($membroId);
        $this->cancelarTimeoutAutenticacao($conn->resourceId);

        $this->membroPorLigacao[$conn->resourceId] = $membroId;
        $this->authVersionPorLigacao[$conn->resourceId] =
            (int) ($membro['auth_version'] ?? 0);
        $this->localizacaoSolicitadaPorLigacao[$conn->resourceId] =
            $localizacaoSolicitada;
        $this->visibilidadeSolicitadaPorLigacao[$conn->resourceId] =
            $visibilidadeSolicitada;
        $this->localizacaoPorLigacao[$conn->resourceId] = $localizacaoAtiva;
        $this->visibilidadePorLigacao[$conn->resourceId] = $visivel;
        $this->ligacoesPorMembro[$membroId] ??= [];
        $this->ligacoesPorMembro[$membroId][$conn->resourceId] = $conn;

        if (!$this->membroTemLigacaoComLocalizacaoAtiva($membroId)) {
            unset($this->localizacoes[$membroId]);
        }

        $this->sincronizarVisibilidadeMembro($membroId, $membro);

        $this->registarDebug(sprintf(
            '[AUTH] Ligação autenticada. Localização: %s. Visível: %s. Pessoas: %d.',
            $localizacaoAtiva ? 'ativa' : 'inativa',
            $visivel ? 'sim' : 'não',
            count($this->pessoas)
        ));

        $this->enviar($conn, [
            'type' => 'authenticated',
            'membro_id' => $membroId,
            'location_enabled' => $localizacaoAtiva,
            'map_presence' => $visivel
        ]);

        $this->enviarContadorMensagens($conn, $membroId);
        $this->enviarEstadosIndividuais();
    }

    private function obterMembro(string $membroId): array|false
    {
        $sql = "
            SELECT
                m.id AS membro_id,
                m.auth_version,
                CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                COALESCE(pp.localizacao_ativa, 0) AS localizacao_ativa,
                COALESCE(pp.invisivel, 0) AS invisivel,
                (
                    SELECT fp.id
                    FROM fotos_perfil AS fp
                    WHERE fp.membro_id COLLATE utf8mb4_unicode_ci =
                          m.id COLLATE utf8mb4_unicode_ci
                    AND fp.status = 'completo'
                    ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
                    LIMIT 1
                ) AS foto_id
            FROM membros AS m
            LEFT JOIN preferencias_privacidade AS pp
                ON pp.membro_id = m.id
            WHERE m.id = :membro_id
            AND m.estado = 'ativo'
            LIMIT 1
        ";

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare($sql);
            $statement->execute(['membro_id' => $membroId]);

            return $statement->fetch(PDO::FETCH_ASSOC);
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function atualizarPresenca(ConnectionInterface $conn, array $data): void
    {
        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId === null) {
            $this->enviarErro($conn, 'A ligação não está autenticada.');
            return;
        }

        $resourceId = $conn->resourceId;
        $membro = $this->obterMembro($membroId);

        if (!$membro) {
            $this->enviarErro($conn, 'A conta já não está disponível.');
            $conn->close(1008);
            return;
        }

        $this->localizacaoSolicitadaPorLigacao[$resourceId] =
            $this->lerBooleano(
                $data,
                'location_enabled',
                $this->localizacaoSolicitadaPorLigacao[$resourceId] ?? false
            );
        $this->visibilidadeSolicitadaPorLigacao[$resourceId] =
            $this->lerBooleano(
                $data,
                'map_presence',
                $this->visibilidadeSolicitadaPorLigacao[$resourceId] ?? false
            );

        $this->aplicarPreferenciasDoServidorAoMembro(
            $membroId,
            $membro,
            true
        );

        $this->registarDebug(sprintf(
            '[PRESENCE] Presença atualizada: localização=%s, visível=%s.',
            ($this->localizacaoPorLigacao[$resourceId] ?? false)
                ? 'ativa'
                : 'inativa',
            ($this->visibilidadePorLigacao[$resourceId] ?? false)
                ? 'sim'
                : 'não'
        ));

        $this->enviarEstadosIndividuais();
    }

    private function aplicarPreferenciasDoServidorAoMembro(
        string $membroId,
        array $membro,
        bool $notificarTodas = false
    ): bool {
        $localizacaoPermitida = (bool) ($membro['localizacao_ativa'] ?? false);
        $membroInvisivel = (bool) ($membro['invisivel'] ?? false);
        $recursosAlterados = [];
        $estadoAnteriorPessoa = isset($this->pessoas[$membroId]);
        $estadoAnteriorLocalizacao = isset($this->localizacoes[$membroId]);
        $recursoDaLocalizacao = (int) (
            $this->localizacoes[$membroId]['resource_id'] ?? 0
        );

        foreach (
            $this->ligacoesPorMembro[$membroId] ?? []
            as $resourceId => $ligacao
        ) {
            $localizacaoAtiva =
                $localizacaoPermitida &&
                ($this->localizacaoSolicitadaPorLigacao[$resourceId] ?? false);
            $ligacaoVisivel =
                $localizacaoAtiva &&
                !$membroInvisivel &&
                ($this->visibilidadeSolicitadaPorLigacao[$resourceId] ?? false);

            if (
                ($this->localizacaoPorLigacao[$resourceId] ?? false) !==
                    $localizacaoAtiva ||
                ($this->visibilidadePorLigacao[$resourceId] ?? false) !==
                    $ligacaoVisivel
            ) {
                $recursosAlterados[$resourceId] = true;
            }

            $this->localizacaoPorLigacao[$resourceId] = $localizacaoAtiva;
            $this->visibilidadePorLigacao[$resourceId] = $ligacaoVisivel;
        }

        $this->cancelarSaidaAgendada($membroId);

        if (
            $recursoDaLocalizacao > 0 &&
            !($this->localizacaoPorLigacao[$recursoDaLocalizacao] ?? false)
        ) {
            $this->invalidarLocalizacaoDaLigacao(
                $recursoDaLocalizacao,
                $membroId
            );
        }

        if (!$this->membroTemLigacaoComLocalizacaoAtiva($membroId)) {
            unset($this->localizacoes[$membroId]);
        }

        $this->sincronizarVisibilidadeMembro($membroId, $membro);
        $membroVisivel = $this->membroTemLigacaoVisivel($membroId);

        foreach (
            $this->ligacoesPorMembro[$membroId] ?? []
            as $resourceId => $ligacao
        ) {
            if (!$notificarTodas && !isset($recursosAlterados[$resourceId])) {
                continue;
            }

            $this->enviar($ligacao, [
                'type' => 'presence_updated',
                'location_enabled' =>
                    $this->localizacaoPorLigacao[$resourceId] ?? false,
                'map_presence' =>
                    $this->visibilidadePorLigacao[$resourceId] ?? false,
                'member_visible' => $membroVisivel,
                'server_preferences_enforced' => true
            ]);
        }

        return
            $recursosAlterados !== [] ||
            $estadoAnteriorPessoa !== isset($this->pessoas[$membroId]) ||
            $estadoAnteriorLocalizacao !== isset($this->localizacoes[$membroId]);
    }

    private function sincronizarVisibilidadeMembro(string $membroId, ?array $membro = null): void
    {
        if ($this->membroTemLigacaoVisivel($membroId)) {
            $this->garantirPessoaVisivel($membroId, $membro);
            return;
        }

        unset($this->pessoas[$membroId]);
    }

    private function garantirPessoaVisivel(string $membroId, ?array $membro = null): void
    {
        if ($membro === null) {
            $membro = $this->obterMembro($membroId);
        }

        if (!$membro) {
            unset($this->pessoas[$membroId]);
            return;
        }

        $fotoId = trim((string) ($membro['foto_id'] ?? ''));

        $pessoaAtual = $this->pessoas[$membroId] ?? [];

        $this->pessoas[$membroId] = [
            'id' => $membroId,
            'membro_id' => $membroId,
            'nome' => trim((string) ($membro['nome'] ?? '')),
            'foto_id' => $fotoId !== '' ? $fotoId : null,
            'src' => $this->urlFotoPerfil($fotoId),
            'top' => isset($pessoaAtual['top'])
                ? (int) $pessoaAtual['top']
                : random_int(50, 600),
            'left' => isset($pessoaAtual['left'])
                ? (int) $pessoaAtual['left']
                : random_int(50, 400)
        ];
    }

    private function obterPessoaParaInteracao(string $membroId): ?array
    {
        if (isset($this->pessoas[$membroId])) {
            return $this->pessoas[$membroId];
        }

        $membro = $this->obterMembro($membroId);

        if (!$membro) return null;

        $fotoId = trim((string) ($membro['foto_id'] ?? ''));

        return [
            'id' => $membroId,
            'membro_id' => $membroId,
            'nome' => trim((string) ($membro['nome'] ?? '')),
            'foto_id' => $fotoId !== '' ? $fotoId : null,
            'src' => $this->urlFotoPerfil($fotoId)
        ];
    }

    private function atualizarLocalizacao(ConnectionInterface $conn, array $data): void
    {
        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId === null) {
            $this->enviarErro($conn, 'A ligação não está autenticada.');
            return;
        }

        $membro = $this->obterMembro($membroId);

        if (!$membro) {
            $this->enviarErro($conn, 'A conta já não está disponível.');
            $conn->close(1008);
            return;
        }

        if ($this->aplicarPreferenciasDoServidorAoMembro($membroId, $membro)) {
            $this->enviarEstadosIndividuais();
        }

        if (!($this->localizacaoPorLigacao[$conn->resourceId] ?? false)) {
            $this->rejeitarLocalizacao(
                $conn,
                $membroId,
                'A descoberta por localização está desativada.'
            );
            return;
        }

        $agoraPreciso = microtime(true);
        $ultimaRecebida = (float) ($this->ultimaLocalizacaoPorLigacao[$conn->resourceId] ?? 0.0);

        if (
            $ultimaRecebida > 0 &&
            ($agoraPreciso - $ultimaRecebida) < self::INTERVALO_MINIMO_LOCALIZACAO_SEGUNDOS
        ) {
            $this->enviar($conn, [
                'type' => 'location_ignored',
                'message' => 'A atualização de localização chegou demasiado depressa.'
            ]);
            return;
        }

        $latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $accuracy = filter_var($data['accuracy'] ?? null, FILTER_VALIDATE_FLOAT);

        if (
            $latitude === false ||
            $longitude === false ||
            !is_finite((float) $latitude) ||
            !is_finite((float) $longitude) ||
            $latitude < -90 ||
            $latitude > 90 ||
            $longitude < -180 ||
            $longitude > 180
        ) {
            $this->rejeitarLocalizacao(
                $conn,
                $membroId,
                'As coordenadas recebidas não são válidas.'
            );
            return;
        }

        if (
            $accuracy === false ||
            !is_finite((float) $accuracy) ||
            $accuracy <= 0 ||
            $accuracy > self::PRECISAO_MAXIMA_METROS
        ) {
            $this->rejeitarLocalizacao(
                $conn,
                $membroId,
                sprintf(
                    'A precisão da localização tem de ser igual ou inferior a %d metros.',
                    (int) self::PRECISAO_MAXIMA_METROS
                )
            );
            return;
        }

        /*
         * Esta âncora antiabuso é separada da localização usada na descoberta.
         * Não desaparece ao fechar/reabrir uma ligação ou ao forçar um frame
         * inválido, evitando que o cliente reinicie o controlo de velocidade.
         */
        $localizacaoAnterior = $this->guardasLocalizacao[$membroId] ?? null;

        if ($localizacaoAnterior !== null) {
            $intervalo = $agoraPreciso - (float) ($localizacaoAnterior['received_at'] ?? 0.0);

            if ($intervalo > 0 && $intervalo <= self::GUARDA_LOCALIZACAO_SEGUNDOS) {
                $distancia = $this->calcularDistanciaMetros(
                    (float) $localizacaoAnterior['latitude'],
                    (float) $localizacaoAnterior['longitude'],
                    (float) $latitude,
                    (float) $longitude
                );
                $distanciaAjustada = max(
                    0.0,
                    $distancia -
                    (float) ($localizacaoAnterior['accuracy'] ?? 0.0) -
                    (float) $accuracy
                );

                if (
                    ($distanciaAjustada / $intervalo) >
                    self::VELOCIDADE_MAXIMA_METROS_SEGUNDO
                ) {
                    $this->rejeitarLocalizacao(
                        $conn,
                        $membroId,
                        'Foi detetado um salto de localização incompatível com a descoberta local.'
                    );
                    return;
                }
            }
        }

        $this->localizacoes[$membroId] = [
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy' => (float) $accuracy,
            'updated_at' => time(),
            'received_at' => $agoraPreciso,
            'resource_id' => $conn->resourceId
        ];
        $this->guardasLocalizacao[$membroId] = [
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy' => (float) $accuracy,
            'received_at' => $agoraPreciso
        ];
        $this->ultimaLocalizacaoPorLigacao[$conn->resourceId] = $agoraPreciso;

        $this->registarDebug('[LOCATION] Localização válida atualizada.');

        $this->enviar($conn, [
            'type' => 'location_received',
            'updated_at' => $this->localizacoes[$membroId]['updated_at']
        ]);

        $this->enviarEstadosIndividuais();
    }

    private function rejeitarLocalizacao(
        ConnectionInterface $conn,
        string $membroId,
        string $mensagem
    ): void
    {
        $localizacaoAtual = $this->localizacoes[$membroId] ?? null;

        if ($localizacaoAtual === null) {
            unset($this->localizacoes[$membroId]);
        } elseif (
            ($localizacaoAtual['resource_id'] ?? null) === $conn->resourceId
        ) {
            $this->invalidarLocalizacaoDaLigacao(
                $conn->resourceId,
                $membroId
            );
        }

        $this->enviar($conn, [
            'type' => 'location_rejected',
            'message' => $mensagem
        ]);
        $this->enviarEstadosIndividuais();
    }

    private function notificarPessoa(ConnectionInterface $from, array $data): void
    {
        $remetenteId = $this->obterMembroDaLigacao($from);
        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));
        $falhar = function (string $mensagem) use (
            $from,
            $destinatarioId
        ): void {
            $this->enviar($from, [
                'type' => 'notification_not_delivered',
                'destinatario_id' => $destinatarioId,
                'message' => $mensagem
            ]);
        };

        if ($remetenteId === null) {
            $falhar('Tens de estar autenticado para enviar um Hey.');
            return;
        }

        $remetente = $this->obterPessoaParaInteracao($remetenteId);

        if (
            !$remetente ||
            $destinatarioId === '' ||
            strlen($destinatarioId) > 64
        ) {
            $falhar('O destinatário não é válido.');
            return;
        }

        if ($destinatarioId === $remetenteId) {
            $falhar('Não podes enviar um Hey para ti próprio.');
            return;
        }

        if (!$this->membrosContinuamAtivos([$remetenteId, $destinatarioId])) {
            $falhar('Esta interação já não está disponível.');
            return;
        }

        if ($this->membrosEstaoBloqueados($remetenteId, $destinatarioId)) {
            $falhar('Já não podes interagir com esta pessoa.');
            $this->enviarEstadosIndividuais();
            return;
        }

        if (!$this->estaoDentroDoRaio($remetenteId, $destinatarioId)) {
            $falhar('Esta pessoa já não está disponível num raio de 100 metros.');
            $this->enviarEstadosIndividuais();
            return;
        }

        $ligacoesDestinatario = $this->ligacoesPorMembro[$destinatarioId] ?? [];
        $destinatario = $this->pessoas[$destinatarioId] ?? null;

        if ($ligacoesDestinatario === []) {
            $falhar('O utilizador não está ligado neste momento.');
            return;
        }

        if (!$destinatario) {
            $falhar('O destinatário já não está disponível.');
            return;
        }

        if (
            !RateLimiter::allow('websocket_hey_minuto', $remetenteId, 3, 60) ||
            !RateLimiter::allow('websocket_hey_hora', $remetenteId, 20, 3600) ||
            !$this->heyDentroDosLimitesPersistentes($remetenteId, $destinatarioId)
        ) {
            $falhar(
                'Enviaste Heys demasiado depressa. Espera um pouco antes de tentar novamente.'
            );
            return;
        }

        $notificacaoId = $this->guardarNotificacao($remetenteId, $destinatarioId);
        $numeroEntregas = 0;

        foreach ($ligacoesDestinatario as $client) {
            $this->enviar($client, [
                'type' => 'notification',
                'notification_id' => $notificacaoId,
                'notification_type' => 'hey',
                'title' => 'Recebeste um Hey!',
                'body' => sprintf(
                    '%s enviou-te um Hey.',
                    (string) ($remetente['nome'] ?? 'Alguém')
                ),
                'from_member_id' => $remetenteId,
                'from_name' => (string) ($remetente['nome'] ?? 'Alguém'),
                'from_photo' => (string) ($remetente['src'] ?? '/imagens/fotos-perfil/default.webp'),
                'created_at' => gmdate('c')
            ]);

            $numeroEntregas++;
        }

        $this->enviar($from, [
            'type' => 'notification_sent',
            'notification_id' => $notificacaoId,
            'destinatario_id' => $destinatarioId,
            'destinatario_nome' => (string) ($destinatario['nome'] ?? 'A outra pessoa'),
            'destinatario_foto' => (string) ($destinatario['src'] ?? '/imagens/fotos-perfil/default.webp'),
            'deliveries' => $numeroEntregas,
            'message' => sprintf(
                '%s recebeu o teu Hey.',
                (string) ($destinatario['nome'] ?? 'A outra pessoa')
            )
        ]);

        $this->registarDebug(sprintf(
            '[HEY] Hey entregue em %d ligação(ões).',
            $numeroEntregas
        ));
    }

    private function heyDentroDosLimitesPersistentes(
        string $emissorId,
        string $destinatarioId
    ): bool
    {
        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare(
                "SELECT
                    SUM(criada_em >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)) AS ultimo_minuto,
                    COUNT(*) AS ultima_hora,
                    SUM(
                        destinatario_id = :destinatario_id
                        AND criada_em >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
                    ) AS mesmo_destinatario
                 FROM notificacao
                 WHERE emissor_id = :emissor_id
                 AND tipo = 'hey'
                 AND criada_em >= DATE_SUB(NOW(), INTERVAL 1 HOUR)"
            );
            $statement->execute([
                'destinatario_id' => $destinatarioId,
                'emissor_id' => $emissorId
            ]);
            $limites = $statement->fetch(PDO::FETCH_ASSOC) ?: [];

            return
                (int) ($limites['ultimo_minuto'] ?? 0) < 3 &&
                (int) ($limites['ultima_hora'] ?? 0) < 20 &&
                (int) ($limites['mesmo_destinatario'] ?? 0) < 1;
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function guardarNotificacao(string $emissorId, string $destinatarioId): int
    {
        $sql = "
            INSERT INTO notificacao (
                emissor_id,
                destinatario_id,
                tipo,
                lida,
                criada_em
            )
            SELECT
                emissor.id,
                destinatario.id,
                'hey',
                0,
                NOW()
            FROM membros AS emissor
            INNER JOIN membros AS destinatario
                ON destinatario.id = :destinatario_id
               AND destinatario.estado = 'ativo'
            WHERE emissor.id = :emissor_id
            AND emissor.estado = 'ativo'
            LIMIT 1
        ";

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare($sql);

            $statement->execute([
                'emissor_id' => $emissorId,
                'destinatario_id' => $destinatarioId
            ]);

            if ($statement->rowCount() !== 1) {
                throw new \RuntimeException('A interação deixou de estar disponível.');
            }

            return (int) $database->lastInsertId();
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function publicarMensagemChat(ConnectionInterface $from, array $data): void
    {
        $membroId = $this->obterMembroDaLigacao($from);
        $mensagemId = filter_var($data['message_id'] ?? null, FILTER_VALIDATE_INT);

        if ($membroId === null) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'A ligação não está autenticada.'
            ]);
            return;
        }

        if ($mensagemId === false || $mensagemId < 1) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'A mensagem não é válida.'
            ]);
            return;
        }

        $sql = "
            SELECT
                msg.id,
                msg.emissor_id,
                msg.destinatario_id,
                msg.texto,
                msg.tipo,
                msg.ficheiro_nome,
                msg.ficheiro_mime,
                msg.ficheiro_tamanho,
                msg.lida,
                msg.criada_em,
                msg.lida_em,
                CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS emissor_nome,
                (
                    SELECT fp.id
                    FROM fotos_perfil fp
                    WHERE fp.membro_id COLLATE utf8mb4_unicode_ci =
                          m.id COLLATE utf8mb4_unicode_ci
                    AND fp.status = 'completo'
                    ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
                    LIMIT 1
                ) AS emissor_foto_id
            FROM mensagens_chat msg
            INNER JOIN membros m
                ON m.id COLLATE utf8mb4_unicode_ci =
                   msg.emissor_id COLLATE utf8mb4_unicode_ci
               AND m.estado = 'ativo'
            INNER JOIN membros destinatario
                ON destinatario.id COLLATE utf8mb4_unicode_ci =
                   msg.destinatario_id COLLATE utf8mb4_unicode_ci
               AND destinatario.estado = 'ativo'
            WHERE msg.id = :id
            LIMIT 1
        ";

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare($sql);
            $statement->execute(['id' => $mensagemId]);
            $mensagem = $statement->fetch(PDO::FETCH_ASSOC);
        } finally {
            $statement = null;
            $database = null;
        }

        if (!$mensagem || (string) $mensagem['emissor_id'] !== $membroId) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'Não podes publicar esta mensagem.'
            ]);
            return;
        }

        if ($this->membrosEstaoBloqueados(
            (string) $mensagem['emissor_id'],
            (string) $mensagem['destinatario_id']
        )) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'Esta conversa já não está disponível.'
            ]);
            return;
        }

        $ficheiro = basename(trim((string) ($mensagem['ficheiro_nome'] ?? '')));
        $fotoId = trim((string) ($mensagem['emissor_foto_id'] ?? ''));

        $mensagem['id'] = (int) $mensagem['id'];
        $mensagem['lida'] = (bool) $mensagem['lida'];
        $mensagem['texto'] = (string) ($mensagem['texto'] ?? '');
        $mensagem['media_url'] = $ficheiro === ''
            ? null
            : '/message-media/' . rawurlencode((string) $mensagem['id']);
        $mensagem['emissor_foto_url'] = $this->urlFotoPerfil($fotoId);
        $mensagem['emissor_perfil_url'] = '/profile/' . rawurlencode((string) $mensagem['emissor_id']);

        unset($mensagem['ficheiro_nome'], $mensagem['emissor_foto_id']);

        $participantes = array_unique([
            (string) $mensagem['emissor_id'],
            (string) $mensagem['destinatario_id']
        ]);

        foreach ($participantes as $participanteId) {
            $naoLidas = $this->contarMensagensNaoLidas($participanteId);

            foreach ($this->ligacoesPorMembro[$participanteId] ?? [] as $ligacao) {
                $this->enviar($ligacao, [
                    'type' => 'chat_message',
                    'message' => $mensagem,
                    'unread_count' => $naoLidas
                ]);
            }
        }

        $this->registarDebug('[CHAT] Mensagem de conversa publicada.');
    }

    private function marcarMensagensChatComoLidas(ConnectionInterface $from, array $data): void
    {
        $leitorId = $this->obterMembroDaLigacao($from);
        $outroId = trim((string) ($data['with_member_id'] ?? ''));

        if ($leitorId === null || $outroId === '' || $outroId === $leitorId) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'A conversa não é válida.'
            ]);
            return;
        }

        if ($this->membrosEstaoBloqueados($leitorId, $outroId)) {
            $this->enviar($from, [
                'type' => 'chat_error',
                'message' => 'Esta conversa já não está disponível.'
            ]);
            return;
        }

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();

            $statement = $database->prepare("
                UPDATE mensagens_chat
                SET lida = 1, lida_em = COALESCE(lida_em, NOW(6))
                WHERE emissor_id = :outro
                AND destinatario_id = :leitor
                AND lida = 0
            ");

            $statement->execute([
                'outro' => $outroId,
                'leitor' => $leitorId
            ]);

            $statement = $database->prepare("
                SELECT COALESCE(MAX(id), 0)
                FROM mensagens_chat
                WHERE emissor_id = :outro
                AND destinatario_id = :leitor
                AND lida = 1
            ");

            $statement->execute([
                'outro' => $outroId,
                'leitor' => $leitorId
            ]);

            $ultimaMensagemId = (int) $statement->fetchColumn();
        } finally {
            $statement = null;
            $database = null;
        }

        foreach ($this->ligacoesPorMembro[$outroId] ?? [] as $ligacao) {
            $this->enviar($ligacao, [
                'type' => 'chat_messages_read',
                'reader_id' => $leitorId,
                'last_message_id' => $ultimaMensagemId
            ]);
        }

        foreach ($this->ligacoesPorMembro[$leitorId] ?? [] as $ligacao) {
            $this->enviarContadorMensagens($ligacao, $leitorId);
        }
    }

    private function contarMensagensNaoLidas(string $membroId): int
    {
        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();

            $statement = $database->prepare("
                SELECT COUNT(*)
                FROM mensagens_chat
                WHERE destinatario_id = :id
                AND lida = 0
                AND NOT EXISTS (
                    SELECT 1
                    FROM bloqueados b
                    WHERE (
                        b.pessoa_bloqueou_id = :id_bloqueio1
                        AND b.pessoa_bloqueada_id = mensagens_chat.emissor_id
                    ) OR (
                        b.pessoa_bloqueou_id = mensagens_chat.emissor_id
                        AND b.pessoa_bloqueada_id = :id_bloqueio2
                    )
                )
            ");

            $statement->execute([
                'id' => $membroId,
                'id_bloqueio1' => $membroId,
                'id_bloqueio2' => $membroId
            ]);

            return (int) $statement->fetchColumn();
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function enviarContadorMensagens(ConnectionInterface $conn, string $membroId): void
    {
        $this->enviar($conn, [
            'type' => 'chat_unread_count',
            'unread_count' => $this->contarMensagensNaoLidas($membroId)
        ]);
    }

    private function enviarEstadosIndividuais(): void
    {
        $bloqueiosDisponiveis = true;

        try {
            $this->carregarBloqueios();
        } catch (\Throwable $erro) {
            $bloqueiosDisponiveis = false;
            $this->registarErro('block_cache', $erro);
        }

        $agora = time();

        foreach ($this->clients as $client) {
            $membroId = $this->membroPorLigacao[$client->resourceId] ?? null;

            if ($membroId === null) continue;

            $localizacaoAtiva = $this->localizacaoPorLigacao[$client->resourceId] ?? false;
            $ligacaoVisivel = $this->visibilidadePorLigacao[$client->resourceId] ?? false;
            $pessoasVisiveis = [];
            $minhaLocalizacao = $this->localizacoes[$membroId] ?? null;
            $minhaLocalizacaoValida =
                $localizacaoAtiva &&
                $this->localizacaoEstaValida($minhaLocalizacao, $agora);

            if ($minhaLocalizacaoValida) {
                foreach ($this->pessoas as $outroMembroId => $pessoa) {
                    if ($outroMembroId === $membroId) {
                        if ($ligacaoVisivel) {
                            $pessoasVisiveis[] = $this->prepararPessoaParaCliente($pessoa);
                        }
                        continue;
                    }

                    if (!$bloqueiosDisponiveis) continue;
                    if ($this->membrosEstaoBloqueadosNoCache($membroId, $outroMembroId)) continue;

                    $outraLocalizacao = $this->localizacoes[$outroMembroId] ?? null;

                    if (!$this->localizacaoEstaValida($outraLocalizacao, $agora)) continue;

                    $distancia = $this->calcularDistanciaMetros(
                        (float) $minhaLocalizacao['latitude'],
                        (float) $minhaLocalizacao['longitude'],
                        (float) $outraLocalizacao['latitude'],
                        (float) $outraLocalizacao['longitude']
                    );

                    if ($distancia > self::RAIO_MAXIMO_METROS) continue;

                    try {
                        $proximityToken = InteractionPolicy::issueProximityToken(
                            $membroId,
                            $outroMembroId,
                            $this->proximitySecret,
                            self::PROXIMIDADE_TOKEN_TTL_SEGUNDOS
                        );
                    } catch (\Throwable $erro) {
                        $this->registarErro('proximity_token', $erro);
                        continue;
                    }

                    $pessoasVisiveis[] = $this->prepararPessoaParaCliente(
                        $pessoa,
                        $proximityToken
                    );
                }
            }

            $this->enviar($client, [
                'type' => 'state',
                'radius_m' => self::RAIO_MAXIMO_METROS,
                'map_presence' => $ligacaoVisivel,
                'location_filter_active' => $minhaLocalizacaoValida,
                'people' => $pessoasVisiveis
            ]);
        }

        $this->registarDebug(sprintf(
            '[STATE] Estados enviados para %d ligação(ões).',
            count($this->clients)
        ));
    }

    private function estaoDentroDoRaio(string $primeiroMembroId, string $segundoMembroId): bool
    {
        $agora = time();
        $primeira = $this->localizacoes[$primeiroMembroId] ?? null;
        $segunda = $this->localizacoes[$segundoMembroId] ?? null;

        if (
            !$this->localizacaoEstaValida($primeira, $agora) ||
            !$this->localizacaoEstaValida($segunda, $agora)
        ) {
            return false;
        }

        if (!isset($this->pessoas[$segundoMembroId])) return false;

        return $this->calcularDistanciaMetros(
            (float) $primeira['latitude'],
            (float) $primeira['longitude'],
            (float) $segunda['latitude'],
            (float) $segunda['longitude']
        ) <= self::RAIO_MAXIMO_METROS;
    }

    private function localizacaoEstaValida(?array $localizacao, int $agora): bool
    {
        if ($localizacao === null) return false;

        $atualizadaEm = (int) ($localizacao['updated_at'] ?? 0);
        $idade = $agora - $atualizadaEm;
        $precisao = (float) ($localizacao['accuracy'] ?? 0.0);

        return
            $atualizadaEm > 0 &&
            $idade >= 0 &&
            $idade <= self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS &&
            is_finite($precisao) &&
            $precisao > 0 &&
            $precisao <= self::PRECISAO_MAXIMA_METROS;
    }

    private function calcularDistanciaMetros(
        float $latitude1,
        float $longitude1,
        float $latitude2,
        float $longitude2
    ): float {
        $raioTerra = 6371000;
        $latitude1Rad = deg2rad($latitude1);
        $latitude2Rad = deg2rad($latitude2);
        $diferencaLatitude = deg2rad($latitude2 - $latitude1);
        $diferencaLongitude = deg2rad($longitude2 - $longitude1);

        $a =
            sin($diferencaLatitude / 2) ** 2 +
            cos($latitude1Rad) *
            cos($latitude2Rad) *
            sin($diferencaLongitude / 2) ** 2;

        $a = min(1.0, max(0.0, $a));
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $raioTerra * $c;
    }

    private function removerLocalizacoesExpiradas(): bool
    {
        $agora = time();
        $removeu = false;

        foreach ($this->localizacoes as $membroId => $localizacao) {
            if ($this->localizacaoEstaValida($localizacao, $agora)) continue;

            unset($this->localizacoes[$membroId]);
            $removeu = true;
        }

        $agoraPreciso = microtime(true);

        foreach ($this->guardasLocalizacao as $membroId => $guarda) {
            $idade = $agoraPreciso - (float) ($guarda['received_at'] ?? 0.0);

            if ($idade >= 0 && $idade <= self::GUARDA_LOCALIZACAO_SEGUNDOS) {
                continue;
            }

            unset($this->guardasLocalizacao[$membroId]);
        }

        return $removeu;
    }

    private function revalidarPreferenciasDeLigacoes(): void
    {
        $membroIds = array_keys($this->ligacoesPorMembro);

        if ($membroIds === []) return;

        $argumentos = [];
        $placeholders = [];

        foreach (array_values($membroIds) as $indice => $membroId) {
            $chave = 'preferencia_membro_' . $indice;
            $placeholders[] = ':' . $chave;
            $argumentos[$chave] = $membroId;
        }

        $sql = "
            SELECT
                m.id AS membro_id,
                CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                COALESCE(pp.localizacao_ativa, 0) AS localizacao_ativa,
                COALESCE(pp.invisivel, 0) AS invisivel,
                (
                    SELECT fp.id
                    FROM fotos_perfil AS fp
                    WHERE fp.membro_id COLLATE utf8mb4_unicode_ci =
                          m.id COLLATE utf8mb4_unicode_ci
                    AND fp.status = 'completo'
                    ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
                    LIMIT 1
                ) AS foto_id
            FROM membros AS m
            LEFT JOIN preferencias_privacidade AS pp
                ON pp.membro_id = m.id
            WHERE m.estado = 'ativo'
            AND m.id IN (" . implode(', ', $placeholders) . ')
        ';

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare($sql);
            $statement->execute($argumentos);
            $membros = [];

            foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $membro) {
                $membroId = trim((string) ($membro['membro_id'] ?? ''));

                if ($membroId !== '') {
                    $membros[$membroId] = $membro;
                }
            }
        } finally {
            $statement = null;
            $database = null;
        }

        $estadoAlterado = false;

        foreach ($membroIds as $membroId) {
            $membro = $membros[$membroId] ?? [
                'membro_id' => $membroId,
                'localizacao_ativa' => 0,
                'invisivel' => 1,
                'foto_id' => null,
                'nome' => ''
            ];

            if (
                $this->aplicarPreferenciasDoServidorAoMembro(
                    $membroId,
                    $membro
                )
            ) {
                $estadoAlterado = true;
            }
        }

        if ($estadoAlterado) {
            $this->registarDebug(
                '[PRIVACY] Preferências de presença revalidadas.'
            );
            $this->enviarEstadosIndividuais();
        }
    }

    private function membrosContinuamAtivos(array $membroIds): bool
    {
        $membroIds = array_values(array_unique(array_filter(
            array_map(
                static fn ($id): string => trim((string) $id),
                $membroIds
            ),
            static fn (string $id): bool => $id !== '' && strlen($id) <= 64
        )));

        if ($membroIds === []) return false;

        return count($this->obterMembrosAtivos($membroIds)) === count($membroIds);
    }

    private function obterMembrosAtivos(array $membroIds): array
    {
        $argumentos = [];
        $placeholders = [];

        foreach (array_values($membroIds) as $indice => $membroId) {
            $chave = 'membro_' . $indice;
            $placeholders[] = ':' . $chave;
            $argumentos[$chave] = (string) $membroId;
        }

        if ($placeholders === []) return [];

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare(
                "SELECT id, auth_version
                 FROM membros
                 WHERE estado = 'ativo'
                 AND id IN (" . implode(', ', $placeholders) . ')'
            );
            $statement->execute($argumentos);

            $ativos = [];

            foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $membro) {
                $membroId = trim((string) ($membro['id'] ?? ''));

                if ($membroId !== '') {
                    $ativos[$membroId] =
                        (int) ($membro['auth_version'] ?? 0);
                }
            }

            return $ativos;
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function terminarLigacoesDeMembrosInativos(): void
    {
        $membroIds = array_keys($this->ligacoesPorMembro);

        if ($membroIds === []) return;

        $ativos = $this->obterMembrosAtivos($membroIds);
        $ligacoesATerminar = [];

        foreach ($membroIds as $membroId) {
            if (!isset($ativos[$membroId])) {
                unset($this->pessoas[$membroId], $this->localizacoes[$membroId]);
                $this->cancelarSaidaAgendada($membroId);
            }

            foreach (
                $this->ligacoesPorMembro[$membroId] ?? []
                as $resourceId => $ligacao
            ) {
                if (
                    !isset($ativos[$membroId]) ||
                    (int) ($this->authVersionPorLigacao[$resourceId] ?? 0) !==
                        (int) $ativos[$membroId]
                ) {
                    $ligacoesATerminar[] = $ligacao;
                }
            }
        }

        if ($ligacoesATerminar === []) return;

        foreach ($ligacoesATerminar as $ligacao) {
            $this->enviarErro(
                $ligacao,
                'A sessão desta ligação deixou de ser válida.'
            );
            $ligacao->close(1008);
        }

        $this->registarDebug(sprintf(
            '[ACCOUNT] %d ligação(ões) inválida(s) desligada(s).',
            count($ligacoesATerminar)
        ));
        $this->enviarEstadosIndividuais();
    }

    private function urlFotoPerfil(
        string $fotoId,
        ?string $proximityToken = null
    ): string
    {
        if ($fotoId === '') return '/imagens/fotos-perfil/default.webp';

        $url = '/profile-photo/' . rawurlencode($fotoId) . '?size=thumb';

        if ($proximityToken !== null && $proximityToken !== '') {
            $url .= '&proximity_token=' . rawurlencode($proximityToken);
        }

        return $url;
    }

    private function prepararPessoaParaCliente(
        array $pessoa,
        ?string $proximityToken = null
    ): array
    {
        $pessoa['src'] = $this->urlFotoPerfil(
            trim((string) ($pessoa['foto_id'] ?? '')),
            $proximityToken
        );

        if ($proximityToken !== null && $proximityToken !== '') {
            $pessoa['proximity_token'] = $proximityToken;
        } else {
            unset($pessoa['proximity_token']);
        }

        unset($pessoa['foto_id']);

        return $pessoa;
    }

    public function onClose(ConnectionInterface $conn): void
    {
        if ($this->clients->contains($conn)) $this->clients->detach($conn);

        $this->cancelarTimeoutAutenticacao($conn->resourceId);
        unset($this->ultimaLocalizacaoPorLigacao[$conn->resourceId]);

        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId !== null) $this->removerLigacaoDoMembro($conn, $membroId);

        $this->registarDebug(sprintf(
            '[CLOSE] Ligação fechada. Pessoas: %d. Ligações: %d.',
            count($this->pessoas),
            count($this->clients)
        ));

        $this->enviarEstadosIndividuais();
    }

    private function removerLigacaoDoMembro(ConnectionInterface $conn, string $membroId): void
    {
        unset(
            $this->membroPorLigacao[$conn->resourceId],
            $this->authVersionPorLigacao[$conn->resourceId],
            $this->localizacaoSolicitadaPorLigacao[$conn->resourceId],
            $this->visibilidadeSolicitadaPorLigacao[$conn->resourceId],
            $this->localizacaoPorLigacao[$conn->resourceId],
            $this->visibilidadePorLigacao[$conn->resourceId],
            $this->ligacoesPorMembro[$membroId][$conn->resourceId]
        );

        $this->invalidarLocalizacaoDaLigacao(
            $conn->resourceId,
            $membroId
        );

        if (empty($this->ligacoesPorMembro[$membroId])) {
            unset($this->ligacoesPorMembro[$membroId]);
        }

        if (
            !$this->membroTemLigacaoVisivel($membroId) ||
            !$this->membroTemLigacaoComLocalizacaoAtiva($membroId)
        ) {
            $this->agendarSaida($membroId);
        }
    }

    private function membroTemLigacaoVisivel(string $membroId): bool
    {
        foreach ($this->ligacoesPorMembro[$membroId] ?? [] as $resourceId => $ligacao) {
            if ($this->visibilidadePorLigacao[$resourceId] ?? false) return true;
        }

        return false;
    }

    private function membroTemLigacaoComLocalizacaoAtiva(string $membroId): bool
    {
        foreach ($this->ligacoesPorMembro[$membroId] ?? [] as $resourceId => $ligacao) {
            if ($this->localizacaoPorLigacao[$resourceId] ?? false) return true;
        }

        return false;
    }

    private function invalidarLocalizacaoDaLigacao(
        int $resourceId,
        string $membroId
    ): bool {
        $localizacao = $this->localizacoes[$membroId] ?? null;

        if (
            !is_array($localizacao) ||
            (int) ($localizacao['resource_id'] ?? 0) !== $resourceId
        ) {
            return false;
        }

        unset($this->localizacoes[$membroId]);

        foreach (
            $this->ligacoesPorMembro[$membroId] ?? []
            as $outroResourceId => $ligacao
        ) {
            if (
                (int) $outroResourceId === $resourceId ||
                !($this->localizacaoPorLigacao[$outroResourceId] ?? false)
            ) {
                continue;
            }

            $this->enviar($ligacao, [
                'type' => 'location_refresh_required'
            ]);
        }

        return true;
    }

    private function agendarSaida(string $membroId): void
    {
        $this->cancelarSaidaAgendada($membroId);

        $this->temporizadoresSaida[$membroId] = $this->loop->addTimer(
            self::TOLERANCIA_NAVEGACAO_SEGUNDOS,
            function () use ($membroId): void {
                unset($this->temporizadoresSaida[$membroId]);

                $removeuPessoa = false;
                $removeuLocalizacao = false;

                if (!$this->membroTemLigacaoVisivel($membroId)) {
                    $removeuPessoa = isset($this->pessoas[$membroId]);
                    unset($this->pessoas[$membroId]);
                }

                if (!$this->membroTemLigacaoComLocalizacaoAtiva($membroId)) {
                    $removeuLocalizacao = isset($this->localizacoes[$membroId]);
                    unset($this->localizacoes[$membroId]);
                }

                if (!$removeuPessoa && !$removeuLocalizacao) return;

                $this->registarDebug(sprintf(
                    '[OFFLINE] Presença removida após tolerância. Pessoas: %d.',
                    count($this->pessoas)
                ));

                $this->enviarEstadosIndividuais();
            }
        );
    }

    private function cancelarSaidaAgendada(string $membroId): void
    {
        $temporizador = $this->temporizadoresSaida[$membroId] ?? null;

        if (!$temporizador instanceof TimerInterface) return;

        $this->loop->cancelTimer($temporizador);

        unset($this->temporizadoresSaida[$membroId]);
    }

    private function cancelarTimeoutAutenticacao(int $resourceId): void
    {
        $temporizador = $this->temporizadoresAutenticacao[$resourceId] ?? null;

        if (!$temporizador instanceof TimerInterface) return;

        $this->loop->cancelTimer($temporizador);
        unset($this->temporizadoresAutenticacao[$resourceId]);
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void
    {
        $this->registarErro('connection', $e);
        $conn->close();
    }

    private function obterMembroDaLigacao(ConnectionInterface $conn): ?string
    {
        return $this->membroPorLigacao[$conn->resourceId] ?? null;
    }

    private function enviarErro(ConnectionInterface $conn, string $mensagem): void
    {
        $this->enviar($conn, [
            'type' => 'error',
            'message' => $mensagem
        ]);
    }

    private function enviar(ConnectionInterface $conn, array $data): void
    {
        try {
            $conn->send(json_encode(
                $data,
                JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_THROW_ON_ERROR
            ));
        } catch (\Throwable $erro) {
            $this->registarErro('send', $erro);
        }
    }

    private function registarDebug(string $mensagem): void
    {
        if (!defined('DEV') || DEV !== true) return;

        echo '[websocket] ' . $mensagem . PHP_EOL;
    }

    private function registarErro(string $evento, \Throwable $erro): void
    {
        $mensagem = '[websocket][' . preg_replace(
            '/[^a-z0-9_-]/i',
            '-',
            $evento
        ) . ']';

        if (defined('DEV') && DEV === true) {
            $mensagem .= ' ' . get_class($erro) . ': ' . $erro->getMessage();
        }

        error_log($mensagem);
    }

    private function lerBooleano(array $data, string $chave, bool $padrao): bool
    {
        if (!array_key_exists($chave, $data)) return $padrao;

        $valor = filter_var($data[$chave], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $valor ?? $padrao;
    }

    private function mensagemDentroDoLimite(
        ConnectionInterface $conn,
        string $tipo,
        ?string $membroId
    ): bool
    {
        $chave = $membroId !== null
            ? 'membro:' . $membroId
            : 'ligacao:' . (string) $conn->resourceId;

        if (!RateLimiter::allow('websocket_total', $chave, 120, 60)) {
            return false;
        }

        [$limite, $janela] = match ($tipo) {
            'auth' => [1, 10],
            'location' => [12, 60],
            'presence_update' => [12, 60],
            'notify' => [10, 60],
            'chat_publish' => [30, 60],
            'chat_read' => [60, 60],
            'block_refresh' => [10, 60],
            'ping' => [6, 60],
            default => [10, 60]
        };

        return RateLimiter::allow(
            'websocket_' . $tipo,
            $chave,
            $limite,
            $janela
        );
    }

    private function atualizarBloqueios(ConnectionInterface $conn, array $data): void
    {
        $membroId = $this->obterMembroDaLigacao($conn);
        $destinatarioId = trim((string) ($data['target_id'] ?? ''));

        if ($membroId === null) {
            $this->enviarErro($conn, 'A ligação não está autenticada.');
            return;
        }

        if ($destinatarioId === '' || $destinatarioId === $membroId) {
            $this->enviarErro($conn, 'O bloqueio indicado não é válido.');
            return;
        }

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->prepare("
                SELECT 1
                FROM bloqueados
                WHERE pessoa_bloqueou_id = :membro_id
                AND pessoa_bloqueada_id = :destinatario_id
                LIMIT 1
            ");

            $statement->execute([
                'membro_id' => $membroId,
                'destinatario_id' => $destinatarioId
            ]);

            if (!$statement->fetchColumn()) {
                $this->enviarErro($conn, 'O bloqueio ainda não foi registado.');
                return;
            }
        } finally {
            $statement = null;
            $database = null;
        }

        $this->carregarBloqueios(true);
        $this->enviarEstadosIndividuais();

        $this->registarDebug('[BLOCK] Cache de bloqueios atualizado.');
    }

    private function carregarBloqueios(bool $forcar = false): bool
    {
        $agora = time();

        if (!$forcar && ($agora - $this->bloqueiosCarregadosEm) < self::BLOQUEIOS_CACHE_SEGUNDOS) {
            return false;
        }

        $database = null;
        $statement = null;

        try {
            $database = $this->getDatabase();
            $statement = $database->query("
                SELECT pessoa_bloqueou_id, pessoa_bloqueada_id
                FROM bloqueados
                ORDER BY pessoa_bloqueou_id, pessoa_bloqueada_id
            ");

            $bloqueios = [];

            foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $bloqueio) {
                $primeiroId = trim((string) ($bloqueio['pessoa_bloqueou_id'] ?? ''));
                $segundoId = trim((string) ($bloqueio['pessoa_bloqueada_id'] ?? ''));

                if ($primeiroId === '' || $segundoId === '' || $primeiroId === $segundoId) continue;

                $bloqueios[$primeiroId][$segundoId] = true;
                $bloqueios[$segundoId][$primeiroId] = true;
            }

            ksort($bloqueios);

            foreach ($bloqueios as &$membrosBloqueados) {
                ksort($membrosBloqueados);
            }

            unset($membrosBloqueados);

            $assinatura = hash('sha256', serialize($bloqueios));
            $alterou = $assinatura !== $this->assinaturaBloqueios;

            $this->bloqueiosEntreMembros = $bloqueios;
            $this->assinaturaBloqueios = $assinatura;
            $this->bloqueiosCarregadosEm = $agora;

            return $alterou;
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function membrosEstaoBloqueados(string $primeiroId, string $segundoId): bool
    {
        try {
            $this->carregarBloqueios(true);
        } catch (\Throwable $erro) {
            $this->registarErro('block_cache', $erro);
            return true;
        }

        return $this->membrosEstaoBloqueadosNoCache($primeiroId, $segundoId);
    }

    private function membrosEstaoBloqueadosNoCache(string $primeiroId, string $segundoId): bool
    {
        return isset($this->bloqueiosEntreMembros[$primeiroId][$segundoId]);
    }
}
