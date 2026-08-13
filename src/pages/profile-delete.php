<?php

declare(strict_types=1);

use App\Email\Email;

require_login($session);

header(
    'Cache-Control: no-store, no-cache, must-revalidate'
);

header('Pragma: no-cache');

header(
    'X-Robots-Tag: noindex, nofollow'
);

header(
    'Referrer-Policy: no-referrer'
);

$metodo = strtoupper(
    (string) (
        $_SERVER['REQUEST_METHOD'] ??
        'GET'
    )
);

if (
    !in_array(
        $metodo,
        ['GET', 'POST'],
        true
    )
) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}

$membroId = trim(
    (string) ($session->id ?? '')
);

$membro =
    $cms
        ->getMember()
        ->get($membroId);

$enviado = false;
$mensagemErro = '';

if (!$membro) {
    http_response_code(404);

    echo $twig->render(
        'error-page.html'
    );

    return;
}

if ($metodo === 'POST') {
    /*
     * O index.php já valida CSRF;
     * esta chamada mantém a página
     * segura isoladamente.
     */
    require_csrf_token();

    $limiteMembro =
        consumirLimiteRequisicoes(
            'delete-account-member',
            chaveLimiteRequisicoes(
                $membroId
            ),
            3,
            60 * 60
        );

    $limiteIp =
        consumirLimiteRequisicoes(
            'delete-account-ip',
            chaveLimiteRequisicoes(
                enderecoCliente()
            ),
            10,
            60 * 60
        );

    if (
        !$limiteMembro['permitido'] ||
        !$limiteIp['permitido']
    ) {
        $tentarEm = max(
            1,
            (int) $limiteMembro[
                'tentar_em'
            ],
            (int) $limiteIp[
                'tentar_em'
            ]
        );

        http_response_code(429);

        header(
            'Retry-After: ' .
            $tentarEm
        );

        $mensagemErro =
            'Foram feitos demasiados pedidos. ' .
            'Tenta novamente mais tarde.';
    } else {
        $tokens = $cms->getToken();
        $token = '';

        try {
            /*
             * Token::create() elimina o token
             * anterior deste propósito e usa
             * uma transação. Só enviamos o
             * email depois de o token existir.
             */
            $token = $tokens->create(
                $membroId,
                'delete_account'
            );

            $link =
                rtrim(
                    (string) DOMAIN,
                    '/'
                ) .
                '/delete-account/?token=' .
                rawurlencode($token);

            $nome = htmlspecialchars(
                (string) (
                    $membro[
                        'primeiro_nome'
                    ] ?? ''
                ),
                ENT_QUOTES |
                ENT_SUBSTITUTE,
                'UTF-8'
            );

            $linkSeguro = htmlspecialchars(
                $link,
                ENT_QUOTES |
                ENT_SUBSTITUTE,
                'UTF-8'
            );

            $corpo =
                '<p>Olá ' .
                $nome .
                ',</p>' .

                '<p>Recebemos um pedido para eliminar definitivamente a tua conta Margot.</p>' .

                '<p><a href="' .
                $linkSeguro .
                '">Confirmar eliminação da conta</a></p>' .

                '<p>Esta ligação é válida durante 20 minutos e só pode ser utilizada uma vez.</p>' .

                '<p>Se não fizeste este pedido, ignora este email. A tua conta não será eliminada.</p>';

            $mail = new Email(
                $email_config
            );

            $enviado = $mail->sendEmail(
                (string) $email_config[
                    'admin_email'
                ],
                (string) $membro['email'],
                'Confirmar eliminação da conta Margot',
                $corpo
            );

            if (!$enviado) {
                $tokens->delete($token);
                $token = '';

                $mensagemErro =
                    'Não foi possível enviar o email. ' .
                    'Tenta novamente.';
            }
        } catch (Throwable $erro) {
            if ($token !== '') {
                try {
                    $tokens->delete($token);
                } catch (
                    Throwable $erroToken
                ) {
                    error_log(
                        '[profile-delete] Não foi possível revogar o token após a falha: ' .
                        $erroToken->getMessage()
                    );
                }
            }

            http_response_code(500);

            $mensagemErro =
                'Não foi possível enviar o email. ' .
                'Tenta novamente.';

            error_log(
                '[profile-delete] Falha ao pedir eliminação: ' .
                $erro->getMessage()
            );
        }
    }
}

echo $twig->render(
    'profile-delete.html',
    [
        'membro' => $membro,
        'sent' => $enviado,
        'mensagem_erro' =>
            $mensagemErro
    ]
);