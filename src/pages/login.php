<?php

declare(strict_types=1);

$utilizador = '';
$mensagemErro = '';
$sucesso = (string) ($_GET['sucesso'] ?? '');

if ($session->id !== '') {
    redirect(DOC_ROOT . 'index/');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $utilizador = trim((string) ($_POST['utilizador'] ?? ''));
    $password = (string) ($_POST['palavra_passe'] ?? '');
    $lembrar = isset($_POST['manter_sessao']);

    if ($utilizador === '' || $password === '') {
        $mensagemErro = 'Preenche o email ou telefone e a palavra-passe.';
    } else {
        $membro = $cms->getMember()->login($utilizador, $password);

        if ($membro && $session->create(membro_id: (string) $membro['id'])) {
            if ($lembrar) {
                $cookie->create($membro);
            } else {
                $cookie->delete();
            }

            redirect(DOC_ROOT . 'index/');
        }

        $mensagemErro = 'O email, número de telefone ou palavra-passe não está correto.';
    }
}

echo $twig->render('login.html', [
    'utilizador' => $utilizador,
    'mensagem_erro' => $mensagemErro,
    'sucesso' => $sucesso
]);