<?php
declare(strict_types=1);

$utilizador = '';
$mensagemErro = '';
$emailPendente = false;
$sucesso = (string) ($_GET['sucesso'] ?? '');
if ($session->id !== '') {
    redirect(DOC_ROOT . 'index/');
}
use App\CMS\EmailVerification;
use App\CMS\Locale;
use App\Email\Email;

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Referrer-Policy: no-referrer');
$english = Locale::current() !== 'pt';
$text = static fn(string $pt, string $en): string => $english ? $en : $pt;
$correctionError = '';
$pendingMember = false;
$pending = $_SESSION['pending_registration'] ?? [];
$pendingId = is_array($pending) && (int) ($pending['expires'] ?? 0) > time()
    ? (string) ($pending['id'] ?? '') : '';
if ($pendingId !== '') {
    $pendingMember = $db->runSQL(
        'SELECT id, email FROM membros WHERE id = :id AND email_verificado_em IS NULL LIMIT 1',
        ['id' => $pendingId]
    )->fetch();
}
if (!$pendingMember) unset($_SESSION['pending_registration']);
$correcting = $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'correct-email';
$newEmail = '';
if ($correcting) {
    require_csrf_token();
    $sucesso = 'email-pendente';
    $newEmail = is_string($_POST['email'] ?? null) ? trim($_POST['email']) : '';
    $expectedEmail = is_string($_POST['current_email'] ?? null) ? $_POST['current_email'] : '';
    if (!$pendingMember) {
        http_response_code(403);
        $correctionError = $text(
            'Esta sessão de registo terminou ou a conta já foi confirmada. Entra com os teus dados para continuar.',
            'This registration session has expired or the account is already confirmed. Sign in to continue.'
        );
    } elseif (strlen($newEmail) > 64 || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        $correctionError = $text('Introduz um email válido, com até 64 caracteres.', 'Enter a valid email, up to 64 characters.');
    } else {
        $limitIp = consumirLimiteRequisicoes('verification-correct-ip', chaveLimiteRequisicoes(enderecoCliente()), 20, 3600);
        $limitAccount = consumirLimiteRequisicoes('verification-correct-account', chaveLimiteRequisicoes($pendingId), 5, 3600);
        if (!$limitIp['permitido'] || !$limitAccount['permitido']) {
            http_response_code(429);
            header('Retry-After: ' . max(1, (int) $limitIp['tentar_em'], (int) $limitAccount['tentar_em']));
            $correctionError = $text('Fizeste demasiados pedidos. Tenta novamente mais tarde.', 'Too many requests. Try again later.');
        } else {
            try {
                $verification = new EmailVerification($db);
                $request = $verification->correctPendingEmail($pendingId, $expectedEmail, $newEmail);
                if ($request === false) {
                    unset($_SESSION['pending_registration']);
                    redirect(DOC_ROOT . 'login');
                }
                $pendingMember['email'] = $request['email'];
                $link = rtrim((string) DOMAIN, '/') . '/verify-email/?token=' . rawurlencode($request['token']);
                $safeLink = htmlspecialchars($link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $name = htmlspecialchars($request['primeiro_nome'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $body = '<p>Olá ' . $name . ',</p>'
                    . '<p>Confirma o teu email para utilizares a Margot.</p>'
                    . '<p><a href="' . $safeLink . '">Confirmar o meu email</a></p>'
                    . '<p>Esta ligação é válida durante 24 horas e só pode ser utilizada uma vez.</p>'
                    . '<p>Se não criaste uma conta na Margot, ignora este email.</p>';
                $sent = false;
                try {
                    $sent = (new Email($email_config))->sendEmail(
                        (string) $email_config['admin_email'], $request['email'], 'Confirma o teu email na Margot', $body
                    );
                } catch (Throwable $error) {
                    error_log('[correct-email-send] ' . $error->getMessage());
                }
                // Keep the new address even if SMTP fails: the user can request a new email.
                redirect(DOC_ROOT . 'login', ['sucesso' => $sent ? 'confirma-email' : 'email-pendente'], 303);
            } catch (DomainException $error) {
                http_response_code(409);
                $correctionError = $error->getMessage() === 'stale_email'
                    ? $text('O endereço já foi alterado. Atualiza a página antes de tentar novamente.', 'The address has already changed. Refresh the page before trying again.')
                    : $text('Este email já está a ser usado. Usa outro ou entra na conta existente.', 'This email is already in use. Choose another or sign in to the existing account.');
            } catch (Throwable $error) {
                http_response_code(500);
                $correctionError = $text('Não foi possível alterar o email. Tenta novamente.', 'Could not change your email. Try again.');
                error_log('[correct-email] ' . $error->getMessage());
            }
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$correcting) {
    $utilizador = trim((string) ($_POST['utilizador'] ?? ''));
    $password = (string) ($_POST['palavra_passe'] ?? '');
    $lembrar = isset($_POST['manter_sessao']);
    if ($utilizador === '' || $password === '') {
        $mensagemErro = 'Preenche o email ou telefone e a palavra-passe.';
    } else {
        $limiteIp = consumirLimiteRequisicoes('login-ip', chaveLimiteRequisicoes(enderecoCliente()), 30, 15 * 60);
        $limiteConta = consumirLimiteRequisicoes('login-conta', chaveLimiteRequisicoes($utilizador), 10, 15 * 60);
        if (!$limiteIp['permitido'] || !$limiteConta['permitido']) {
            $tentarEm = max((int) $limiteIp['tentar_em'], (int) $limiteConta['tentar_em']);
            $minutos = minutosParaTentarNovamente($tentarEm);
            http_response_code(429);
            header('Retry-After: ' . max(1, $tentarEm));
            $mensagemErro =
                $minutos === 1
                    ? 'Fizeste demasiadas tentativas. Tenta novamente dentro de 1 minuto.'
                    : 'Fizeste demasiadas tentativas. Tenta novamente dentro de ' . $minutos . ' minutos.';
        } else {
            $membro = $cms->getMember()->login($utilizador, $password);
            if ($membro) {
                if (!$cms->getMember()->emailVerified((string) $membro['id'])) {
                    http_response_code(403);
                    if (session_status() === PHP_SESSION_ACTIVE) session_regenerate_id(true);
                    $_SESSION['pending_registration'] = ['id' => (string) $membro['id'], 'expires' => time() + 86400];
                    $pendingMember = ['id' => (string) $membro['id'], 'email' => (string) $membro['email']];
                    $emailPendente = true;
                    $mensagemErro = 'Confirma o teu email antes de entrares.';
                } elseif ($session->create(membro_id: (string) $membro['id'])) {
                    unset($_SESSION['pending_registration']);
                    if ($lembrar) {
                        $cookie->create($membro);
                    } else {
                        $cookie->delete();
                    }
                    redirect(DOC_ROOT . 'index/');
                } else {
                    $mensagemErro = 'Não foi possível iniciar a sessão. Tenta novamente.';
                }
            } else {
                $mensagemErro = 'O email, número de telefone ou palavra-passe não está correto.';
            }
        }
    }
}
echo $twig->render('login.html', [
    'utilizador' => $utilizador,
    'mensagem_erro' => $mensagemErro,
    'email_pendente' => $emailPendente,
    'sucesso' => $sucesso,
    'confirmation_email' => $pendingMember ? (string) $pendingMember['email'] : '',
    'correction_error' => $correctionError,
    'correction_email' => $newEmail,
    'confirmation_en' => $english
]);