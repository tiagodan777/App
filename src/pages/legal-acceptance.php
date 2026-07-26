<?php

declare(strict_types=1);

require_login($session);

$memberId = (string) $session->id;
$error = '';

if (member_has_current_legal_acceptance($db, $memberId)) {
    redirect(DOC_ROOT . 'index/');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    $birthDate = $db->runSQL(
        'SELECT nascimento FROM membros WHERE id = :id AND estado = :estado LIMIT 1',
        ['id' => $memberId, 'estado' => 'ativo']
    )->fetchColumn();
    $birth = is_string($birthDate)
        ? DateTimeImmutable::createFromFormat('!Y-m-d', $birthDate, new DateTimeZone('UTC'))
        : false;
    $ageLimit = (new DateTimeImmutable('today', new DateTimeZone('UTC')))->modify('-18 years');

    if (!$birth || $birth > $ageLimit || ($_POST['confirmar_18'] ?? '') !== '1') {
        $error = 'Só pessoas com pelo menos 18 anos podem usar a Margot.';
    } elseif (
        ($_POST['aceitar_termos'] ?? '') !== '1' ||
        ($_POST['reconhecer_privacidade'] ?? '') !== '1'
    ) {
        $error = 'Tens de aceitar os Termos e confirmar a leitura da Política de Privacidade.';
    } else {
        $acceptances = [
            'termos' => TERMS_VERSION,
            'privacidade' => PRIVACY_VERSION,
            'maior_18' => AGE_DECLARATION_VERSION
        ];

        $db->beginTransaction();

        try {
            foreach ($acceptances as $document => $version) {
                $db->runSQL(
                    'INSERT INTO aceitacoes_legais (
                        membro_id,
                        documento,
                        versao,
                        documento_hash,
                        aceite_em,
                        origem
                     ) VALUES (
                        :membro_id,
                        :documento,
                        :versao,
                        :documento_hash,
                        UTC_TIMESTAMP(6),
                        :origem
                     )',
                    [
                        'membro_id' => $memberId,
                        'documento' => $document,
                        'versao' => $version,
                        'documento_hash' => legal_document_hash($document),
                        'origem' => 'reaceitacao'
                    ]
                );
            }

            $db->commit();
            redirect(DOC_ROOT . 'index/');
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            error_log('[legal-acceptance] ' . $exception->getMessage());
            $error = 'Não foi possível guardar a confirmação. Tenta novamente.';
        }
    }
}

echo $twig->render('legal/legal-acceptance.html', [
    'error' => $error
]);
