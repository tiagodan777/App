<?php

declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;
use PDO;
use RuntimeException;

final class PushNotification
{
    private const MAX_ATTEMPTS = 5;

    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function registerDevice(
        string $memberId,
        string $platform,
        string $token,
        string $installationId,
        string $sessionHash,
        string $environment = 'production',
        ?string $appVersion = null
    ): void {
        $memberId = $this->validMemberId($memberId);
        $platform = $this->validPlatform($platform);
        $token = $this->validToken($token, $platform);
        $installationId = $this->validInstallationId($installationId);
        $sessionHash = $this->validHash($sessionHash, 'Sessão inválida.');
        $environment = $platform === 'ios'
            ? $this->validEnvironment($environment)
            : 'production';
        $appVersion = $this->normaliseOptionalText($appVersion, 32);
        $tokenHash = hash('sha256', $token);

        $this->db->beginTransaction();

        try {
            $tokenDeviceId = $this->deviceIdByTokenHash($tokenHash);
            $installationDeviceId = $this->deviceIdByInstallation(
                $platform,
                $installationId
            );

            if (
                $tokenDeviceId !== null &&
                $installationDeviceId !== null &&
                $tokenDeviceId !== $installationDeviceId
            ) {
                $this->deleteDevice($installationDeviceId);
            }

            $deviceId = $tokenDeviceId ?? $installationDeviceId;
            $parameters = [
                'member_id' => $memberId,
                'platform' => $platform,
                'environment' => $environment,
                'token' => $token,
                'token_hash' => $tokenHash,
                'installation_id' => $installationId,
                'session_hash' => $sessionHash,
                'app_version' => $appVersion
            ];

            if ($deviceId === null) {
                $statement = $this->db->prepare(
                    'INSERT INTO push_dispositivos (
                        membro_id,
                        plataforma,
                        ambiente,
                        token,
                        token_hash,
                        instalacao_id,
                        sessao_hash,
                        versao_app,
                        ativo,
                        criado_em,
                        atualizado_em
                     ) VALUES (
                        :member_id,
                        :platform,
                        :environment,
                        :token,
                        :token_hash,
                        :installation_id,
                        :session_hash,
                        :app_version,
                        1,
                        UTC_TIMESTAMP(6),
                        UTC_TIMESTAMP(6)
                     )'
                );
            } else {
                $parameters['id'] = $deviceId;
                $statement = $this->db->prepare(
                    'UPDATE push_dispositivos
                     SET membro_id = :member_id,
                         plataforma = :platform,
                         ambiente = :environment,
                         token = :token,
                         token_hash = :token_hash,
                         instalacao_id = :installation_id,
                         sessao_hash = :session_hash,
                         versao_app = :app_version,
                         ativo = 1,
                         falhas_consecutivas = 0,
                         ultimo_erro = NULL,
                         atualizado_em = UTC_TIMESTAMP(6)
                     WHERE id = :id'
                );
            }

            $statement->execute($parameters);
            $this->db->commit();
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $error;
        }
    }

    public function unregisterDevice(
        string $memberId,
        string $installationId,
        ?string $token = null
    ): void {
        $memberId = $this->validMemberId($memberId);
        $installationId = $this->validInstallationId($installationId);
        $tokenHash = null;

        if ($token !== null && trim($token) !== '') {
            $tokenHash = hash('sha256', trim($token));
        }

        $statement = $this->db->prepare(
            'UPDATE push_dispositivos
             SET ativo = 0,
                 atualizado_em = UTC_TIMESTAMP(6)
             WHERE membro_id = :member_id
             AND (
                 instalacao_id = :installation_id
                 OR (:token_hash IS NOT NULL AND token_hash = :token_hash_copy)
             )'
        );

        $statement->execute([
            'member_id' => $memberId,
            'installation_id' => $installationId,
            'token_hash' => $tokenHash,
            'token_hash_copy' => $tokenHash
        ]);

        $this->cancelQueuedForInactiveDevices($memberId);
    }

    public function unregisterSession(
        string $memberId,
        string $sessionHash
    ): void {
        $memberId = $this->validMemberId($memberId);
        $sessionHash = $this->validHash($sessionHash, 'Sessão inválida.');

        $statement = $this->db->prepare(
            'UPDATE push_dispositivos
             SET ativo = 0,
                 atualizado_em = UTC_TIMESTAMP(6)
             WHERE membro_id = :member_id
             AND sessao_hash = :session_hash'
        );

        $statement->execute([
            'member_id' => $memberId,
            'session_hash' => $sessionHash
        ]);

        $this->cancelQueuedForInactiveDevices($memberId);
    }

    public function enqueueHey(
        string $senderId,
        string $recipientId,
        int $notificationId
    ): int {
        if ($notificationId < 1) {
            throw new InvalidArgumentException('Notificação inválida.');
        }

        $senderId = $this->validMemberId($senderId);
        $recipientId = $this->validMemberId($recipientId);
        $sender = $this->memberPreview($senderId);

        return $this->enqueue(
            $recipientId,
            'hey',
            $sender['name'] . ' mandou-te um Hey!',
            'Toca para ver o perfil.',
            '/profile/' . rawurlencode($senderId),
            [
                'type' => 'hey',
                'notification_id' => (string) $notificationId,
                'from_member_id' => $senderId,
                'from_name' => $sender['name'],
                'from_photo' => $sender['photo']
            ],
            'hey:' . $notificationId
        );
    }

    public function enqueueNearbyPeople(
        string $recipientId,
        int $nearbyCount
    ): int {
        $recipientId = $this->validMemberId($recipientId);
        $nearbyCount = max(3, min(999, $nearbyCount));

        return $this->enqueue(
            $recipientId,
            'nearby',
            'Há ' . $nearbyCount . ' pessoas com a Margot aqui perto 👀',
            'Abre a app e manda-lhes um Hey.',
            '/',
            [
                'type' => 'nearby',
                'nearby_count' => (string) $nearbyCount
            ],
            'nearby:' . $recipientId . ':' . bin2hex(random_bytes(8))
        );
    }

    public function enqueueMessage(
        string $senderId,
        string $recipientId,
        int $messageId
    ): int {
        if ($messageId < 1) {
            throw new InvalidArgumentException('Mensagem inválida.');
        }

        $senderId = $this->validMemberId($senderId);
        $recipientId = $this->validMemberId($recipientId);
        $sender = $this->memberPreview($senderId);

        $statement = $this->db->prepare(
            'SELECT texto, tipo
             FROM mensagens_chat
             WHERE id = :id
             AND emissor_id = :sender_id
             AND destinatario_id = :recipient_id
             LIMIT 1'
        );

        $statement->execute([
            'id' => $messageId,
            'sender_id' => $senderId,
            'recipient_id' => $recipientId
        ]);

        $message = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$message) {
            throw new RuntimeException('Mensagem não encontrada.');
        }

        $body = trim((string) ($message['texto'] ?? ''));

        if ($body === '') {
            $body = match ((string) ($message['tipo'] ?? '')) {
                'imagem' => '📷 Fotografia',
                'video' => '🎥 Vídeo',
                default => 'Nova mensagem'
            };
        }

        return $this->enqueue(
            $recipientId,
            'message',
            $sender['name'],
            $body,
            '/messages/' . rawurlencode($senderId),
            [
                'type' => 'message',
                'message_id' => (string) $messageId,
                'from_member_id' => $senderId,
                'from_name' => $sender['name'],
                'from_photo' => $sender['photo']
            ],
            'message:' . $messageId
        );
    }

    public function recoverStalledJobs(): int
    {
        $statement = $this->db->prepare(
            "UPDATE push_fila
             SET estado = 'queued',
                 bloqueado_em = NULL,
                 proxima_tentativa_em = UTC_TIMESTAMP(6)
             WHERE estado = 'processing'
             AND bloqueado_em < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)"
        );

        $statement->execute();

        return $statement->rowCount();
    }

    public function nextJob(): ?array
    {
        $this->db->beginTransaction();

        try {
            $statement = $this->db->prepare(
                "SELECT
                    q.id,
                    q.dispositivo_id,
                    q.membro_id,
                    q.tipo,
                    q.titulo,
                    q.corpo,
                    q.url,
                    q.dados_json,
                    q.chave_unica,
                    q.tentativas,
                    d.plataforma,
                    d.ambiente,
                    d.token
                 FROM push_fila AS q
                 INNER JOIN push_dispositivos AS d
                    ON d.id = q.dispositivo_id
                   AND d.membro_id COLLATE utf8mb4_unicode_ci = q.membro_id COLLATE utf8mb4_unicode_ci
                 WHERE q.estado = 'queued'
                 AND q.proxima_tentativa_em <= UTC_TIMESTAMP(6)
                 AND d.ativo = 1
                 ORDER BY q.id ASC
                 LIMIT 1
                 FOR UPDATE"
            );

            $statement->execute();

            $job = $statement->fetch(PDO::FETCH_ASSOC);

            if (!$job) {
                $this->db->commit();
                return null;
            }

            $attempts = (int) $job['tentativas'] + 1;

            $update = $this->db->prepare(
                "UPDATE push_fila
                 SET estado = 'processing',
                     tentativas = :attempts,
                     bloqueado_em = UTC_TIMESTAMP(6)
                 WHERE id = :id"
            );

            $update->execute([
                'attempts' => $attempts,
                'id' => (int) $job['id']
            ]);

            $this->db->commit();

            $job['id'] = (int) $job['id'];
            $job['dispositivo_id'] = (int) $job['dispositivo_id'];
            $job['tentativas'] = $attempts;
            $job['dados'] = $this->decodeData((string) $job['dados_json']);

            unset($job['dados_json']);

            return $job;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $error;
        }
    }

    public function markSent(
        int $jobId,
        int $deviceId,
        ?string $environment = null
    ): void {
        if ($environment !== null) {
            $environment = $this->validEnvironment($environment);
        }

        $this->db->beginTransaction();

        try {
            $statement = $this->db->prepare(
                "UPDATE push_fila
                 SET estado = 'sent',
                     enviado_em = UTC_TIMESTAMP(6),
                     bloqueado_em = NULL,
                     ultimo_erro = NULL
                 WHERE id = :id"
            );

            $statement->execute([
                'id' => $jobId
            ]);

            $environmentSql = $environment === null
                ? ''
                : 'ambiente = :environment,';

            $device = $this->db->prepare(
                'UPDATE push_dispositivos
                 SET ' . $environmentSql . '
                     ultimo_sucesso_em = UTC_TIMESTAMP(6),
                     falhas_consecutivas = 0,
                     ultimo_erro = NULL,
                     atualizado_em = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );

            $deviceParameters = [
                'id' => $deviceId
            ];

            if ($environment !== null) {
                $deviceParameters['environment'] = $environment;
            }

            $device->execute($deviceParameters);

            $this->db->commit();
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $error;
        }
    }

    public function markFailed(
        int $jobId,
        int $deviceId,
        string $errorCode,
        bool $permanent
    ): void {
        $errorCode = mb_substr(
            trim($errorCode),
            0,
            190
        );

        $attemptsStatement = $this->db->prepare(
            'SELECT tentativas
             FROM push_fila
             WHERE id = :id
             LIMIT 1'
        );

        $attemptsStatement->execute([
            'id' => $jobId
        ]);

        $attempts = (int) $attemptsStatement->fetchColumn();
        $finished = $permanent || $attempts >= self::MAX_ATTEMPTS;
        $retrySeconds = $this->retryDelay($attempts);

        $nextRetry = gmdate(
            'Y-m-d H:i:s',
            time() + $retrySeconds
        );

        $this->db->beginTransaction();

        try {
            $statement = $this->db->prepare(
                "UPDATE push_fila
                 SET estado = :status,
                     bloqueado_em = NULL,
                     ultimo_erro = :error,
                     proxima_tentativa_em = CASE
                         WHEN :finished = 1 THEN proxima_tentativa_em
                         ELSE :next_retry
                     END
                 WHERE id = :id"
            );

            $statement->execute([
                'status' => $finished ? 'failed' : 'queued',
                'error' => $errorCode !== ''
                    ? $errorCode
                    : 'push_error',
                'finished' => $finished ? 1 : 0,
                'next_retry' => $nextRetry,
                'id' => $jobId
            ]);

            $device = $this->db->prepare(
                'UPDATE push_dispositivos
                 SET falhas_consecutivas = falhas_consecutivas + 1,
                     ultima_falha_em = UTC_TIMESTAMP(6),
                     ultimo_erro = :error,
                     ativo = CASE
                         WHEN :permanent = 1 THEN 0
                         ELSE ativo
                     END,
                     atualizado_em = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );

            $device->execute([
                'error' => $errorCode !== ''
                    ? $errorCode
                    : 'push_error',
                'permanent' => $permanent ? 1 : 0,
                'id' => $deviceId
            ]);

            $this->db->commit();
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            throw $error;
        }
    }

    public function isDeliverable(array $job): bool
    {
        $type = (string) ($job['tipo'] ?? '');

        try {
            $recipientId = $this->validMemberId(
                (string) ($job['membro_id'] ?? '')
            );
        } catch (InvalidArgumentException) {
            return false;
        }

        /*
         * O alerta de proximidade só é útil enquanto a Margot continua
         * efetivamente fora do ecrã.
         *
         * A fila pode demorar alguns segundos a ser processada.
         * Se entretanto o utilizador abriu a app ou o grupo deixou de ter
         * pelo menos 3 pessoas, cancelamos o push antes de o enviar.
         */
        if ($type === 'nearby') {
            $member = $this->db->prepare(
                'SELECT 1
                 FROM membros AS m
                 INNER JOIN estado_app_membro AS ea
                    ON ea.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci
                 WHERE m.id = :recipient_id
                 AND ea.em_background = 1
                 AND ea.alerta_proximidade_ativo = 1
                 AND ea.total_proximidade >= 3
                 LIMIT 1'
            );

            $member->execute([
                'recipient_id' => $recipientId
            ]);

            return (bool) $member->fetchColumn();
        }

        $data = is_array($job['dados'] ?? null)
            ? $job['dados']
            : [];

        try {
            $senderId = $this->validMemberId(
                (string) ($data['from_member_id'] ?? '')
            );
        } catch (InvalidArgumentException) {
            return false;
        }

        if (hash_equals($senderId, $recipientId)) {
            return false;
        }

        $members = $this->db->prepare(
            'SELECT COUNT(*)
             FROM membros
             WHERE id = :sender_id
             OR id = :recipient_id'
        );

        $members->execute([
            'sender_id' => $senderId,
            'recipient_id' => $recipientId
        ]);

        if ((int) $members->fetchColumn() !== 2) {
            return false;
        }

        $blocked = $this->db->prepare(
            'SELECT 1
             FROM bloqueados
             WHERE (
                 pessoa_bloqueou_id = :sender_1
                 AND pessoa_bloqueada_id = :recipient_1
             ) OR (
                 pessoa_bloqueou_id = :recipient_2
                 AND pessoa_bloqueada_id = :sender_2
             )
             LIMIT 1'
        );

        $blocked->execute([
            'sender_1' => $senderId,
            'recipient_1' => $recipientId,
            'recipient_2' => $recipientId,
            'sender_2' => $senderId
        ]);

        if ($blocked->fetchColumn()) {
            return false;
        }

        if ($type === 'hey') {
            $notificationId = filter_var(
                $data['notification_id'] ?? null,
                FILTER_VALIDATE_INT
            );

            if (
                $notificationId === false ||
                $notificationId < 1
            ) {
                return false;
            }

            $statement = $this->db->prepare(
                "SELECT 1
                 FROM notificacao
                 WHERE id = :id
                 AND emissor_id = :sender_id
                 AND destinatario_id = :recipient_id
                 AND tipo = 'hey'
                 AND lida = 0
                 AND ocultada_para_destinatario_em IS NULL
                 LIMIT 1"
            );
        } elseif ($type === 'message') {
            $notificationId = filter_var(
                $data['message_id'] ?? null,
                FILTER_VALIDATE_INT
            );

            if (
                $notificationId === false ||
                $notificationId < 1
            ) {
                return false;
            }

            $statement = $this->db->prepare(
                'SELECT 1
                 FROM mensagens_chat
                 WHERE id = :id
                 AND emissor_id = :sender_id
                 AND destinatario_id = :recipient_id
                 AND lida = 0
                 LIMIT 1'
            );
        } else {
            return false;
        }

        $statement->execute([
            'id' => $notificationId,
            'sender_id' => $senderId,
            'recipient_id' => $recipientId
        ]);

        return (bool) $statement->fetchColumn();
    }

    public function markCancelled(
        int $jobId,
        string $reason
    ): void {
        $reason = mb_substr(
            trim($reason),
            0,
            190
        );

        $statement = $this->db->prepare(
            "UPDATE push_fila
             SET estado = 'cancelled',
                 bloqueado_em = NULL,
                 ultimo_erro = :reason
             WHERE id = :id"
        );

        $statement->execute([
            'reason' => $reason !== ''
                ? $reason
                : 'cancelled',
            'id' => $jobId
        ]);
    }

    public function cleanup(): void
    {
        $this->db->exec(
            "DELETE FROM push_fila
             WHERE (
                 estado = 'sent'
                 AND enviado_em < DATE_SUB(
                     UTC_TIMESTAMP(6),
                     INTERVAL 7 DAY
                 )
             ) OR (
                 estado IN ('failed', 'cancelled')
                 AND criado_em < DATE_SUB(
                     UTC_TIMESTAMP(6),
                     INTERVAL 30 DAY
                 )
             )"
        );

        $this->db->exec(
            "DELETE FROM push_dispositivos
             WHERE ativo = 0
             AND atualizado_em < DATE_SUB(
                 UTC_TIMESTAMP(6),
                 INTERVAL 90 DAY
             )"
        );
    }

    private function enqueue(
        string $recipientId,
        string $type,
        string $title,
        string $body,
        string $url,
        array $data,
        string $uniqueKey
    ): int {
        $recipientId = $this->validMemberId($recipientId);
        $type = $this->normaliseRequiredText($type, 32);
        $title = $this->normaliseRequiredText($title, 120);
        $body = $this->normaliseRequiredText($body, 240);
        $url = $this->validInternalUrl($url);
        $uniqueKey = $this->normaliseRequiredText(
            $uniqueKey,
            190
        );

        $json = json_encode(
            $this->normaliseData($data),
            JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_THROW_ON_ERROR
        );

        $devices = $this->activeDeviceIds($recipientId);

        if ($devices === []) {
            return 0;
        }

        $statement = $this->db->prepare(
            "INSERT IGNORE INTO push_fila (
                dispositivo_id,
                membro_id,
                tipo,
                titulo,
                corpo,
                url,
                dados_json,
                chave_unica,
                estado,
                tentativas,
                proxima_tentativa_em,
                criado_em
             ) VALUES (
                :device_id,
                :member_id,
                :type,
                :title,
                :body,
                :url,
                :data,
                :unique_key,
                'queued',
                0,
                UTC_TIMESTAMP(6),
                UTC_TIMESTAMP(6)
             )"
        );

        $queued = 0;

        foreach ($devices as $deviceId) {
            $statement->execute([
                'device_id' => $deviceId,
                'member_id' => $recipientId,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'url' => $url,
                'data' => $json,
                'unique_key' => $uniqueKey
            ]);

            $queued += $statement->rowCount();
        }

        return $queued;
    }

    private function activeDeviceIds(
        string $memberId
    ): array {
        $statement = $this->db->prepare(
            'SELECT id
             FROM push_dispositivos
             WHERE membro_id = :member_id
             AND ativo = 1'
        );

        $statement->execute([
            'member_id' => $memberId
        ]);

        return array_map(
            static fn (mixed $id): int => (int) $id,
            $statement->fetchAll(PDO::FETCH_COLUMN)
        );
    }

    /**
     * @return array{name: string, photo: string}
     */
    private function memberPreview(
        string $memberId
    ): array {
        $statement = $this->db->prepare(
            "SELECT
                COALESCE(
                    NULLIF(
                        TRIM(
                            CONCAT(
                                primeiro_nome,
                                ' ',
                                ultimo_nome
                            )
                        ),
                        ''
                    ),
                    'Alguém'
                ) AS nome,
                COALESCE(
                    (
                        SELECT fp.nome_arquivo
                        FROM fotos_perfil AS fp
                        WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = membros.id COLLATE utf8mb4_unicode_ci
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
                ) AS foto
             FROM membros
             WHERE membros.id = :id
             LIMIT 1"
        );

        $statement->execute([
            'id' => $memberId
        ]);

        $member = $statement->fetch(PDO::FETCH_ASSOC);
        $name = trim((string) ($member['nome'] ?? ''));
        $photo = basename(
            trim((string) ($member['foto'] ?? ''))
        );

        if ($name === '') {
            $name = 'Alguém';
        }

        if ($photo === '') {
            $photo = 'default.webp';
        }

        return [
            'name' => mb_substr($name, 0, 100),
            'photo' => '/imagens/fotos-perfil/' .
                rawurlencode($photo)
        ];
    }

    private function deviceIdByTokenHash(
        string $tokenHash
    ): ?int {
        $statement = $this->db->prepare(
            'SELECT id
             FROM push_dispositivos
             WHERE token_hash = :token_hash
             LIMIT 1
             FOR UPDATE'
        );

        $statement->execute([
            'token_hash' => $tokenHash
        ]);

        $id = $statement->fetchColumn();

        return $id === false
            ? null
            : (int) $id;
    }

    private function deviceIdByInstallation(
        string $platform,
        string $installationId
    ): ?int {
        $statement = $this->db->prepare(
            'SELECT id
             FROM push_dispositivos
             WHERE plataforma = :platform
             AND instalacao_id = :installation_id
             LIMIT 1
             FOR UPDATE'
        );

        $statement->execute([
            'platform' => $platform,
            'installation_id' => $installationId
        ]);

        $id = $statement->fetchColumn();

        return $id === false
            ? null
            : (int) $id;
    }

    private function deleteDevice(
        int $deviceId
    ): void {
        $statement = $this->db->prepare(
            'DELETE FROM push_dispositivos
             WHERE id = :id'
        );

        $statement->execute([
            'id' => $deviceId
        ]);
    }

    private function cancelQueuedForInactiveDevices(
        string $memberId
    ): void {
        $statement = $this->db->prepare(
            "UPDATE push_fila AS q
             INNER JOIN push_dispositivos AS d
                ON d.id = q.dispositivo_id
             SET q.estado = 'cancelled',
                 q.bloqueado_em = NULL,
                 q.ultimo_erro = 'device_unregistered'
             WHERE q.membro_id = :member_id
             AND d.ativo = 0
             AND q.estado IN ('queued', 'processing')"
        );

        $statement->execute([
            'member_id' => $memberId
        ]);
    }

    private function validMemberId(
        string $memberId
    ): string {
        $memberId = strtolower(
            trim($memberId)
        );

        if (
            preg_match(
                '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/',
                $memberId
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Membro inválido.'
            );
        }

        return $memberId;
    }

    private function validPlatform(
        string $platform
    ): string {
        $platform = strtolower(
            trim($platform)
        );

        if (
            !in_array(
                $platform,
                ['ios', 'android'],
                true
            )
        ) {
            throw new InvalidArgumentException(
                'Plataforma inválida.'
            );
        }

        return $platform;
    }

    private function validToken(
        string $token,
        string $platform
    ): string {
        $token = trim($token);

        $valid = $platform === 'ios'
            ? preg_match(
                '/^[a-fA-F0-9]{32,256}$/',
                $token
            ) === 1
            : strlen($token) >= 20 &&
                strlen($token) <= 4096 &&
                preg_match(
                    '/^[\x21-\x7E]+$/',
                    $token
                ) === 1;

        if (!$valid) {
            throw new InvalidArgumentException(
                'Token push inválido.'
            );
        }

        return $platform === 'ios'
            ? strtolower($token)
            : $token;
    }

    private function validInstallationId(
        string $installationId
    ): string {
        $installationId = strtolower(
            trim($installationId)
        );

        if (
            preg_match(
                '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/',
                $installationId
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Instalação inválida.'
            );
        }

        return $installationId;
    }

    private function validHash(
        string $hash,
        string $message
    ): string {
        $hash = strtolower(
            trim($hash)
        );

        if (
            preg_match(
                '/^[a-f0-9]{64}$/',
                $hash
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                $message
            );
        }

        return $hash;
    }

    private function validEnvironment(
        string $environment
    ): string {
        $environment = strtolower(
            trim($environment)
        );

        if (
            !in_array(
                $environment,
                ['sandbox', 'production'],
                true
            )
        ) {
            throw new InvalidArgumentException(
                'Ambiente APNs inválido.'
            );
        }

        return $environment;
    }

    private function validInternalUrl(
        string $url
    ): string {
        $url = trim($url);

        if (
            $url === '' ||
            !str_starts_with($url, '/') ||
            str_starts_with($url, '//') ||
            preg_match(
                '/[\x00-\x1F\x7F]/',
                $url
            ) === 1 ||
            strlen($url) > 500
        ) {
            throw new InvalidArgumentException(
                'Destino do push inválido.'
            );
        }

        return $url;
    }

    private function normaliseRequiredText(
        string $value,
        int $max
    ): string {
        $value = trim(
            preg_replace(
                '/\s+/u',
                ' ',
                $value
            ) ?? ''
        );

        if ($value === '') {
            throw new InvalidArgumentException(
                'Texto do push inválido.'
            );
        }

        return mb_substr(
            $value,
            0,
            $max
        );
    }

    private function normaliseOptionalText(
        ?string $value,
        int $max
    ): ?string {
        if ($value === null) {
            return null;
        }

        $value = trim($value);

        return $value === ''
            ? null
            : mb_substr(
                $value,
                0,
                $max
            );
    }

    private function normaliseData(
        array $data
    ): array {
        $normalised = [];

        foreach ($data as $key => $value) {
            $key = trim(
                (string) $key
            );

            if (
                $key === '' ||
                strlen($key) > 64 ||
                preg_match(
                    '/^[a-zA-Z0-9_]+$/',
                    $key
                ) !== 1 ||
                (
                    !is_scalar($value) &&
                    $value !== null
                )
            ) {
                continue;
            }

            $normalised[$key] = mb_substr(
                (string) $value,
                0,
                500
            );
        }

        return $normalised;
    }

    private function decodeData(
        string $json
    ): array {
        try {
            $data = json_decode(
                $json,
                true,
                16,
                JSON_THROW_ON_ERROR
            );
        } catch (\JsonException) {
            return [];
        }

        return is_array($data)
            ? $this->normaliseData($data)
            : [];
    }

    private function retryDelay(
        int $attempts
    ): int {
        return match ($attempts) {
            1 => 15,
            2 => 60,
            3 => 300,
            default => 900
        };
    }
}