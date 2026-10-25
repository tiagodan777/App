<?php
declare(strict_types=1);

namespace App\CMS\Realtime;

use App\CMS\ProximityConfig;
use App\CMS\Location;
use App\CMS\LocationSample;
use App\CMS\PushNotification;
use App\CMS\NearbyPresenceNotification;
use App\Validate\Validate;
use PDO;
use Ratchet\ConnectionInterface;
// Métodos de Discovery usados exclusivamente pela classe WebSocket.

trait Discovery {
    private array $nearbyConfirmation = [];
    private int $nearbyPrunedAt = 0;

    private function sincronizarEstadoCanonico(string $memberId): array {
        $state = (new Location($this->getDatabase()))->state($memberId);
        if ($state['revision'] > 0) {
            foreach ($this->ligacoesPorMembro[$memberId] ?? [] as $resourceId => $connection) {
                $this->localizacaoPorLigacao[$resourceId] = $state['active'];
                $this->visibilidadePorLigacao[$resourceId] = $state['visible'];
            }
        }
        return $state;
    }

    private function atualizarPresenca(ConnectionInterface $conn, array $data): void {
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
        $localizacaoMembroAtiva = $this->membroTemLigacaoComLocalizacaoAtiva($membroId);
        $visibilidadeMembro = $this->membroTemLigacaoVisivel($membroId);
        $this->persistirEstadoPresencaParaProximidade($membroId, $localizacaoMembroAtiva, $visibilidadeMembro);
        $localizacaoAtiva = $this->localizacaoPorLigacao[$resourceId];
        $visivel = $this->visibilidadePorLigacao[$resourceId];
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

    private function sincronizarVisibilidadeMembro(string $membroId, ?array $membro = null): void {
        if ($membro === null) {
            $membro = $this->obterMembro($membroId);
        }
        if (!$membro) {
            unset($this->pessoas[$membroId], $this->faixaEtariaPorMembro[$membroId]);
            return;
        }
        $faixaEtaria = $this->obterFaixaEtaria((string) ($membro['nascimento'] ?? ''));
        if ($faixaEtaria === null) {
            unset($this->pessoas[$membroId], $this->faixaEtariaPorMembro[$membroId]);
            return;
        }
        $this->faixaEtariaPorMembro[$membroId] = $faixaEtaria;
        $state = $this->sincronizarEstadoCanonico($membroId);
        if ($state['revision'] > 0 ? $state['visible'] : $this->membroTemLigacaoVisivel($membroId)) {
            $this->garantirPessoaVisivel($membroId, $membro);
            return;
        }
        unset($this->pessoas[$membroId]);
    }

    private function garantirPessoaVisivel(string $membroId, ?array $membro = null): void {
        if ($membro === null) {
            $membro = $this->obterMembro($membroId);
        }
        if (!$membro) {
            unset($this->pessoas[$membroId], $this->faixaEtariaPorMembro[$membroId]);
            return;
        }
        $faixaEtaria = $this->obterFaixaEtaria((string) ($membro['nascimento'] ?? ''));
        if ($faixaEtaria === null) {
            unset($this->pessoas[$membroId], $this->faixaEtariaPorMembro[$membroId]);
            return;
        }
        $this->faixaEtariaPorMembro[$membroId] = $faixaEtaria;
        $foto = basename(trim((string) ($membro['foto_perfil'] ?? 'default.webp')));
        if ($foto === '') {
            $foto = 'default.webp';
        }
        $pessoaAtual = $this->pessoas[$membroId] ?? [];
        $this->pessoas[$membroId] = [
            'id' => $membroId,
            'membro_id' => $membroId,
            'nome' => trim((string) ($membro['nome'] ?? '')),
            'src' => '/imagens/fotos-perfil/' . rawurlencode($foto),
            'faixa_etaria' => $faixaEtaria,
            'top' => isset($pessoaAtual['top']) ? (int) $pessoaAtual['top'] : random_int(50, 600),
            'left' => isset($pessoaAtual['left']) ? (int) $pessoaAtual['left'] : random_int(50, 400)
        ];
    }

    private function obterPessoaParaInteracao(string $membroId): ?array {
        if (isset($this->pessoas[$membroId])) {
            return $this->pessoas[$membroId];
        }
        $membro = $this->obterMembro($membroId);
        if (!$membro) {
            return null;
        }
        $faixaEtaria = $this->obterFaixaEtaria((string) ($membro['nascimento'] ?? ''));
        if ($faixaEtaria === null) {
            return null;
        }
        $this->faixaEtariaPorMembro[$membroId] = $faixaEtaria;
        $foto = basename(trim((string) ($membro['foto_perfil'] ?? 'default.webp')));
        if ($foto === '') {
            $foto = 'default.webp';
        }
        return [
            'id' => $membroId,
            'membro_id' => $membroId,
            'nome' => trim((string) ($membro['nome'] ?? '')),
            'src' => '/imagens/fotos-perfil/' . rawurlencode($foto),
            'faixa_etaria' => $faixaEtaria
        ];
    }

    private function atualizarLocalizacao(ConnectionInterface $conn, array $data): void {
        $membroId = $this->obterMembroDaLigacao($conn);
        if ($membroId === null) {
            $this->enviarErro($conn, 'A ligação não está autenticada.');
            return;
        }
        $this->sincronizarEstadoCanonico($membroId);
        if (!($this->localizacaoPorLigacao[$conn->resourceId] ?? false)) {
            return;
        }
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
        if ($accuracy === false || $accuracy < 0) {
            $accuracy = 0;
        }
        try { $capturedAt = LocationSample::capturedAt($data); }
        catch (\InvalidArgumentException $invalidSample) { return; }
        $capturedEpoch = $capturedAt === null ? time() : (int)(new \DateTimeImmutable($capturedAt,new \DateTimeZone('UTC')))->format('U');
        if ($capturedAt !== null && isset($this->localizacoes[$membroId])
            && $capturedEpoch < (int)$this->localizacoes[$membroId]['updated_at']) return;
        $accepted = $this->persistirLocalizacaoParaProximidade(
            $membroId,
            (float) $latitude,
            (float) $longitude,
            min((float) $accuracy, 10000),
            $this->membroTemLigacaoVisivel($membroId),
            $capturedAt
        );
        // Native HTTP may already have persisted a newer sample. Never regress the live map.
        if ($capturedAt !== null && !$accepted) {
            $this->sincronizarLocalizacoesPersistidas(true);
            return;
        }
        $this->localizacoes[$membroId] = [
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy' => min((float) $accuracy, 10000),
            'updated_at' => $capturedEpoch,
            'source' => 'websocket'
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

    private function persistirLocalizacaoParaProximidade(
        string $membroId,
        float $latitude,
        float $longitude,
        float $accuracy,
        bool $visivel,
        ?string $capturedAt = null
    ): bool {
        $agora = microtime(true);
        $ultimaPersistencia = (float) ($this->ultimaPersistenciaLocalizacaoPorMembro[$membroId] ?? 0.0);
        if (
            $capturedAt === null && $ultimaPersistencia > 0 &&
            $agora - $ultimaPersistencia < self::PERSISTENCIA_LOCALIZACAO_INTERVALO_SEGUNDOS
        ) {
            return true;
        }
        $this->ultimaPersistenciaLocalizacaoPorMembro[$membroId] = $agora;
        try {
            $database = $this->getDatabase();
            $nearby = new NearbyPresenceNotification($database, new PushNotification($database));
            $posicaoAnterior = $nearby->locationSnapshot($membroId);
            $accepted = (new Location($database))->saveBackground($membroId,$latitude,$longitude,$accuracy,
                true,$visivel,$capturedAt,'foreground');
            if (!$accepted) return false;
            echo sprintf("[LOCATION PERSIST] %s gravado na BD. Visível=%s\n", $membroId, $visivel ? 'sim' : 'não');
            $posicaoNova = $visivel ? ['latitude' => $latitude, 'longitude' => $longitude] : null;
            /*
             * Isto faz com que a chegada/movimento desta pessoa
             * possa disparar imediatamente uma reavaliação de
             * utilizadores que estejam em background.
             */
            try { $nearby->processLocationChange($membroId, $posicaoAnterior, $posicaoNova); }
            catch (\Throwable $notificationError) { error_log('[LOCATION NEARBY] '.$notificationError->getMessage()); }
            return true;
        } catch (\Throwable $erro) {
            unset($this->ultimaPersistenciaLocalizacaoPorMembro[$membroId]);
            echo sprintf("[LOCATION PERSIST ERROR] %s: %s\n", $membroId, $erro->getMessage());
            return false;
        }
    }

    private function persistirEstadoPresencaParaProximidade(
        string $membroId,
        bool $localizacaoAtiva,
        bool $visivel
    ): void {
        $canonical = $this->sincronizarEstadoCanonico($membroId);
        if ($canonical['revision'] > 0) {
            $localizacaoAtiva = $canonical['active'];
            $visivel = $canonical['visible'];
        }
        if (!$localizacaoAtiva || !$visivel) {
            foreach (array_keys($this->nearbyConfirmation) as $pair) {
                if (str_starts_with($pair,$membroId.':') || str_ends_with($pair,':'.$membroId)) {
                    unset($this->nearbyConfirmation[$pair]);
                }
            }
        }
        try {
            $database = $this->getDatabase();
            $nearby = new NearbyPresenceNotification($database, new PushNotification($database));
            $posicaoAnterior = $nearby->locationSnapshot($membroId);
            $statement = $database->prepare("UPDATE localizacao_membro
                SET localizacao_ativa = :active, visivel = :visible,
                    recebida_em = IF(:hide_fence = 1,UTC_TIMESTAMP(3),recebida_em)
                WHERE membro_id = :member_id AND estado_versao = 0");
            $statement->execute([
                'active' => $localizacaoAtiva ? 1 : 0,
                'visible' => $visivel ? 1 : 0,
                'hide_fence' => (!$localizacaoAtiva || !$visivel) ? 1 : 0,
                'member_id' => $membroId
            ]);
            $canonical = $this->sincronizarEstadoCanonico($membroId);
            if ($canonical['revision'] > 0) {
                $localizacaoAtiva = $canonical['active'];
                $visivel = $canonical['visible'];
            }
            echo sprintf(
                "[PRESENCE PERSIST] %s: localização=%s, visível=%s\n",
                $membroId,
                $localizacaoAtiva ? 'ativa' : 'inativa',
                $visivel ? 'sim' : 'não'
            );
            $nearby->processLocationChange(
                $membroId,
                $posicaoAnterior,
                $localizacaoAtiva && $visivel ? $posicaoAnterior : null
            );
        } catch (\Throwable $erro) {
            echo sprintf("[PRESENCE PERSIST ERROR] %s: %s\n", $membroId, $erro->getMessage());
        }
    }

    private function moverPessoa(ConnectionInterface $conn, array $data): void {
        $membroId = $this->obterMembroDaLigacao($conn);
        if (
            $membroId === null ||
            !($this->visibilidadePorLigacao[$conn->resourceId] ?? false) ||
            !isset($this->pessoas[$membroId])
        ) {
            return;
        }
        $top = $this->limitarNumero((int) ($data['top'] ?? 0), -2000, 2000);
        $left = $this->limitarNumero((int) ($data['left'] ?? 0), -2000, 2000);
        if ($top === 0 && $left === 0) {
            return;
        }
        $this->pessoas[$membroId]['top'] += $top;
        $this->pessoas[$membroId]['left'] += $left;
        $this->enviarEstadosIndividuais();
    }

    private function enviarEstadosIndividuais(): void {
        try {
            $this->carregarBloqueios();
        } catch (\Throwable $erro) {
            echo sprintf("[BLOCK CACHE ERROR] %s\n", $erro->getMessage());
        }
        try {
            $this->sincronizarLocalizacoesPersistidas();
        } catch (\Throwable $erro) {
            echo sprintf("[LOCATION CACHE ERROR] %s\n", $erro->getMessage());
        }
        $agora = time();
        foreach ($this->clients as $client) {
            $membroId = $this->membroPorLigacao[$client->resourceId] ?? null;
            if ($membroId === null) {
                continue;
            }
            $localizacaoAtiva = $this->localizacaoPorLigacao[$client->resourceId] ?? false;
            $ligacaoVisivel = $this->visibilidadePorLigacao[$client->resourceId] ?? false;
            $minhaLocalizacao = $this->localizacoes[$membroId] ?? null;
            $minhaLocalizacaoValida = $localizacaoAtiva && $this->localizacaoEstaValida($minhaLocalizacao, $agora);
            $minhaFaixaEtaria = $this->faixaEtariaPorMembro[$membroId] ?? null;
            $pessoasVisiveis = [];
            if ($minhaLocalizacaoValida && $minhaFaixaEtaria !== null) {
                foreach ($this->pessoas as $outroMembroId => $pessoa) {
                    if ($outroMembroId === $membroId) {
                        if (!$ligacaoVisivel) {
                            continue;
                        }
                        unset($pessoa['faixa_etaria']);
                        $pessoa['distance_m'] = 0;
                        $pessoasVisiveis[] = $pessoa;
                        continue;
                    }
                    if ($this->membrosEstaoBloqueadosNoCache($membroId, $outroMembroId)) {
                        continue;
                    }
                    if (($pessoa['faixa_etaria'] ?? null) !== $minhaFaixaEtaria) {
                        continue;
                    }
                    $outraLocalizacao = $this->localizacoes[$outroMembroId] ?? null;
                    if (!$this->localizacaoEstaValida($outraLocalizacao, $agora)) {
                        continue;
                    }
                    $distancia = $this->calcularDistanciaMetros(
                        $minhaLocalizacao['latitude'],
                        $minhaLocalizacao['longitude'],
                        $outraLocalizacao['latitude'],
                        $outraLocalizacao['longitude']
                    );
                    if (!$this->confirmarProximidade($membroId,$outroMembroId,$minhaLocalizacao,$outraLocalizacao,$agora)) {
                        continue;
                    }
                    $tokenAcessoPerfil = $this->obterTokenAcessoPerfil($membroId, $outroMembroId);
                    if ($tokenAcessoPerfil === null) {
                        continue;
                    }
                    unset($pessoa['faixa_etaria']);
                    $pessoa['distance_m'] = (int) round($distancia);
                    $pessoa['profile_access_token'] = $tokenAcessoPerfil;
                    $pessoasVisiveis[] = $pessoa;
                }
            }
            $this->enviar($client, [
                'type' => 'state',
                'radius_m' => ProximityConfig::RADIUS_METRES,
                'map_presence' => $ligacaoVisivel,
                'location_filter_active' => $minhaLocalizacaoValida,
                'people' => $pessoasVisiveis
            ]);
        }
        echo sprintf("[STATE] Estados individuais enviados para %d ligação(ões)\n", count($this->clients));
    }

    private function sincronizarLocalizacoesPersistidas(bool $forcar = false): void {
        $agora = time();
        if (!$forcar && $agora - $this->localizacoesPersistidasCarregadasEm < self::LOCALIZACOES_PERSISTIDAS_CACHE_SEGUNDOS) return;
        $parameters = [];
        $connected = [];
        foreach (array_keys($this->ligacoesPorMembro) as $index => $memberId) {
            $connected[] = ':connected' . $index;
            $parameters['connected' . $index] = $memberId;
        }
        // Inclui observadores invisíveis e estados desativados das ligações abertas.
        // A BD é a autoridade; flags antigas de um socket não ocultam outra instalação.
        $connectedFilter = $connected ? ' OR lm.membro_id IN (' . implode(',', $connected) . ')' : '';
        $statement = $this->getDatabase()->prepare(
            "SELECT lm.membro_id, lm.latitude, lm.longitude, lm.precisao_m,
                lm.localizacao_ativa, lm.visivel, lm.estado_versao,
                UNIX_TIMESTAMP(lm.atualizada_em) AS atualizada_em_epoch,
                m.nascimento, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome,
                COALESCE((SELECT fp.nome_arquivo FROM fotos_perfil fp
                    WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
                      AND (fp.status = 'completo' OR fp.status IS NULL)
                    ORDER BY fp.ordem IS NULL, fp.ordem, fp.id LIMIT 1), 'default.webp') AS foto_perfil
             FROM localizacao_membro lm
             INNER JOIN membros m ON m.id COLLATE utf8mb4_unicode_ci = lm.membro_id COLLATE utf8mb4_unicode_ci
             WHERE (lm.localizacao_ativa = 1 AND lm.atualizada_em >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL "
                . self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS . " SECOND))" . $connectedFilter
        );
        $statement->execute($parameters);
        $visiveisAgora = [];
        $localizacoesAgora = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $memberId = (string) $row['membro_id'];
            $active = (bool) $row['localizacao_ativa'];
            $visible = $active && (bool) $row['visivel'];
            if ((int) $row['estado_versao'] > 0) {
                foreach ($this->ligacoesPorMembro[$memberId] ?? [] as $resourceId => $connection) {
                    $this->localizacaoPorLigacao[$resourceId] = $active;
                    $this->visibilidadePorLigacao[$resourceId] = $visible;
                }
            }
            $latitude = filter_var($row['latitude'], FILTER_VALIDATE_FLOAT);
            $longitude = filter_var($row['longitude'], FILTER_VALIDATE_FLOAT);
            $captured = (int) ($row['atualizada_em_epoch'] ?? 0);
            $ageGroup = $this->obterFaixaEtaria((string) $row['nascimento']);
            if (!$active || $latitude === false || $longitude === false || abs($latitude) > 90
                || abs($longitude) > 180 || $captured <= 0
                || $agora - $captured > self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS || $ageGroup === null) {
                unset($this->localizacoes[$memberId], $this->pessoas[$memberId]);
                continue;
            }
            $localizacoesAgora[$memberId] = true;
            if (!isset($this->localizacoes[$memberId]) || (int) $this->localizacoes[$memberId]['updated_at'] <= $captured) {
                $this->localizacoes[$memberId] = [
                    'latitude' => (float) $latitude, 'longitude' => (float) $longitude,
                    'accuracy' => max(0.0, min(10000.0, (float) ($row['precisao_m'] ?? 0))),
                    'updated_at' => $captured, 'source' => 'background'
                ];
            }
            $this->faixaEtariaPorMembro[$memberId] = $ageGroup;
            if (!$visible) {
                unset($this->pessoas[$memberId]);
                continue;
            }
            $visiveisAgora[$memberId] = true;
            $this->garantirPessoaVisivel($memberId, $row);
        }
        foreach (array_keys($this->pessoas) as $memberId) {
            if (!isset($visiveisAgora[$memberId])) unset($this->pessoas[$memberId]);
        }
        foreach ($this->localizacoes as $memberId => $location) {
            if (($location['source'] ?? '') === 'background' && !isset($localizacoesAgora[$memberId])) {
                unset($this->localizacoes[$memberId]);
            }
        }
        $this->membrosVisiveisPorPersistencia = $visiveisAgora;
        $this->localizacoesPersistidasCarregadasEm = $agora;
    }

    private function estaoDentroDoRaio(string $primeiroMembroId, string $segundoMembroId): bool {
        $agora = time();
        $primeira = $this->localizacoes[$primeiroMembroId] ?? null;
        $segunda = $this->localizacoes[$segundoMembroId] ?? null;
        if (!$this->localizacaoEstaValida($primeira, $agora) || !$this->localizacaoEstaValida($segunda, $agora)) {
            return false;
        }
        return $this->confirmarProximidade($primeiroMembroId,$segundoMembroId,$primeira,$segunda,$agora);
    }

    private function confirmarProximidade(string $a, string $b, array $first, array $second, int $now): bool {
        $key = strcmp($a,$b)<0 ? $a.':'.$b : $b.':'.$a;
        $distance = $this->calcularDistanciaMetros($first['latitude'],$first['longitude'],$second['latitude'],$second['longitude']);
        if ($now-$this->nearbyPrunedAt>=30) {
            $this->nearbyConfirmation = array_filter($this->nearbyConfirmation,
                fn($entry)=>$now-$entry['seen_at']<=self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS);
            $this->nearbyPrunedAt=$now;
        }
        if ($distance <= ProximityConfig::RADIUS_METRES) {
            // Bound memory use. A full cache never prevents a new in-radius entry.
            if (isset($this->nearbyConfirmation[$key]) || count($this->nearbyConfirmation)<10000) {
                $this->nearbyConfirmation[$key] = ['seen_at'=>$now,'outside_since'=>null];
            }
            return true;
        }
        $entry = $this->nearbyConfirmation[$key] ?? null;
        $uncertainty = min(25,max(0,(float)($first['accuracy'] ?? 0)) + max(0,(float)($second['accuracy'] ?? 0)));
        if ($entry !== null && $distance<=ProximityConfig::RADIUS_METRES+$uncertainty) {
            // Start the grace on the first uncertain exit, never renew it on repeated reads.
            $entry['outside_since'] ??= $now;
            $this->nearbyConfirmation[$key]=$entry;
            if ($now-$entry['outside_since']<=30) return true;
        }
        unset($this->nearbyConfirmation[$key]);
        return false;
    }

    private function localizacaoEstaValida(?array $localizacao, int $agora): bool {
        if ($localizacao === null) {
            return false;
        }
        return $agora - (int) ($localizacao['updated_at'] ?? 0) <= self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS;
    }

    private function obterFaixaEtaria(string $nascimento): ?string {
        return Validate::ageGroup($nascimento);
    }

    private function membrosNaMesmaFaixaEtaria(string $primeiroMembroId, string $segundoMembroId): bool {
        $primeiraFaixa = $this->faixaEtariaPorMembro[$primeiroMembroId] ?? null;
        $segundaFaixa = $this->faixaEtariaPorMembro[$segundoMembroId] ?? null;
        if ($primeiraFaixa === null) {
            $primeiroMembro = $this->obterMembro($primeiroMembroId);
            if (!$primeiroMembro) {
                return false;
            }
            $primeiraFaixa = $this->obterFaixaEtaria((string) ($primeiroMembro['nascimento'] ?? ''));
            if ($primeiraFaixa === null) {
                return false;
            }
            $this->faixaEtariaPorMembro[$primeiroMembroId] = $primeiraFaixa;
        }
        if ($segundaFaixa === null) {
            $segundoMembro = $this->obterMembro($segundoMembroId);
            if (!$segundoMembro) {
                return false;
            }
            $segundaFaixa = $this->obterFaixaEtaria((string) ($segundoMembro['nascimento'] ?? ''));
            if ($segundaFaixa === null) {
                return false;
            }
            $this->faixaEtariaPorMembro[$segundoMembroId] = $segundaFaixa;
        }
        return $primeiraFaixa === $segundaFaixa;
    }

    private function propositoAcessoPerfil(string $membroId): string {
        return 'profile:' . substr(hash('sha256', $membroId), 0, 24);
    }

    private function limparAcessosPerfilExpirados(PDO $database, int $agora): void {
        if ($agora - $this->acessosPerfilLimposEm < self::ACESSO_PERFIL_LIMPEZA_SEGUNDOS) {
            return;
        }
        $statement = $database->prepare(" DELETE
            FROM token
            WHERE proposito LIKE 'profile:%' AND validade <= UTC_TIMESTAMP() ");
        $statement->execute();
        $this->acessosPerfilLimposEm = $agora;
        foreach ($this->acessosPerfil as $chave => $acesso) {
            if ((int) ($acesso['expira_em'] ?? 0) <= $agora) {
                unset($this->acessosPerfil[$chave]);
            }
        }
    }

    private function obterTokenAcessoPerfil(string $visualizadorId, string $perfilId): ?string {
        if (
            $visualizadorId === $perfilId ||
            $this->membrosEstaoBloqueadosNoCache($visualizadorId, $perfilId) ||
            !$this->membrosNaMesmaFaixaEtaria($visualizadorId, $perfilId)
        ) {
            return null;
        }
        $agora = time();
        $chave = $visualizadorId . '>' . $perfilId;
        $acessoAtual = $this->acessosPerfil[$chave] ?? null;
        if (
            is_array($acessoAtual) &&
            (int) ($acessoAtual['expira_em'] ?? 0) > $agora + self::ACESSO_PERFIL_RENOVAR_ANTES_SEGUNDOS &&
            preg_match('/^[a-f0-9]{64}$/', (string) ($acessoAtual['token'] ?? ''))
        ) {
            return (string) $acessoAtual['token'];
        }
        $database = null;
        try {
            $database = $this->getDatabase();
            $this->limparAcessosPerfilExpirados($database, $agora);
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $proposito = $this->propositoAcessoPerfil($visualizadorId);
            $expiraEm = $agora + self::ACESSO_PERFIL_VALIDADE_SEGUNDOS;
            $database->beginTransaction();
            $delete = $database->prepare(" DELETE
                FROM token
                WHERE membro_id = :perfil_id AND proposito = :proposito ");
            $delete->execute(['perfil_id' => $perfilId, 'proposito' => $proposito]);
            $insert = $database->prepare(" INSERT INTO token ( token, membro_id, validade, proposito )
                VALUES ( :token, :perfil_id, :validade, :proposito ) ");
            $insert->execute([
                'token' => $tokenHash,
                'perfil_id' => $perfilId,
                'validade' => gmdate('Y-m-d H:i:s', $expiraEm),
                'proposito' => $proposito
            ]);
            $database->commit();
            $this->acessosPerfil[$chave] = ['token' => $token, 'expira_em' => $expiraEm];
            return $token;
        } catch (\Throwable $erro) {
            if ($database instanceof PDO && $database->inTransaction()) {
                $database->rollBack();
            }
            echo sprintf("[PROFILE ACCESS ERROR] %s -> %s: %s\n", $visualizadorId, $perfilId, $erro->getMessage());
            return null;
        }
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
            cos($latitude1Rad) * cos($latitude2Rad) * sin($diferencaLongitude / 2) ** 2;
        $a = min(1.0, max(0.0, $a));
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return $raioTerra * $c;
    }

    private function atualizarBloqueios(ConnectionInterface $conn, array $data): void {
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
        $database = $this->getDatabase();
        $statement = $database->prepare(" SELECT 1
            FROM bloqueados
            WHERE pessoa_bloqueou_id = :membro_id AND pessoa_bloqueada_id = :destinatario_id
            LIMIT 1 ");
        $statement->execute(['membro_id' => $membroId, 'destinatario_id' => $destinatarioId]);
        if (!$statement->fetchColumn()) {
            $this->enviarErro($conn, 'O bloqueio ainda não foi registado.');
            return;
        }
        $this->carregarBloqueios(true);
        $this->enviarEstadosIndividuais();
        echo sprintf("[BLOCK] Estado atualizado entre %s e %s.\n", $membroId, $destinatarioId);
    }

    private function carregarBloqueios(bool $forcar = false): bool {
        $agora = time();
        if (!$forcar && $agora - $this->bloqueiosCarregadosEm < self::BLOQUEIOS_CACHE_SEGUNDOS) {
            return false;
        }
        $database = $this->getDatabase();
        $statement = $database->query(" SELECT pessoa_bloqueou_id, pessoa_bloqueada_id
            FROM bloqueados
            ORDER BY pessoa_bloqueou_id, pessoa_bloqueada_id ");
        $bloqueios = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $bloqueio) {
            $primeiroId = trim((string) ($bloqueio['pessoa_bloqueou_id'] ?? ''));
            $segundoId = trim((string) ($bloqueio['pessoa_bloqueada_id'] ?? ''));
            if ($primeiroId === '' || $segundoId === '' || $primeiroId === $segundoId) {
                continue;
            }
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
    }

    private function membrosEstaoBloqueados(string $primeiroId, string $segundoId): bool {
        try {
            $this->carregarBloqueios();
        } catch (\Throwable $erro) {
            echo sprintf("[BLOCK CACHE ERROR] %s\n", $erro->getMessage());
        }
        return $this->membrosEstaoBloqueadosNoCache($primeiroId, $segundoId);
    }

    private function membrosEstaoBloqueadosNoCache(string $primeiroId, string $segundoId): bool {
        return isset($this->bloqueiosEntreMembros[$primeiroId][$segundoId]);
    }
}