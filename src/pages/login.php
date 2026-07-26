<?php

$utilizador = '';
$mensagemErro = '';
$sucesso = $_GET['sucesso'] ?? '';
$logged_in = $_SESSION['id'] ?? 0;

if ($logged_in != 0) {
    redirect(DOC_ROOT . 'index');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $utilizador = trim((string) ($_POST['utilizador'] ?? ''));
    $password = (string) ($_POST['palavra_passe'] ?? '');
    $lembrar = isset($_POST['manter_sessao']);

    if ($utilizador === '' || $password === '') {
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

            $tokenLogin = $cms->getToken()->create(
                $membro['id'],
                'login'
            );

            redirect(
                DOC_ROOT .
                'index/?loginToken=' .
                urlencode((string) $tokenLogin)
            );
        } else {
            $mensagemErro = 'O email, número de telefone ou palavra-passe não está correto.';
        }
    }
}

$data['utilizador'] = $utilizador;
$data['mensagem_erro'] = $mensagemErro;
$data['sucesso'] = $sucesso;

echo $twig->render('login.html', $data);