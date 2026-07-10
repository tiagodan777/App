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
    $lembrar = isset($_POST['manter_sessao']) && $_POST['manter_sessao'] == 1 ? true : false;
    /*$errors['user'] = Validate::isEmail($user) ? '' : 'Por favor introduz um email/nº de telefone correto';*/
    $erros['palavra_passe'] = Validate::isPassword($passowrd) ? '' : 'Por favor introduz uma password válida';

    $invalid = implode($erros);

    var_dump($erros);
    if (!$invalid) {
        $membro = $cms->getMember()->login($utilizador, $passowrd);
       if ($membro) {

        echo "<pre>";
        echo "LOGIN OK\n";
        var_dump($membro);

        echo "\nANTES DA SESSION\n";
        var_dump($_SESSION);

        if ($lembrar) {
            echo "\nVAI CRIAR COOKIE\n";
            $token = $cms->getCookie()->create($membro);
            $cms->getSession()->create($token);
            $tokenLogin = $cms->getToken()->create($membro['id'], 'login');
        } else {
            echo "\nVAI CRIAR SESSION\n";
            $cms->getSession()->create(membro_id: $membro['id']);

            echo "\nSESSION DEPOIS:\n";
            var_dump($_SESSION);

            $tokenLogin = $cms->getToken()->create($membro['id'], 'login');
        }

        echo "\nTOKEN LOGIN:\n";
        var_dump($tokenLogin);

        die();
        } else {
            $erros['message'] = 'Por favor tenta novamente';
            
        }
    }
}

$data['utilizador'] = $utilizador;
$data['erros'] = $erros;
$data['sucesso'] = $sucesso;

echo $twig->render('login.html', $data);

