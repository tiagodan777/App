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
    $passowrd = $_POST['palavra_passe'];
    $remember = (isset($_POST['lembrar']) && $_POST['lembrar'] == 1) ? true : false;
    /*$errors['user'] = Validate::isEmail($user) ? '' : 'Por favor introduz um email/nº de telefone correto';*/
    $erros['palavra_passe'] = Validate::isPassword($passowrd) ? '' : 'Por favor introduz uma password válida';

    $invalid = implode($erros);
    if (!$invalid) {
        $member = $cms->getMember()->login($utilizador, $passowrd);
        if ($member && $member['role'] == 'suspended') {
            $erros['message'] = 'Conta suspensa';
        } elseif ($member) {
            if ($remember) {
                $token = $cms->getCookie()->create($member);
                $cms->getSession()->create($token);
                $tokenLogin = $cms->getToken()->create($member['id'], 'login');
            } else {
                $cms->getSession()->create(member_id: $member['id']);
                $tokenLogin = $cms->getToken()->create($member['id'], 'login');
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

