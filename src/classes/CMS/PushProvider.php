<?php

declare(strict_types=1);

namespace App\CMS;

use RuntimeException;

final class PushProvider
{
    private array $config;
    private ?array $fcmAccessToken = null;
    private array $apnsTokens = [];

    public function __construct(array $config = [])
    {
        $this->config = array_replace_recursive([
            'enabled' => false,
            'apns' => [
                'team_id' => '',
                'key_id' => '',
                'private_key_file' => '',
                'topic' => ''
            ],
            'fcm' => [
                'service_account_file' => '',
                'project_id' => ''
            ]
        ], $config);
    }

    public function isEnabled(): bool
    {
        return ($this->config['enabled'] ?? false) === true;
    }

    /**
     * @return array{success: bool, permanent: bool, error: string, environment?: string}
     */
    public function send(array $job): array
    {
        if (!$this->isEnabled()) {
            throw new RuntimeException('O envio de notificações push está desativado.');
        }

        return match ((string) ($job['plataforma'] ?? '')) {
            'ios' => $this->sendApns($job),
            'android' => $this->sendFcm($job),
            default => [
                'success' => false,
                'permanent' => true,
                'error' => 'unsupported_platform'
            ]
        };
    }

    private function sendApns(array $job): array
    {
        $config = $this->config['apns'] ?? [];
        $teamId = $this->requiredConfig($config, 'team_id', 'APNs Team ID');
        $keyId = $this->requiredConfig($config, 'key_id', 'APNs Key ID');
        $keyFile = $this->requiredConfig(
            $config,
            'private_key_file',
            'ficheiro da chave APNs'
        );
        $topic = $this->requiredConfig(config: $config, key: 'topic', label: 'APNs topic');
        $deviceToken = trim((string) ($job['token'] ?? ''));

        if ($deviceToken === '') {
            return [
                'success' => false,
                'permanent' => true,
                'error' => 'empty_device_token'
            ];
        }

        $environment = (string) ($job['ambiente'] ?? 'production');
        $host = $environment === 'sandbox'
            ? 'https://api.sandbox.push.apple.com'
            : 'https://api.push.apple.com';

        $payload = [
            'aps' => [
                'alert' => [
                    'title' => (string) ($job['titulo'] ?? 'Margot'),
                    'body' => (string) ($job['corpo'] ?? '')
                ],
                'sound' => 'default',
                'thread-id' => 'margot-' . (string) ($job['tipo'] ?? 'activity')
            ],
            'url' => (string) ($job['url'] ?? '/'),
            'type' => (string) ($job['tipo'] ?? 'activity')
        ];

        foreach (($job['dados'] ?? []) as $key => $value) {
            if ($key !== 'aps') {
                $payload[(string) $key] = (string) $value;
            }
        }

        $json = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_THROW_ON_ERROR
        );

        $authorization = $this->apnsAuthorizationToken(
            $teamId,
            $keyId,
            $keyFile
        );

        $headers = [
            'authorization: bearer ' . $authorization,
            'apns-topic: ' . $topic,
            'apns-push-type: alert',
            'apns-priority: 10',
            'apns-expiration: ' . (time() + 86400),
            'content-type: application/json'
        ];

        $response = $this->apnsRequest(
            $host,
            $deviceToken,
            $headers,
            $json
        );

        if ($response['network_error'] !== '') {
            return [
                'success' => false,
                'permanent' => false,
                'error' => 'apns_network_' . $response['network_error']
            ];
        }

        if ($response['status'] === 200) {
            return [
                'success' => true,
                'permanent' => false,
                'error' => '',
                'environment' => $environment
            ];
        }

        $body = $this->decodeJsonObject($response['body']);
        $reason = trim((string) ($body['reason'] ?? 'unknown'));

        /*
         * Um token de Debug pertence ao sandbox e um token de TestFlight/App
         * Store à produção. Se o ambiente guardado estiver errado, tentamos
         * uma vez no outro endpoint e corrigimos o dispositivo após sucesso.
         */
        if ($reason === 'BadDeviceToken') {
            $environment = $environment === 'sandbox'
                ? 'production'
                : 'sandbox';
            $host = $environment === 'sandbox'
                ? 'https://api.sandbox.push.apple.com'
                : 'https://api.push.apple.com';
            $response = $this->apnsRequest(
                $host,
                $deviceToken,
                $headers,
                $json
            );

            if ($response['network_error'] !== '') {
                return [
                    'success' => false,
                    'permanent' => false,
                    'error' => 'apns_alternate_network_' . $response['network_error']
                ];
            }

            if ($response['status'] === 200) {
                return [
                    'success' => true,
                    'permanent' => false,
                    'error' => '',
                    'environment' => $environment
                ];
            }

            $body = $this->decodeJsonObject($response['body']);
            $reason = trim((string) ($body['reason'] ?? 'unknown'));
        }

        $permanentReasons = [
            'BadDeviceToken',
            'DeviceTokenNotForTopic',
            'Unregistered'
        ];

        return [
            'success' => false,
            'permanent' => in_array($reason, $permanentReasons, true),
            'error' => sprintf('apns_%d_%s', $response['status'], $reason)
        ];
    }

    /**
     * @return array{status: int, body: string, network_error: string}
     */
    private function apnsRequest(
        string $host,
        string $deviceToken,
        array $headers,
        string $json
    ): array {
        return $this->curlRequest(
            $host . '/3/device/' . rawurlencode($deviceToken),
            $headers,
            $json,
            true
        );
    }

    private function sendFcm(array $job): array
    {
        $config = $this->config['fcm'] ?? [];
        $serviceAccountFile = $this->requiredConfig(
            $config,
            'service_account_file',
            'conta de serviço FCM'
        );
        $serviceAccount = $this->readJsonFile($serviceAccountFile);
        $projectId = trim((string) ($config['project_id'] ?? ''));

        if ($projectId === '') {
            $projectId = trim((string) ($serviceAccount['project_id'] ?? ''));
        }

        if ($projectId === '') {
            throw new RuntimeException('O Project ID do Firebase não está configurado.');
        }

        $deviceToken = trim((string) ($job['token'] ?? ''));

        if ($deviceToken === '') {
            return [
                'success' => false,
                'permanent' => true,
                'error' => 'empty_device_token'
            ];
        }

        $data = [
            'url' => (string) ($job['url'] ?? '/'),
            'type' => (string) ($job['tipo'] ?? 'activity')
        ];

        foreach (($job['dados'] ?? []) as $key => $value) {
            $data[(string) $key] = (string) $value;
        }

        $payload = [
            'message' => [
                'token' => $deviceToken,
                'notification' => [
                    'title' => (string) ($job['titulo'] ?? 'Margot'),
                    'body' => (string) ($job['corpo'] ?? '')
                ],
                'data' => $data,
                'android' => [
                    'priority' => 'high',
                    'ttl' => '86400s',
                    'notification' => [
                        'channel_id' => 'margot_activity',
                        'icon' => 'ic_stat_margot',
                        'sound' => 'default'
                    ]
                ]
            ]
        ];

        $json = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_THROW_ON_ERROR
        );

        $accessToken = $this->fcmAccessToken(
            $serviceAccount,
            $serviceAccountFile
        );

        $response = $this->curlRequest(
            sprintf(
                'https://fcm.googleapis.com/v1/projects/%s/messages:send',
                rawurlencode($projectId)
            ),
            [
                'authorization: Bearer ' . $accessToken,
                'content-type: application/json; charset=UTF-8'
            ],
            $json
        );

        if ($response['network_error'] !== '') {
            return [
                'success' => false,
                'permanent' => false,
                'error' => 'fcm_network_' . $response['network_error']
            ];
        }

        if ($response['status'] >= 200 && $response['status'] < 300) {
            return ['success' => true, 'permanent' => false, 'error' => ''];
        }

        $body = $this->decodeJsonObject($response['body']);
        $error = is_array($body['error'] ?? null) ? $body['error'] : [];
        $providerCode = trim((string) ($error['status'] ?? 'unknown'));

        foreach (($error['details'] ?? []) as $detail) {
            if (!is_array($detail)) {
                continue;
            }

            $candidate = trim((string) ($detail['errorCode'] ?? ''));

            if ($candidate !== '') {
                $providerCode = $candidate;
                break;
            }
        }

        $permanent = in_array(
            $providerCode,
            ['UNREGISTERED', 'SENDER_ID_MISMATCH'],
            true
        );

        return [
            'success' => false,
            'permanent' => $permanent,
            'error' => sprintf('fcm_%d_%s', $response['status'], $providerCode)
        ];
    }

    private function apnsAuthorizationToken(
        string $teamId,
        string $keyId,
        string $keyFile
    ): string {
        $cacheKey = hash('sha256', $teamId . "\0" . $keyId . "\0" . $keyFile);
        $cached = $this->apnsTokens[$cacheKey] ?? null;

        if (is_array($cached) && (int) ($cached['expires_at'] ?? 0) > time()) {
            return (string) $cached['token'];
        }

        $privateKey = $this->readFile($keyFile, 'chave privada APNs');
        $issuedAt = time();
        $unsigned = $this->base64UrlEncode(json_encode(
            ['alg' => 'ES256', 'kid' => $keyId],
            JSON_THROW_ON_ERROR
        )) . '.' . $this->base64UrlEncode(json_encode(
            ['iss' => $teamId, 'iat' => $issuedAt],
            JSON_THROW_ON_ERROR
        ));

        $key = openssl_pkey_get_private($privateKey);

        if ($key === false) {
            throw new RuntimeException('A chave privada APNs não é válida.');
        }

        $signature = '';

        if (!openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Não foi possível assinar o token APNs.');
        }

        $token = $unsigned . '.' . $this->base64UrlEncode(
            $this->ecdsaDerToJose($signature, 32)
        );

        $this->apnsTokens[$cacheKey] = [
            'token' => $token,
            'expires_at' => $issuedAt + 3000
        ];

        return $token;
    }

    private function fcmAccessToken(
        array $serviceAccount,
        string $serviceAccountFile
    ): string {
        if (
            is_array($this->fcmAccessToken) &&
            ($this->fcmAccessToken['file'] ?? '') === $serviceAccountFile &&
            (int) ($this->fcmAccessToken['expires_at'] ?? 0) > time()
        ) {
            return (string) $this->fcmAccessToken['token'];
        }

        $clientEmail = trim((string) ($serviceAccount['client_email'] ?? ''));
        $privateKey = (string) ($serviceAccount['private_key'] ?? '');
        $tokenUri = trim((string) ($serviceAccount['token_uri'] ?? ''));

        if ($tokenUri === '') {
            $tokenUri = 'https://oauth2.googleapis.com/token';
        }

        if ($clientEmail === '' || trim($privateKey) === '') {
            throw new RuntimeException('A conta de serviço FCM está incompleta.');
        }

        $issuedAt = time();
        $unsigned = $this->base64UrlEncode(json_encode(
            ['alg' => 'RS256', 'typ' => 'JWT'],
            JSON_THROW_ON_ERROR
        )) . '.' . $this->base64UrlEncode(json_encode([
            'iss' => $clientEmail,
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud' => $tokenUri,
            'iat' => $issuedAt,
            'exp' => $issuedAt + 3600
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

        $key = openssl_pkey_get_private($privateKey);

        if ($key === false) {
            throw new RuntimeException('A chave privada da conta FCM não é válida.');
        }

        $signature = '';

        if (!openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Não foi possível assinar o token FCM.');
        }

        $assertion = $unsigned . '.' . $this->base64UrlEncode($signature);
        $response = $this->curlRequest(
            $tokenUri,
            ['content-type: application/x-www-form-urlencoded'],
            http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion
            ], '', '&', PHP_QUERY_RFC3986)
        );

        if ($response['network_error'] !== '') {
            throw new RuntimeException(
                'Falha de rede ao autenticar no FCM: ' . $response['network_error']
            );
        }

        $body = $this->decodeJsonObject($response['body']);
        $token = trim((string) ($body['access_token'] ?? ''));
        $expiresIn = max(120, (int) ($body['expires_in'] ?? 3600));

        if ($response['status'] !== 200 || $token === '') {
            throw new RuntimeException(
                'O FCM recusou a autenticação (HTTP ' . $response['status'] . ').'
            );
        }

        $this->fcmAccessToken = [
            'file' => $serviceAccountFile,
            'token' => $token,
            'expires_at' => time() + $expiresIn - 60
        ];

        return $token;
    }

    /**
     * @return array{status: int, body: string, network_error: string}
     */
    private function curlRequest(
        string $url,
        array $headers,
        string $body,
        bool $http2 = false
    ): array {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('A extensão cURL do PHP não está instalada.');
        }

        $curl = curl_init($url);

        if ($curl === false) {
            throw new RuntimeException('Não foi possível iniciar o pedido push.');
        }

        $options = [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0
        ];

        if ($http2 && defined('CURL_HTTP_VERSION_2_0')) {
            $options[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_2_0;
        }

        curl_setopt_array($curl, $options);
        $responseBody = curl_exec($curl);
        $networkError = $responseBody === false
            ? (string) curl_errno($curl)
            : '';
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);

        return [
            'status' => $status,
            'body' => is_string($responseBody) ? $responseBody : '',
            'network_error' => $networkError
        ];
    }

    private function requiredConfig(
        array $config,
        string $key,
        string $label
    ): string {
        $value = trim((string) ($config[$key] ?? ''));

        if ($value === '') {
            throw new RuntimeException('Falta configurar ' . $label . '.');
        }

        return $value;
    }

    private function readJsonFile(string $path): array
    {
        $contents = $this->readFile($path, 'conta de serviço FCM');

        try {
            $decoded = json_decode($contents, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw new RuntimeException(
                'O ficheiro da conta de serviço FCM não contém JSON válido.',
                0,
                $error
            );
        }

        if (!is_array($decoded)) {
            throw new RuntimeException('A conta de serviço FCM não é válida.');
        }

        return $decoded;
    }

    private function readFile(string $path, string $label): string
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new RuntimeException('O ficheiro de ' . $label . ' não está acessível.');
        }

        $contents = file_get_contents($path);

        if ($contents === false || trim($contents) === '') {
            throw new RuntimeException('O ficheiro de ' . $label . ' está vazio.');
        }

        return $contents;
    }

    private function decodeJsonObject(string $json): array
    {
        try {
            $decoded = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return [];
        }

        return is_array($decoded) ? $decoded : [];
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function ecdsaDerToJose(string $signature, int $partLength): string
    {
        $offset = 0;

        if (($signature[$offset] ?? '') !== "\x30") {
            throw new RuntimeException('A assinatura APNs não está em formato DER.');
        }

        $offset++;
        $sequenceLength = $this->readDerLength($signature, $offset);

        if ($sequenceLength !== strlen($signature) - $offset) {
            throw new RuntimeException('A assinatura APNs DER está truncada.');
        }

        $r = $this->readDerInteger($signature, $offset);
        $s = $this->readDerInteger($signature, $offset);

        return $this->normaliseEcdsaPart($r, $partLength) .
            $this->normaliseEcdsaPart($s, $partLength);
    }

    private function readDerInteger(string $der, int &$offset): string
    {
        if (($der[$offset] ?? '') !== "\x02") {
            throw new RuntimeException('A assinatura APNs DER é inválida.');
        }

        $offset++;
        $length = $this->readDerLength($der, $offset);
        $value = substr($der, $offset, $length);

        if (strlen($value) !== $length) {
            throw new RuntimeException('A assinatura APNs DER está incompleta.');
        }

        $offset += $length;
        return $value;
    }

    private function readDerLength(string $der, int &$offset): int
    {
        if (!isset($der[$offset])) {
            throw new RuntimeException('A assinatura APNs DER está incompleta.');
        }

        $length = ord($der[$offset]);
        $offset++;

        if (($length & 0x80) === 0) {
            return $length;
        }

        $bytes = $length & 0x7f;

        if ($bytes < 1 || $bytes > 4 || strlen($der) < $offset + $bytes) {
            throw new RuntimeException('O comprimento DER da assinatura APNs é inválido.');
        }

        $length = 0;

        for ($index = 0; $index < $bytes; $index++) {
            $length = ($length << 8) | ord($der[$offset]);
            $offset++;
        }

        return $length;
    }

    private function normaliseEcdsaPart(string $part, int $length): string
    {
        $part = ltrim($part, "\x00");

        if (strlen($part) > $length) {
            throw new RuntimeException('A assinatura APNs ECDSA é inválida.');
        }

        return str_pad($part, $length, "\x00", STR_PAD_LEFT);
    }
}