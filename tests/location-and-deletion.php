<?php
(function () {
    $db = new TestDatabase();
    $member = new App\CMS\Member($db);
    $location = new App\CMS\Location($db);
    $push = new App\CMS\PushNotification($db);
    $nearby = new App\CMS\NearbyPresenceNotification($db, $push);
    $ids = [];
    for ($i=0; $i<9; $i++) {
        $ids[] = $member->create(['primeiro_nome'=>'Pessoa', 'ultimo_nome'=>(string)$i, 'nascimento'=>'1990-01-01',
            'genero'=>'F', 'email'=>"location$i@example.test", 'telefone'=>'', 'password'=>'Senha1234',
            'sobre_ti'=>'', 'nome_seo'=>"pessoa-$i"]);
    }
    $a = $ids[0]; $b = $ids[1]; $c = $ids[2];
    $installation = '33333333-3333-4333-8333-333333333333';
    $push->registerDevice($a, 'ios', str_repeat('a',64), $installation, str_repeat('b',64));
    foreach ($ids as $i=>$id) { $location->saveBackground($id, 38.0+$i*0.00001, -9.0, 15, true, true); }
    same(['latitude'=>38.0,'longitude'=>-9.0], $nearby->locationSnapshot($a), 'Posição guardada');
    $nearby->syncAppState($a, false);
    $nearby->evaluateMember($a);
    same(null, $push->nextJob(), 'Foreground não gera alerta de proximidade');
    $nearby->syncAppState($a, true);
    $nearby->evaluateMember($a);
    $job = $push->nextJob();
    same('nearby', $job['tipo'], 'Background com vizinhos gera alerta');
    same('8', $job['dados']['nearby_count'], 'Contagem exclui próprio');
    $push->markSent($job['id'], $job['dispositivo_id']);
    $nearby->evaluateMember($a);
    same(null, $push->nextJob(), 'Não repete alerta a cada posição');
    $nearby->syncAppState($a, false);
    $nearby->syncAppState($a, true);
    $nearby->evaluateMember($a);
    same(null, $push->nextJob(), 'Cooldown persiste ao fechar e reabrir');
    $location->saveBackground($b, 38, -9, 10, true, false);
    same(null, $nearby->locationSnapshot($b), 'Invisibilidade remove coordenadas');
    (new App\CMS\Safety($db))->block($a, $c);
    $nearby->evaluateMember($a);
    same(6, (int)$db->query('SELECT total_proximidade FROM estado_app_membro')->fetchColumn(), 'Invisíveis e bloqueados fora da contagem');
    $db->runSQL("UPDATE localizacao_membro SET atualizada_em='2000-01-01' WHERE membro_id=:id", ['id'=>$ids[3]]);
    $nearby->evaluateMember($a);
    same(5, (int)$db->query('SELECT total_proximidade FROM estado_app_membro')->fetchColumn(), 'Posição expirada fora da contagem');
    $location->disable($a);
    $nearby->evaluateMember($a);
    same(0, (int)$db->query('SELECT total_proximidade FROM estado_app_membro')->fetchColumn(), 'Desligar localização remove presença');
    foreach ([[91,0], [0,181], [null,0]] as [$lat,$lon]) {
        try { $location->saveBackground($a,$lat,$lon,1,true,true); check(false,'Coordenada inválida'); }
        catch (InvalidArgumentException) { check(true,'Coordenada inválida recusada'); }
    }
    $location->saveBackground($a, null, null, null, false, false);
    same(null, $nearby->locationSnapshot($a), 'Desativação aceita coordenadas ausentes');

    // Eliminar todas as referências, incluindo tabelas antigas sem foreign keys.
    $member->recordLegalAcceptance($a);
    (new App\CMS\Token($db))->create($a,'background_location');
    (new App\CMS\MemberConnection($db))->connect($a,$b);
    (new App\CMS\TodayStatus($db))->save($a,'Teste',[]);
    $messages = new App\CMS\Message($db);
    $message = $messages->send($a,$b,'Apagar esta conversa',[]);
    $messages->react($message,$b,'❤️',false);
    $messages->hideConversation($b,$a);
    $deletedMessage = $messages->send($b,$a,'Já apagada',[]);
    $messages->deleteSent($deletedMessage,$b,$a);
    $db->runSQL('INSERT INTO localizacoes (membro_id,latitude,longitude) VALUES (:id,38,-9)', ['id'=>$a]);
    $db->runSQL("INSERT INTO mensagens (pessoa_enviou,pessoa_recebeu,texto) VALUES (:a,:b,'Legada')", ['a'=>$a,'b'=>$b]);
    $unrelatedMessage = $messages->send($b,$c,'Preservar',[]);
    check($member->delete($a), 'Eliminar conta');
    same(false,$member->exists($a),'Conta removida');
    foreach (['aceitacoes_legais','token','localizacao_membro','localizacoes','membros_gostos','fotos_perfil',
        'membro_hoje','estado_app_membro','push_dispositivos','push_fila'] as $table) {
        same(0,(int)$db->runSQL("SELECT COUNT(*) FROM $table WHERE membro_id=:id", ['id'=>$a])->fetchColumn(), 'Eliminar referências em '.$table);
    }
    foreach (['ligacoes_membros','mensagens_reacoes','mensagens_conversas_ocultas','mensagens_apagadas','mensagens','bloqueados'] as $table) {
        same(0,(int)$db->query("SELECT COUNT(*) FROM $table")->fetchColumn(),'Sem órfãos em '.$table);
    }
    same('Preservar',$messages->get($unrelatedMessage,$b)['texto'],'Conversa alheia preservada');
    same(false,$member->delete($a),'Eliminar conta inexistente devolve false');
})();
