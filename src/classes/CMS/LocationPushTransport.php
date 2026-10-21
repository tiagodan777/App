<?php
declare(strict_types=1);

namespace App\CMS;

trait LocationPushTransport {
    /** Um pedido, sem fallback de ambiente e sem repetição automática. */
    public function sendLocationRecovery(array $device): array {
        if (!$this->isEnabled()) {
            throw new \RuntimeException('Push desativado.');
        }
        $environment = $device['environment'];
        if (!in_array($environment, ['sandbox', 'production'], true)) {
            throw new \InvalidArgumentException('Ambiente APNs inválido.');
        }
        $config = $this->config['apns'];
        $authorization = $this->apnsAuthorizationToken(
            $this->requiredConfig($config, 'team_id', 'APNs Team ID'),
            $this->requiredConfig($config, 'key_id', 'APNs Key ID'),
            $this->requiredConfig($config, 'private_key_file', 'chave APNs')
        );
        $headers = [
            'authorization: bearer ' . $authorization,
            'apns-topic: ' . $this->requiredConfig($config, 'topic', 'APNs topic') . '.location-query',
            'apns-push-type: location', 'apns-priority: 10', 'apns-expiration: ' . (time() + 120),
            'content-type: application/json'
        ];
        $payload = json_encode([
            'aps' => (object) [], 'margot_location' => 'v1',
            'registration_id' => $device['registration_id'],
            'request_id' => $device['request_id'], 'sent_at' => time()
        ], JSON_THROW_ON_ERROR);
        $host = $environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
        $response = $this->apnsRequest($host, $device['apns_token'], $headers, $payload);
                $reason = (string) ($this->decodeJsonObject($response['body'])['reason'] ?? ($response['status'] === 200 ? '' : 'http_' . (int) $response['status']));
        return [
            'success' => $response['status'] === 200 && $response['network_error'] === '',
            'permanent' => in_array($reason, ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'], true),
            'error' => $response['network_error'] !== '' ? 'network_error' : substr($reason, 0, 100)
        ];
    }
}