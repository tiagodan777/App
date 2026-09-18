/* Captura mono PCM16 em blocos, sem guardar a gravação no processo de áudio. */
class MargotVoiceCapture extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Int16Array(4096);
        this.length = 0;
        this.remaining = sampleRate * 180;
        this.port.onmessage = () => {
            this.flush();
            this.port.postMessage({ stopped: true });
            this.remaining = 0;
        };
    }
    flush() {
        if (!this.length) return;
        const chunk = this.buffer.slice(0, this.length);
        this.port.postMessage({ samples: chunk }, [chunk.buffer]);
        this.length = 0;
    }
    process(inputs) {
        const input = inputs[0]?.[0];
        if (!input || this.remaining <= 0) return true;
        for (let i = 0; i < input.length && this.remaining > 0; i++, this.remaining--) {
            const value = Math.max(-1, Math.min(1, input[i]));
            this.buffer[this.length++] = Math.round(value * (value < 0 ? 32768 : 32767));
            if (this.length === this.buffer.length) this.flush();
        }
        if (this.remaining === 0) {
            this.flush();
            this.port.postMessage({ limit: true });
        }
        return true;
    }
}
registerProcessor('margot-voice', MargotVoiceCapture);