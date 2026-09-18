<?php
(function () {
    $db = new TestDatabase();
    $members = new App\CMS\Member($db);
    $ids = [];

    foreach (['a', 'b', 'c'] as $name) {
        $ids[] = $members->create([
            'primeiro_nome' => $name,
            'ultimo_nome' => 'Chat',
            'nascimento' => '1990-01-01',
            'genero' => 'M',
            'email' => $name . '@chat.test',
            'password' => 'Senha1234',
            'sobre_ti' => '',
            'nome_seo' => $name
        ]);
    }

    [$a, $b, $c] = $ids;
    $messages = new App\CMS\Message($db);

    $original = $messages->send($a, $b, 'Texto original', []);
    $reply = $messages->send($b, $a, 'Resposta', [], $original);
    $shown = $messages->get($reply, $a);

    same(
        [
            'id' => $original,
            'available' => true,
            'sender_id' => $a,
            'text' => 'Texto original',
            'type' => 'texto'
        ],
        $shown['reply'],
        'Resposta com contexto correto'
    );

    same(
        $shown['reply'],
        $messages->history($a, $b)[1]['reply'],
        'Histórico e envio apresentam a mesma resposta'
    );

    same(false, $messages->get($reply, $c), 'Terceiro não consegue ler resposta');

    try {
        $messages->send($a, $c, 'Intrusão', [], $original);
        check(false, 'Resposta entre conversas');
    } catch (InvalidArgumentException) {
        check(true, 'Resposta entre conversas recusada');
    }

    $messages->deleteSent($original, $a, $b);
    $deleted = $messages->get($reply, $b)['reply'];

    same(false, $deleted['available'], 'Apagar original deixa referência indisponível');
    same('', $deleted['text'], 'Texto apagado não fica na citação');

    try {
        $messages->send($b, $a, 'Resposta tardia', [], $original);
        check(false, 'Resposta a mensagem apagada');
    } catch (InvalidArgumentException) {
        check(true, 'Resposta apagada recusada');
    }

    $messages->hideConversation($a, $b);

    try {
        $messages->send($a, $b, 'Resposta oculta', [], $reply);
        check(false, 'Resposta oculta');
    } catch (InvalidArgumentException) {
        check(true, 'Resposta fora do histórico visível recusada');
    }

    $voice = $messages->send($a, $b, '', [
        'tipo' => 'audio',
        'nome' => 'voice.wav',
        'mime' => 'audio/wav',
        'tamanho' => 32044
    ]);

    same('audio', $messages->get($voice, $b)['tipo'], 'Áudio guardado');

    same(
        '/media/mensagens/voice.wav',
        $messages->get($voice, $b)['media_url'],
        'URL de reprodução'
    );

    same(
        'Mensagem de voz',
        $messages->conversations($b)[0]['resumo'],
        'Resumo áudio na lista'
    );

    foreach (['🫶🏽', '🇵🇹', '👩🏽‍💻', '❤️', '1️⃣', '👨‍👩‍👧‍👦', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'] as $emoji) {
        check($messages->validReaction($emoji), 'Emoji composto aceite sem catálogo');
    }

    foreach ([
        '',
        'abc',
        '1',
        '#',
        '🇵',
        '🏽',
        '❤️❤️',
        "❤️\n",
        '<script>',
        str_repeat('❤️', 30)
    ] as $invalid) {
        check(!$messages->validReaction($invalid), 'Apenas um emoji é aceite');
    }

    foreach (['🫶🏽', '🇵🇹', '👩🏽‍💻', '❤️'] as $emoji) {
        $messages->react($voice, $b, $emoji, false);
        same($emoji, $messages->reactions($voice)[0]['emoji'], 'Reação Unicode preservada');
    }

    $messages->react($voice, $b, '❤️', false);

    same(
        '❤️',
        $messages->reactions($voice)[0]['emoji'],
        'Duplo toque repetido mantém coração'
    );

    $messages->react($voice, $b, '❤️', true);
    same([], $messages->reactions($voice), 'Menu permite retirar reação');

    try {
        $messages->react($voice, $b, '<script>', false);
        check(false, 'Emoji inválido');
    } catch (InvalidArgumentException) {
        check(true, 'Texto arbitrário recusado como emoji');
    }

    for ($i = 0; $i < 110; $i++) {
        $latest = $messages->send($b, $a, 'Depois de ocultar ' . $i, []);
    }

    $history = $messages->history($a, $b);

    same(100, count($history), 'Abertura limita histórico recente');
    same($latest, $history[99]['id'], 'Conversa oculta volta a abrir na última mensagem');

    $audio = new App\CMS\MessageAudio();
    $path = tempnam(sys_get_temp_dir(), 'chat-audio-');
    $pcm = str_repeat("\0", 32000);

    $valid = 'RIFF'
        . pack('V', 36 + strlen($pcm))
        . 'WAVEfmt '
        . pack('VvvVVvv', 16, 1, 1, 16000, 32000, 2, 16)
        . 'data'
        . pack('V', strlen($pcm))
        . $pcm;

    try {
        file_put_contents($path, $valid);
        $audio->validate($path);
        check(true, 'WAV PCM mono válido');

        foreach ([
            'not audio',
            substr($valid, 0, -2),
            substr_replace($valid, pack('v', 2), 22, 2),
            substr_replace($valid, pack('V', 0), 28, 4),
            substr_replace($valid, pack('v', 3), 20, 2)
        ] as $invalid) {
            file_put_contents($path, $invalid);
            clearstatcache(true, $path);

            try {
                $audio->validate($path);
                check(false, 'Áudio inválido aceite');
            } catch (InvalidArgumentException) {
                check(true, 'Áudio inválido recusado');
            }
        }
    } finally {
        unlink($path);
    }
})();