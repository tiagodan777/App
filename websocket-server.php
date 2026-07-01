<?php
require_once __DIR__ . '/src/bootstrap.php';

use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use App\CMS\WebSocket;

$pdoFactory = function () use ($cms): \PDO {
    $pdo = $cms->getDatabase();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // estica o timeout da sessão (opcional)
    try { $pdo->query("SET SESSION wait_timeout=28800"); } catch (\Throwable $e) {}
    return $pdo;
};

// Instancia o componente com a fábrica de PDO
$ws = new WebSocket($pdoFactory);

// Cria o servidor Ratchet
$server = IoServer::factory(
    new HttpServer(
        new WsServer($ws)
    ),
    8080,
    '0.0.0.0'
);

echo "WebSocket ligado na porta 8080\n";

$server->run();