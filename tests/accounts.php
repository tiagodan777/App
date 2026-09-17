<?php
// Serviços reais, contas fictícias e base descartável; não envia emails.
(function () {
    $db = new TestDatabase();
    $member = new App\CMS\Member($db);
    $tokens = new App\CMS\Token($db);
    $verification = new App\CMS\EmailVerification($db);
    $recovery = new App\CMS\PasswordRecovery($db);
    $input = ['primeiro_nome' => ' Ana ', 'ultimo_nome' => 'Teste', 'dia' => '15', 'mes' => '5',
        'ano' => '1990', 'genero' => 'P', 'email' => ' ANA@example.test ', 'telefone' => '',
        'password' => 'Senha1234', 'confirma_password' => 'Senha1234', 'sobre_ti' => 'Olá',
        'gostos' => ['Café', 'Café', ' Música '], 'aceitou_termos' => '1', 'aceitou_privacidade' => '1'];
    $sections = ['nome', 'nascimento', 'sexo', 'gostos', 'contactos', 'descricao', 'palavra-passe'];
    $form = $member->prepareAccountForm($input, $sections, true);
    same([], $form['errors'], 'Criar conta com género Personalizado compatível com SQL');
    $id = $member->create($form['changes']);
    check(is_string($id), 'Criar conta devolve UUID');
    $member->recordLegalAcceptance($id);
    same(2, (int) $db->query('SELECT COUNT(*) FROM aceitacoes_legais')->fetchColumn(), 'Consentimentos guardados');
    same('ana@example.test', $member->get($id)['email'], 'Email normalizado');
    same(null, $member->get($id)['telefone'], 'Telefone vazio guardado como NULL');
    same(2, count($member->get($id)['gostos']), 'Gostos sem duplicações');
    $hash = $db->query('SELECT password FROM membros')->fetchColumn();
    check($hash !== $input['password'] && password_verify($input['password'], $hash), 'Password protegida');
    same(false, $member->emailVerified($id), 'Conta nova por confirmar');
    $request = $verification->createRequest('ANA@example.test');
    same($id, $request['membro_id'], 'Pedido de confirmação identifica conta');
    check($verification->verify($request['token']), 'Confirmar email');
    check($member->emailVerified($id), 'Confirmação persistida');
    same(false, $verification->verify($request['token']), 'Link de confirmação só uma vez');
    same(false, $verification->createRequest('ana@example.test'), 'Não reemitir para email já confirmado');
    same($id, $member->login(' ANA@example.test ', 'Senha1234')['id'], 'Login por email');
    same(false, $member->login('ana@example.test', 'errada'), 'Password errada recusada');
    same(false, $member->login('ausente@example.test', 'Senha1234'), 'Conta inexistente recusada');
    check($member->update($id, ['telefone' => '+351 912-345-678', 'sobre_ti' => 'Nova bio']), 'Editar contactos e bio');
    same($id, $member->login('+351 (912) 345-678', 'Senha1234')['id'], 'Login por telefone normalizado');
    same('Nova bio', $member->get($id)['bio'], 'Edição persistida');
    $partial = $member->prepareAccountForm(['sobre_ti' => 'Só a bio'], ['descricao'], false);
    same(['sobre_ti' => 'Só a bio'], $partial['changes'], 'Edição parcial não apaga outros campos');
    foreach ([['ano', '2020', 'nascimento'], ['genero', 'X', 'genero'], ['email', 'invalido', 'email'],
        ['telefone', 'abc', 'telefone'], ['password', 'curta', 'password'],
        ['confirma_password', 'diferente', 'confirma_password'], ['aceitou_termos', '0', 'aceitou_termos'],
        ['aceitou_privacidade', '0', 'aceitou_privacidade']] as [$key, $value, $error]) {
        $invalid = $member->prepareAccountForm(array_replace($input, [$key => $value]), $sections, true);
        check(isset($invalid['errors'][$error]), 'Registo recusa ' . $key);
    }
    $other = $form['changes'];
    $other['email'] = 'outra@example.test';
    $otherId = $member->create($other);
    check(is_string($otherId), 'Várias contas sem telefone');
    try {
        $member->create($other);
        check(false, 'Email duplicado deve falhar');
    } catch (PDOException $error) {
        same('23000', $error->getCode(), 'Índice impede email duplicado (código SQLite)');
        same(false, $db->inTransaction(), 'Duplicação faz rollback');
    }
    $old = $recovery->createRequest('ana@example.test');
    $reset = $recovery->createRequest('ana@example.test');
    same(false, $recovery->resetPassword($old['token'], 'NovaSenha1234'), 'Reset anterior revogado');
    same(false, $recovery->resetPassword($reset['token'], 'curta'), 'Reset recusa password fraca');
    $background = $tokens->create($id, 'background_location');
    check($recovery->resetPassword($reset['token'], 'NovaSenha1234'), 'Reset válido');
    same(false, $member->login('ana@example.test', 'Senha1234'), 'Password antiga revogada');
    same($id, $member->login('ana@example.test', 'NovaSenha1234')['id'], 'Nova password funciona');
    same(false, $recovery->resetPassword($reset['token'], 'OutraSenha1234'), 'Reset não reutilizável');
    same(false, $tokens->getMemberId($background, 'background_location'), 'Reset revoga tokens anteriores');
    $expired = $recovery->createRequest('ana@example.test');
    $db->exec("UPDATE token SET validade = '2000-01-01'");
    same(false, $recovery->resetPassword($expired['token'], 'OutraSenha1234'), 'Reset expirado recusado');
    same(false, $recovery->createRequest('ausente@example.test'), 'Não criar token para conta inexistente');
    $session = new App\CMS\Session($db);
    check($session->create(membro_id: $id), 'Criar sessão de adulto');
    same($id, $session->id, 'Sessão identifica conta');
    $db->runSQL('UPDATE membros SET nascimento = :birth WHERE id = :id', ['birth' => '2020-01-01', 'id' => $id]);
    same(false, $session->create(membro_id: $id), 'Sessão recusa menor');
    same(false, $member->login('ana@example.test', 'NovaSenha1234'), 'Login recusa menor');
})();
