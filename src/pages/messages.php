<?php
declare(strict_types=1);

$messages = $cms->getMessage();
$access = $cms->getMessageAccess();
$membroId = trim((string) ($session->id ?? ''));
$outroId = trim((string) ($id ?? ''));
$api = trim((string) ($_GET['api'] ?? ''));
$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$json = $api !== '' || $metodo === 'POST';

function conversaIndisponivel($twig, bool $json): never {
    if ($json) {
        json_response(['success' => false, 'message' => 'Esta conversa não está disponível.'], 404);
    }
    http_response_code(404);
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    echo $twig->render('error-page.html', ['message' => 'Esta conversa não está disponível.']);
    exit();
}
if ($membroId === '') {
    if ($json) {
        json_response(['success' => false, 'message' => 'A sessão terminou.'], 401);
    }
    redirect(DOC_ROOT . 'login');
}
if (!in_array($metodo, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    json_response(['success' => false, 'message' => 'Método não permitido.'], 405);
}
try {
    if ($metodo === 'GET' && $api === 'conversations') {
        json_response([
            'success' => true,
            'conversations' => $messages->conversations($membroId),
            'unread_count' => $messages->unreadCount($membroId)
        ]);
    }
    if ($metodo === 'GET' && $api !== 'history' && $outroId === '') {
        echo $twig->render('messages.html', [
            'membro_id' => $membroId,
            'conversas' => $messages->conversations($membroId),
            'mensagens_nao_lidas' => $messages->unreadCount($membroId)
        ]);
        return;
    }
    $contexto = $access->context($membroId, $outroId);
    if (!$contexto) {
        conversaIndisponivel($twig, $json);
    }
    $membroId = (string) $contexto['membro_id'];
    $outroId = (string) $contexto['outro_id'];
    $existente = (bool) $contexto['conversa_existente'];
    $ligados = (bool) $contexto['ligados'];
    if ($metodo === 'GET') {
        if (!$existente && !$ligados) {
            conversaIndisponivel($twig, $json);
        }
        if ($api === 'history') {
            json_response([
                'success' => true,
                'messages' => $messages->history($membroId, $outroId, max(0, (int) ($_GET['after_id'] ?? 0)))
            ]);
        }
        $outro = $messages->memberPreview($outroId);
        if (!$outro) {
            conversaIndisponivel($twig, false);
        }
        $messages->markRead($membroId, $outroId);
        echo $twig->render('chat.html', [
            'membro_id' => $membroId,
            'outro' => $outro,
            'mensagens' => $messages->history($membroId, $outroId),
            'mensagens_nao_lidas' => $messages->unreadCount($membroId)
        ]);
        return;
    }
    $acao = trim((string) ($_POST['action'] ?? 'send'));
    if (in_array($acao, ['mark_read', 'delete_message', 'react'], true) && !$existente && !$ligados) {
        conversaIndisponivel($twig, true);
    }
    if ($acao === 'mark_read') {
        $messages->markRead($membroId, $outroId);
        json_response(['success' => true, 'unread_count' => $messages->unreadCount($membroId)]);
    }
    if ($acao === 'delete_conversation') {
        if (!$existente) {
            conversaIndisponivel($twig, true);
        }
        $corte = $messages->hideConversation($membroId, $outroId);
        json_response([
            'success' => true,
            'deleted' => true,
            'hidden_until_id' => $corte,
            'unread_count' => $messages->unreadCount($membroId)
        ]);
    }
    if ($acao === 'delete_message' || $acao === 'react') {
        $mensagemId = filter_var($_POST['message_id'] ?? null, FILTER_VALIDATE_INT);
        if ($mensagemId === false || $mensagemId < 1) {
            json_response(['success' => false, 'message' => 'A mensagem não é válida.'], 422);
        }
        if ($acao === 'delete_message') {
            try {
                $apagada = $messages->deleteSent($mensagemId, $membroId, $outroId);
            } catch (InvalidArgumentException $erro) {
                json_response(['success' => false, 'message' => $erro->getMessage()], 403);
            }
            if (!$apagada) {
                json_response(['success' => false, 'message' => 'A mensagem já não existe.'], 404);
            }
            json_response([
                'success' => true,
                'deleted' => true,
                'message_id' => $mensagemId,
                'unread_count' => $messages->unreadCount($membroId)
            ]);
        }
        if (!$messages->belongsToConversation($mensagemId, $membroId, $outroId)) {
            json_response(['success' => false, 'message' => 'A mensagem não é válida.'], 422);
        }
        $emoji = trim((string) ($_POST['emoji'] ?? ''));
        if (!in_array($emoji, $messages->allowedReactions(), true)) {
            json_response(['success' => false, 'message' => 'A reação não é válida.'], 422);
        }
        $reacoes = $messages->react(
            $mensagemId,
            $membroId,
            $emoji,
            filter_var($_POST['toggle'] ?? false, FILTER_VALIDATE_BOOLEAN)
        );
        json_response(['success' => true, 'message_id' => $mensagemId, 'reactions' => $reacoes]);
    }
    if ($acao !== 'send') {
        json_response(['success' => false, 'message' => 'Ação inválida.'], 422);
    }
    if (
        !$ligados &&
        !$access->validProximityToken($membroId, $outroId, (string) ($_POST['profile_access_token'] ?? ''))
    ) {
        json_response(
            [
                'success' => false,
                'message' =>
                    'Para continuar a conversar, têm de estar dentro dos 100 metros ou estar ligados na Margot.'
            ],
            403
        );
    }
    if (!$ligados && !$access->hasReply($membroId, $outroId) && $access->sentBeforeReply($membroId, $outroId) >= 2) {
        json_response(
            [
                'success' => false,
                'message' =>
                    'Já enviaste duas mensagens. Quando a outra pessoa responder ou te enviar um Hey, podes continuar.'
            ],
            429
        );
    }
    $texto = trim((string) ($_POST['mensagem'] ?? ($_POST['texto'] ?? '')));
    if (mb_strlen($texto) > 2000) {
        json_response(['success' => false, 'message' => 'A mensagem pode ter no máximo 2000 caracteres.'], 422);
    }
    $media = (new App\CMS\MessageMedia())->receive($_FILES['media'] ?? []);
    if ($texto === '' && $media === []) {
        json_response(['success' => false, 'message' => 'Escreve uma mensagem ou escolhe um ficheiro.'], 422);
    }
    $mensagemId = $messages->send($membroId, $outroId, $texto, $media);
    // A falha de push não deve repetir uma mensagem já guardada.
    try {
        $cms->getPushNotification()->enqueueMessage($membroId, $outroId, $mensagemId);
    } catch (Throwable $erro) {
        error_log('[messages-push] ' . $erro->getMessage());
    }
    json_response(['success' => true, 'message' => $messages->get($mensagemId, $membroId)], 201);
} catch (Throwable $erro) {
    error_log('[messages] ' . $erro->getMessage());
    if ($json) {
        json_response(['success' => false, 'message' => 'Não foi possível processar as mensagens.'], 500);
    }
    http_response_code(500);
    echo $twig->render('error-page.html', ['message' => 'Não foi possível abrir as mensagens.']);
}
