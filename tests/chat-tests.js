// Executar com Node + jsdom. Rede, sensores e teclado nativo são simulados explicitamente.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export async function testChat(JSDOM, html, root) {
    let checks = 0;

    const equal = (actual, expected, label) => {
        assert.deepEqual(actual, expected, label);
        checks++;
    };

    const ok = (value, label) => {
        assert(value, label);
        checks++;
    };

    const dom = new JSDOM(html, {
        url: 'https://example.test/messages/other',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const w = dom.window;
    const doc = w.document;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const byId = id => doc.getElementById(id);

    w.jQuery = {};
    w.matchMedia = () => ({ matches: false });

    w.ResizeObserver = class {
        observe() {}
        disconnect() {}
    };

    w.HTMLElement.prototype.scrollTo = function ({ top }) {
        this.scrollTop = top;
    };

    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLElement.prototype.animate = function () {};

    w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };

    w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
    };

    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });

    w.HTMLCanvasElement.prototype.toBlob = callback =>
        callback(new w.Blob(['image'], { type: 'image/jpeg' }));

    let stops = 0;
    let audioNode;
    let audioContext;

    const stream = () => ({
        getTracks: () => [{
            stop() {
                stops++;
            }
        }],
        getAudioTracks: () => [{}]
    });

    let acquire = async () => stream();

    Object.defineProperty(w.navigator, 'mediaDevices', {
        value: {
            getUserMedia: (...args) => acquire(...args)
        }
    });

    w.AudioContext = class {
        constructor() {
            audioContext = this;
            this.sampleRate = 16000;
            this.state = 'running';
            this.audioWorklet = { addModule: async () => {} };
        }

        resume() {
            return Promise.resolve();
        }

        close() {
            this.state = 'closed';
            return Promise.resolve();
        }

        createMediaStreamSource() {
            return { connect() {} };
        }

        createGain() {
            return {
                gain: { value: 1 },
                connect() {}
            };
        }
    };

    w.AudioWorkletNode = class {
        constructor() {
            audioNode = this;

            this.port = {
                postMessage: () => {
                    this.port.onmessage({
                        data: { samples: new Int16Array([1, -2, 3]) }
                    });

                    this.port.onmessage({
                        data: { stopped: true }
                    });
                }
            };
        }

        connect() {
            return { connect() {} };
        }

        disconnect() {}
    };

    let haptics = 0;
    let posts = [];
    let nextId = 26;
    let deferred = null;
    let failed = false;
    let reactionFailed = false;

    w.MargotHaptics = {
        feedback() {
            haptics++;
        }
    };

    w.AppWebSocket = {
        isConnected: () => true,
        send() {},
        profileAccessToken: () => ''
    };

    w.fetch = async (url, options = {}) => {
        assert(!String(url).includes('chat-emojis.json'), 'No emoji catalog request');

        const body = options.body;
        posts.push(body);

        if (body?.get('action') === 'send') {
            if (deferred) await deferred;

            if (failed) {
                return {
                    ok: false,
                    json: async () => ({
                        success: false,
                        message: 'Erro de teste'
                    })
                };
            }

            return {
                ok: true,
                json: async () => ({
                    success: true,
                    message: {
                        id: nextId++,
                        emissor_id: 'me',
                        destinatario_id: 'other',
                        texto: body.get('mensagem'),
                        tipo: body.get('media_kind') === 'audio' ? 'audio' : 'texto',
                        media_url: body.get('media_kind') === 'audio' ? '/voice.wav' : null,
                        criada_em: '2026-09-17 15:00:00',
                        reactions: []
                    }
                })
            };
        }

        if (body?.get('action') === 'react' && reactionFailed) {
            return {
                ok: false,
                json: async () => ({
                    success: false,
                    message: 'Escolhe apenas um emoji.'
                })
            };
        }

        return {
            ok: true,
            json: async () => ({
                success: true,
                reactions: body?.get('action') === 'react'
                    ? [{ member_id: 'me', emoji: body.get('emoji') }]
                    : []
            })
        };
    };

    for (const name of ['chat-viewport', 'chat-recorder', 'chat-camera', 'chat-reactions']) {
        w.eval(fs.readFileSync(root + '/public/js/' + name + '.js', 'utf8'));
    }

    w.membroId = 'me';
    w.chatMembroId = 'other';
    w.eval(fs.readFileSync(root + '/public/js/chat.js', 'utf8'));

    const input = value => {
        byId('chat-texto').value = value;
        byId('chat-texto').dispatchEvent(new w.Event('input'));
    };

    const submit = () =>
        byId('chat-form').dispatchEvent(new w.Event('submit', { cancelable: true }));

    const pointer = (element, type, id = 1, x = 0, y = 0) => {
        const event = new w.Event(type, {
            bubbles: true,
            cancelable: true
        });

        Object.assign(event, {
            button: 0,
            pointerId: id,
            clientX: x,
            clientY: y
        });

        element.dispatchEvent(event);
        return event;
    };

    await wait(30);

    equal(
        byId('chat-mensagens').getAttribute('aria-busy'),
        'false',
        'Initial history revealed'
    );

    input('Olá');
    byId('chat-texto').focus();

    ok(
        pointer(byId('chat-enviar'), 'pointerdown').defaultPrevented,
        'Pointerdown prevents focus transfer'
    );

    equal(
        posts.filter(body => body?.get('action') === 'send').length,
        0,
        'Pointerdown does not also submit'
    );

    submit();
    await wait(0);

    equal(doc.activeElement.id, 'chat-texto', 'Input focus remains after submit');
    equal(byId('chat-texto').value, '', 'Confirmed draft cleared');

    equal(
        doc.querySelector('[data-mensagem-id="26"] p').textContent,
        'Olá',
        'Sent message rendered'
    );

    let resolve;
    deferred = new Promise(r => resolve = r);

    input('Primeira');
    submit();
    input('Próxima');
    resolve();

    await wait(0);
    deferred = null;

    equal(byId('chat-texto').value, 'Próxima', 'Next draft preserved during send');

    failed = true;
    submit();
    await wait(0);

    equal(byId('chat-texto').value, 'Próxima', 'Failed send preserves draft');
    equal(byId('chat-erro').textContent, 'Erro de teste', 'Send failure explained');

    failed = false;
    input('');

    const bubble = doc.querySelector('[data-mensagem-id="27"] .chat-balao');

    pointer(bubble, 'pointerdown');
    pointer(bubble, 'pointerup');
    pointer(bubble, 'pointerdown');
    pointer(bubble, 'pointerup');
    await wait(0);

    equal(haptics, 1, 'Double tap haptic');

    ok(
        posts.some(body => body?.get('emoji') === '❤️' && body.get('toggle') === 'false'),
        'Double tap adds, does not toggle heart'
    );

    pointer(bubble, 'pointerdown');
    pointer(bubble, 'pointercancel');
    pointer(bubble, 'pointerdown');
    pointer(bubble, 'pointerup');
    await wait(0);

    equal(haptics, 1, 'Cancelled gesture does not like');

    pointer(bubble, 'pointerdown');
    pointer(bubble, 'pointermove', 1, 50, 0);
    await wait(530);

    equal(byId('chat-actions').open, false, 'Scroll cancels long press');

    pointer(bubble, 'pointerdown');
    await wait(530);

    equal(byId('chat-actions').open, true, 'Long press opens menu');
    equal(haptics, 2, 'Long press haptic');

    pointer(bubble, 'pointerup');
    doc.querySelector('[data-action="reply"]').click();

    equal(byId('chat-reply-preview').hidden, false, 'Reply preview visible');
    equal(doc.activeElement.id, 'chat-texto', 'Reply focuses composer');

    input('Resposta');
    submit();
    await wait(0);

    equal(
        posts.filter(body => body?.get('action') === 'send').at(-1).get('reply_to'),
        '27',
        'Reply id sent'
    );

    equal(byId('chat-reply-preview').hidden, true, 'Reply cleared on success');

    pointer(bubble, 'pointerdown');
    await wait(530);
    pointer(bubble, 'pointerup');

    doc.querySelector('[data-action="all"]').click();
    await wait(0);

    const emojiInput = byId('chat-emoji-input');
    const emojiForm = emojiInput.form;

    equal(
        doc.activeElement.id,
        'chat-emoji-input',
        'Reaction opens focused keyboard input'
    );

    emojiForm.dispatchEvent(new w.Event('submit', { cancelable: true }));

    equal(
        byId('chat-emoji-error').textContent,
        'Escolhe um emoji no teclado.',
        'Empty reaction explained'
    );

    emojiInput.value = '🇵🇹';
    emojiInput.dispatchEvent(new w.Event('input'));

    equal(
        posts.filter(body => body?.get('emoji') === '🇵🇹').length,
        0,
        'Typing emoji does not send prematurely'
    );

    emojiForm.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await wait(0);

    ok(
        posts.some(body => body?.get('emoji') === '🇵🇹'),
        'Keyboard emoji submitted'
    );

    equal(byId('chat-emojis').open, false, 'Reaction dialog closes on success');

    pointer(bubble, 'pointerdown');
    await wait(530);
    pointer(bubble, 'pointerup');
    doc.querySelector('[data-action="all"]').click();

    reactionFailed = true;
    emojiInput.value = 'texto';
    emojiForm.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await wait(0);

    equal(byId('chat-emojis').open, true, 'Failed reaction stays open');
    equal(emojiInput.value, 'texto', 'Failed reaction keeps input');

    equal(
        byId('chat-emoji-error').textContent,
        'Escolhe apenas um emoji.',
        'Server validation shown next to input'
    );

    reactionFailed = false;

    const reactionsBeforeCancel = posts.filter(
        body => body?.get('action') === 'react'
    ).length;

    byId('chat-emojis').querySelector('[data-close]').click();

    equal(
        posts.filter(body => body?.get('action') === 'react').length,
        reactionsBeforeCancel,
        'Cancel never sends a reaction'
    );

    byId('chat-microphone').click();
    await wait(0);

    equal(byId('chat-recording').hidden, false, 'Recording UI');

    byId('chat-recording-cancel').click();

    equal(byId('chat-recording').hidden, true, 'Cancel resets recorder');
    ok(stops > 0, 'Cancel releases microphone');

    byId('chat-microphone').click();
    await wait(0);
    byId('chat-recording-send').click();
    await wait(0);

    const audioPost = posts.filter(body => body?.get('action') === 'send').at(-1);

    equal(audioPost.get('media_kind'), 'audio', 'Audio intent sent');
    equal(audioPost.get('media').type, 'audio/wav', 'Cross-platform WAV attachment');
    equal(audioContext.state, 'closed', 'Send releases audio context');

    const wav = await new Promise(resolve => {
        const reader = new w.FileReader();
        reader.onload = () => resolve(Buffer.from(reader.result));
        reader.readAsArrayBuffer(audioPost.get('media'));
    });

    equal(wav.toString('ascii', 0, 4), 'RIFF', 'WAV header');
    equal(wav.readUInt32LE(24), 16000, 'WAV sample rate');
    equal(wav.readInt16LE(46), -2, 'Signed PCM preserved');

    const sentBeforeLimit = posts.filter(
        body => body?.get('action') === 'send'
    ).length;

    byId('chat-microphone').click();
    await wait(0);
    audioNode.port.onmessage({ data: { limit: true } });
    await wait(0);

    equal(
        posts.filter(body => body?.get('action') === 'send').length,
        sentBeforeLimit,
        'Time limit never sends without confirmation'
    );

    ok(
        byId('chat-media-preview').querySelector('audio'),
        'Time limit keeps audio ready to preview/send'
    );

    equal(byId('chat-recording').hidden, true, 'Time limit stops recording UI');
    byId('chat-media-preview').querySelector('button').click();

    byId('chat-camera-open').click();
    await wait(0);

    const video = byId('chat-camera').querySelector('video');

    Object.defineProperties(video, {
        videoWidth: { value: 640 },
        videoHeight: { value: 480 }
    });

    doc.querySelector('[data-camera="capture"]').click();
    await wait(0);

    equal(
        doc.querySelector('[data-camera="use"]').hidden,
        false,
        'Camera preview before attachment'
    );

    doc.querySelector('[data-camera="use"]').click();

    ok(
        byId('chat-media-preview').querySelector('img'),
        'Custom camera produces image attachment'
    );

    equal(byId('chat-camera').open, false, 'Camera closed after confirmation');
    byId('chat-media-preview').querySelector('button').click();

    let resolveCamera;
    acquire = () => new Promise(resolve => resolveCamera = resolve);

    byId('chat-camera-open').click();
    doc.querySelector('[data-camera="close"]').click();

    const before = stops;
    resolveCamera(stream());
    await wait(0);

    equal(
        stops,
        before + 1,
        'Late camera permission releases stream after close'
    );

    let resolveMic;
    acquire = () => new Promise(resolve => resolveMic = resolve);

    byId('chat-microphone').click();
    await wait(0);
    byId('chat-recording-cancel').click();

    const beforeMic = stops;
    resolveMic(stream());
    await wait(0);

    equal(
        stops,
        beforeMic + 1,
        'Late microphone permission releases stream after cancel'
    );

    acquire = async () => {
        throw Object.assign(new Error('denied'), {
            name: 'NotAllowedError'
        });
    };

    byId('chat-microphone').click();
    await wait(0);

    ok(
        byId('chat-erro').textContent.includes('microfone'),
        'Permission denial explained'
    );

    equal(byId('chat-recording').hidden, true, 'Permission denial returns idle');

    // A WebSocket event from another conversation must never appear here.
    const incoming = {
        id: 99,
        emissor_id: 'stranger',
        destinatario_id: 'me',
        texto: 'privado'
    };

    w.dispatchEvent(new w.CustomEvent('app:chat-message', {
        detail: { message: incoming }
    }));

    equal(
        doc.querySelector('[data-mensagem-id="99"]'),
        null,
        'Foreign conversation ignored'
    );

    incoming.emissor_id = 'other';

    w.dispatchEvent(new w.CustomEvent('app:chat-message', {
        detail: { message: incoming }
    }));

    w.dispatchEvent(new w.CustomEvent('app:chat-message', {
        detail: { message: incoming }
    }));

    equal(
        doc.querySelectorAll('[data-mensagem-id="99"]').length,
        1,
        'Realtime duplicates suppressed'
    );

    doc.dispatchEvent(new w.Event('margot:page-leave'));
    equal(w.desativarChatMargot, undefined, 'Navigation cleans controller');

    w.dispatchEvent(new w.CustomEvent('app:chat-message', {
        detail: { message: { ...incoming, id: 100 } }
    }));

    equal(
        doc.querySelector('[data-mensagem-id="100"]'),
        null,
        'Late event ignored after leaving'
    );

    dom.window.close();

    // Run the actual AudioWorklet processor, including buffering and the 3-minute cap.
    let Processor;
    const packets = [];

    const context = {
        sampleRate: 16000,
        AudioWorkletProcessor: class {
            constructor() {
                this.port = {
                    postMessage: packet => packets.push(packet)
                };
            }
        },
        registerProcessor: (name, type) => Processor = type
    };

    vm.runInNewContext(
        fs.readFileSync(root + '/public/js/chat-audio-worklet.js', 'utf8'),
        context
    );

    const processor = new Processor();

    processor.process([[new Float32Array([1, -1, 0.5])]]);
    processor.port.onmessage();

    equal(
        [...packets[0].samples],
        [32767, -32768, 16384],
        'Worklet PCM conversion'
    );

    ok(packets.at(-1).stopped, 'Worklet flush acknowledgment');

    const limited = new Processor();
    limited.remaining = 2;
    limited.process([[new Float32Array([1, 1, 1])]]);

    equal(packets.at(-2).samples.length, 2, 'Recording stops at sample limit');
    ok(packets.at(-1).limit, 'Recording limit event');

    return checks;
}