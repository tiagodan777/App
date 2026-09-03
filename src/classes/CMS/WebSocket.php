<?php

declare(strict_types=1);

namespace App\CMS;

use App\Validate\Validate;
use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
use React\EventLoop\LoopInterface;
use React\EventLoop\TimerInterface;

class WebSocket implements MessageComponentInterface
{
    private const RAIO_MAXIMO_METROS = 40000;
    /* O iOS envia eventos de movimento/visita, não pings exatos por minuto. */
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS = 180;
    private const LOCALIZACOES_PERSISTIDAS_CACHE_SEGUNDOS = 5;
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
    private int $bloqueiosCarregadosEm = 0;
    private int $acessosPerfilLimposEm = 0;
    private int $localizacoesPersistidasCarregadasEm = 0;
    private string $assinaturaBloqueios = '';

    public function __construct(callable $pdoFactory, LoopInterface $loop)
    {
        $this->clients = new \SplObjectStorage();
        $this->pdoFactory = $pdoFactory;
        $this->loop = $loop;

        $this->loop->addPeriodicTimer(
            self::BLOQUEIOS_CACHE_SEGUNDOS,
            function (): void {
                if (count($this->clients) === 0) {
                    return;
                }

                try {
                    $this->carregarBloqueios(true);
                    $this->enviarEstadosIndividuais();
                } catch (\Throwable $erro) {
                    echo sprintf(
                        "[BLOCK CACHE ERROR] %s\n",
                        $erro->getMessage()
                    );
                }
            }
        );
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

    public function onOpen(ConnectionInterface $conn): void
    {
        $this->clients->attach($conn);

        echo sprintf(
            "[OPEN] Ligação %d aberta. Ligações: %d\n",
            $conn->resourceId,
            count($this->clients)
        );

        $this->enviar(
            $conn,
            [
                'type' => 'connected',
                'resource_id' => $conn->resourceId
            ]
        );
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

        $type = trim(
            (string) (
                $data['type']
                ?? ''
            )
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

                case 'location':
                    $this->atualizarLocalizacao(
                        $from,
                        $data
                    );
                    break;

                case 'presence_update':
                    $this->atualizarPresenca(
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

                case 'connection_attempt':
                    $this->tentarConexao(
                        $from,
                        $data
                    );
                    break;

                case 'connection_disconnect':
                    $this->desconectarMembros(
                        $from,
                        $data
                    );
                    break;

                case 'chat_publish':
                    $this->publicarMensagemChat(
                        $from,
                        $data
                    );
                    break;

                case 'chat_reaction':
                    $this->publicarReacaoChat(
                        $from,
                        $data
                    );
                    break;

                case 'chat_read':
                    $this->marcarMensagensChatComoLidas(
                        $from,
                        $data
                    );
                    break;

                case 'ping':
                    $this->enviar(
                        $from,
                        [
                            'type' => 'pong',
                            'timestamp' => time()
                        ]
                    );
                    break;

                case 'block_refresh':
                    $this->atualizarBloqueios(
                        $from,
                        $data
                    );
                    break;

                default:
                    $this->enviarErro(
                        $from,
                        'Tipo de mensagem desconhecido.'
                    );
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
        $membroId = trim(
            (string) (
                $data['membro_id']
                ?? ''
            )
        );

        if ($membroId === '') {
            $this->enviarErro(
                $conn,
                'Não foi recebido um membro válido.'
            );

            return;
        }

        $membroAnterior =
            $this->membroPorLigacao[
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

        $membro =
            $this->obterMembro(
                $membroId
            );

        if (!$membro) {
            $this->enviarErro(
                $conn,
                'O membro não foi encontrado.'
            );

            return;
        }

        $faixaEtaria =
            $this->obterFaixaEtaria(
                (string) (
                    $membro['nascimento']
                    ?? ''
                )
            );

        if ($faixaEtaria === null) {
            $this->enviarErro(
                $conn,
                'A conta não tem uma idade válida para utilizar a descoberta de pessoas próximas.'
            );

            $conn->close();

            return;
        }

        $this->faixaEtariaPorMembro[
            $membroId
        ] = $faixaEtaria;

        $localizacaoAtiva =
            $this->lerBooleano(
                $data,
                'location_enabled',
                $this->lerBooleano(
                    $data,
                    'map_presence',
                    true
                )
            );

        $visivel =
            $localizacaoAtiva &&
            $this->lerBooleano(
                $data,
                'map_presence',
                true
            );

        $this->cancelarSaidaAgendada(
            $membroId
        );

        $this->membroPorLigacao[
            $conn->resourceId
        ] = $membroId;

        $this->localizacaoPorLigacao[
            $conn->resourceId
        ] = $localizacaoAtiva;

        $this->visibilidadePorLigacao[
            $conn->resourceId
        ] = $visivel;

        $this->ligacoesPorMembro[
            $membroId
        ] ??= [];

        $this->ligacoesPorMembro[
            $membroId
        ][
            $conn->resourceId
        ] = $conn;

        if (
            !$this->membroTemLigacaoComLocalizacaoAtiva(
                $membroId
            )
        ) {
            unset(
                $this->localizacoes[
                    $membroId
                ]
            );
        }

        $this->sincronizarVisibilidadeMembro(
            $membroId,
            $membro
        );

        echo sprintf(
            "[AUTH] Ligação %d autenticada como %s. Localização: %s. Visível: %s. Pessoas: %d. Ligações deste membro: %d\n",
            $conn->resourceId,
            $membroId,
            $localizacaoAtiva
                ? 'ativa'
                : 'inativa',
            $visivel
                ? 'sim'
                : 'não',
            count(
                $this->pessoas
            ),
            count(
                $this->ligacoesPorMembro[
                    $membroId
                ]
            )
        );

        $this->enviar(
            $conn,
            [
                'type' =>
                    'authenticated',

                'membro_id' =>
                    $membroId,

                'location_enabled' =>
                    $localizacaoAtiva,

                'map_presence' =>
                    $visivel
            ]
        );

        $this->enviarContadorMensagens(
            $conn,
            $membroId
        );

        $this->enviarEstadosIndividuais();
    }

    private function obterMembro(
        string $membroId
    ): array|false {
        $sql = "
            SELECT
                m.id AS membro_id,
                CONCAT(
                    m.primeiro_nome,
                    ' ',
                    m.ultimo_nome
                ) AS nome,
                m.nascimento,
                COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE
                            fp.membro_id COLLATE utf8mb4_unicode_ci =
                            m.id COLLATE utf8mb4_unicode_ci
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
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    $sql
                );

            $statement->execute([
                'membro_id' =>
                    $membroId
            ]);

            return $statement->fetch(
                PDO::FETCH_ASSOC
            );
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function atualizarPresenca(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId =
            $this->obterMembroDaLigacao(
                $conn
            );

        if ($membroId === null) {
            $this->enviarErro(
                $conn,
                'A ligação não está autenticada.'
            );

            return;
        }

        $resourceId =
            $conn->resourceId;

        $localizacaoAtiva =
            $this->lerBooleano(
                $data,
                'location_enabled',
                $this->localizacaoPorLigacao[
                    $resourceId
                ] ?? true
            );

        $visivelSolicitado =
            $this->lerBooleano(
                $data,
                'map_presence',
                $this->visibilidadePorLigacao[
                    $resourceId
                ] ?? true
            );

        $visivel =
            $localizacaoAtiva &&
            $visivelSolicitado;

        $this->localizacaoPorLigacao[
            $resourceId
        ] = $localizacaoAtiva;

        $this->visibilidadePorLigacao[
            $resourceId
        ] = $visivel;

        $this->cancelarSaidaAgendada(
            $membroId
        );

        if (
            !$this->membroTemLigacaoComLocalizacaoAtiva(
                $membroId
            )
        ) {
            unset(
                $this->localizacoes[
                    $membroId
                ]
            );
        }

        $this->sincronizarVisibilidadeMembro(
            $membroId
        );

        $this->enviar(
            $conn,
            [
                'type' =>
                    'presence_updated',

                'location_enabled' =>
                    $localizacaoAtiva,

                'map_presence' =>
                    $visivel,

                'member_visible' =>
                    $this->membroTemLigacaoVisivel(
                        $membroId
                    )
            ]
        );

        echo sprintf(
            "[PRESENCE] %s atualizou presença. Ligação %d: localização=%s, visível=%s.\n",
            $membroId,
            $resourceId,
            $localizacaoAtiva
                ? 'ativa'
                : 'inativa',
            $visivel
                ? 'sim'
                : 'não'
        );

        $this->enviarEstadosIndividuais();
    }

    private function sincronizarVisibilidadeMembro(
        string $membroId,
        ?array $membro = null
    ): void {
        if ($membro === null) {
            $membro =
                $this->obterMembro(
                    $membroId
                );
        }

        if (!$membro) {
            unset(
                $this->pessoas[
                    $membroId
                ],
                $this->faixaEtariaPorMembro[
                    $membroId
                ]
            );

            return;
        }

        $faixaEtaria =
            $this->obterFaixaEtaria(
                (string) (
                    $membro['nascimento']
                    ?? ''
                )
            );

        if ($faixaEtaria === null) {
            unset(
                $this->pessoas[
                    $membroId
                ],
                $this->faixaEtariaPorMembro[
                    $membroId
                ]
            );

            return;
        }

        $this->faixaEtariaPorMembro[
            $membroId
        ] = $faixaEtaria;

        if (
            $this->membroTemLigacaoVisivel(
                $membroId
            )
        ) {
            $this->garantirPessoaVisivel(
                $membroId,
                $membro
            );

            return;
        }

        unset(
            $this->pessoas[
                $membroId
            ]
        );
    }

    private function garantirPessoaVisivel(
        string $membroId,
        ?array $membro = null
    ): void {
        if ($membro === null) {
            $membro =
                $this->obterMembro(
                    $membroId
                );
        }

        if (!$membro) {
            unset(
                $this->pessoas[
                    $membroId
                ],
                $this->faixaEtariaPorMembro[
                    $membroId
                ]
            );

            return;
        }

        $faixaEtaria =
            $this->obterFaixaEtaria(
                (string) (
                    $membro['nascimento']
                    ?? ''
                )
            );

        if ($faixaEtaria === null) {
            unset(
                $this->pessoas[
                    $membroId
                ],
                $this->faixaEtariaPorMembro[
                    $membroId
                ]
            );

            return;
        }

        $this->faixaEtariaPorMembro[
            $membroId
        ] = $faixaEtaria;

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

        $pessoaAtual =
            $this->pessoas[
                $membroId
            ] ?? [];

        $this->pessoas[
            $membroId
        ] = [
            'id' =>
                $membroId,

            'membro_id' =>
                $membroId,

            'nome' =>
                trim(
                    (string) (
                        $membro['nome']
                        ?? ''
                    )
                ),

            'src' =>
                '/imagens/fotos-perfil/' .
                rawurlencode(
                    $foto
                ),

            'faixa_etaria' =>
                $faixaEtaria,

            'top' =>
                isset(
                    $pessoaAtual['top']
                )
                    ? (int) $pessoaAtual['top']
                    : random_int(
                        50,
                        600
                    ),

            'left' =>
                isset(
                    $pessoaAtual['left']
                )
                    ? (int) $pessoaAtual['left']
                    : random_int(
                        50,
                        400
                    )
        ];
    }

    private function obterPessoaParaInteracao(
        string $membroId
    ): ?array {
        if (
            isset(
                $this->pessoas[
                    $membroId
                ]
            )
        ) {
            return $this->pessoas[
                $membroId
            ];
        }

        $membro =
            $this->obterMembro(
                $membroId
            );

        if (!$membro) {
            return null;
        }

        $faixaEtaria =
            $this->obterFaixaEtaria(
                (string) (
                    $membro['nascimento']
                    ?? ''
                )
            );

        if ($faixaEtaria === null) {
            return null;
        }

        $this->faixaEtariaPorMembro[
            $membroId
        ] = $faixaEtaria;

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

        return [
            'id' =>
                $membroId,

            'membro_id' =>
                $membroId,

            'nome' =>
                trim(
                    (string) (
                        $membro['nome']
                        ?? ''
                    )
                ),

            'src' =>
                '/imagens/fotos-perfil/' .
                rawurlencode(
                    $foto
                ),

            'faixa_etaria' =>
                $faixaEtaria
        ];
    }

    private function atualizarLocalizacao(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId =
            $this->obterMembroDaLigacao(
                $conn
            );

        if ($membroId === null) {
            $this->enviarErro(
                $conn,
                'A ligação não está autenticada.'
            );

            return;
        }

        if (
            !(
                $this->localizacaoPorLigacao[
                    $conn->resourceId
                ] ?? false
            )
        ) {
            return;
        }

        $latitude =
            filter_var(
                $data['latitude']
                    ?? null,
                FILTER_VALIDATE_FLOAT
            );

        $longitude =
            filter_var(
                $data['longitude']
                    ?? null,
                FILTER_VALIDATE_FLOAT
            );

        $accuracy =
            filter_var(
                $data['accuracy']
                    ?? 0,
                FILTER_VALIDATE_FLOAT
            );

        if (
            $latitude === false ||
            $longitude === false ||
            $latitude < -90 ||
            $latitude > 90 ||
            $longitude < -180 ||
            $longitude > 180
        ) {
            $this->enviarErro(
                $conn,
                'As coordenadas recebidas não são válidas.'
            );

            return;
        }

        if (
            $accuracy === false ||
            $accuracy < 0
        ) {
            $accuracy = 0;
        }

        $this->localizacoes[
            $membroId
        ] = [
            'latitude' =>
                (float) $latitude,

            'longitude' =>
                (float) $longitude,

            'accuracy' =>
                min(
                    (float) $accuracy,
                    10000
                ),

            'updated_at' =>
                time(),

            'source' =>
                'websocket'
        ];

        echo sprintf(
            "[LOCATION] %s atualizou localização. Precisão: %.1f m\n",
            $membroId,
            $this->localizacoes[
                $membroId
            ][
                'accuracy'
            ]
        );

        $this->enviar(
            $conn,
            [
                'type' =>
                    'location_received',

                'updated_at' =>
                    $this->localizacoes[
                        $membroId
                    ][
                        'updated_at'
                    ]
            ]
        );

        $this->enviarEstadosIndividuais();
    }

    private function moverPessoa(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId =
            $this->obterMembroDaLigacao(
                $conn
            );

        if (
            $membroId === null ||
            !(
                $this->visibilidadePorLigacao[
                    $conn->resourceId
                ] ?? false
            ) ||
            !isset(
                $this->pessoas[
                    $membroId
                ]
            )
        ) {
            return;
        }

        $top =
            $this->limitarNumero(
                (int) (
                    $data['top']
                    ?? 0
                ),
                -2000,
                2000
            );

        $left =
            $this->limitarNumero(
                (int) (
                    $data['left']
                    ?? 0
                ),
                -2000,
                2000
            );

        if (
            $top === 0 &&
            $left === 0
        ) {
            return;
        }

        $this->pessoas[
            $membroId
        ][
            'top'
        ] += $top;

        $this->pessoas[
            $membroId
        ][
            'left'
        ] += $left;

        $this->enviarEstadosIndividuais();
    }

    private function notificarPessoa(
        ConnectionInterface $from,
        array $data
    ): void {
        $remetenteId =
            $this->obterMembroDaLigacao(
                $from
            );

        if ($remetenteId === null) {
            $this->enviarErroHey(
                $from,
                trim(
                    (string) (
                        $data['destinatario_id']
                        ?? ''
                    )
                ),
                'Tens de estar autenticado para enviar um Hey.'
            );

            return;
        }

        $remetente =
            $this->obterPessoaParaInteracao(
                $remetenteId
            );

        $destinatarioId =
            trim(
                (string) (
                    $data['destinatario_id']
                    ?? ''
                )
            );

        if (
            !$remetente ||
            $destinatarioId === ''
        ) {
            $this->enviarErroHey(
                $from,
                $destinatarioId,
                'O destinatário não é válido.'
            );

            return;
        }

        if (
            $destinatarioId ===
            $remetenteId
        ) {
            $this->enviarErroHey(
                $from,
                $destinatarioId,
                'Não podes enviar um Hey para ti próprio.'
            );

            return;
        }

        if (
            $this->membrosEstaoBloqueados(
                $remetenteId,
                $destinatarioId
            )
        ) {
            $this->enviarErroHey(
                $from,
                $destinatarioId,
                'Já não podes interagir com esta pessoa.'
            );

            $this->enviarEstadosIndividuais();

            return;
        }

        if (
            !$this->membrosNaMesmaFaixaEtaria(
                $remetenteId,
                $destinatarioId
            )
        ) {
            $this->enviarErroHey(
                $from,
                $destinatarioId,
                'Já não podes interagir com esta pessoa.'
            );

            $this->enviarEstadosIndividuais();

            return;
        }

        if (
            !$this->estaoDentroDoRaio(
                $remetenteId,
                $destinatarioId
            )
        ) {
            $this->enviarErroHey(
                $from,
                $destinatarioId,
                'Esta pessoa já não está dentro do raio disponível.'
            );

            $this->enviarEstadosIndividuais();

            return;
        }

        $ligacoesDestinatario =
            $this->ligacoesPorMembro[
                $destinatarioId
            ] ?? [];

        $destinatario =
            $this->pessoas[
                $destinatarioId
            ] ??
            $this->obterPessoaParaInteracao(
                $destinatarioId
            );

        if (!$destinatario) {
            $this->enviarErroHey(
                $from,
                $destinatarioId,
                'O destinatário já não está disponível.'
            );

            return;
        }

        $notificacaoId =
            $this->guardarNotificacao(
                $remetenteId,
                $destinatarioId
            );

        try {
            $databasePush =
                $this->getDatabase();

            (
                new PushNotification(
                    $databasePush
                )
            )->enqueueHey(
                $remetenteId,
                $destinatarioId,
                $notificacaoId
            );
        } catch (
            \Throwable $erroPush
        ) {
            /*
             * O Hey continua válido mesmo
             * que a fila push esteja indisponível.
             */
            echo sprintf(
                "[HEY PUSH ERROR] %s\n",
                $erroPush->getMessage()
            );
        } finally {
            $databasePush = null;
        }

        $numeroEntregas = 0;

        foreach (
            $ligacoesDestinatario
            as $client
        ) {
            $this->enviar(
                $client,
                [
                    'type' =>
                        'notification',

                    'notification_id' =>
                        $notificacaoId,

                    'notification_type' =>
                        'hey',

                    'title' =>
                        'Recebeste um Hey!',

                    'body' =>
                        sprintf(
                            '%s enviou-te um Hey.',
                            (string) (
                                $remetente['nome']
                                ?? 'Alguém'
                            )
                        ),

                    'from_member_id' =>
                        $remetenteId,

                    'from_name' =>
                        (string) (
                            $remetente['nome']
                            ?? 'Alguém'
                        ),

                    'from_photo' =>
                        (string) (
                            $remetente['src']
                            ?? '/imagens/fotos-perfil/default.webp'
                        ),

                    'created_at' =>
                        gmdate(
                            'c'
                        )
                ]
            );

            $numeroEntregas++;
        }

        $this->enviar(
            $from,
            [
                'type' =>
                    'notification_sent',

                'notification_id' =>
                    $notificacaoId,

                'destinatario_id' =>
                    $destinatarioId,

                'destinatario_nome' =>
                    (string) (
                        $destinatario['nome']
                        ?? 'A outra pessoa'
                    ),

                'destinatario_foto' =>
                    (string) (
                        $destinatario['src']
                        ?? '/imagens/fotos-perfil/default.webp'
                    ),

                'deliveries' =>
                    $numeroEntregas,

                'message' =>
                    $numeroEntregas > 0
                        ? sprintf(
                            '%s recebeu o teu Hey.',
                            (string) (
                                $destinatario['nome']
                                ?? 'A outra pessoa'
                            )
                        )
                        : sprintf(
                            'Hey enviado. %s vai vê-lo quando voltar à Margot.',
                            (string) (
                                $destinatario['nome']
                                ?? 'A outra pessoa'
                            )
                        )
            ]
        );

        echo sprintf(
            "[HEY] %s enviou para %s. Entregas: %d\n",
            $remetenteId,
            $destinatarioId,
            $numeroEntregas
        );
    }

    private function tentarConexao(
        ConnectionInterface $from,
        array $data
    ): void {
        $remetenteId =
            $this->obterMembroDaLigacao(
                $from
            );

        $destinatarioId =
            trim(
                (string) (
                    $data['destinatario_id']
                    ?? ''
                )
            );

        if (
            $remetenteId === null ||
            $destinatarioId === ''
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Não foi possível iniciar a ligação.'
            );

            return;
        }

        if (
            $destinatarioId ===
            $remetenteId
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Não podes ligar-te a ti próprio.'
            );

            return;
        }

        $remetente =
            $this->obterPessoaParaInteracao(
                $remetenteId
            );

        $destinatario =
            $this->obterPessoaParaInteracao(
                $destinatarioId
            );

        if (
            !$remetente ||
            !$destinatario
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Esta pessoa já não está disponível.'
            );

            return;
        }

        if (
            $this->membrosEstaoBloqueados(
                $remetenteId,
                $destinatarioId
            ) ||
            !$this->membrosNaMesmaFaixaEtaria(
                $remetenteId,
                $destinatarioId
            )
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Já não podes interagir com esta pessoa.'
            );

            $this->enviarEstadosIndividuais();

            return;
        }

        $database =
            $this->getDatabase();

        $ligacoes =
            new MemberConnection(
                $database
            );

        if (
            $ligacoes->areConnected(
                $remetenteId,
                $destinatarioId
            )
        ) {
            $this->enviarEventoConexaoCriada(
                $remetenteId,
                $destinatarioId,
                true
            );

            return;
        }

        if (
            !$this->estaoDentroDoRaio(
                $remetenteId,
                $destinatarioId
            )
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Para criarem uma ligação, têm de estar perto um do outro.'
            );

            $this->enviarEstadosIndividuais();

            return;
        }

        $agora =
            microtime(
                true
            );

        $this->limparTentativasConexao(
            $agora
        );

        $chave =
            $this->chaveConexao(
                $remetenteId,
                $destinatarioId
            );

        $tentativas =
            $this->tentativasConexao[
                $chave
            ] ?? [];

        $tentativaOutro =
            (float) (
                $tentativas[
                    $destinatarioId
                ] ?? 0.0
            );

        $tentativas[
            $remetenteId
        ] = $agora;

        $this->tentativasConexao[
            $chave
        ] = $tentativas;

        if (
            $tentativaOutro > 0 &&
            abs(
                $agora -
                $tentativaOutro
            ) <=
            self::JANELA_CONEXAO_SEGUNDOS
        ) {
            $ligacoes->connect(
                $remetenteId,
                $destinatarioId
            );

            unset(
                $this->tentativasConexao[
                    $chave
                ]
            );

            $this->enviarEventoConexaoCriada(
                $remetenteId,
                $destinatarioId,
                false
            );

            echo sprintf(
                "[CONNECTION] %s e %s ficaram ligados.\n",
                $remetenteId,
                $destinatarioId
            );

            return;
        }

        $this->enviar(
            $from,
            [
                'type' =>
                    'connection_waiting',

                'destinatario_id' =>
                    $destinatarioId,

                'other_member_id' =>
                    $destinatarioId,

                'other_name' =>
                    (string) (
                        $destinatario['nome']
                        ?? ''
                    ),

                'expires_in_ms' =>
                    (int) round(
                        self::JANELA_CONEXAO_SEGUNDOS *
                        1000
                    )
            ]
        );
    }

    private function desconectarMembros(
        ConnectionInterface $from,
        array $data
    ): void {
        $remetenteId =
            $this->obterMembroDaLigacao(
                $from
            );

        $destinatarioId =
            trim(
                (string) (
                    $data['destinatario_id']
                    ?? ''
                )
            );

        if (
            $remetenteId === null ||
            $destinatarioId === ''
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Não foi possível remover a ligação.'
            );

            return;
        }

        if (
            $destinatarioId ===
            $remetenteId
        ) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'A ligação indicada não é válida.'
            );

            return;
        }

        $database =
            $this->getDatabase();

        $ligacoes =
            new MemberConnection(
                $database
            );

        $removeu =
            $ligacoes->disconnect(
                $remetenteId,
                $destinatarioId
            );

        unset(
            $this->tentativasConexao[
                $this->chaveConexao(
                    $remetenteId,
                    $destinatarioId
                )
            ]
        );

        $this->enviarEventoConexaoRemovida(
            $remetenteId,
            $destinatarioId,
            !$removeu
        );

        echo sprintf(
            "[CONNECTION] %s e %s deixaram de estar ligados.\n",
            $remetenteId,
            $destinatarioId
        );
    }

    private function enviarEventoConexaoRemovida(
        string $primeiroId,
        string $segundoId,
        bool $alreadyDisconnected
    ): void {
        $primeiro =
            $this->obterPessoaParaInteracao(
                $primeiroId
            );

        $segundo =
            $this->obterPessoaParaInteracao(
                $segundoId
            );

        foreach (
            $this->ligacoesPorMembro[
                $primeiroId
            ] ?? []
            as $client
        ) {
            $this->enviar(
                $client,
                [
                    'type' =>
                        'connection_removed',

                    'other_member_id' =>
                        $segundoId,

                    'other_name' =>
                        (string) (
                            $segundo['nome']
                            ?? ''
                        ),

                    'already_disconnected' =>
                        $alreadyDisconnected
                ]
            );
        }

        foreach (
            $this->ligacoesPorMembro[
                $segundoId
            ] ?? []
            as $client
        ) {
            $this->enviar(
                $client,
                [
                    'type' =>
                        'connection_removed',

                    'other_member_id' =>
                        $primeiroId,

                    'other_name' =>
                        (string) (
                            $primeiro['nome']
                            ?? ''
                        ),

                    'already_disconnected' =>
                        $alreadyDisconnected
                ]
            );
        }
    }

    private function enviarEventoConexaoCriada(
        string $primeiroId,
        string $segundoId,
        bool $alreadyConnected
    ): void {
        $primeiro =
            $this->obterPessoaParaInteracao(
                $primeiroId
            );

        $segundo =
            $this->obterPessoaParaInteracao(
                $segundoId
            );

        foreach (
            $this->ligacoesPorMembro[
                $primeiroId
            ] ?? []
            as $client
        ) {
            $this->enviar(
                $client,
                [
                    'type' =>
                        'connection_created',

                    'other_member_id' =>
                        $segundoId,

                    'other_name' =>
                        (string) (
                            $segundo['nome']
                            ?? ''
                        ),

                    'other_photo' =>
                        (string) (
                            $segundo['src']
                            ?? '/imagens/fotos-perfil/default.webp'
                        ),

                    'already_connected' =>
                        $alreadyConnected
                ]
            );
        }

        foreach (
            $this->ligacoesPorMembro[
                $segundoId
            ] ?? []
            as $client
        ) {
            $this->enviar(
                $client,
                [
                    'type' =>
                        'connection_created',

                    'other_member_id' =>
                        $primeiroId,

                    'other_name' =>
                        (string) (
                            $primeiro['nome']
                            ?? ''
                        ),

                    'other_photo' =>
                        (string) (
                            $primeiro['src']
                            ?? '/imagens/fotos-perfil/default.webp'
                        ),

                    'already_connected' =>
                        $alreadyConnected
                ]
            );
        }
    }

    private function enviarErroConexao(
        ConnectionInterface $conn,
        string $destinatarioId,
        string $mensagem
    ): void {
        $this->enviar(
            $conn,
            [
                'type' =>
                    'connection_error',

                'destinatario_id' =>
                    $destinatarioId,

                'other_member_id' =>
                    $destinatarioId,

                'message' =>
                    $mensagem
            ]
        );
    }

    private function chaveConexao(
        string $firstId,
        string $secondId
    ): string {
        $ids = [
            $firstId,
            $secondId
        ];

        sort(
            $ids,
            SORT_STRING
        );

        return (
            $ids[0] .
            '|' .
            $ids[1]
        );
    }

    private function limparTentativasConexao(
        float $agora
    ): void {
        $limite =
            $agora -
            (
                self::JANELA_CONEXAO_SEGUNDOS +
                0.5
            );

        foreach (
            $this->tentativasConexao
            as $chave => $tentativas
        ) {
            $maisRecente =
                0.0;

            foreach (
                $tentativas
                as $instante
            ) {
                $maisRecente =
                    max(
                        $maisRecente,
                        (float) $instante
                    );
            }

            if (
                $maisRecente <
                $limite
            ) {
                unset(
                    $this->tentativasConexao[
                        $chave
                    ]
                );
            }
        }
    }

    private function guardarNotificacao(
        string $emissorId,
        string $destinatarioId
    ): int {
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
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    $sql
                );

            $statement->execute([
                'emissor_id' =>
                    $emissorId,

                'destinatario_id' =>
                    $destinatarioId
            ]);

            return (
                (int) $database
                    ->lastInsertId()
            );
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function publicarMensagemChat(
        ConnectionInterface $from,
        array $data
    ): void {
        $membroId =
            $this->obterMembroDaLigacao(
                $from
            );

        $mensagemId =
            filter_var(
                $data['message_id']
                    ?? null,
                FILTER_VALIDATE_INT
            );

        if ($membroId === null) {
            $this->enviar(
                $from,
                [
                    'type' =>
                        'chat_error',

                    'message' =>
                        'A ligação não está autenticada.'
                ]
            );

            return;
        }

        if (
            $mensagemId === false ||
            $mensagemId < 1
        ) {
            $this->enviar(
                $from,
                [
                    'type' =>
                        'chat_error',

                    'message' =>
                        'A mensagem não é válida.'
                ]
            );

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
                CONCAT(
                    m.primeiro_nome,
                    ' ',
                    m.ultimo_nome
                ) AS emissor_nome,
                COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil fp
                        WHERE
                            fp.membro_id COLLATE utf8mb4_unicode_ci =
                            m.id COLLATE utf8mb4_unicode_ci
                        AND (
                            fp.status = 'completo'
                            OR fp.status IS NULL
                        )
                        ORDER BY
                            fp.ordem IS NULL ASC,
                            fp.ordem ASC,
                            fp.id ASC
                        LIMIT 1
                    ),
                    'default.webp'
                ) AS emissor_foto
            FROM mensagens_chat msg
            INNER JOIN membros m
                ON
                    m.id COLLATE utf8mb4_unicode_ci =
                    msg.emissor_id COLLATE utf8mb4_unicode_ci
            WHERE msg.id = :id
            LIMIT 1
        ";

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    $sql
                );

            $statement->execute([
                'id' =>
                    $mensagemId
            ]);

            $mensagem =
                $statement->fetch(
                    PDO::FETCH_ASSOC
                );
        } finally {
            $statement = null;
            $database = null;
        }

        if (
            !$mensagem ||
            (string) $mensagem['emissor_id'] !==
            $membroId
        ) {
            $this->enviar(
                $from,
                [
                    'type' =>
                        'chat_error',

                    'message' =>
                        'Não podes publicar esta mensagem.'
                ]
            );

            return;
        }

        $destinatarioId =
            trim(
                (string) (
                    $mensagem['destinatario_id']
                    ?? ''
                )
            );

        /*
         * A gravação HTTP já faz esta validação. Repeti-la aqui impede
         * que uma mensagem seja entregue em tempo real caso exista uma
         * tentativa de contornar o endpoint, um bloqueio tenha ocorrido
         * entretanto ou as contas pertençam a faixas etárias diferentes.
         */
        if (
            !$this->interacaoMensagensPermitida(
                $membroId,
                $destinatarioId
            )
        ) {
            $this->enviar(
                $from,
                [
                    'type' =>
                        'chat_error',

                    'message' =>
                        'Esta conversa não está disponível.'
                ]
            );

            return;
        }

        $ficheiro =
            basename(
                trim(
                    (string) (
                        $mensagem['ficheiro_nome']
                        ?? ''
                    )
                )
            );

        $foto =
            basename(
                trim(
                    (string) (
                        $mensagem['emissor_foto']
                        ?? 'default.webp'
                    )
                )
            );

        if ($foto === '') {
            $foto = 'default.webp';
        }

        $mensagem['id'] =
            (int) $mensagem['id'];

        $mensagem['lida'] =
            (bool) $mensagem['lida'];

        $mensagem['texto'] =
            (string) (
                $mensagem['texto']
                ?? ''
            );

        $mensagem['media_url'] =
            $ficheiro === ''
                ? null
                : (
                    '/media/mensagens/' .
                    rawurlencode(
                        $ficheiro
                    )
                );

        $mensagem['emissor_foto_url'] =
            '/imagens/fotos-perfil/' .
            rawurlencode(
                $foto
            );

        $mensagem['emissor_perfil_url'] =
            '/profile/' .
            rawurlencode(
                (string) $mensagem['emissor_id']
            );

        unset(
            $mensagem['ficheiro_nome'],
            $mensagem['emissor_foto']
        );

        $participantes =
            array_unique([
                (string) $mensagem['emissor_id'],
                (string) $mensagem['destinatario_id']
            ]);

        foreach (
            $participantes
            as $participanteId
        ) {
            $naoLidas =
                $this->contarMensagensNaoLidas(
                    $participanteId
                );

            foreach (
                $this->ligacoesPorMembro[
                    $participanteId
                ] ?? []
                as $ligacao
            ) {
                $this->enviar(
                    $ligacao,
                    [
                        'type' =>
                            'chat_message',

                        'message' =>
                            $mensagem,

                        'unread_count' =>
                            $naoLidas
                    ]
                );
            }
        }

        echo sprintf(
            "[CHAT] Mensagem %d publicada por %s para %s.\n",
            $mensagem['id'],
            $mensagem['emissor_id'],
            $mensagem['destinatario_id']
        );
    }

    private function publicarReacaoChat(
        ConnectionInterface $from,
        array $data
    ): void {
        $membroId =
            $this->obterMembroDaLigacao(
                $from
            );

        $mensagemId =
            filter_var(
                $data['message_id']
                    ?? null,
                FILTER_VALIDATE_INT
            );

        if ($membroId === null) {
            return;
        }

        if (
            $mensagemId === false ||
            $mensagemId < 1
        ) {
            return;
        }

        $database = null;

        try {
            $database =
                $this->getDatabase();

            $mensagem =
                $database->prepare(
                    'SELECT
                        emissor_id,
                        destinatario_id
                     FROM mensagens_chat
                     WHERE id = :id
                     AND (
                         emissor_id = :membro1
                         OR destinatario_id = :membro2
                     )
                     LIMIT 1'
                );

            $mensagem->execute([
                'id' =>
                    (int) $mensagemId,

                'membro1' =>
                    $membroId,

                'membro2' =>
                    $membroId
            ]);

            $linhaMensagem =
                $mensagem->fetch(
                    PDO::FETCH_ASSOC
                );

            if (!$linhaMensagem) {
                return;
            }

            $reacoes =
                $database->prepare(
                    'SELECT
                        membro_id,
                        emoji
                     FROM mensagens_reacoes
                     WHERE mensagem_id = :mensagem
                     ORDER BY
                        atualizada_em ASC,
                        membro_id ASC'
                );

            $reacoes->execute([
                'mensagem' =>
                    (int) $mensagemId
            ]);

            $lista = [];

            foreach (
                $reacoes->fetchAll(
                    PDO::FETCH_ASSOC
                )
                as $reacao
            ) {
                $lista[] = [
                    'member_id' =>
                        (string) (
                            $reacao['membro_id']
                            ?? ''
                        ),

                    'emoji' =>
                        (string) (
                            $reacao['emoji']
                            ?? ''
                        )
                ];
            }

            $evento = [
                'type' =>
                    'chat_reaction',

                'message_id' =>
                    (int) $mensagemId,

                'reactions' =>
                    $lista
            ];

            $destinatarios = [
                (string) (
                    $linhaMensagem['emissor_id']
                    ?? ''
                ),

                (string) (
                    $linhaMensagem['destinatario_id']
                    ?? ''
                )
            ];

            foreach (
                array_unique(
                    $destinatarios
                )
                as $destinatarioId
            ) {
                if (
                    $destinatarioId ===
                    ''
                ) {
                    continue;
                }

                foreach (
                    $this->ligacoesPorMembro[
                        $destinatarioId
                    ] ?? []
                    as $client
                ) {
                    $this->enviar(
                        $client,
                        $evento
                    );
                }
            }
        } catch (
            \Throwable $erro
        ) {
            echo sprintf(
                "[CHAT REACTION ERROR] %s\n",
                $erro->getMessage()
            );
        } finally {
            $database = null;
        }
    }

    private function marcarMensagensChatComoLidas(
        ConnectionInterface $from,
        array $data
    ): void {
        $leitorId =
            $this->obterMembroDaLigacao(
                $from
            );

        $outroId =
            trim(
                (string) (
                    $data['with_member_id']
                    ?? ''
                )
            );

        if (
            $leitorId === null ||
            $outroId === '' ||
            $outroId === $leitorId
        ) {
            $this->enviar(
                $from,
                [
                    'type' =>
                        'chat_error',

                    'message' =>
                        'A conversa não é válida.'
                ]
            );

            return;
        }

        if (
            !$this->interacaoMensagensPermitida(
                $leitorId,
                $outroId
            ) ||
            !$this->existeConversaMensagens(
                $leitorId,
                $outroId
            )
        ) {
            $this->enviar(
                $from,
                [
                    'type' =>
                        'chat_error',

                    'message' =>
                        'Esta conversa não está disponível.'
                ]
            );

            return;
        }

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    "
                    UPDATE mensagens_chat
                    SET
                        lida = 1,
                        lida_em = COALESCE(
                            lida_em,
                            NOW(6)
                        )
                    WHERE emissor_id = :outro
                    AND destinatario_id = :leitor
                    AND lida = 0
                    "
                );

            $statement->execute([
                'outro' =>
                    $outroId,

                'leitor' =>
                    $leitorId
            ]);

            $statement =
                $database->prepare(
                    "
                    SELECT
                        COALESCE(
                            MAX(id),
                            0
                        )
                    FROM mensagens_chat
                    WHERE emissor_id = :outro
                    AND destinatario_id = :leitor
                    AND lida = 1
                    "
                );

            $statement->execute([
                'outro' =>
                    $outroId,

                'leitor' =>
                    $leitorId
            ]);

            $ultimaMensagemId =
                (int) $statement
                    ->fetchColumn();
        } finally {
            $statement = null;
            $database = null;
        }

        foreach (
            $this->ligacoesPorMembro[
                $outroId
            ] ?? []
            as $ligacao
        ) {
            $this->enviar(
                $ligacao,
                [
                    'type' =>
                        'chat_messages_read',

                    'reader_id' =>
                        $leitorId,

                    'last_message_id' =>
                        $ultimaMensagemId
                ]
            );
        }

        foreach (
            $this->ligacoesPorMembro[
                $leitorId
            ] ?? []
            as $ligacao
        ) {
            $this->enviarContadorMensagens(
                $ligacao,
                $leitorId
            );
        }
    }

    private function contarMensagensNaoLidas(
        string $membroId
    ): int {
        $membro =
            $this->obterMembro(
                $membroId
            );

        if (!$membro) {
            return 0;
        }

        $faixaEtaria =
            $this->obterFaixaEtaria(
                (string) (
                    $membro['nascimento']
                    ?? ''
                )
            );

        if ($faixaEtaria === null) {
            return 0;
        }

        $condicaoFaixaEtaria =
            Validate::adultSqlCondition(
                'em'
            );

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    "
                    SELECT COUNT(*)
                    FROM mensagens_chat msg
                    INNER JOIN membros em
                        ON
                            em.id COLLATE utf8mb4_unicode_ci =
                            msg.emissor_id COLLATE utf8mb4_unicode_ci
                    WHERE
                        msg.destinatario_id = :id
                    AND msg.lida = 0
                    AND {$condicaoFaixaEtaria}
                    AND NOT EXISTS (
                        SELECT 1
                        FROM bloqueados b
                        WHERE (
                            b.pessoa_bloqueou_id = :eu1
                            AND
                            b.pessoa_bloqueada_id COLLATE utf8mb4_unicode_ci =
                            msg.emissor_id COLLATE utf8mb4_unicode_ci
                        )
                        OR (
                            b.pessoa_bloqueou_id COLLATE utf8mb4_unicode_ci =
                            msg.emissor_id COLLATE utf8mb4_unicode_ci
                            AND
                            b.pessoa_bloqueada_id = :eu2
                        )
                    )
                    "
                );

            $statement->execute([
                'id' =>
                    $membroId,

                'eu1' =>
                    $membroId,

                'eu2' =>
                    $membroId
            ]);

            return (
                (int) $statement
                    ->fetchColumn()
            );
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function enviarContadorMensagens(
        ConnectionInterface $conn,
        string $membroId
    ): void {
        $this->enviar(
            $conn,
            [
                'type' =>
                    'chat_unread_count',

                'unread_count' =>
                    $this->contarMensagensNaoLidas(
                        $membroId
                    )
            ]
        );
    }

    private function enviarEstadosIndividuais(): void
    {
        try {
            $this->carregarBloqueios();
        } catch (\Throwable $erro) {
            echo sprintf(
                "[BLOCK CACHE ERROR] %s\n",
                $erro->getMessage()
            );
        }

        try {
            $this->sincronizarLocalizacoesPersistidas();
        } catch (\Throwable $erro) {
            echo sprintf(
                "[LOCATION CACHE ERROR] %s\n",
                $erro->getMessage()
            );
        }

        $agora =
            time();

        foreach (
            $this->clients
            as $client
        ) {
            $membroId =
                $this->membroPorLigacao[
                    $client->resourceId
                ] ?? null;

            if ($membroId === null) {
                continue;
            }

            $localizacaoAtiva =
                $this->localizacaoPorLigacao[
                    $client->resourceId
                ] ?? false;

            $ligacaoVisivel =
                $this->visibilidadePorLigacao[
                    $client->resourceId
                ] ?? false;

            $minhaLocalizacao =
                $this->localizacoes[
                    $membroId
                ] ?? null;

            $minhaLocalizacaoValida =
                $localizacaoAtiva &&
                $this->localizacaoEstaValida(
                    $minhaLocalizacao,
                    $agora
                );

            $minhaFaixaEtaria =
                $this->faixaEtariaPorMembro[
                    $membroId
                ] ?? null;

            $pessoasVisiveis = [];

            if (
                $minhaLocalizacaoValida &&
                $minhaFaixaEtaria !== null
            ) {
                foreach (
                    $this->pessoas
                    as $outroMembroId => $pessoa
                ) {
                    if (
                        $outroMembroId ===
                        $membroId
                    ) {
                        if (
                            !$ligacaoVisivel
                        ) {
                            continue;
                        }

                        unset(
                            $pessoa['faixa_etaria']
                        );

                        $pessoa['distance_m'] =
                            0;

                        $pessoasVisiveis[] =
                            $pessoa;

                        continue;
                    }

                    if (
                        $this->membrosEstaoBloqueadosNoCache(
                            $membroId,
                            $outroMembroId
                        )
                    ) {
                        continue;
                    }

                    if (
                        (
                            $pessoa['faixa_etaria']
                            ?? null
                        ) !==
                        $minhaFaixaEtaria
                    ) {
                        continue;
                    }

                    $outraLocalizacao =
                        $this->localizacoes[
                            $outroMembroId
                        ] ?? null;

                    if (
                        !$this->localizacaoEstaValida(
                            $outraLocalizacao,
                            $agora
                        )
                    ) {
                        continue;
                    }

                    $distancia =
                        $this->calcularDistanciaMetros(
                            $minhaLocalizacao[
                                'latitude'
                            ],
                            $minhaLocalizacao[
                                'longitude'
                            ],
                            $outraLocalizacao[
                                'latitude'
                            ],
                            $outraLocalizacao[
                                'longitude'
                            ]
                        );

                    if (
                        $distancia >
                        self::RAIO_MAXIMO_METROS
                    ) {
                        continue;
                    }

                    $tokenAcessoPerfil =
                        $this->obterTokenAcessoPerfil(
                            $membroId,
                            $outroMembroId
                        );

                    if (
                        $tokenAcessoPerfil ===
                        null
                    ) {
                        continue;
                    }

                    unset(
                        $pessoa['faixa_etaria']
                    );

                    $pessoa['distance_m'] =
                        (int) round(
                            $distancia
                        );

                    $pessoa[
                        'profile_access_token'
                    ] =
                        $tokenAcessoPerfil;

                    $pessoasVisiveis[] =
                        $pessoa;
                }
            }

            $this->enviar(
                $client,
                [
                    'type' =>
                        'state',

                    'radius_m' =>
                        self::RAIO_MAXIMO_METROS,

                    'map_presence' =>
                        $ligacaoVisivel,

                    'location_filter_active' =>
                        $minhaLocalizacaoValida,

                    'people' =>
                        $pessoasVisiveis
                ]
            );
        }

        echo sprintf(
            "[STATE] Estados individuais enviados para %d ligação(ões)\n",
            count(
                $this->clients
            )
        );
    }

    private function sincronizarLocalizacoesPersistidas(
        bool $forcar = false
    ): void {
        $agora =
            time();

        if (
            !$forcar &&
            (
                $agora -
                $this->localizacoesPersistidasCarregadasEm
            ) <
            self::LOCALIZACOES_PERSISTIDAS_CACHE_SEGUNDOS
        ) {
            return;
        }

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    "
                    SELECT
                        lm.membro_id,
                        lm.latitude,
                        lm.longitude,
                        lm.precisao_m,
                        UNIX_TIMESTAMP(
                            lm.atualizada_em
                        ) AS atualizada_em_epoch,
                        m.nascimento,
                        CONCAT(
                            m.primeiro_nome,
                            ' ',
                            m.ultimo_nome
                        ) AS nome,
                        COALESCE(
                            (
                                SELECT fp.nome_arquivo
                                FROM fotos_perfil AS fp
                                WHERE
                                    fp.membro_id COLLATE utf8mb4_unicode_ci =
                                    m.id COLLATE utf8mb4_unicode_ci
                                AND (
                                    fp.status = 'completo'
                                    OR fp.status IS NULL
                                )
                                ORDER BY
                                    fp.ordem IS NULL ASC,
                                    fp.ordem ASC,
                                    fp.id ASC
                                LIMIT 1
                            ),
                            'default.webp'
                        ) AS foto_perfil
                    FROM localizacao_membro AS lm
                    INNER JOIN membros AS m
                        ON
                            m.id COLLATE utf8mb4_unicode_ci =
                            lm.membro_id COLLATE utf8mb4_unicode_ci
                    WHERE
                        lm.localizacao_ativa = 1
                    AND lm.visivel = 1
                    AND lm.latitude IS NOT NULL
                    AND lm.longitude IS NOT NULL
                    AND lm.atualizada_em >=
                        DATE_SUB(
                            UTC_TIMESTAMP(),
                            INTERVAL " .
                            self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS .
                            " SECOND
                        )
                    "
                );

            $statement->execute();

            $visiveisAgora = [];

            foreach (
                $statement->fetchAll(
                    PDO::FETCH_ASSOC
                )
                as $linha
            ) {
                $membroId =
                    trim(
                        (string) (
                            $linha['membro_id']
                            ?? ''
                        )
                    );

                $latitude =
                    filter_var(
                        $linha['latitude']
                            ?? null,
                        FILTER_VALIDATE_FLOAT
                    );

                $longitude =
                    filter_var(
                        $linha['longitude']
                            ?? null,
                        FILTER_VALIDATE_FLOAT
                    );

                $atualizadaEm =
                    (int) (
                        $linha['atualizada_em_epoch']
                        ?? 0
                    );

                $faixaEtaria =
                    $this->obterFaixaEtaria(
                        (string) (
                            $linha['nascimento']
                            ?? ''
                        )
                    );

                if (
                    $membroId === '' ||
                    $latitude === false ||
                    $longitude === false ||
                    $latitude < -90 ||
                    $latitude > 90 ||
                    $longitude < -180 ||
                    $longitude > 180 ||
                    $atualizadaEm <= 0 ||
                    $faixaEtaria === null
                ) {
                    continue;
                }

                $temLigacaoAberta =
                    !empty(
                        $this->ligacoesPorMembro[
                            $membroId
                        ]
                    );

                /*
                 * O estado em tempo real prevalece sobre uma linha de BD que
                 * ainda não recebeu a atualização de invisível/desativado.
                 */
                if (
                    $temLigacaoAberta &&
                    (
                        !$this->membroTemLigacaoVisivel(
                            $membroId
                        ) ||
                        !$this->membroTemLigacaoComLocalizacaoAtiva(
                            $membroId
                        )
                    )
                ) {
                    continue;
                }

                $visiveisAgora[
                    $membroId
                ] = true;

                /*
                 * Uma posição WebSocket mais recente prevalece sobre a cópia
                 * que chegou pelo endpoint nativo de segundo plano.
                 */
                if (
                    !isset(
                        $this->localizacoes[
                            $membroId
                        ]
                    ) ||
                    (
                        (int) (
                            $this->localizacoes[
                                $membroId
                            ][
                                'updated_at'
                            ] ?? 0
                        )
                    ) <
                    $atualizadaEm
                ) {
                    $this->localizacoes[
                        $membroId
                    ] = [
                        'latitude' =>
                            (float) $latitude,

                        'longitude' =>
                            (float) $longitude,

                        'accuracy' =>
                            max(
                                0.0,
                                min(
                                    10000.0,
                                    (float) (
                                        $linha['precisao_m']
                                        ?? 0
                                    )
                                )
                            ),

                        'updated_at' =>
                            $atualizadaEm,

                        'source' =>
                            'background'
                    ];
                }

                $this->faixaEtariaPorMembro[
                    $membroId
                ] = $faixaEtaria;

                if (
                    !$this->membroTemLigacaoVisivel(
                        $membroId
                    )
                ) {
                    $foto =
                        basename(
                            trim(
                                (string) (
                                    $linha['foto_perfil']
                                    ?? 'default.webp'
                                )
                            )
                        );

                    if ($foto === '') {
                        $foto =
                            'default.webp';
                    }

                    $pessoaAtual =
                        $this->pessoas[
                            $membroId
                        ] ?? [];

                    $this->pessoas[
                        $membroId
                    ] = [
                        'id' =>
                            $membroId,

                        'membro_id' =>
                            $membroId,

                        'nome' =>
                            trim(
                                (string) (
                                    $linha['nome']
                                    ?? ''
                                )
                            ),

                        'src' =>
                            '/imagens/fotos-perfil/' .
                            rawurlencode(
                                $foto
                            ),

                        'faixa_etaria' =>
                            $faixaEtaria,

                        'top' =>
                            isset(
                                $pessoaAtual['top']
                            )
                                ? (int) $pessoaAtual['top']
                                : random_int(
                                    50,
                                    600
                                ),

                        'left' =>
                            isset(
                                $pessoaAtual['left']
                            )
                                ? (int) $pessoaAtual['left']
                                : random_int(
                                    50,
                                    400
                                )
                    ];
                }
            }

            foreach (
                array_keys(
                    $this->membrosVisiveisPorPersistencia
                )
                as $membroId
            ) {
                if (
                    isset(
                        $visiveisAgora[
                            $membroId
                        ]
                    )
                ) {
                    continue;
                }

                if (
                    !$this->membroTemLigacaoVisivel(
                        $membroId
                    )
                ) {
                    unset(
                        $this->pessoas[
                            $membroId
                        ]
                    );
                }

                if (
                    (
                        $this->localizacoes[
                            $membroId
                        ][
                            'source'
                        ] ?? ''
                    ) ===
                    'background'
                ) {
                    unset(
                        $this->localizacoes[
                            $membroId
                        ]
                    );
                }
            }

            $this->membrosVisiveisPorPersistencia =
                $visiveisAgora;

            $this->localizacoesPersistidasCarregadasEm =
                $agora;
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function estaoDentroDoRaio(
        string $primeiroMembroId,
        string $segundoMembroId
    ): bool {
        $agora =
            time();

        $primeira =
            $this->localizacoes[
                $primeiroMembroId
            ] ?? null;

        $segunda =
            $this->localizacoes[
                $segundoMembroId
            ] ?? null;

        if (
            !$this->localizacaoEstaValida(
                $primeira,
                $agora
            ) ||
            !$this->localizacaoEstaValida(
                $segunda,
                $agora
            )
        ) {
            return false;
        }

        return (
            $this->calcularDistanciaMetros(
                $primeira['latitude'],
                $primeira['longitude'],
                $segunda['latitude'],
                $segunda['longitude']
            ) <=
            self::RAIO_MAXIMO_METROS
        );
    }

    private function localizacaoEstaValida(
        ?array $localizacao,
        int $agora
    ): bool {
        if ($localizacao === null) {
            return false;
        }

        return (
            $agora -
            (int) (
                $localizacao['updated_at']
                ?? 0
            )
        ) <=
        self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS;
    }

    private function obterFaixaEtaria(
        string $nascimento
    ): ?string {
        return Validate::ageGroup(
            $nascimento
        );
    }

    private function membrosNaMesmaFaixaEtaria(
        string $primeiroMembroId,
        string $segundoMembroId
    ): bool {
        $primeiraFaixa =
            $this->faixaEtariaPorMembro[
                $primeiroMembroId
            ] ?? null;

        $segundaFaixa =
            $this->faixaEtariaPorMembro[
                $segundoMembroId
            ] ?? null;

        if ($primeiraFaixa === null) {
            $primeiroMembro =
                $this->obterMembro(
                    $primeiroMembroId
                );

            if (!$primeiroMembro) {
                return false;
            }

            $primeiraFaixa =
                $this->obterFaixaEtaria(
                    (string) (
                        $primeiroMembro['nascimento']
                        ?? ''
                    )
                );

            if ($primeiraFaixa === null) {
                return false;
            }

            $this->faixaEtariaPorMembro[
                $primeiroMembroId
            ] = $primeiraFaixa;
        }

        if ($segundaFaixa === null) {
            $segundoMembro =
                $this->obterMembro(
                    $segundoMembroId
                );

            if (!$segundoMembro) {
                return false;
            }

            $segundaFaixa =
                $this->obterFaixaEtaria(
                    (string) (
                        $segundoMembro['nascimento']
                        ?? ''
                    )
                );

            if ($segundaFaixa === null) {
                return false;
            }

            $this->faixaEtariaPorMembro[
                $segundoMembroId
            ] = $segundaFaixa;
        }

        return (
            $primeiraFaixa ===
            $segundaFaixa
        );
    }

    private function interacaoMensagensPermitida(
        string $primeiroMembroId,
        string $segundoMembroId
    ): bool {
        $primeiroMembroId =
            trim(
                $primeiroMembroId
            );

        $segundoMembroId =
            trim(
                $segundoMembroId
            );

        if (
            $primeiroMembroId === '' ||
            $segundoMembroId === '' ||
            hash_equals(
                $primeiroMembroId,
                $segundoMembroId
            )
        ) {
            return false;
        }

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    "
                    SELECT
                        id,
                        nascimento
                    FROM membros
                    WHERE id = :primeiro
                    OR id = :segundo
                    "
                );

            $statement->execute([
                'primeiro' =>
                    $primeiroMembroId,

                'segundo' =>
                    $segundoMembroId
            ]);

            $membros = [];

            foreach (
                $statement->fetchAll(
                    PDO::FETCH_ASSOC
                )
                as $membro
            ) {
                $id =
                    trim(
                        (string) (
                            $membro['id']
                            ?? ''
                        )
                    );

                if ($id !== '') {
                    $membros[
                        $id
                    ] = $membro;
                }
            }

            if (
                !isset(
                    $membros[
                        $primeiroMembroId
                    ],
                    $membros[
                        $segundoMembroId
                    ]
                )
            ) {
                return false;
            }

            $primeiraFaixa =
                $this->obterFaixaEtaria(
                    (string) (
                        $membros[
                            $primeiroMembroId
                        ][
                            'nascimento'
                        ] ?? ''
                    )
                );

            $segundaFaixa =
                $this->obterFaixaEtaria(
                    (string) (
                        $membros[
                            $segundoMembroId
                        ][
                            'nascimento'
                        ] ?? ''
                    )
                );

            if (
                $primeiraFaixa === null ||
                $segundaFaixa === null ||
                $primeiraFaixa !==
                    $segundaFaixa
            ) {
                return false;
            }

            $statement =
                $database->prepare(
                    "
                    SELECT 1
                    FROM bloqueados
                    WHERE (
                        pessoa_bloqueou_id = :primeiro1
                        AND
                        pessoa_bloqueada_id = :segundo1
                    )
                    OR (
                        pessoa_bloqueou_id = :segundo2
                        AND
                        pessoa_bloqueada_id = :primeiro2
                    )
                    LIMIT 1
                    "
                );

            $statement->execute([
                'primeiro1' =>
                    $primeiroMembroId,

                'segundo1' =>
                    $segundoMembroId,

                'segundo2' =>
                    $segundoMembroId,

                'primeiro2' =>
                    $primeiroMembroId
            ]);

            return (
                !$statement
                    ->fetchColumn()
            );
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function existeConversaMensagens(
        string $primeiroMembroId,
        string $segundoMembroId
    ): bool {
        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    "
                    SELECT 1
                    FROM mensagens_chat
                    WHERE (
                        emissor_id = :primeiro1
                        AND destinatario_id = :segundo1
                    )
                    OR (
                        emissor_id = :segundo2
                        AND destinatario_id = :primeiro2
                    )
                    LIMIT 1
                    "
                );

            $statement->execute([
                'primeiro1' =>
                    $primeiroMembroId,

                'segundo1' =>
                    $segundoMembroId,

                'segundo2' =>
                    $segundoMembroId,

                'primeiro2' =>
                    $primeiroMembroId
            ]);

            return (
                (bool) $statement
                    ->fetchColumn()
            );
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function propositoAcessoPerfil(
        string $membroId
    ): string {
        return (
            'profile:' .
            substr(
                hash(
                    'sha256',
                    $membroId
                ),
                0,
                24
            )
        );
    }

    private function limparAcessosPerfilExpirados(
        PDO $database,
        int $agora
    ): void {
        if (
            (
                $agora -
                $this->acessosPerfilLimposEm
            ) <
            self::ACESSO_PERFIL_LIMPEZA_SEGUNDOS
        ) {
            return;
        }

        $statement =
            $database->prepare(
                "
                DELETE FROM token
                WHERE
                    proposito LIKE 'profile:%'
                AND validade <= UTC_TIMESTAMP()
                "
            );

        $statement->execute();

        $this->acessosPerfilLimposEm =
            $agora;

        foreach (
            $this->acessosPerfil
            as $chave => $acesso
        ) {
            if (
                (int) (
                    $acesso['expira_em']
                    ?? 0
                ) <=
                $agora
            ) {
                unset(
                    $this->acessosPerfil[
                        $chave
                    ]
                );
            }
        }
    }

    private function obterTokenAcessoPerfil(
        string $visualizadorId,
        string $perfilId
    ): ?string {
        if (
            $visualizadorId ===
                $perfilId ||
            $this->membrosEstaoBloqueadosNoCache(
                $visualizadorId,
                $perfilId
            ) ||
            !$this->membrosNaMesmaFaixaEtaria(
                $visualizadorId,
                $perfilId
            )
        ) {
            return null;
        }

        $agora =
            time();

        $chave =
            $visualizadorId .
            '>' .
            $perfilId;

        $acessoAtual =
            $this->acessosPerfil[
                $chave
            ] ?? null;

        if (
            is_array(
                $acessoAtual
            ) &&
            (
                (int) (
                    $acessoAtual['expira_em']
                    ?? 0
                )
            ) >
            (
                $agora +
                self::ACESSO_PERFIL_RENOVAR_ANTES_SEGUNDOS
            ) &&
            preg_match(
                '/^[a-f0-9]{64}$/',
                (string) (
                    $acessoAtual['token']
                    ?? ''
                )
            )
        ) {
            return (
                (string) $acessoAtual[
                    'token'
                ]
            );
        }

        $database = null;
        $delete = null;
        $insert = null;

        try {
            $database =
                $this->getDatabase();

            $this->limparAcessosPerfilExpirados(
                $database,
                $agora
            );

            $token =
                bin2hex(
                    random_bytes(
                        32
                    )
                );

            $tokenHash =
                hash(
                    'sha256',
                    $token
                );

            $proposito =
                $this->propositoAcessoPerfil(
                    $visualizadorId
                );

            $expiraEm =
                $agora +
                self::ACESSO_PERFIL_VALIDADE_SEGUNDOS;

            $database->beginTransaction();

            $delete =
                $database->prepare(
                    "
                    DELETE FROM token
                    WHERE membro_id = :perfil_id
                    AND proposito = :proposito
                    "
                );

            $delete->execute([
                'perfil_id' =>
                    $perfilId,

                'proposito' =>
                    $proposito
            ]);

            $insert =
                $database->prepare(
                    "
                    INSERT INTO token (
                        token,
                        membro_id,
                        validade,
                        proposito
                    )
                    VALUES (
                        :token,
                        :perfil_id,
                        :validade,
                        :proposito
                    )
                    "
                );

            $insert->execute([
                'token' =>
                    $tokenHash,

                'perfil_id' =>
                    $perfilId,

                'validade' =>
                    gmdate(
                        'Y-m-d H:i:s',
                        $expiraEm
                    ),

                'proposito' =>
                    $proposito
            ]);

            $database->commit();

            $this->acessosPerfil[
                $chave
            ] = [
                'token' =>
                    $token,

                'expira_em' =>
                    $expiraEm
            ];

            return $token;
        } catch (\Throwable $erro) {
            if (
                $database instanceof PDO &&
                $database->inTransaction()
            ) {
                $database->rollBack();
            }

            echo sprintf(
                "[PROFILE ACCESS ERROR] %s -> %s: %s\n",
                $visualizadorId,
                $perfilId,
                $erro->getMessage()
            );

            return null;
        } finally {
            $delete = null;
            $insert = null;
            $database = null;
        }
    }

    private function calcularDistanciaMetros(
        float $latitude1,
        float $longitude1,
        float $latitude2,
        float $longitude2
    ): float {
        $raioTerra =
            6371000;

        $latitude1Rad =
            deg2rad(
                $latitude1
            );

        $latitude2Rad =
            deg2rad(
                $latitude2
            );

        $diferencaLatitude =
            deg2rad(
                $latitude2 -
                $latitude1
            );

        $diferencaLongitude =
            deg2rad(
                $longitude2 -
                $longitude1
            );

        $a =
            sin(
                $diferencaLatitude /
                2
            ) ** 2 +
            cos(
                $latitude1Rad
            ) *
            cos(
                $latitude2Rad
            ) *
            sin(
                $diferencaLongitude /
                2
            ) ** 2;

        $a =
            min(
                1.0,
                max(
                    0.0,
                    $a
                )
            );

        $c =
            2 *
            atan2(
                sqrt(
                    $a
                ),
                sqrt(
                    1 -
                    $a
                )
            );

        return (
            $raioTerra *
            $c
        );
    }

    public function onClose(
        ConnectionInterface $conn
    ): void {
        if (
            $this->clients->contains(
                $conn
            )
        ) {
            $this->clients->detach(
                $conn
            );
        }

        $membroId =
            $this->obterMembroDaLigacao(
                $conn
            );

        if (
            $membroId !==
            null
        ) {
            $this->removerLigacaoDoMembro(
                $conn,
                $membroId
            );
        }

        echo sprintf(
            "[CLOSE] Ligação %d fechada. Pessoas: %d. Ligações: %d\n",
            $conn->resourceId,
            count(
                $this->pessoas
            ),
            count(
                $this->clients
            )
        );

        $this->enviarEstadosIndividuais();
    }

    private function removerLigacaoDoMembro(
        ConnectionInterface $conn,
        string $membroId
    ): void {
        unset(
            $this->membroPorLigacao[
                $conn->resourceId
            ],
            $this->localizacaoPorLigacao[
                $conn->resourceId
            ],
            $this->visibilidadePorLigacao[
                $conn->resourceId
            ],
            $this->ligacoesPorMembro[
                $membroId
            ][
                $conn->resourceId
            ]
        );

        if (
            empty(
                $this->ligacoesPorMembro[
                    $membroId
                ]
            )
        ) {
            unset(
                $this->ligacoesPorMembro[
                    $membroId
                ]
            );
        }

        if (
            !$this->membroTemLigacaoVisivel(
                $membroId
            ) ||
            !$this->membroTemLigacaoComLocalizacaoAtiva(
                $membroId
            )
        ) {
            $this->agendarSaida(
                $membroId
            );
        }
    }

    private function membroTemLigacaoVisivel(
        string $membroId
    ): bool {
        foreach (
            $this->ligacoesPorMembro[
                $membroId
            ] ?? []
            as $resourceId => $ligacao
        ) {
            if (
                $this->visibilidadePorLigacao[
                    $resourceId
                ] ?? false
            ) {
                return true;
            }
        }

        return false;
    }

    private function membroTemLigacaoComLocalizacaoAtiva(
        string $membroId
    ): bool {
        foreach (
            $this->ligacoesPorMembro[
                $membroId
            ] ?? []
            as $resourceId => $ligacao
        ) {
            if (
                $this->localizacaoPorLigacao[
                    $resourceId
                ] ?? false
            ) {
                return true;
            }
        }

        return false;
    }

    private function agendarSaida(
        string $membroId
    ): void {
        $this->cancelarSaidaAgendada(
            $membroId
        );

        $this->temporizadoresSaida[
            $membroId
        ] =
            $this->loop->addTimer(
                self::TOLERANCIA_NAVEGACAO_SEGUNDOS,
                function () use (
                    $membroId
                ): void {
                    unset(
                        $this->temporizadoresSaida[
                            $membroId
                        ]
                    );

                    $removeuPessoa =
                        false;

                    $removeuLocalizacao =
                        false;

                    if (
                        !$this->membroTemLigacaoVisivel(
                            $membroId
                        ) &&
                        !isset(
                            $this->membrosVisiveisPorPersistencia[
                                $membroId
                            ]
                        )
                    ) {
                        $removeuPessoa =
                            isset(
                                $this->pessoas[
                                    $membroId
                                ]
                            );

                        unset(
                            $this->pessoas[
                                $membroId
                            ]
                        );
                    }

                    if (
                        !$this->membroTemLigacaoComLocalizacaoAtiva(
                            $membroId
                        ) &&
                        !isset(
                            $this->membrosVisiveisPorPersistencia[
                                $membroId
                            ]
                        )
                    ) {
                        $removeuLocalizacao =
                            isset(
                                $this->localizacoes[
                                    $membroId
                                ]
                            );

                        unset(
                            $this->localizacoes[
                                $membroId
                            ]
                        );
                    }

                    if (
                        !$removeuPessoa &&
                        !$removeuLocalizacao
                    ) {
                        return;
                    }

                    echo sprintf(
                        "[OFFLINE] %s atualizado após o período de tolerância. Pessoas: %d\n",
                        $membroId,
                        count(
                            $this->pessoas
                        )
                    );

                    $this->enviarEstadosIndividuais();
                }
            );
    }

    private function cancelarSaidaAgendada(
        string $membroId
    ): void {
        $temporizador =
            $this->temporizadoresSaida[
                $membroId
            ] ?? null;

        if (
            !$temporizador instanceof
            TimerInterface
        ) {
            return;
        }

        $this->loop->cancelTimer(
            $temporizador
        );

        unset(
            $this->temporizadoresSaida[
                $membroId
            ]
        );
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

    private function obterMembroDaLigacao(
        ConnectionInterface $conn
    ): ?string {
        return (
            $this->membroPorLigacao[
                $conn->resourceId
            ] ?? null
        );
    }

    private function enviarErro(
        ConnectionInterface $conn,
        string $mensagem
    ): void {
        $this->enviar(
            $conn,
            [
                'type' =>
                    'error',

                'message' =>
                    $mensagem
            ]
        );
    }

    private function enviarErroHey(
        ConnectionInterface $conn,
        string $destinatarioId,
        string $mensagem
    ): void {
        $this->enviar(
            $conn,
            [
                'type' =>
                    'notification_not_delivered',

                'destinatario_id' =>
                    $destinatarioId,

                'message' =>
                    $mensagem
            ]
        );
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

    private function lerBooleano(
        array $data,
        string $chave,
        bool $padrao
    ): bool {
        if (
            !array_key_exists(
                $chave,
                $data
            )
        ) {
            return $padrao;
        }

        $valor =
            filter_var(
                $data[
                    $chave
                ],
                FILTER_VALIDATE_BOOLEAN,
                FILTER_NULL_ON_FAILURE
            );

        return (
            $valor ??
            $padrao
        );
    }

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

    private function atualizarBloqueios(
        ConnectionInterface $conn,
        array $data
    ): void {
        $membroId =
            $this->obterMembroDaLigacao(
                $conn
            );

        $destinatarioId =
            trim(
                (string) (
                    $data['target_id']
                    ?? ''
                )
            );

        if ($membroId === null) {
            $this->enviarErro(
                $conn,
                'A ligação não está autenticada.'
            );

            return;
        }

        if (
            $destinatarioId === '' ||
            $destinatarioId ===
            $membroId
        ) {
            $this->enviarErro(
                $conn,
                'O bloqueio indicado não é válido.'
            );

            return;
        }

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->prepare(
                    "
                    SELECT 1
                    FROM bloqueados
                    WHERE
                        pessoa_bloqueou_id = :membro_id
                    AND
                        pessoa_bloqueada_id = :destinatario_id
                    LIMIT 1
                    "
                );

            $statement->execute([
                'membro_id' =>
                    $membroId,

                'destinatario_id' =>
                    $destinatarioId
            ]);

            if (
                !$statement
                    ->fetchColumn()
            ) {
                $this->enviarErro(
                    $conn,
                    'O bloqueio ainda não foi registado.'
                );

                return;
            }
        } finally {
            $statement = null;
            $database = null;
        }

        $this->carregarBloqueios(
            true
        );

        $this->enviarEstadosIndividuais();

        echo sprintf(
            "[BLOCK] Estado atualizado entre %s e %s.\n",
            $membroId,
            $destinatarioId
        );
    }

    private function carregarBloqueios(
        bool $forcar = false
    ): bool {
        $agora =
            time();

        if (
            !$forcar &&
            (
                $agora -
                $this->bloqueiosCarregadosEm
            ) <
            self::BLOQUEIOS_CACHE_SEGUNDOS
        ) {
            return false;
        }

        $database = null;
        $statement = null;

        try {
            $database =
                $this->getDatabase();

            $statement =
                $database->query(
                    "
                    SELECT
                        pessoa_bloqueou_id,
                        pessoa_bloqueada_id
                    FROM bloqueados
                    ORDER BY
                        pessoa_bloqueou_id,
                        pessoa_bloqueada_id
                    "
                );

            $bloqueios = [];

            foreach (
                $statement->fetchAll(
                    PDO::FETCH_ASSOC
                )
                as $bloqueio
            ) {
                $primeiroId =
                    trim(
                        (string) (
                            $bloqueio[
                                'pessoa_bloqueou_id'
                            ] ?? ''
                        )
                    );

                $segundoId =
                    trim(
                        (string) (
                            $bloqueio[
                                'pessoa_bloqueada_id'
                            ] ?? ''
                        )
                    );

                if (
                    $primeiroId === '' ||
                    $segundoId === '' ||
                    $primeiroId ===
                        $segundoId
                ) {
                    continue;
                }

                $bloqueios[
                    $primeiroId
                ][
                    $segundoId
                ] = true;

                $bloqueios[
                    $segundoId
                ][
                    $primeiroId
                ] = true;
            }

            ksort(
                $bloqueios
            );

            foreach (
                $bloqueios
                as &$membrosBloqueados
            ) {
                ksort(
                    $membrosBloqueados
                );
            }

            unset(
                $membrosBloqueados
            );

            $assinatura =
                hash(
                    'sha256',
                    serialize(
                        $bloqueios
                    )
                );

            $alterou =
                $assinatura !==
                $this->assinaturaBloqueios;

            $this->bloqueiosEntreMembros =
                $bloqueios;

            $this->assinaturaBloqueios =
                $assinatura;

            $this->bloqueiosCarregadosEm =
                $agora;

            return $alterou;
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function membrosEstaoBloqueados(
        string $primeiroId,
        string $segundoId
    ): bool {
        try {
            $this->carregarBloqueios();
        } catch (\Throwable $erro) {
            echo sprintf(
                "[BLOCK CACHE ERROR] %s\n",
                $erro->getMessage()
            );
        }

        return (
            $this->membrosEstaoBloqueadosNoCache(
                $primeiroId,
                $segundoId
            )
        );
    }

    private function membrosEstaoBloqueadosNoCache(
        string $primeiroId,
        string $segundoId
    ): bool {
        return isset(
            $this->bloqueiosEntreMembros[
                $primeiroId
            ][
                $segundoId
            ]
        );
    }
}