<?php

declare(strict_types=1);

use App\CMS\AuthenticatedWebSocket;
use App\CMS\WebSocket;
use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use React\EventLoop\Loop;
use React\Socket\SocketServer;

define('APP_ROOT', __DIR__);

$configFile = APP_ROOT . '/config/config.local.php';

if (!file_exists($configFile)) {
    $configFile = APP_ROOT . '/config/config.php';
}

require_once $configFile;
require_once APP_ROOT . '/vendor/autoload.php';

$loop = Loop::get();

$pdoFactory = static function () use ($dsn, $username, $password): PDO {
    return new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
};

$origemPrincipal = rtrim((string) DOMAIN, '/');
$hostPrincipal = (string) parse_url($origemPrincipal, PHP_URL_HOST);
$esquemaPrincipal = (string) parse_url($origemPrincipal, PHP_URL_SCHEME);
$origensPermitidas = [$origemPrincipal];

if ($hostPrincipal !== '' && $esquemaPrincipal !== '') {
    $hostAlternativo = str_starts_with($hostPrincipal, 'www.')
        ? substr($hostPrincipal, 4)
        : 'www.' . $hostPrincipal;

    $origensPermitidas[] = $esquemaPrincipal . '://' . $hostAlternativo;
}

$webSocket = new WebSocket($pdoFactory, $loop);

$webSocketAutenticado = new AuthenticatedWebSocket(
    $webSocket,
    $pdoFactory,
    $loop,
    array_values(array_unique($origensPermitidas))
);

$wsServer = new WsServer($webSocketAutenticado);

$wsServer->enableKeepAlive($loop, 30);

$socket = new SocketServer('127.0.0.1:8080', [], $loop);

new IoServer(
    new HttpServer($wsServer),
    $socket,
    $loop
);

echo sprintf(
    "[%s] WebSocket ligado em 127.0.0.1:8080\n",
    date('Y-m-d H:i:s')
);

$loop->run();