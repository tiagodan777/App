<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;

class WebSocket implements MessageComponentInterface
{
    private const RAIO_MAXIMO_METROS = 100;
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS = 90;

    private \SplObjectStorage $clients;
    private $pdoFactory;
    private array $membroPorLigacao = [];
    private array $ligacoesPorMembro = [];
    private array $pessoas = [];
    private array $localizacoes = [];

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
            throw new \RuntimeException('A fábrica da base de dados não devolveu um PDO.');
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

                case 'move':
                    $this->moverPessoa($from, $data);
                    break;

                case 'notify':
                    $this->notificarPessoa($from, $data);
                    break;

                case 'ping':
                    $this->enviar($from, ['type' => 'pong', 'timestamp' => time()]);
                    break;

                default:
                    $this->enviarErro($from, 'Tipo de mensagem desconhecido.');
                    break;
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

    private function autenticarPessoa(ConnectionInterface $conn, array $data): void {
        $membroId = trim((string) ($data['membro_id'] ?? ''));

        if ($membroId === '') {
            $this->enviarErro($conn, 'Não foi recebido um membro válido.');

            return;
        }

        $membroAnterior =
            $this->membroPorLigacao[$conn->resourceId] ?? null;

        if ($membroAnterior !== null && $membroAnterior !== $membroId) {
            $this->removerLigacaoDoMembro($conn, $membroAnterior);
        }

        $membro = $this->obterMembro($membroId);

        if (!$membro) {
            echo sprintf("[AUTH ERROR] Membro não encontrado: %s\n",$membroId);

            $this->enviarErro($conn, 'O membro não foi encontrado.');

            return;
        }

        $foto = basename(
            trim(
                (string) ($membro['foto_perfil'] ?? 'default.webp'))
        );

        if ($foto === '') {
            $foto = 'default.webp';
        }

        $this->membroPorLigacao[$conn->resourceId] = $membroId;

        if (!isset($this->ligacoesPorMembro[$membroId])) {
            $this->ligacoesPorMembro[$membroId] = [];
        }

        $this->ligacoesPorMembro[$membroId][$conn->resourceId] = $conn;

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
            $this->pessoas[$membroId]['nome'] = trim((string) ($membro['nome'] ?? ''));

            $this->pessoas[$membroId]['src'] = '/imagens/fotos-perfil/' . $foto;
        }

        echo sprintf(
            "[AUTH] Ligação %d autenticada como %s. Pessoas: %d. Ligações deste membro: %d\n",
            $conn->resourceId,
            $membroId,
            count($this->pessoas),
            count($this->ligacoesPorMembro[$membroId])
        );

        $this->enviar($conn, ['type' => 'authenticated', 'membro_id' => $membroId]);

        $this->enviarEstadosIndividuais();
    }

    private function obterMembro(string $membroId): array|false
    {
        $sql = "
            SELECT m.id AS membro_id, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                COALESCE((SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE fp.membro_id = m.id
                        AND (fp.status = 'completo' OR fp.status IS NULL)

                        ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC

                        LIMIT 1), 'default.webp') AS foto_perfil

            FROM membros AS m
            WHERE m.id = :membro_id
            LIMIT 1";

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

    private function atualizarLocalizacao(ConnectionInterface $conn, array $data): void {
        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId === null) {
            $this->enviarErro($conn, 'A ligação não está autenticada.');

            return;
        }

        if (!isset($data['latitude']) ||!isset($data['longitude'])) {
            $this->enviarErro($conn, 'A localização recebida está incompleta.');

            return;
        }

        $latitude = filter_var($data['latitude'], FILTER_VALIDATE_FLOAT);

        $longitude = filter_var($data['longitude'] ,FILTER_VALIDATE_FLOAT);

        $accuracy = filter_var($data['accuracy'] ?? 0, FILTER_VALIDATE_FLOAT);

        if ($latitude === false || $longitude === false || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            $this->enviarErro($conn, 'As coordenadas recebidas não são válidas.');

            return;
        }

        if ($accuracy === false || $accuracy < 0) {
            $accuracy = 0;
        }

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
            'updated_at' =>
                $this->localizacoes[$membroId]['updated_at']
        ]);

        $this->enviarEstadosIndividuais();
    }

    private function moverPessoa(ConnectionInterface $conn, array $data): void {
        $membroId = $this->obterMembroDaLigacao($conn);

        if ($membroId === null ||!isset($this->pessoas[$membroId])) {
            return;
        }

        $top = $this->limitarNumero((int) ($data['top'] ?? 0), -2000,2000);

        $left = $this->limitarNumero((int) ($data['left'] ?? 0), -2000, 2000);

        if ($top === 0 && $left === 0) {
            return;
        }

        $this->pessoas[$membroId]['top'] += $top;
        $this->pessoas[$membroId]['left'] += $left;

        $this->enviarEstadosIndividuais();
    }

    private function notificarPessoa(ConnectionInterface $from, array $data): void {
        $remetenteId = $this->obterMembroDaLigacao($from);

        if ($remetenteId === null) {
            $this->enviarErro($from, 'Tens de estar autenticado para enviar um Hey.');

            return;
        }

        $remetente = $this->pessoas[$remetenteId] ?? null;

        if (!$remetente) {
            return;
        }

        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));

        if ($destinatarioId === '') {
            $this->enviarErro($from, 'O destinatário não é válido.');

            return;
        }

        if ($destinatarioId === $remetenteId) {
            $this->enviarErro($from, 'Não podes enviar um Hey para ti próprio.');

            return;
        }

        if (!$this->estaoDentroDoRaio($remetenteId, $destinatarioId)) {
            $this->enviarErro($from, 'Esta pessoa já não está num raio de 100 metros.');

            $this->enviarEstadosIndividuais();

            return;
        }

        $ligacoesDestinatario = $this->ligacoesPorMembro[$destinatarioId] ?? [];

        if ($ligacoesDestinatario === []) {
            $this->enviar($from, [
                'type' => 'notification_not_delivered',
                'destinatario_id' => $destinatarioId,
                'message' =>
                    'O utilizador não está ligado neste momento.'
            ]);

            return;
        }

        $notificacaoId = $this->guardarNotificacao(
            $remetenteId,
            $destinatarioId
        );

        $numeroEntregas = 0;

        foreach ($ligacoesDestinatario as $client) {
            $this->enviar($client, [
                'type' => 'notification',
                'notification_id' => $notificacaoId,
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
            'notification_id' => $notificacaoId,
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
                :tipo,
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
                'destinatario_id' => $destinatarioId,
                'tipo' => 'hey'
            ]);

            return (int) $database->lastInsertId();
        } finally {
            $statement = null;
            $database = null;
        }
    }

    private function enviarEstadosIndividuais(): void
    {
        $agora = time();

        foreach ($this->clients as $client) {
            $membroId =
                $this->membroPorLigacao[$client->resourceId]
                ?? null;

            if ($membroId === null) {
                continue;
            }

            $pessoasVisiveis = [];

            $minhaLocalizacao =
                $this->localizacoes[$membroId]
                ?? null;

            $minhaLocalizacaoValida =
                $this->localizacaoEstaValida(
                    $minhaLocalizacao,
                    $agora
                );

            foreach (
                $this->pessoas
                as $outroMembroId => $pessoa
            ) {
                if ($outroMembroId === $membroId) {
                    $pessoa['distance_m'] = 0;
                    $pessoasVisiveis[] = $pessoa;

                    continue;
                }

                $outraLocalizacao =
                    $this->localizacoes[$outroMembroId]
                    ?? null;

                $outraLocalizacaoValida =
                    $this->localizacaoEstaValida(
                        $outraLocalizacao,
                        $agora
                    );

                /*
                * Fallback temporário para HTTP:
                *
                * enquanto não existir localização válida,
                * mostra todas as pessoas online.
                */
                if (
                    !$minhaLocalizacaoValida ||
                    !$outraLocalizacaoValida
                ) {
                    $pessoa['distance_m'] = null;
                    $pessoasVisiveis[] = $pessoa;

                    continue;
                }

                $distancia =
                    $this->calcularDistanciaMetros(
                        $minhaLocalizacao['latitude'],
                        $minhaLocalizacao['longitude'],
                        $outraLocalizacao['latitude'],
                        $outraLocalizacao['longitude']
                    );

                if (
                    $distancia >
                    self::RAIO_MAXIMO_METROS
                ) {
                    continue;
                }

                $pessoa['distance_m'] =
                    (int) round($distancia);

                $pessoasVisiveis[] = $pessoa;
            }

            $this->enviar($client, [
                'type' => 'state',
                'radius_m' =>
                    self::RAIO_MAXIMO_METROS,
                'location_filter_active' =>
                    $minhaLocalizacaoValida,
                'people' => $pessoasVisiveis
            ]);
        }

        echo sprintf(
            "[STATE] Estados individuais enviados para %d ligação(ões)\n",
            count($this->clients)
        );
    }

    private function estaoDentroDoRaio(
        string $primeiroMembroId,
        string $segundoMembroId
    ): bool {
        $agora = time();

        $primeira =
            $this->localizacoes[$primeiroMembroId]
            ?? null;

        $segunda =
            $this->localizacoes[$segundoMembroId]
            ?? null;

        /*
        * Fallback temporário para HTTP.
        *
        * Sem localização, permite o Hey entre
        * pessoas que estejam online.
        */
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
            return isset(
                $this->pessoas[$primeiroMembroId],
                $this->pessoas[$segundoMembroId]
            );
        }

        $distancia =
            $this->calcularDistanciaMetros(
                $primeira['latitude'],
                $primeira['longitude'],
                $segunda['latitude'],
                $segunda['longitude']
            );

        return (
            $distancia <=
            self::RAIO_MAXIMO_METROS
        );
    }

    private function localizacaoEstaValida(?array $localizacao,int $agora): bool {
        if ($localizacao === null) {
            return false;
        }

        return ($agora - (int) $localizacao['updated_at']) <= self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS;
    }

    private function calcularDistanciaMetros(float $latitude1, float $longitude1, float $latitude2, float $longitude2): float {
        $raioTerraMetros = 6371000;

        $latitude1Rad = deg2rad($latitude1);
        $latitude2Rad = deg2rad($latitude2);

        $diferencaLatitude = deg2rad($latitude2 - $latitude1);

        $diferencaLongitude = deg2rad($longitude2 - $longitude1);

        $a = sin($diferencaLatitude / 2) ** 2 + cos($latitude1Rad) * cos($latitude2Rad) * sin($diferencaLongitude / 2) ** 2;

        $c = 2 * atan2(sqrt($a),sqrt(1 - $a));

        return $raioTerraMetros * $c;
    }

    public function onClose(ConnectionInterface $conn): void
    {
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
        unset($this->membroPorLigacao[$conn->resourceId]);

        unset(
            $this->ligacoesPorMembro[$membroId][$conn->resourceId]);

        if (empty($this->ligacoesPorMembro[$membroId])) {
            unset($this->ligacoesPorMembro[$membroId]);
            unset($this->pessoas[$membroId]);
            unset($this->localizacoes[$membroId]);
        }
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void {
        echo sprintf(
            "[CONNECTION ERROR] Ligação %d: %s\n",
            $conn->resourceId,
            $e->getMessage()
        );

        $conn->close();
    }

    private function obterMembroDaLigacao(ConnectionInterface $conn): ?string {
        return $this->membroPorLigacao[
            $conn->resourceId
        ] ?? null;
    }

    private function enviarErro(ConnectionInterface $conn, string $mensagem): void {
        $this->enviar($conn, [
            'type' => 'error',
            'message' => $mensagem
        ]);
    }

    private function enviar(ConnectionInterface $conn, array $data): void {
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

    private function limitarNumero(int $numero, int $minimo, int $maximo): int {
        return max(
            $minimo,
            min($maximo, $numero)
        );
    }
}