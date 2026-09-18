/* O mesmo leitor para mensagens recebidas e para o áudio ainda por enviar. */
window.MargotChatAudioPlayer = function (audio, onError) {
    if (audio.parentElement?.classList.contains('chat-voice')) return audio.parentElement;

    const player = document.createElement('div');
    player.className = 'chat-voice';

    const play = document.createElement('button');
    play.type = 'button';

    const progress = document.createElement('input');
    progress.type = 'range';
    progress.min = 0;
    progress.max = 1;
    progress.step = 0.01;
    progress.value = 0;
    progress.disabled = true;
    progress.setAttribute('aria-label', 'Posição da mensagem de voz');

    const time = document.createElement('output');

    const format = (value) => {
        const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
        return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    };

    function update() {
        play.textContent = audio.paused ? '▶' : 'Ⅱ';
        play.setAttribute('aria-label', audio.paused ? 'Ouvir mensagem de voz' : 'Pausar mensagem de voz');

        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        progress.max = duration || 1;
        progress.disabled = !duration;
        progress.value = audio.currentTime || 0;
        time.textContent = format(audio.currentTime || duration);
    }

    play.addEventListener('click', async () => {
        if (!audio.paused) return audio.pause();

        document.querySelectorAll('.chat-voice audio').forEach((other) => {
            if (other !== audio) other.pause();
        });

        try {
            await audio.play();
        } catch {
            onError('Não foi possível reproduzir este áudio. Tenta novamente.');
        }
    });

    progress.addEventListener('input', () => {
        audio.currentTime = Number(progress.value);
        update();
    });

    for (const event of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended']) {
        audio.addEventListener(event, update);
    }

    audio.controls = false;
    audio.hidden = true;
    audio.preload = 'metadata';

    if (audio.parentNode) audio.replaceWith(player);

    player.append(play, progress, time, audio);
    update();

    return player;
};