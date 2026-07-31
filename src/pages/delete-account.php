<?php
declare(strict_types=1);

use App\Email\Email;

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
$eliminado = false;
$mensagemErro = '';
$membro = false;
$membroId = false;

if (preg_match('/^[a-f0-9]{64}$/', $token) === 1) {
    try {
        $membroId = $cms->getToken()->getMemberId($token, 'delete_account');

        if ($membroId !== false) {
            $membro = $cms->getMember()->get((string) $membroId);
            $tokenValido = $membro !== false;
        }
    } catch (Throwable $erro) {
        error_log('[delete-account] Falha ao validar token: ' . $erro->getMessage());
    }
}

if ($metodo === 'POST') {
    $limiteIp = consumirLimiteRequisicoes(
        'delete-account-confirm-ip',
        chaveLimiteRequisicoes(enderecoCliente()),
        20,
        60 * 60
    );
    $limiteMembro = $membroId !== false
        ? consumirLimiteRequisicoes(
            'delete-account-confirm-member',
            chaveLimiteRequisicoes((string) $membroId),
            5,
            60 * 60
        )
        : ['permitido' => true, 'tentar_em' => 0];

    if (!$limiteIp['permitido'] || !$limiteMembro['permitido']) {
        $tentarEm = max(
            1,
            (int) $limiteIp['tentar_em'],
            (int) $limiteMembro['tentar_em']
        );
        http_response_code(429);
        header('Retry-After: ' . $tentarEm);
        $mensagemErro = 'Foram feitas demasiadas tentativas. Tenta novamente mais tarde.';
    } elseif (!$tokenValido || !$membro || $membroId === false) {
        http_response_code(400);
        $mensagemErro = 'Esta ligação é inválida, expirou ou já foi utilizada.';
    } elseif ((string) ($_POST['confirmar_eliminacao'] ?? '') !== '1') {
        http_response_code(400);
        $mensagemErro = 'Confirma que compreendes que a eliminação é definitiva.';
    } else {
        $email = (string) $membro['email'];
        $primeiroNome = (string) $membro['primeiro_nome'];

        try {
            $eliminado = $cms->getMember()->delete((string) $membroId);

            if (!$eliminado) {
                throw new RuntimeException('A conta não foi encontrada durante a eliminação.');
            }

            if (hash_equals((string) $session->id, (string) $membroId)) {
                $cookie->delete();
                $session->delete();
            }

            try {
                $nomeSeguro = htmlspecialchars($primeiroNome, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $corpo = '<p>Olá ' . $nomeSeguro . ',</p>' .
                    '<p>A tua conta Margot e os dados associados foram eliminados definitivamente.</p>' .
                    '<p>Obrigado pelo tempo que passaste connosco.</p>';
                $mail = new Email($email_config);
                $mail->sendEmail(
                    (string) $email_config['admin_email'],
                    $email,
                    'A tua conta Margot foi eliminada',
                    $corpo
                );
            } catch (Throwable $erroEmail) {
                error_log('[delete-account] Conta eliminada, mas o email final falhou: ' . $erroEmail->getMessage());
            }

            $token = '';
            $tokenValido = false;
            $membro = false;
        } catch (Throwable $erro) {
            http_response_code(500);
            $eliminado = false;
            $mensagemErro = 'Não foi possível eliminar a conta. Tenta novamente.';
            error_log('[delete-account] Falha ao eliminar conta: ' . $erro->getMessage());
        }
    }
}

echo $twig->render('delete-account.html', [
    'token' => $token,
    'token_valido' => $tokenValido,
    'eliminado' => $eliminado,
    'mensagem_erro' => $mensagemErro,
    'membro' => $membro
]);