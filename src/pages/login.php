<?php

use App\Security\RateLimiter;

$utilizador = '';
$mensagemErro = '';
$sucesso = $_GET['sucesso'] ?? '';
$logged_in = $_SESSION['id'] ?? 0;

if ($logged_in != 0) {
    redirect(DOC_ROOT . 'index');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    $utilizador = trim((string) ($_POST['utilizador'] ?? ''));
    $password = (string) ($_POST['palavra_passe'] ?? '');
    $lembrar = isset($_POST['manter_sessao']);
    $ipKey = privacy_hash(request_ip());
    $identifierKey = privacy_hash(mb_strtolower($utilizador));

    if (
        !RateLimiter::allow('login-ip', $ipKey, 20, 900) ||
        !RateLimiter::allow('login-identifier', $identifierKey, 5, 900)
    ) {
        http_response_code(429);
        header('Retry-After: 900');
        $mensagemErro = 'Foram feitas demasiadas tentativas. Espera 15 minutos e tenta novamente.';
    } elseif ($utilizador === '' || $password === '') {
        $mensagemErro = 'Preenche o email ou telefone e a palavra-passe.';
    } else {
        $membro = $cms->getMember()->login($utilizador, $password);

        if ($membro) {
            if ($lembrar) {
                $token = $cms->getCookie()->create($membro);
                $cms->getSession()->create($token);
            } else {
                $cms->getSession()->create(membro_id: $membro['id']);
            }

            RateLimiter::clear('login-identifier', $identifierKey);
            redirect(DOC_ROOT . 'index/');
        } else {
            $mensagemErro = 'O email, número de telefone ou palavra-passe não está correto.';
        }
    }
}

$data['utilizador'] = $utilizador;
$data['mensagem_erro'] = $mensagemErro;
$data['sucesso'] = $sucesso;
$data['csrf_token'] = csrf_token();

echo $twig->render('login.html', $data);
