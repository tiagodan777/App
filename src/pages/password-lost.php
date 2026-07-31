<?php
declare(strict_types=1);

use App\CMS\PasswordRecovery;
use App\Email\Email;

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');

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
            'password-lost-ip',
            chaveLimiteRequisicoes(enderecoCliente()),
            20,
            60 * 60
        );
        $limiteEmail = consumirLimiteRequisicoes(
            'password-lost-email',
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
            $recovery = new PasswordRecovery($db);

            try {
                $pedido = $recovery->createRequest($email);

                if ($pedido !== false) {
                    $link = rtrim((string) DOMAIN, '/') . '/password-reset/?token=' . rawurlencode((string) $pedido['token']);
                    $nome = htmlspecialchars((string) $pedido['primeiro_nome'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $linkSeguro = htmlspecialchars($link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                    $corpo = '<p>Olá ' . $nome . ',</p>' .
                        '<p>Recebemos um pedido para alterares a password da tua conta Margot.</p>' .
                        '<p><a href="' . $linkSeguro . '">Alterar a minha password</a></p>' .
                        '<p>Esta ligação é válida durante 20 minutos e só pode ser utilizada uma vez.</p>' .
                        '<p>Se não fizeste este pedido, ignora este email. A tua password continuará igual.</p>' .
                        '<p>Ligação: ' . $linkSeguro . '</p>';

                    try {
                        $mail = new Email($email_config);
                        $mail->sendEmail(
                            (string) $email_config['admin_email'],
                            (string) $pedido['email'],
                            'Alterar a password da Margot',
                            $corpo
                        );
                    } catch (Throwable $erroEmail) {
                        $recovery->cancelRequest((string) $pedido['token']);
                        error_log('[password-lost] Falha ao enviar o email: ' . $erroEmail->getMessage());
                    }
                } else {
                    usleep(random_int(250000, 600000));
                }
            } catch (Throwable $erro) {
                error_log('[password-lost] Falha ao processar o pedido: ' . $erro->getMessage());
            }

            $enviado = true;
            $email = '';
        }
    }
}

echo $twig->render('password-lost.html', [
    'email' => $email,
    'enviado' => $enviado,
    'mensagem_erro' => $mensagemErro
]);