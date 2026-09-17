<?php
(function () {
    $db = new TestDatabase();
    $member = new App\CMS\Member($db);
    $push = new App\CMS\PushNotification($db);
    $messages = new App\CMS\Message($db);
    $safety = new App\CMS\Safety($db);
    $ids = [];
    foreach (['sender', 'recipient', 'other'] as $name) {
        $ids[] = $member->create(['primeiro_nome' => $name, 'ultimo_nome' => 'Teste', 'nascimento' => '1990-01-01',
            'genero' => 'M', 'email' => $name . '@example.test', 'telefone' => '', 'password' => 'Senha1234',
            'sobre_ti' => '', 'nome_seo' => $name]);
    }
    [$sender, $recipient, $other] = $ids;
    $ios = '11111111-1111-4111-8111-111111111111';
    $android = '22222222-2222-4222-8222-222222222222';
    $session = str_repeat('a', 64);
    $apns = str_repeat('b', 64);
    $fcm = str_repeat('FCM-test:', 12);
    same(0, $push->enqueueNearbyPeople($recipient, 7), 'Sem dispositivo não enfileira');
    $push->registerDevice($recipient, 'ios', strtoupper($apns), $ios, $session, 'sandbox');
    $push->registerDevice($recipient, 'android', $fcm, $android, $session);
    $push->registerDevice($recipient, 'ios', $apns, $ios, $session, 'sandbox');
    same(2, (int) $db->query('SELECT COUNT(*) FROM push_dispositivos')->fetchColumn(), 'Registo idempotente iOS/Android');
    same($apns, $db->query("SELECT token FROM push_dispositivos WHERE plataforma='ios'")->fetchColumn(), 'APNs normalizado');
    foreach ([['web', $apns, $ios, $session], ['ios', 'invalid', $ios, $session],
        ['android', 'short', $android, $session], ['ios', $apns, '../', $session], ['ios', $apns, $ios, 'invalid']] as $bad) {
        try { $push->registerDevice($recipient, ...$bad); check(false, 'Registo inválido deveria falhar'); }
        catch (InvalidArgumentException) { check(true, 'Registo inválido recusado'); }
    }
    $message = $messages->send($sender, $recipient, 'Olá no iPhone e Android', []);
    same(2, $push->enqueueMessage($sender, $recipient, $message), 'Mensagem gera um push por dispositivo');
    same(0, $push->enqueueMessage($sender, $recipient, $message), 'Evento não duplica fila');
    $first = $push->nextJob();
    same('ios', $first['plataforma'], 'Primeiro job iOS');
    same(1, $first['tentativas'], 'Reserva incrementa tentativa');
    same('/messages/' . $sender, $first['url'], 'Push aponta para conversa');
    check($push->isDeliverable($first), 'Mensagem nova entregável');
    $push->markSent($first['id'], $first['dispositivo_id'], 'production');
    same('production', $db->query("SELECT ambiente FROM push_dispositivos WHERE plataforma='ios'")->fetchColumn(), 'Ambiente APNs corrigido após sucesso');
    $second = $push->nextJob();
    same('android', $second['plataforma'], 'Segundo job Android');
    $push->markFailed($second['id'], $second['dispositivo_id'], 'fcm_503_UNAVAILABLE', false);
    same('queued', $db->runSQL('SELECT estado FROM push_fila WHERE id=:id', ['id'=>$second['id']])->fetchColumn(), 'Erro temporário volta à fila');
    same(null, $push->nextJob(), 'Backoff impede repetição imediata');
    $db->exec("UPDATE push_fila SET proxima_tentativa_em='2000-01-01' WHERE estado='queued'");
    $second = $push->nextJob();
    same(2, $second['tentativas'], 'Segunda tentativa');
    $push->markFailed($second['id'], $second['dispositivo_id'], 'fcm_404_UNREGISTERED', true);
    same(0, (int) $db->query("SELECT ativo FROM push_dispositivos WHERE plataforma='android'")->fetchColumn(), 'Token inválido desativado');
    $messages->markRead($recipient, $sender);
    same(false, $push->isDeliverable($first), 'Mensagem lida não envia push pendente');
    $db->runSQL('INSERT INTO notificacao (emissor_id,destinatario_id) VALUES (:a,:b)', ['a'=>$sender,'b'=>$recipient]);
    $hey = (int) $db->lastInsertId();
    same(1, $push->enqueueHey($sender, $recipient, $hey), 'Hey ignora dispositivo desativado');
    $job = $push->nextJob();
    check($push->isDeliverable($job), 'Hey não lido entregável');
    $safety->block($recipient, $sender);
    same(false, $push->isDeliverable($job), 'Bloqueio cancela envio');
    $safety->unblock($recipient, $sender);
    (new App\CMS\Notification($db))->hide($recipient, 'recebido', $hey);
    same(false, $push->isDeliverable($job), 'Hey ocultado não envia push');
    $push->markCancelled($job['id'], 'already_read');
    $push->enqueueNearbyPeople($recipient, 7);
    $nearby = $push->nextJob();
    same(false, $push->isDeliverable($nearby), 'Proximidade sem estado background não entrega');
    $db->runSQL('INSERT INTO estado_app_membro (membro_id,em_background,alerta_proximidade_ativo,total_proximidade) VALUES (:id,1,1,7)', ['id'=>$recipient]);
    check($push->isDeliverable($nearby), 'Proximidade em background entrega');
    $db->exec('UPDATE estado_app_membro SET em_background=0');
    same(false, $push->isDeliverable($nearby), 'Abrir app cancela alerta');
    $push->markCancelled($nearby['id'], 'app_foreground');
    $push->enqueueNearbyPeople($recipient, 8);
    $push->unregisterSession($recipient, $session);
    same(null, $push->nextJob(), 'Logout impede novos envios');
    same(0, (int) $db->query("SELECT COUNT(*) FROM push_fila WHERE estado IN ('queued','processing')")->fetchColumn(), 'Logout cancela fila');
    $push->registerDevice($recipient, 'ios', str_repeat('c',64), $ios, $session);
    same(2, (int) $db->query('SELECT COUNT(*) FROM push_dispositivos')->fetchColumn(), 'Rotação mantém instalação');
    $push->enqueueNearbyPeople($recipient, 7);
    $push->registerDevice($other, 'ios', str_repeat('c',64), $ios, str_repeat('d',64));
    same(null, $push->nextJob(), 'Trocar conta nunca recebe push da conta anterior');
    same(1, $push->enqueueNearbyPeople($other, 7), 'Nova conta recebe na mesma instalação');
    $job = $push->nextJob();
    $db->exec("UPDATE push_fila SET bloqueado_em='2000-01-01' WHERE estado='processing'");
    same(1, $push->recoverStalledJobs(), 'Worker recupera job interrompido');
    $job = $push->nextJob();
    $db->runSQL('UPDATE push_fila SET tentativas=5 WHERE id=:id', ['id'=>$job['id']]);
    $push->markFailed($job['id'], $job['dispositivo_id'], 'network', false);
    same('failed', $db->runSQL('SELECT estado FROM push_fila WHERE id=:id', ['id'=>$job['id']])->fetchColumn(), 'Limite de tentativas');
    $push->unregisterDevice($other, $ios);
    same(0, $push->enqueueNearbyPeople($other, 7), 'Desativar notificações impede fila nova');
})();
