<?php
declare(strict_types=1);

namespace App\CMS;

trait ReusablePushTransport {
    private $pushMulti = null;

    private function curlRequest(string $url, array $headers, string $body, bool $http2 = false): array {
        if (!function_exists('curl_multi_init')) {
            return $this->curlRequestSequential($url, $headers, $body, $http2);
        }

        $multi = $this->pushMultiHandle();
        $handle = $this->pushRequestHandle(compact('url', 'headers', 'body', 'http2'));

        if (curl_multi_add_handle($multi, $handle) !== CURLM_OK) {
            curl_close($handle);
            throw new \RuntimeException('Não foi possível iniciar o pedido push.');
        }

        try {
            while (true) {
                $this->performPushMulti($multi);

                while (($info = curl_multi_info_read($multi)) !== false) {
                    if ($info['handle'] === $handle) {
                        return $this->pushResponse($handle, (int) $info['result']);
                    }
                }

                $this->waitPushMulti($multi);
            }
        } finally {
            curl_multi_remove_handle($multi, $handle);
            curl_close($handle);
        }
    }

    private function pushMultiHandle() {
        if ($this->pushMulti === null) {
            $this->pushMulti = curl_multi_init();
            curl_multi_setopt($this->pushMulti, CURLMOPT_MAXCONNECTS, 16);
        }

        return $this->pushMulti;
    }

    private function pushRequestHandle(array $request) {
        $handle = curl_init($request['url']);

        if ($handle === false) {
            throw new \RuntimeException('Não foi possível criar o pedido push.');
        }

        $headers = $request['headers'];

        $options = [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $request['body'],
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use ($headers): int {
                if (
                    in_array('apns-push-type: location', $headers, true) &&
                    preg_match('/^apns-unique-id:[ \\t]*([!-~]{1,256})[ \\t]*\\r?\\n?$/iD', $line, $match) === 1
                ) {
                    error_log('[LOCATION RECOVERY] apns_unique_id=' . $match[1]);
                }

                return strlen($line);
            }
        ];

        if ($request['http2'] && defined('CURL_HTTP_VERSION_2_0')) {
            $options[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_2_0;
        }

        if (!curl_setopt_array($handle, $options)) {
            curl_close($handle);
            throw new \RuntimeException('Não foi possível configurar o pedido push.');
        }

        return $handle;
    }

    private function performPushMulti($multi): void {
        do {
            $status = curl_multi_exec($multi, $running);
        } while ($status === CURLM_CALL_MULTI_PERFORM);

        if ($status !== CURLM_OK) {
            throw new \RuntimeException('Erro no transporte push: ' . $status);
        }
    }

    private function waitPushMulti($multi): void {
        if (curl_multi_select($multi, 0.1) === -1) {
            usleep(10000);
        }
    }

    private function pushResponse($handle, int $code): array {
        $body = curl_multi_getcontent($handle);

        return [
            'status' => (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE),
            'body' => is_string($body) ? $body : '',
            'network_error' => $code === CURLE_OK ? '' : (string) $code
        ];
    }
}