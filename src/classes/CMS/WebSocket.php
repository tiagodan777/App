<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
use React\EventLoop\LoopInterface;
use React\EventLoop\TimerInterface;

class WebSocket implements MessageComponentInterface
{
    private const RAIO_MAXIMO_METROS = 150;
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS = 90;
    private const TOLERANCIA_NAVEGACAO_SEGUNDOS = 8.0;

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

    public function __construct(callable $pdoFactory, LoopInterface $loop)
    {
        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
        $this->loop = $loop;
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

                default:
                    $this->enviarErro($from, 'Tipo de mensagem desconhecido.');
            }
        } catch (\Throwable $erro) {
            echo sprintf(
                "[ERROR] Ligação %d: %s\n",
                $from->resourceId,
                $erro->getMessage()
            );

            $this->enviarErro($from, 'Não foi possível processar o pedido.');
        }
    }

    private function autenticarPessoa(ConnectionInterface $conn, array $data): void
    {
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

    private function obterMembro(string $membroId): array|false
    {
        $sql = "
            SELECT
                m.id AS membro_id,
                CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE fp.membro_id COLLATE utf8mb4_unicode_ci =
                              m.id COLLATE utf8mb4_unicode_ci
                        AND (fp.status = 'completo' OR fp.status IS NULL)
                        ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
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

        $localizacaoAtiva = $this->lerBooleano(
            $data,
            'location_enabled',
            $this->localizacaoPorLigacao[$resourceId] ?? true
        );

        $visivelSolicitado = $this->lerBooleano(
            $data,
            'map_presence',
            $this->visibilidadePorLigacao[$resourceId] ?? true
        );

        $visivel = $localizacaoAtiva && $visivelSolicitado;

        $this->localizacaoPorLigacao[$resourceId] = $localizacaoAtiva;
        $this->visibilidadePorLigacao[$resourceId] = $visivel;

        $this->cancelarSaidaAgendada($membroId);

        if (!$this->membroTemLigacaoComLocalizacaoAtiva($membroId)) {
            unset($this->localizacoes[$membroId]);
        }

        $this->sincronizarVisibilidadeMembro($membroId);

        $this->enviar($conn, [
            'type' => 'presence_updated',
            'location_enabled' => $localizacaoAtiva,
            'map_presence' => $visivel,
            'member_visible' => $this->membroTemLigacaoVisivel($membroId)
        ]);

        echo sprintf(
            "[PRESENCE] %s atualizou presença. Ligação %d: localização=%s, visível=%s.\n",
            $membroId,
            $resourceId,
            $localizacaoAtiva ? 'ativa' : 'inativa',
            $visivel ? 'sim' : 'não'
        );

        $this->enviarEstadosIndividuais();
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

        $foto = basename(trim((string) ($membro['foto_perfil'] ?? 'default.webp')));

        if ($foto === '') $foto = 'default.webp';

        $pessoaAtual = $this->pessoas[$membroId] ?? [];

        $this->pessoas[$membroId] = [
            'id' => $membroId,
            'membro_id' => $membroId,
            'nome' => trim((string) ($membro['nome'] ?? '')),
            'src' => '/imagens/fotos-perfil/' . rawurlencode($foto),
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

        $foto = basename(trim((string) ($membro['foto_perfil'] ?? 'default.webp')));

        if ($foto === '') $foto = 'default.webp';

        return [
            'id' => $membroId,
            'membro_id' => $membroId,
            'nome' => trim((string) ($membro['nome'] ?? '')),
            'src' => '/imagens/fotos-perfil/' . rawurlencode($foto)
        ];
    }

    private function atualizarLocalizacao(ConnectionInterface $conn, array $data): void
    {
        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId === null) {
            $this->enviarErro($conn, 'A ligação não está autenticada.');
            return;
        }

        if (!($this->localizacaoPorLigacao[$conn->resourceId] ?? false)) return;

        $latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $accuracy = filter_var($data['accuracy'] ?? 0, FILTER_VALIDATE_FLOAT);

        if (
            $latitude === false ||
            $longitude === false ||
            $latitude < -90 ||
            $latitude > 90 ||
            $longitude < -180 ||
            $longitude > 180
        ) {
            $this->enviarErro($conn, 'As coordenadas recebidas não são válidas.');
            return;
        }

        if ($accuracy === false || $accuracy < 0) $accuracy = 0;

        $this->localizacoes[$membroId] = [
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy' => min((float) $accuracy, 10000),
            'updated_at' => time()
        ];

        echo sprintf(
            "[LOCATION] %s atualizou localização. Precisão: %.1f m\n",
            $membroId,
            $this->localizacoes[$membroId]['accuracy']
        );

        $this->enviar($conn, [
            'type' => 'location_received',
            'updated_at' => $this->localizacoes[$membroId]['updated_at']
        ]);

        $this->enviarEstadosIndividuais();
    }

    private function moverPessoa(ConnectionInterface $conn, array $data): void
    {
        $membroId = $this->obterMembroDaLigacao($conn);

        if (
            $membroId === null ||
            !($this->visibilidadePorLigacao[$conn->resourceId] ?? false) ||
            !isset($this->pessoas[$membroId])
        ) return;

        $top = $this->limitarNumero((int) ($data['top'] ?? 0), -2000, 2000);
        $left = $this->limitarNumero((int) ($data['left'] ?? 0), -2000, 2000);

        if ($top === 0 && $left === 0) return;

        $this->pessoas[$membroId]['top'] += $top;
        $this->pessoas[$membroId]['left'] += $left;

        $this->enviarEstadosIndividuais();
    }

    private function notificarPessoa(ConnectionInterface $from, array $data): void
    {
        $remetenteId = $this->obterMembroDaLigacao($from);

        if ($remetenteId === null) {
            $this->enviarErro($from, 'Tens de estar autenticado para enviar um Hey.');
            return;
        }

        $remetente = $this->obterPessoaParaInteracao($remetenteId);
        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));

        if (!$remetente || $destinatarioId === '') {
            $this->enviarErro($from, 'O destinatário não é válido.');
            return;
        }

        if ($destinatarioId === $remetenteId) {
            $this->enviarErro($from, 'Não podes enviar um Hey para ti próprio.');
            return;
        }

        if (!$this->estaoDentroDoRaio($remetenteId, $destinatarioId)) {
            $this->enviarErro($from, 'Esta pessoa já não está num raio de 150 metros.');
            $this->enviarEstadosIndividuais();
            return;
        }

        $ligacoesDestinatario = $this->ligacoesPorMembro[$destinatarioId] ?? [];
        $destinatario = $this->pessoas[$destinatarioId] ?? null;

        if ($ligacoesDestinatario === []) {
            $this->enviar($from, [
                'type' => 'notification_not_delivered',
                'destinatario_id' => $destinatarioId,
                'message' => 'O utilizador não está ligado neste momento.'
            ]);
            return;
        }

        if (!$destinatario) {
            $this->enviarErro($from, 'O destinatário já não está disponível.');
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

        echo sprintf(
            "[HEY] %s enviou para %s. Entregas: %d\n",
            $remetenteId,
            $destinatarioId,
            $numeroEntregas
        );
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
            VALUES (
                :emissor_id,
                :destinatario_id,
                'hey',
                0,
                NOW()
            )
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
                COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil fp
                        WHERE fp.membro_id COLLATE utf8mb4_unicode_ci =
                              m.id COLLATE utf8mb4_unicode_ci
                        AND (fp.status = 'completo' OR fp.status IS NULL)
                        ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
                        LIMIT 1
                    ),
                    'default.webp'
                ) AS emissor_foto
            FROM mensagens_chat msg
            INNER JOIN membros m
                ON m.id COLLATE utf8mb4_unicode_ci =
                   msg.emissor_id COLLATE utf8mb4_unicode_ci
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

        $ficheiro = basename(trim((string) ($mensagem['ficheiro_nome'] ?? '')));
        $foto = basename(trim((string) ($mensagem['emissor_foto'] ?? 'default.webp')));

        if ($foto === '') $foto = 'default.webp';

        $mensagem['id'] = (int) $mensagem['id'];
        $mensagem['lida'] = (bool) $mensagem['lida'];
        $mensagem['texto'] = (string) ($mensagem['texto'] ?? '');
        $mensagem['media_url'] = $ficheiro === '' ? null : '/media/mensagens/' . rawurlencode($ficheiro);
        $mensagem['emissor_foto_url'] = '/imagens/fotos-perfil/' . rawurlencode($foto);
        $mensagem['emissor_perfil_url'] = '/profile/' . rawurlencode((string) $mensagem['emissor_id']);

        unset($mensagem['ficheiro_nome'], $mensagem['emissor_foto']);

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

        echo sprintf(
            "[CHAT] Mensagem %d publicada por %s para %s.\n",
            $mensagem['id'],
            $mensagem['emissor_id'],
            $mensagem['destinatario_id']
        );
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
            ");

            $statement->execute(['id' => $membroId]);

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
        $agora = time();

        foreach ($this->clients as $client) {
            if (!($this->localizacaoPorLigacao[$client->resourceId] ?? false)) continue;

            $membroId = $this->membroPorLigacao[$client->resourceId] ?? null;

            if ($membroId === null) continue;

            $ligacaoVisivel = $this->visibilidadePorLigacao[$client->resourceId] ?? false;
            $pessoasVisiveis = [];
            $minhaLocalizacao = $this->localizacoes[$membroId] ?? null;
            $minhaLocalizacaoValida = $this->localizacaoEstaValida($minhaLocalizacao, $agora);

            foreach ($this->pessoas as $outroMembroId => $pessoa) {
                if ($outroMembroId === $membroId) {
                    if (!$ligacaoVisivel) continue;

                    $pessoa['distance_m'] = 0;
                    $pessoasVisiveis[] = $pessoa;
                    continue;
                }

                $outraLocalizacao = $this->localizacoes[$outroMembroId] ?? null;
                $outraLocalizacaoValida = $this->localizacaoEstaValida($outraLocalizacao, $agora);

                if (!$minhaLocalizacaoValida || !$outraLocalizacaoValida) {
                    $pessoa['distance_m'] = null;
                    $pessoasVisiveis[] = $pessoa;
                    continue;
                }

                $distancia = $this->calcularDistanciaMetros(
                    $minhaLocalizacao['latitude'],
                    $minhaLocalizacao['longitude'],
                    $outraLocalizacao['latitude'],
                    $outraLocalizacao['longitude']
                );

                if ($distancia > self::RAIO_MAXIMO_METROS) continue;

                $pessoa['distance_m'] = (int) round($distancia);
                $pessoasVisiveis[] = $pessoa;
            }

            $this->enviar($client, [
                'type' => 'state',
                'radius_m' => self::RAIO_MAXIMO_METROS,
                'map_presence' => $ligacaoVisivel,
                'location_filter_active' => $minhaLocalizacaoValida,
                'people' => $pessoasVisiveis
            ]);
        }

        echo sprintf(
            "[STATE] Estados individuais enviados para %d ligação(ões)\n",
            count($this->clients)
        );
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
            return isset(
                $this->pessoas[$primeiroMembroId],
                $this->pessoas[$segundoMembroId]
            );
        }

        return $this->calcularDistanciaMetros(
            $primeira['latitude'],
            $primeira['longitude'],
            $segunda['latitude'],
            $segunda['longitude']
        ) <= self::RAIO_MAXIMO_METROS;
    }

    private function localizacaoEstaValida(?array $localizacao, int $agora): bool
    {
        if ($localizacao === null) return false;

        return ($agora - (int) ($localizacao['updated_at'] ?? 0)) <= self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS;
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

    public function onClose(ConnectionInterface $conn): void
    {
        if ($this->clients->contains($conn)) $this->clients->detach($conn);

        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId !== null) $this->removerLigacaoDoMembro($conn, $membroId);

        echo sprintf(
            "[CLOSE] Ligação %d fechada. Pessoas: %d. Ligações: %d\n",
            $conn->resourceId,
            count($this->pessoas),
            count($this->clients)
        );

        $this->enviarEstadosIndividuais();
    }

    private function removerLigacaoDoMembro(ConnectionInterface $conn, string $membroId): void
    {
        unset(
            $this->membroPorLigacao[$conn->resourceId],
            $this->localizacaoPorLigacao[$conn->resourceId],
            $this->visibilidadePorLigacao[$conn->resourceId],
            $this->ligacoesPorMembro[$membroId][$conn->resourceId]
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

                echo sprintf(
                    "[OFFLINE] %s atualizado após o período de tolerância. Pessoas: %d\n",
                    $membroId,
                    count($this->pessoas)
                );

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

    public function onError(ConnectionInterface $conn, \Exception $e): void
    {
        echo sprintf(
            "[CONNECTION ERROR] Ligação %d: %s\n",
            $conn->resourceId,
            $e->getMessage()
        );

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
            echo sprintf(
                "[SEND ERROR] Ligação %d: %s\n",
                $conn->resourceId,
                $erro->getMessage()
            );
        }
    }

    private function lerBooleano(array $data, string $chave, bool $padrao): bool
    {
        if (!array_key_exists($chave, $data)) return $padrao;

        $valor = filter_var($data[$chave], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $valor ?? $padrao;
    }

    private function limitarNumero(int $numero, int $minimo, int $maximo): int
    {
        return max($minimo, min($maximo, $numero));
    }
}