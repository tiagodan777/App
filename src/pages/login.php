<?php
declare(strict_types=1);

$utilizador = '';
$mensagemErro = '';
$emailPendente = false;
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
        $limiteIp = consumirLimiteRequisicoes(
            'login-ip',
            chaveLimiteRequisicoes(enderecoCliente()),
            30,
            15 * 60
        );

        $limiteConta = consumirLimiteRequisicoes(
            'login-conta',
            chaveLimiteRequisicoes($utilizador),
            10,
            15 * 60
        );

        if (!$limiteIp['permitido'] || !$limiteConta['permitido']) {
            $tentarEm = max(
                (int) $limiteIp['tentar_em'],
                (int) $limiteConta['tentar_em']
            );

            $minutos = minutosParaTentarNovamente($tentarEm);

            http_response_code(429);
            header('Retry-After: ' . max(1, $tentarEm));

            $mensagemErro = $minutos === 1
                ? 'Fizeste demasiadas tentativas. Tenta novamente dentro de 1 minuto.'
                : 'Fizeste demasiadas tentativas. Tenta novamente dentro de ' . $minutos . ' minutos.';
        } else {
            $membro = $cms->getMember()->login(
                $utilizador,
                $password
            );

            if ($membro) {
                $estadoVerificacao = $db->runSQL(
                    'SELECT email_verificado_em
                     FROM membros
                     WHERE id = :id
                     LIMIT 1',
                    ['id' => (string) $membro['id']]
                )->fetch();

                if (
                    !$estadoVerificacao ||
                    empty($estadoVerificacao['email_verificado_em'])
                ) {
                    http_response_code(403);
                    $emailPendente = true;
                    $mensagemErro = 'Confirma o teu email antes de entrares.';
                } elseif (
                    $session->create(
                        membro_id: (string) $membro['id']
                    )
                ) {
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
    'sucesso' => $sucesso
]);