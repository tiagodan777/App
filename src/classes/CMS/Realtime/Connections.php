<?php
declare(strict_types=1);

namespace App\CMS\Realtime;

use App\CMS\MemberConnection;
use App\CMS\PushNotification;
use Ratchet\ConnectionInterface;
// Métodos de Connections usados exclusivamente pela classe WebSocket.

trait Connections {

    private function notificarPessoa(ConnectionInterface $from, array $data): void {
        $remetenteId = $this->obterMembroDaLigacao($from);
        if ($remetenteId === null) {
            $this->enviarErroHey(
                $from,
                trim((string) ($data['destinatario_id'] ?? '')),
                'Tens de estar autenticado para enviar um Hey.'
            );
            return;
        }
        $remetente = $this->obterPessoaParaInteracao($remetenteId);
        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));
        if (!$remetente || $destinatarioId === '') {
            $this->enviarErroHey($from, $destinatarioId, 'O destinatário não é válido.');
            return;
        }
        if ($destinatarioId === $remetenteId) {
            $this->enviarErroHey($from, $destinatarioId, 'Não podes enviar um Hey para ti próprio.');
            return;
        }
        if ($this->membrosEstaoBloqueados($remetenteId, $destinatarioId)) {
            $this->enviarErroHey($from, $destinatarioId, 'Já não podes interagir com esta pessoa.');
            $this->enviarEstadosIndividuais();
            return;
        }
        if (!$this->membrosNaMesmaFaixaEtaria($remetenteId, $destinatarioId)) {
            $this->enviarErroHey($from, $destinatarioId, 'Já não podes interagir com esta pessoa.');
            $this->enviarEstadosIndividuais();
            return;
        }
        if (!$this->estaoDentroDoRaio($remetenteId, $destinatarioId)) {
            $this->enviarErroHey($from, $destinatarioId, 'Esta pessoa já não está dentro do raio disponível.');
            $this->enviarEstadosIndividuais();
            return;
        }
        $ligacoesDestinatario = $this->ligacoesPorMembro[$destinatarioId] ?? [];
        $destinatario = $this->pessoas[$destinatarioId] ?? $this->obterPessoaParaInteracao($destinatarioId);
        if (!$destinatario) {
            $this->enviarErroHey($from, $destinatarioId, 'O destinatário já não está disponível.');
            return;
        }
        $notificacaoId = $this->guardarNotificacao($remetenteId, $destinatarioId);
        try {
            $databasePush = $this->getDatabase();
            (new PushNotification($databasePush))->enqueueHey($remetenteId, $destinatarioId, $notificacaoId);
        } catch (\Throwable $erroPush) {
            /* O Hey continua válido mesmo que a fila push esteja indisponível. */
            echo sprintf("[HEY PUSH ERROR] %s\n", $erroPush->getMessage());
        }
        $numeroEntregas = 0;
        foreach ($ligacoesDestinatario as $client) {
            $this->enviar($client, [
                'type' => 'notification',
                'notification_id' => $notificacaoId,
                'notification_type' => 'hey',
                'title' => 'Recebeste um Hey!',
                'body' => sprintf('%s enviou-te um Hey.', (string) ($remetente['nome'] ?? 'Alguém')),
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
            'message' =>
                $numeroEntregas > 0
                    ? sprintf('%s recebeu o teu Hey.', (string) ($destinatario['nome'] ?? 'A outra pessoa'))
                    : sprintf(
                        'Hey enviado. %s vai vê-lo quando voltar à Margot.',
                        (string) ($destinatario['nome'] ?? 'A outra pessoa')
                    )
        ]);
        echo sprintf("[HEY] %s enviou para %s. Entregas: %d\n", $remetenteId, $destinatarioId, $numeroEntregas);
    }

    private function tentarConexao(ConnectionInterface $from, array $data): void {
        $remetenteId = $this->obterMembroDaLigacao($from);
        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));
        if ($remetenteId === null || $destinatarioId === '') {
            $this->enviarErroConexao($from, $destinatarioId, 'Não foi possível iniciar a ligação.');
            return;
        }
        if ($destinatarioId === $remetenteId) {
            $this->enviarErroConexao($from, $destinatarioId, 'Não podes ligar-te a ti próprio.');
            return;
        }
        $remetente = $this->obterPessoaParaInteracao($remetenteId);
        $destinatario = $this->obterPessoaParaInteracao($destinatarioId);
        if (!$remetente || !$destinatario) {
            $this->enviarErroConexao($from, $destinatarioId, 'Esta pessoa já não está disponível.');
            return;
        }
        if (
            $this->membrosEstaoBloqueados($remetenteId, $destinatarioId) ||
            !$this->membrosNaMesmaFaixaEtaria($remetenteId, $destinatarioId)
        ) {
            $this->enviarErroConexao($from, $destinatarioId, 'Já não podes interagir com esta pessoa.');
            $this->enviarEstadosIndividuais();
            return;
        }
        $database = $this->getDatabase();
        $ligacoes = new MemberConnection($database);
        if ($ligacoes->areConnected($remetenteId, $destinatarioId)) {
            $this->enviarEventoConexaoCriada($remetenteId, $destinatarioId, true);
            return;
        }
        if (!$this->estaoDentroDoRaio($remetenteId, $destinatarioId)) {
            $this->enviarErroConexao(
                $from,
                $destinatarioId,
                'Para criarem uma ligação, têm de estar perto um do outro.'
            );
            $this->enviarEstadosIndividuais();
            return;
        }
        $agora = microtime(true);
        $this->limparTentativasConexao($agora);
        $chave = $this->chaveConexao($remetenteId, $destinatarioId);
        $tentativas = $this->tentativasConexao[$chave] ?? [];
        $tentativaOutro = (float) ($tentativas[$destinatarioId] ?? 0.0);
        $tentativas[$remetenteId] = $agora;
        $this->tentativasConexao[$chave] = $tentativas;
        if ($tentativaOutro > 0 && abs($agora - $tentativaOutro) <= self::JANELA_CONEXAO_SEGUNDOS) {
            $ligacoes->connect($remetenteId, $destinatarioId);
            unset($this->tentativasConexao[$chave]);
            $this->enviarEventoConexaoCriada($remetenteId, $destinatarioId, false);
            echo sprintf("[CONNECTION] %s e %s ficaram ligados.\n", $remetenteId, $destinatarioId);
            return;
        }
        $this->enviar($from, [
            'type' => 'connection_waiting',
            'destinatario_id' => $destinatarioId,
            'other_member_id' => $destinatarioId,
            'other_name' => (string) ($destinatario['nome'] ?? ''),
            'expires_in_ms' => (int) round(self::JANELA_CONEXAO_SEGUNDOS * 1000)
        ]);
    }

    private function desconectarMembros(ConnectionInterface $from, array $data): void {
        $remetenteId = $this->obterMembroDaLigacao($from);
        $destinatarioId = trim((string) ($data['destinatario_id'] ?? ''));
        if ($remetenteId === null || $destinatarioId === '') {
            $this->enviarErroConexao($from, $destinatarioId, 'Não foi possível remover a ligação.');
            return;
        }
        if ($destinatarioId === $remetenteId) {
            $this->enviarErroConexao($from, $destinatarioId, 'A ligação indicada não é válida.');
            return;
        }
        $database = $this->getDatabase();
        $ligacoes = new MemberConnection($database);
        $removeu = $ligacoes->disconnect($remetenteId, $destinatarioId);
        unset($this->tentativasConexao[$this->chaveConexao($remetenteId, $destinatarioId)]);
        $this->enviarEventoConexaoRemovida($remetenteId, $destinatarioId, !$removeu);
        echo sprintf("[CONNECTION] %s e %s deixaram de estar ligados.\n", $remetenteId, $destinatarioId);
    }

    private function enviarEventoConexaoRemovida(
        string $primeiroId,
        string $segundoId,
        bool $alreadyDisconnected
    ): void {
        $primeiro = $this->obterPessoaParaInteracao($primeiroId);
        $segundo = $this->obterPessoaParaInteracao($segundoId);
        foreach ($this->ligacoesPorMembro[$primeiroId] ?? [] as $client) {
            $this->enviar($client, [
                'type' => 'connection_removed',
                'other_member_id' => $segundoId,
                'other_name' => (string) ($segundo['nome'] ?? ''),
                'already_disconnected' => $alreadyDisconnected
            ]);
        }
        foreach ($this->ligacoesPorMembro[$segundoId] ?? [] as $client) {
            $this->enviar($client, [
                'type' => 'connection_removed',
                'other_member_id' => $primeiroId,
                'other_name' => (string) ($primeiro['nome'] ?? ''),
                'already_disconnected' => $alreadyDisconnected
            ]);
        }
    }

    private function enviarEventoConexaoCriada(string $primeiroId, string $segundoId, bool $alreadyConnected): void {
        $primeiro = $this->obterPessoaParaInteracao($primeiroId);
        $segundo = $this->obterPessoaParaInteracao($segundoId);
        foreach ($this->ligacoesPorMembro[$primeiroId] ?? [] as $client) {
            $this->enviar($client, [
                'type' => 'connection_created',
                'other_member_id' => $segundoId,
                'other_name' => (string) ($segundo['nome'] ?? ''),
                'other_photo' => (string) ($segundo['src'] ?? '/imagens/fotos-perfil/default.webp'),
                'already_connected' => $alreadyConnected
            ]);
        }
        foreach ($this->ligacoesPorMembro[$segundoId] ?? [] as $client) {
            $this->enviar($client, [
                'type' => 'connection_created',
                'other_member_id' => $primeiroId,
                'other_name' => (string) ($primeiro['nome'] ?? ''),
                'other_photo' => (string) ($primeiro['src'] ?? '/imagens/fotos-perfil/default.webp'),
                'already_connected' => $alreadyConnected
            ]);
        }
    }

    private function enviarErroConexao(ConnectionInterface $conn, string $destinatarioId, string $mensagem): void {
        $this->enviar($conn, [
            'type' => 'connection_error',
            'destinatario_id' => $destinatarioId,
            'other_member_id' => $destinatarioId,
            'message' => $mensagem
        ]);
    }

    private function chaveConexao(string $firstId, string $secondId): string {
        $ids = [$firstId, $secondId];
        sort($ids, SORT_STRING);
        return $ids[0] . '|' . $ids[1];
    }

    private function limparTentativasConexao(float $agora): void {
        $limite = $agora - (self::JANELA_CONEXAO_SEGUNDOS + 0.5);
        foreach ($this->tentativasConexao as $chave => $tentativas) {
            $maisRecente = 0.0;
            foreach ($tentativas as $instante) {
                $maisRecente = max($maisRecente, (float) $instante);
            }
            if ($maisRecente < $limite) {
                unset($this->tentativasConexao[$chave]);
            }
        }
    }

    private function guardarNotificacao(string $emissorId, string $destinatarioId): int {
        $sql = " INSERT INTO notificacao ( emissor_id, destinatario_id, tipo, lida, criada_em )
            VALUES ( :emissor_id, :destinatario_id, 'hey', 0, NOW() ) ";
        $database = $this->getDatabase();
        $statement = $database->prepare($sql);
        $statement->execute(['emissor_id' => $emissorId, 'destinatario_id' => $destinatarioId]);
        return (int) $database->lastInsertId();
    }
}
