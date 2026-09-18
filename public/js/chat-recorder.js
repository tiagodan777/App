/* Uma gravação de cada vez. As pistas são sempre fechadas ao sair/cancelar. */
window.MargotChatRecorder = function ({ onState, onFile, onError, workletUrl }) {
    let sendWhenReady = true;
    let state = 'idle',
        stream,
        context,
        node,
        timer,
        generation = 0,
        chunks = [],
        seconds = 0;
    function release() {
        clearInterval(timer);
        stream?.getTracks().forEach((track) => track.stop());
        node?.disconnect();
        if (context && context.state !== 'closed') context.close().catch(() => {});
        stream = context = node = null;
    }
    function cancel() {
        generation++;
        release();
        chunks = [];
        state = 'idle';
        onState(state, 0);
    }
    function wav(rate) {
        const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const buffer = new ArrayBuffer(44 + count * 2),
            view = new DataView(buffer);
        const text = (offset, value) =>
            [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)));
        text(0, 'RIFF');
        view.setUint32(4, buffer.byteLength - 8, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, count * 2, true);
        let offset = 44;
        chunks.forEach((chunk) =>
            chunk.forEach((sample) => {
                view.setInt16(offset, sample, true);
                offset += 2;
            })
        );
        return new File([buffer], 'mensagem-de-voz.wav', { type: 'audio/wav' });
    }
    function finish(send = true) {
        if (state !== 'recording') return;
        sendWhenReady = send;
        state = 'finishing';
        onState(state, seconds);
        node.port.postMessage('stop');
    }
    async function start() {
        if (state !== 'idle') return;
        const current = ++generation;
        state = 'starting';
        onState(state, 0);
        try {
            if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
                throw new Error('A gravação não está disponível neste dispositivo.');
            context = new (window.AudioContext || window.webkitAudioContext)();
            await context.resume();
            if (current !== generation) return;
            const acquired = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });
            if (current !== generation) {
                acquired.getTracks().forEach((track) => track.stop());
                return;
            }
            stream = acquired;
            await context.audioWorklet.addModule(workletUrl);
            if (current !== generation) return;
            chunks = [];
            seconds = 0;
            const rate = context.sampleRate;
            node = new AudioWorkletNode(context, 'margot-voice');
            node.port.onmessage = ({ data }) => {
                if (current !== generation) return;
                if (data.samples) chunks.push(data.samples);
                if (data.limit) finish(false);
                if (data.stopped) {
                    const file = wav(rate);
                    cancel();
                    if (file.size > 44) onFile(file, sendWhenReady);
                    else onError('Não foi captado áudio. Tenta novamente.');
                }
            };
            context.createMediaStreamSource(stream).connect(node);
            const silent = context.createGain();
            silent.gain.value = 0;
            node.connect(silent).connect(context.destination);
            state = 'recording';
            onState(state, seconds);
            timer = setInterval(() => onState(state, ++seconds), 1000);
            stream.getAudioTracks()[0].onended = () => {
                if (state === 'recording') {
                    cancel();
                    onError('A gravação foi interrompida.');
                }
            };
        } catch (error) {
            if (current !== generation) return;
            cancel();
            onError(
                error.name === 'NotAllowedError'
                    ? 'Permite o acesso ao microfone nas definições para gravar áudio.'
                    : error.message || 'Não foi possível gravar áudio.'
            );
        }
    }
    return {
        start,
        finish,
        cancel,
        get state() {
            return state;
        }
    };
};