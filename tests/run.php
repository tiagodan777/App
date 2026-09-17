<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('DOC_ROOT', '/');
require APP_ROOT . '/vendor/autoload.php';
require APP_ROOT . '/src/functions.php';
require __DIR__ . '/TestDatabase.php';
$checks = 0;

function check(bool $condition, string $message): void {
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

function same($expected, $actual, string $message): void {
    check($expected === $actual, $message . ': ' . json_encode($actual, JSON_UNESCAPED_UNICODE));
}
$db = new TestDatabase();
$a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
$c = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
foreach ([$a, $b, $c] as $i => $id) {
    $db->runSQL(
        'INSERT INTO membros (id, primeiro_nome, ultimo_nome, nascimento, genero, email, password, nome_seo)
            VALUES (:id, :first, :last, :birth, :gender, :email, :password, :seo)',
        [
            'id' => $id,
            'first' => 'Pessoa ' . $i,
            'last' => 'Teste',
            'birth' => $i === 2 ? '2020-01-01' : '1990-01-01',
            'gender' => 'M',
            'email' => $i . '@example.test',
            'password' => password_hash('Senha1234', PASSWORD_DEFAULT),
            'seo' => 'teste'
        ]
    );
}
$access = new App\CMS\MessageAccess($db);
$messages = new App\CMS\Message($db);
$connections = new App\CMS\MemberConnection($db);
$safety = new App\CMS\Safety($db);
$notifications = new App\CMS\Notification($db);
$profile = new App\CMS\ProfileAccess($db);
$member = new App\CMS\Member($db);
same(false, $access->validId('../etc'), 'UUID inválido');
same(false, $access->context($a, $a), 'Não conversar consigo próprio');
same(false, $access->context($a, $c), 'Menor sem acesso a conversa');
same(false, $access->context($a, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'Membro inexistente');
same(false, $profile->canView($a, $b), 'Perfil sem relação não visível');
same(false, $connections->areConnected($a, $b), 'Sem ligação inicial');
check($connections->connect($b, $a), 'Criar ligação na ordem inversa');
check($connections->areConnected($a, $b), 'Par de ligação normalizado');
check($access->context($a, $b)['ligados'], 'Contexto reconhece ligação');
check($profile->canView($a, $b), 'Ligação permite perfil');
same(1, count($messages->conversations($a)), 'Ligação aparece sem mensagens');
same('Ligados na Margot', $messages->conversations($a)[0]['resumo'], 'Resumo sem mensagens');
$id1 = $messages->send($a, $b, 'Olá', []);
$id2 = $messages->send($a, $b, 'Tudo bem?', []);
same(2, $messages->unreadCount($b), 'Contador de mensagens');
same(2, $access->sentBeforeReply($a, $b), 'Limite de mensagens antes de resposta');
same(false, $access->hasReply($a, $b), 'Sem resposta inicial');
$history = $messages->history($b, $a);
same([$id1, $id2], array_column($history, 'id'), 'Histórico em ordem');
same('Olá', $messages->get($id1, $b)['texto'], 'Mensagem recuperada');
same(false, $messages->get($id1, $c), 'Terceiro não pode obter mensagem');
same(false, $messages->belongsToConversation($id1, $a, $c), 'Reação noutra conversa recusada');
$reactions = $messages->react($id1, $b, '❤️', false);
same(1, count($reactions), 'Adicionar reação');
same(1, count($messages->history($a, $b)[0]['reactions']), 'Reações no histórico');
same([], $messages->react($id1, $b, '❤️', true), 'Alternar retira reação');
$messages->markRead($b, $a);
same(0, $messages->unreadCount($b), 'Marcar como lidas');
$id3 = $messages->send($b, $a, 'Sim', []);
check($access->hasReply($a, $b), 'Resposta desbloqueia conversa');
same($id3, $messages->hideConversation($a, $b), 'Corte da conversa');
same([], $messages->history($a, $b), 'Conversa oculta para quem apagou');
same(3, count($messages->history($b, $a)), 'Histórico da outra pessoa preservado');
$id4 = $messages->send($b, $a, 'Nova mensagem', []);
same([$id4], array_column($messages->history($a, $b), 'id'), 'Mensagem nova reaparece');
same(1, $messages->unreadCount($a), 'Contador respeita conversa oculta');
try {
    $messages->deleteSent($id4, $a, $b);
    check(false, 'Apagar mensagem alheia');
} catch (InvalidArgumentException) {
    check(true, 'Autoria da eliminação');
}
check((bool) $messages->deleteSent($id4, $b, $a), 'Autor elimina mensagem');
same(false, $messages->get($id4, $a), 'Mensagem eliminada');
same(
    1,
    (int) $db->runSQL('SELECT COUNT(*) FROM mensagens_apagadas WHERE mensagem_id = :id', ['id' => $id4])->fetchColumn(),
    'Registo para evento WebSocket'
);
check($safety->block($a, $b), 'Bloquear');
same(false, $safety->block($a, $b), 'Bloqueio idempotente');
same(false, $access->context($b, $a), 'Bloqueio impede acesso nas duas direções');
same(false, $profile->canView($b, $a), 'Bloqueio impede perfil');
same([], $messages->conversations($b), 'Bloqueio oculta conversa');
same(0, $messages->unreadCount($a), 'Contador ignora bloqueados');
same($b, $safety->blockedUsers($a)[0]['id'], 'Lista de bloqueados');
$safety->unblock($a, $b);
check($access->context($a, $b) !== false, 'Desbloquear');
$safety->report($a, $b, 'spam', 'Teste');
same(1, (int) $db->runSQL('SELECT COUNT(*) FROM denuncias')->fetchColumn(), 'Denúncia guardada');
$db->runSQL("INSERT INTO notificacao (emissor_id, destinatario_id, tipo) VALUES (:a, :b, 'hey')", [
    'a' => $a,
    'b' => $b
]);
$heyId = (int) $db->lastInsertId();
same(1, $notifications->unreadCount($b), 'Hey não lido');
same('recebido', $notifications->list($b)[0]['direcao'], 'Direção do Hey');
$notifications->hide($b, 'recebido', $heyId);
same([], $notifications->list($b), 'Hey oculto para destinatário');
same(1, count($notifications->list($a)), 'Hey continua no emissor');
same(0, $notifications->unreadCount($b), 'Ocultar Hey marca como lido');
$notifications->hide($a, 'enviado');
same([], $notifications->list($a), 'Ocultar todos');
$today = new App\CMS\TodayStatus($db);
same(null, $today->get($a), 'Sem estado inicial');
$status = $today->save($a, 'Café?', [['type' => 'shirt', 'color' => 'blue']]);
same('Café?', $status['note'], 'Guardar estado');
same('blue', $status['clothes'][0]['color'], 'Roupa preservada');
$status = $today->save($a, 'Passeio', []);
same([], $status['clothes'], 'Atualizar estado');
$db->runSQL('UPDATE membro_hoje SET expira_em = :date WHERE membro_id = :id', ['date' => '2000-01-01', 'id' => $a]);
same(null, $today->get($a), 'Estado expirado não aparece');
same(null, $today->save($a, '', []), 'Estado vazio remove registo');
same('abc', $today->normaliseNote(' abcdef ', 3), 'Limite de nota');
same([], $today->normaliseClothes([['type' => 'invalid']]), 'Roupa inválida');
same(1, count($today->normaliseClothes([['type' => 'shirt'], ['type' => 'shirt']])), 'Roupa sem tipos repetidos');
$tokens = new App\CMS\Token($db);
$raw = $tokens->create($a, 'websocket');
same($a, $tokens->getMemberId($raw, 'websocket'), 'Token válido');
same(false, $tokens->getMemberId($raw, 'password_reset'), 'Propósito do token');
same(hash('sha256', $raw), $db->runSQL('SELECT token FROM token')->fetchColumn(), 'Token guardado como hash');
same($a, $tokens->consume($raw, 'websocket'), 'Consumir token');
same(false, $tokens->consume($raw, 'websocket'), 'Token de uso único');
$old = $tokens->create($a, 'background_location');
$new = $tokens->create($a, 'background_location');
same(false, $tokens->getMemberId($old, 'background_location'), 'Rotação revoga token anterior');
same($a, $tokens->getMemberId($new, 'background_location'), 'Novo token ativo');
same(false, $member->emailVerified($a), 'Email pendente');
$db->runSQL('UPDATE membros SET email_verificado_em = :date WHERE id = :id', ['date' => '2026-01-01', 'id' => $a]);
check($member->emailVerified($a), 'Email verificado');
check($member->exists($a), 'Membro existe');
$form = $member->prepareAccountForm(['telefone' => '', 'email' => 'a@example.test'], ['contactos'], false);
same([], $form['errors'], 'Telefone opcional');
same(false, App\Validate\Validate::isAdult('2000-02-31'), 'Data impossível');
same(true, App\Validate\Validate::isAdult('1990-01-01'), 'Adulto');
same('default.webp', $member->get($a)['fotos'][0]['nome_arquivo'], 'Fotografia por omissão');
check($connections->disconnect($a, $b), 'Desligar par');
same(false, $connections->areConnected($b, $a), 'Ligação removida');
require __DIR__ . '/websocket.php';
require __DIR__ . '/accounts.php';
require __DIR__ . '/push.php';
require __DIR__ . '/location-and-deletion.php';
require __DIR__ . '/push-provider.php';
require __DIR__ . '/media.php';

echo "OK: $checks verificações de comportamento (SQLite temporário).\n";
