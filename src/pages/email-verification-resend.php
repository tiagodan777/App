<?php
declare(strict_types=1);

use App\CMS\EmailVerification;
use App\Email\Email;

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$email = '';
$enviado = false;
$mensagemErro = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim((string) ($_POST['email'] ?? ''));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        $mensagemErro = 'Introduz um email válido.';
    } else {
        $limiteIp = consumirLimiteRequisicoes(
            'verification-resend-ip',
            chaveLimiteRequisicoes(enderecoCliente()),
            20,
            60 * 60
        );

        $limiteEmail = consumirLimiteRequisicoes(
            'verification-resend-email',
            chaveLimiteRequisicoes($email),
            3,
            60 * 60
        );

        if (!$limiteIp['permitido'] || !$limiteEmail['permitido']) {
            $tentarEm = max(
                1,
                (int) $limiteIp['tentar_em'],
                (int) $limiteEmail['tentar_em']
            );

            http_response_code(429);
            header('Retry-After: ' . $tentarEm);
            $mensagemErro = 'Foram pedidos demasiados emails. Tenta novamente mais tarde.';
        } else {
            $verification = new EmailVerification($db);

            try {
                $pedido = $verification->createRequest($email);

                if ($pedido !== false) {
                    $link = rtrim((string) DOMAIN, '/') . '/verify-email/?token=' . rawurlencode((string) $pedido['token']);
                    $nome = htmlspecialchars((string) $pedido['primeiro_nome'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $linkSeguro = htmlspecialchars($link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $corpo = '<p>Olá ' . $nome . ',</p>' .
                        '<p>Confirma o teu endereço de email para começares a utilizar a Margot.</p>' .
                        '<p><a href="' . $linkSeguro . '">Confirmar o meu email</a></p>' .
                        '<p>Esta ligação é válida durante 24 horas e só pode ser utilizada uma vez.</p>' .
                        '<p>Se não criaste uma conta na Margot, ignora este email.</p>' .
                        '<p>Ligação: ' . $linkSeguro . '</p>';

                    try {
                        $mail = new Email($email_config);
                        $mail->sendEmail(
                            (string) $email_config['admin_email'],
                            (string) $pedido['email'],
                            'Confirma o teu email na Margot',
                            $corpo
                        );
                    } catch (Throwable $erroEmail) {
                        $verification->cancelRequest((string) $pedido['token']);
                        error_log('[email-verification-resend] Falha ao enviar email: ' . $erroEmail->getMessage());
                    }
                } else {
                    usleep(random_int(250000, 600000));
                }
            } catch (Throwable $erro) {
                error_log('[email-verification-resend] Falha ao processar pedido: ' . $erro->getMessage());
            }

            $enviado = true;
            $email = '';
        }
    }
}

echo $twig->render('email-verification-resend.html', [
    'email' => $email,
    'enviado' => $enviado,
    'mensagem_erro' => $mensagemErro
]);