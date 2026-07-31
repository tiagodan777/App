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
        /*
         * O limite por IP é relativamente alto porque várias pessoas podem
         * estar na mesma rede Wi-Fi durante um evento.
         */
        $limiteIp = consumirLimiteRequisicoes(
            'login-ip',
            chaveLimiteRequisicoes(enderecoCliente()),
            100,
            15 * 60
        );

        /*
         * O limite por conta impede tentativas repetidas contra o mesmo
         * email ou telefone, mesmo quando vêm de endereços IP diferentes.
         */
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
}

echo $twig->render('login.html', [
    'utilizador' => $utilizador,
    'mensagem_erro' => $mensagemErro,
    'sucesso' => $sucesso
]);