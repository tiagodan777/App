<?php
require_login($session);

$id = $session->id;
if (!$id) {
    redirect(DOC_ROOT . 'index/', ['failure' => 'Membro não encontrado']);
}

$membro = $cms->getMember()->getFull($id);

if ($_SERVER['REQUEST_METHOD']  == 'POST') {
    $email = $membro['email'];

    $token = $cms->getToken()->create($id, 'delete_account');
    $subject = 'Apagaste definitivamente a sua conta na Margot';
    $body = 'É uma pena ver-te a deixar a nossa plataforma. Obrigado pelo tempo que aqui passas-te';
    $mail = new \TiagoDaniel\Email\Email($email_config);
    $mail->sendEmail($email_config['admin_email'], $email, $subject, $body);

    $delete = $cms->getMember()->delete($membro['id']);


    if ($delete) {
        $cms->getSession()->delete();
        $cms->getCookie()->delete();
        redirect(DOC_ROOT . 'index');
    } else {
        redirect(DOC_ROOT . 'profile/', ['message' => 'Não foi possível apagar a tua conta. Tenta mais tarde']);
    }
}

$data['membro'] = $membro;

echo $twig->render('delete-account.html', $data);
?>
