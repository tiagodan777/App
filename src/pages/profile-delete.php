<?php
require_login($session);

$id = $session->id;
$input_message = $_POST['message'] ?? '';
$sent = false;

if (!$id) {
    redirect('index', ['failure' => 'Membro não encontrado']);
}

$membro = $cms->getMember()->get($id);

if ($_SERVER['REQUEST_METHOD']  == 'POST') {
    $email = $membro['email'];

    $token = $cms->getToken()->create($id, 'delete_account');
    $link = DOMAIN . 'delete-account/?token=' . $token;
    $subject = 'Desejas mesmo deixar a Margot?';
    $body = 'É uma pena ver-te a deixar a nossa plataforma. Se pretenderes seguir com a tua decisão, clica no link <a href="' . $link . '">' . $link . '</a> para que a tua conta e todos os teus dados sejam apagados.';
    $message = 'Foi-te enviado um email para confirmares a remoção da tua conta';
    $mail = new \TiagoDaniel\Email\Email($email_config);
    $sent = $mail->sendEmail($email_config['admin_email'], $email, $subject, $body);
}

$data['membro'] = $membro;
$data['message'] = $input_message;
$data['sent'] = $sent;

echo $twig->render('profile-delete.html', $data);
?>
