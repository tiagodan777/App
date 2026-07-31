<?php
declare(strict_types=1);

use App\CMS\EmailVerification;

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$token = strtolower(trim((string) ($_GET['token'] ?? '')));
$verificado = false;
$mensagemErro = '';

if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
    http_response_code(400);
    $mensagemErro = 'Esta ligação é inválida, expirou ou já foi utilizada.';
} else {
    $limite = consumirLimiteRequisicoes(
        'verify-email-ip',
        chaveLimiteRequisicoes(enderecoCliente()),
        30,
        60 * 60
    );

    if (!$limite['permitido']) {
        $tentarEm = max(1, (int) $limite['tentar_em']);
        http_response_code(429);
        header('Retry-After: ' . $tentarEm);
        $mensagemErro = 'Foram feitas demasiadas tentativas. Tenta novamente mais tarde.';
    } else {
        try {
            $verification = new EmailVerification($db);
            $verificado = $verification->verify($token);

            if (!$verificado) {
                http_response_code(400);
                $mensagemErro = 'Esta ligação é inválida, expirou ou já foi utilizada.';
            }
        } catch (Throwable $erro) {
            http_response_code(500);
            $mensagemErro = 'Não foi possível confirmar o email. Tenta novamente.';
            error_log('[verify-email] Falha ao confirmar email: ' . $erro->getMessage());
        }
    }
}

echo $twig->render('verify-email.html', [
    'verificado' => $verificado,
    'mensagem_erro' => $mensagemErro
]);