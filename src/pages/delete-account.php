<?php

declare(strict_types=1);

use App\Security\RateLimiter;

require_login($session);

$memberId = (string) $session->id;
$member = $cms->getMember()->get($memberId);
$error = '';

if (!$member) {
    $cms->getCookie()->delete();
    $cms->getSession()->delete();
    redirect(DOC_ROOT . 'login/');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    if (!RateLimiter::allow(
        'delete-account',
        privacy_hash('member:' . $memberId),
        5,
        3600
    )) {
        http_response_code(429);
        $error = 'Foram feitas demasiadas tentativas. Tenta novamente mais tarde.';
    } else {
        $password = (string) ($_POST['password_atual'] ?? '');
        $confirmation = trim((string) ($_POST['confirmacao'] ?? ''));

        if (!$cms->getMember()->verifyPassword($memberId, $password)) {
            $error = 'A palavra-passe não está correta.';
        } elseif ($confirmation !== 'APAGAR') {
            $error = 'Escreve APAGAR para confirmar.';
        } elseif ($cms->getMember()->delete($memberId)) {
            try {
                $cms->getCookie()->delete();
            } catch (Throwable) {
                /*
                 * A conta e os tokens já foram eliminados em cascata. Uma
                 * falha de limpeza local não pode transformar o resultado em
                 * “conta não apagada”.
                 */
                error_log('[delete-account] A conta foi apagada; falhou a limpeza adicional do cookie.');
            }

            $cms->getSession()->delete();
            redirect(DOC_ROOT . 'login/', ['sucesso' => 'conta_eliminada'], 303);
        } else {
            $error = 'Não foi possível apagar a conta. Tenta novamente.';
        }
    }
}

echo $twig->render('delete-account.html', [
    'membro' => $member,
    'error' => $error
]);
