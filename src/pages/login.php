<?php
use App\Validate\Validate;

$utilizador = '';
$erros = [];
$sucesso = $_GET['sucesso'] ?? '';

$logged_in = $_SESSION['id'] ?? 0;

if ($logged_in != 0) {
    redirect(DOC_ROOT . 'index');
}

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $utilizador = $_POST['utilizador'];
    $password = $_POST['palavra_passe'];
    $lembrar = isset($_POST['manter_sessao']);
    /*$errors['user'] = Validate::isEmail($user) ? '' : 'Por favor introduz um email/nº de telefone correto';*/
    $erros['palavra_passe'] = Validate::isPassword($password) ? '' : 'Por favor introduz uma password válida';

    $invalid = implode($erros);

    if (!$invalid) {
        $membro = $cms->getMember()->login($utilizador, $password);
        if ($membro) {
            if ($lembrar) {
                $token = $cms->getCookie()->create($membro);
                $cms->getSession()->create($token);
                $tokenLogin = $cms->getToken()->create($membro['id'], 'login');
            } else {
                $cms->getSession()->create(membro_id: $membro['id']);
                $tokenLogin = $cms->getToken()->create($membro['id'], 'login');
            }
            // $cms->getSession()->create($tokenLogin, 'login');

            redirect(DOC_ROOT . 'index/?loginToken=' . $tokenLogin);
        } else {
            $erros['message'] = 'Por favor tenta novamente';
            
        }
    }
}

$data['utilizador'] = $utilizador;
$data['erros'] = $erros;
$data['sucesso'] = $sucesso;

echo $twig->render('login.html', $data);

