<?php
declare(strict_types=1);

namespace App\CMS\Realtime;

use App\CMS\ProximityConfig;
use App\CMS\PushNotification;
use App\CMS\NearbyPresenceNotification;
use App\Validate\Validate;
use PDO;
use Ratchet\ConnectionInterface;
// Métodos de Discovery usados exclusivamente pela classe WebSocket.

trait Discovery {

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
        if ($this->membroTemLigacaoVisivel($membroId)) {
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
        $this->localizacoes[$membroId] = [
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy' => min((float) $accuracy, 10000),
            'updated_at' => time(),
            'source' => 'websocket'
        ];
        $this->persistirLocalizacaoParaProximidade(
            $membroId,
            (float) $latitude,
            (float) $longitude,
            min((float) $accuracy, 10000),
            $this->membroTemLigacaoVisivel($membroId)
        );
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
        bool $visivel
    ): void {
        $agora = microtime(true);
        $ultimaPersistencia = (float) ($this->ultimaPersistenciaLocalizacaoPorMembro[$membroId] ?? 0.0);
        if (
            $ultimaPersistencia > 0 &&
            $agora - $ultimaPersistencia < self::PERSISTENCIA_LOCALIZACAO_INTERVALO_SEGUNDOS
        ) {
            return;
        }
        $this->ultimaPersistenciaLocalizacaoPorMembro[$membroId] = $agora;
        try {
            $database = $this->getDatabase();
            $nearby = new NearbyPresenceNotification($database, new PushNotification($database));
            $posicaoAnterior = $nearby->locationSnapshot($membroId);
            /*
             * A coluna origem da BD só permite:
             *
             * foreground
             * background
             *
             * Portanto uma localização recebida pelo WebSocket
             * é guardada como foreground.
             */
            $statement = $database->prepare("INSERT INTO localizacao_membro ( membro_id, latitude, longitude, precisao_m, localizacao_ativa, visivel,
                origem, atualizada_em )
                VALUES ( :member_id, :latitude, :longitude, :accuracy, 1, :visible, 'foreground', UTC_TIMESTAMP() )
                ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), precisao_m =
                VALUES(precisao_m), localizacao_ativa = 1, visivel = VALUES(visivel), origem = 'foreground',
                atualizada_em = UTC_TIMESTAMP()");
            $statement->execute([
                'member_id' => $membroId,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'accuracy' => $accuracy,
                'visible' => $visivel ? 1 : 0
            ]);
            echo sprintf("[LOCATION PERSIST] %s gravado na BD. Visível=%s\n", $membroId, $visivel ? 'sim' : 'não');
            $posicaoNova = $visivel ? ['latitude' => $latitude, 'longitude' => $longitude] : null;
            /*
             * Isto faz com que a chegada/movimento desta pessoa
             * possa disparar imediatamente uma reavaliação de
             * utilizadores que estejam em background.
             */
            $nearby->processLocationChange($membroId, $posicaoAnterior, $posicaoNova);
        } catch (\Throwable $erro) {
            unset($this->ultimaPersistenciaLocalizacaoPorMembro[$membroId]);
            echo sprintf("[LOCATION PERSIST ERROR] %s: %s\n", $membroId, $erro->getMessage());
        }
    }

    private function persistirEstadoPresencaParaProximidade(
        string $membroId,
        bool $localizacaoAtiva,
        bool $visivel
    ): void {
        try {
            $database = $this->getDatabase();
            $nearby = new NearbyPresenceNotification($database, new PushNotification($database));
            $posicaoAnterior = $nearby->locationSnapshot($membroId);
            $statement = $database->prepare("UPDATE localizacao_membro
                SET localizacao_ativa = :active, visivel = :visible
                WHERE membro_id = :member_id");
            $statement->execute([
                'active' => $localizacaoAtiva ? 1 : 0,
                'visible' => $visivel ? 1 : 0,
                'member_id' => $membroId
            ]);
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
                    if ($distancia > ProximityConfig::RADIUS_METRES) {
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
        if (
            !$forcar &&
            $agora - $this->localizacoesPersistidasCarregadasEm < self::LOCALIZACOES_PERSISTIDAS_CACHE_SEGUNDOS
        ) {
            return;
        }
        $database = $this->getDatabase();
        $statement = $database->prepare(
            " SELECT lm.membro_id, lm.latitude, lm.longitude, lm.precisao_m, UNIX_TIMESTAMP(lm.atualizada_em) AS
                atualizada_em_epoch, m.nascimento, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome) AS nome, COALESCE( (
                SELECT fp.nome_arquivo
                FROM fotos_perfil AS fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci AND (fp.status =
                'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
                LIMIT 1 ), 'default.webp' ) AS foto_perfil
                FROM localizacao_membro AS lm
                INNER JOIN membros AS m ON m.id COLLATE utf8mb4_unicode_ci = lm.membro_id COLLATE utf8mb4_unicode_ci
                WHERE lm.localizacao_ativa = 1 AND lm.visivel = 1 AND lm.latitude IS NOT NULL AND lm.longitude IS NOT
                NULL AND lm.atualizada_em >= DATE_SUB( UTC_TIMESTAMP(), INTERVAL " .
                self::LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS .
                " SECOND
                )
            "
        );
        $statement->execute();
        $visiveisAgora = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $linha) {
            $membroId = trim((string) ($linha['membro_id'] ?? ''));
            $latitude = filter_var($linha['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
            $longitude = filter_var($linha['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
            $atualizadaEm = (int) ($linha['atualizada_em_epoch'] ?? 0);
            $faixaEtaria = $this->obterFaixaEtaria((string) ($linha['nascimento'] ?? ''));
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
            $temLigacaoAberta = !empty($this->ligacoesPorMembro[$membroId]);
            if (
                $temLigacaoAberta &&
                (!$this->membroTemLigacaoVisivel($membroId) || !$this->membroTemLigacaoComLocalizacaoAtiva($membroId))
            ) {
                continue;
            }
            $visiveisAgora[$membroId] = true;
            if (
                !isset($this->localizacoes[$membroId]) ||
                (int) ($this->localizacoes[$membroId]['updated_at'] ?? 0) < $atualizadaEm
            ) {
                $this->localizacoes[$membroId] = [
                    'latitude' => (float) $latitude,
                    'longitude' => (float) $longitude,
                    'accuracy' => max(0.0, min(10000.0, (float) ($linha['precisao_m'] ?? 0))),
                    'updated_at' => $atualizadaEm,
                    'source' => 'background'
                ];
            }
            $this->faixaEtariaPorMembro[$membroId] = $faixaEtaria;
            if (!$this->membroTemLigacaoVisivel($membroId)) {
                $foto = basename(trim((string) ($linha['foto_perfil'] ?? 'default.webp')));
                if ($foto === '') {
                    $foto = 'default.webp';
                }
                $pessoaAtual = $this->pessoas[$membroId] ?? [];
                $this->pessoas[$membroId] = [
                    'id' => $membroId,
                    'membro_id' => $membroId,
                    'nome' => trim((string) ($linha['nome'] ?? '')),
                    'src' => '/imagens/fotos-perfil/' . rawurlencode($foto),
                    'faixa_etaria' => $faixaEtaria,
                    'top' => isset($pessoaAtual['top']) ? (int) $pessoaAtual['top'] : random_int(50, 600),
                    'left' => isset($pessoaAtual['left']) ? (int) $pessoaAtual['left'] : random_int(50, 400)
                ];
            }
        }
        foreach (array_keys($this->membrosVisiveisPorPersistencia) as $membroId) {
            if (isset($visiveisAgora[$membroId])) {
                continue;
            }
            if (!$this->membroTemLigacaoVisivel($membroId)) {
                unset($this->pessoas[$membroId]);
            }
            if (($this->localizacoes[$membroId]['source'] ?? '') === 'background') {
                unset($this->localizacoes[$membroId]);
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
        return $this->calcularDistanciaMetros(
            $primeira['latitude'],
            $primeira['longitude'],
            $segunda['latitude'],
            $segunda['longitude']
        ) <= ProximityConfig::RADIUS_METRES;
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
