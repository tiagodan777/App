<?php
declare(strict_types=1);

use App\CMS\PasswordRecovery;
use App\CMS\Token;
use App\Validate\Validate;

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$token = strtolower(trim((string) (
    $metodo === 'POST'
        ? ($_POST['token'] ?? '')
        : ($_GET['token'] ?? '')
)));
$tokenValido = false;
$concluido = false;
$mensagemErro = '';
$formatoValido = preg_match('/^[a-f0-9]{64}$/', $token) === 1;

if ($formatoValido) {
    try {
        $tokens = new Token($db);
        $tokenValido = $tokens->getMemberId($token, 'password_reset') !== false;
    } catch (Throwable $erro) {
        error_log('[password-reset] Falha ao validar o token: ' . $erro->getMessage());
    }
}

if ($metodo === 'POST') {
    $novaPassword = (string) ($_POST['nova_password'] ?? '');
    $confirmarPassword = (string) ($_POST['confirmar_password'] ?? '');
    $limiteIp = consumirLimiteRequisicoes(
        'password-reset-ip',
        chaveLimiteRequisicoes(enderecoCliente()),
        20,
        60 * 60
    );
    $limiteToken = consumirLimiteRequisicoes(
        'password-reset-token',
        chaveLimiteRequisicoes($token),
        10,
        60 * 60
    );

    if (!$limiteIp['permitido'] || !$limiteToken['permitido']) {
        $tentarEm = max(
            1,
            (int) $limiteIp['tentar_em'],
            (int) $limiteToken['tentar_em']
        );
        http_response_code(429);
        header('Retry-After: ' . $tentarEm);
        $mensagemErro = 'Foram feitas demasiadas tentativas. Tenta novamente mais tarde.';
    } elseif (!$tokenValido) {
        http_response_code(400);
        $mensagemErro = 'Esta ligação é inválida, expirou ou já foi utilizada.';
    } elseif (!Validate::isPassword($novaPassword)) {
        http_response_code(400);
        $mensagemErro = 'A password deve ter pelo menos 8 caracteres, uma maiúscula, uma minúscula e um número.';
    } elseif (!hash_equals($novaPassword, $confirmarPassword)) {
        http_response_code(400);
        $mensagemErro = 'As passwords não coincidem.';
    } else {
        try {
            $recovery = new PasswordRecovery($db);
            $concluido = $recovery->resetPassword($token, $novaPassword);

            if ($concluido) {
                $cookie->delete();
                $session->delete();
                $token = '';
                $tokenValido = false;
            } else {
                http_response_code(400);
                $tokenValido = false;
                $mensagemErro = 'Esta ligação é inválida, expirou ou já foi utilizada.';
            }
        } catch (Throwable $erro) {
            http_response_code(500);
            $mensagemErro = 'Não foi possível alterar a password. Tenta novamente.';
            error_log('[password-reset] Falha ao alterar a password: ' . $erro->getMessage());
        }
    }
}

echo $twig->render('password-reset.html', [
    'token' => $token,
    'token_valido' => $tokenValido,
    'concluido' => $concluido,
    'mensagem_erro' => $mensagemErro
]);