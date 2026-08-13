<?php

declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit;
}

/* O router principal já valida; esta chamada protege também o ficheiro isolado. */
require_csrf_token();

/*
 * O logout tem de funcionar mesmo que a remoção do token na base de dados
 * falhe momentaneamente. Primeiro tentamos revogar o token persistente e,
 * independentemente do resultado, apagamos o cookie e destruímos a sessão.
 */
$tokenPersistente = trim((string) ($cookie->token ?? ''));
$membroId = trim((string) ($session->id ?? ''));

if ($membroId !== '') {
    try {
        $db->runSQL(
            "DELETE FROM token
             WHERE membro_id = :membro_id
             AND proposito IN ('background_location', 'websocket')",
            ['membro_id' => $membroId]
        );
    } catch (Throwable $erro) {
        error_log(
            '[logout] Não foi possível revogar os acessos em segundo plano: ' .
            $erro->getMessage()
        );
    }

    try {
        $db->runSQL(
            'UPDATE localizacao_membro
             SET localizacao_ativa = 0,
                 visivel = 0,
                 atualizada_em = UTC_TIMESTAMP()
            WHERE membro_id = :membro_id',
            ['membro_id' => $membroId]
        );
    } catch (Throwable $erro) {
        error_log(
            '[logout] Não foi possível desativar a presença em segundo plano: ' .
            $erro->getMessage()
        );
    }
}

try {
    if ($tokenPersistente !== '') {
        $cms->getToken()->delete($tokenPersistente);
    }
} catch (Throwable $erro) {
    error_log(
        '[logout] Não foi possível revogar o token persistente: ' .
        $erro->getMessage()
    );
}

try {
    $cookie->delete();
} catch (Throwable $erro) {
    error_log(
        '[logout] Não foi possível concluir a limpeza do cookie: ' .
        $erro->getMessage()
    );
}

/*
 * Fallback local: Cookie::delete() também faz isto, mas esta limpeza garante
 * que o browser deixa de reutilizar o token mesmo perante uma falha de BD.
 */
setcookie('token', '', [
    'expires' => time() - 3600,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax'
]);

unset($_COOKIE['token']);
$cookie->token = '';

$session->delete();

redirect(DOC_ROOT . 'login/', [], 303);