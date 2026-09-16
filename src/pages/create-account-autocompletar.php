<?php
declare(strict_types=1);

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$gosto = trim((string) ($metodo === 'GET' ? $_GET['gosto'] ?? '' : $_POST['gosto'] ?? ''));
if ($metodo === 'GET') {
    json_response($gosto === '' ? [] : $cms->getHobbie()->get($gosto));
}
if ($metodo === 'POST') {
    if ($gosto === '') {
        json_response(['success' => false, 'message' => 'Escreve um gosto.'], 422);
    }
    try {
        $cms->getHobbie()->create($gosto);
    } catch (\PDOException $erro) {
        // Um gosto já existente também conta como sucesso, incluindo pedidos simultâneos.
        if ((int) ($erro->errorInfo[1] ?? 0) !== 1062) {
            error_log('[create-account-autocompletar] ' . $erro->getMessage());
            json_response(['success' => false, 'message' => 'Não foi possível guardar o gosto.'], 500);
        }
    }
    json_response(['success' => true]);
}
header('Allow: GET, POST');
json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
