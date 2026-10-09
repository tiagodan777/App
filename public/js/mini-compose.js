/* Usa a mesma câmara, gravador e leitor de áudio do chat. */
window.MargotMiniCompose = function (form, { onError, workletUrl }) {
    const events = new AbortController();
    const signal = events.signal;
    const input = form.querySelector('[name="mensagem"]');
    const media = form.querySelector('[name="media"]');
    const submit = form.querySelector('[type="submit"]');
    const controls = document.createElement('div');
    const menu = form.closest('.mini-menu');
    const daylies = menu.querySelector('[data-daylies-mini]');

    if (daylies && !daylies.closest('.mini-menu-daylies-slot')) {
        const slot = document.createElement('section');
        slot.className = 'mini-menu-daylies-slot';
        form.before(slot);
        slot.append(daylies);
    }

    controls.className = 'mini-compose-input';
    controls.innerHTML = `
        <button type="button" data-camera-open aria-label="Tirar fotografia">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h4l2-3h4l2 3h4v14H4z"></path>
                <circle cx="12" cy="12" r="4"></circle>
            </svg>
        </button>
        <button type="button" data-microphone aria-label="Gravar mensagem de voz">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="2" width="6" height="13" rx="3"></rect>
                <path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"></path>
            </svg>
        </button>
        <div class="chat-recording" hidden>
            <button type="button" data-cancel aria-label="Apagar gravação">×</button>
            <span class="chat-recording-wave" aria-hidden="true">
                <i></i><i></i><i></i><i></i><i></i>
            </span>
            <output>0:00</output>
            <button type="button" data-send aria-label="Enviar gravação">↑</button>
        </div>`;

    const preview = document.createElement('div');
    preview.className = 'chat-media-preview mini-compose-preview';
    preview.hidden = true;

    const status = document.createElement('div');
    status.className = 'mini-compose-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.hidden = true;
    const statusText = document.createElement('span');
    status.append(statusText);

    let viewOnce = false;

    form.prepend(preview);
    form.append(controls, status);

    const microphone = controls.querySelector('[data-microphone]');
    controls.insertBefore(input, microphone);
    controls.append(submit);
    form.querySelector('.mini-menu-anexo')?.remove();

    const recording = controls.querySelector('.chat-recording');
    const drafts = (window.MargotMiniDrafts ||= new Map());

    let file = null,
        objectURL = null,
        recipient = '',
        busy = false,
        preparing = false,
        disposed = false;

    const on = (el, type, handler) => el.addEventListener(type, handler, { signal });

    function save() {
        if (recipient) drafts.set(recipient, { file, text: input.value, once: viewOnce });
    }

    function statusLabel() {
        const english = window.MargotI18n?.language === 'en';
        if (preparing) return english ? 'Preparing video…' : 'A preparar vídeo…';
        if (file?.type.startsWith('video/')) return english ? 'Sending video…' : 'A enviar vídeo…';
        if (file?.type.startsWith('image/')) return english ? 'Sending photo…' : 'A enviar fotografia…';
        return english ? 'Sending message…' : 'A enviar mensagem…';
    }

    function state() {
        if (disposed) return;
        const locked = busy || preparing;
        const active = recorder.state !== 'idle';

        recording.hidden = !active;
        input.hidden = active;
        microphone.hidden = active || Boolean(file || input.value.trim());
        submit.hidden = active || !Boolean(file || input.value.trim());

        controls.querySelector('[data-camera-open]').hidden = active;
        form.classList.toggle('mini-compose-recording', active);

        submit.disabled = locked;
        controls.querySelector('[data-camera-open]').disabled = locked;
        microphone.disabled = locked;
        input.readOnly = locked;
        preview.querySelectorAll('button').forEach((button) => {
            button.disabled = locked;
        });
        form.setAttribute('aria-busy', String(locked));
        form.classList.toggle('mini-compose-has-media', Boolean(file));
        form.classList.toggle('mini-compose-busy', locked);
        form.classList.toggle('mini-compose-preparing', preparing);
        status.hidden = !locked;
        const label = locked ? statusLabel() : '';
        if (statusText.textContent !== label) statusText.textContent = label;
    }

    function choose(value, once = false) {
        preview.querySelectorAll('audio,video').forEach((el) => el.pause());
        if (objectURL) URL.revokeObjectURL(objectURL);

        file = value;
        objectURL = null;
        media.value = '';
        preview.replaceChildren();
        preview.hidden = !file;
        viewOnce = Boolean(file?.type.startsWith('image/') && once);

        if (file) {
            const tag = file.type.startsWith('audio/')
                ? 'audio'
                : file.type.startsWith('video/')
                  ? 'video'
                  : 'img';

            const limit = tag === 'audio' ? 35 : tag === 'video' ? 100 : 15;

            if (file.size > limit * 1024 * 1024) {
                file = null;
                preview.hidden = true;
                viewOnce = false;
                onError('O ficheiro pode ter no máximo ' + limit + ' MB.');
                state();
                save();
                return;
            }

            const element = document.createElement(tag);
            element.src = objectURL = URL.createObjectURL(file);

            if (tag !== 'img') {
                element.controls = true;
                element.setAttribute('playsinline', '');
            } else {
                element.alt = 'Fotografia a enviar';
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'chat-media-remover';
            remove.textContent = '×';
            remove.setAttribute('aria-label', 'Remover anexo');
            on(remove, 'click', () => {
                if (!busy && !preparing) choose(null);
            });

            preview.append(
                remove,
                tag === 'audio' ? window.MargotChatAudioPlayer(element, onError) : element
            );
        }

        state();
        save();
    }

    const recorder = window.MargotChatRecorder({
        workletUrl,
        onError,

        onLevel(level) {
            recording.style.setProperty('--voice-level', String(level));
        },

        onState(status, seconds) {
            recording.dataset.state = status;
            recording.querySelector('output').textContent =
                status === 'starting'
                    ? 'A abrir microfone…'
                    : status === 'finishing'
                      ? 'A preparar…'
                      : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

            recording.querySelector('[data-send]').disabled = status !== 'recording';
            state();
        },

        onFile(value, send) {
            choose(value);
            if (send) form.requestSubmit();
        }
    });

    const camera = window.MargotChatCamera({
        dialog: document.getElementById('chat-camera'),
        gallery: media,
        onFile: choose,
        onError,
        onPreparing(value) {
            if (disposed) return;
            preparing = value;
            state();
        }
    });

    on(controls.querySelector('[data-camera-open]'), 'click', () => {
        if (busy || preparing) return;
        input.blur();
        camera.open();
    });

    on(controls.querySelector('[data-microphone]'), 'click', () => {
        if (!busy && !preparing) recorder.start();
    });

    on(controls.querySelector('[data-cancel]'), 'click', () => recorder.cancel());
    on(controls.querySelector('[data-send]'), 'click', () => recorder.finish());

    let keepFocus = false;

    on(submit, 'pointerdown', (event) => {
        if (event.button !== 0) return;
        keepFocus = document.activeElement === input;
        event.preventDefault();
    });

    on(submit, 'pointercancel', () => {
        keepFocus = false;
    });

    on(submit, 'click', () => {
        if (keepFocus) input.focus({ preventScroll: true });
        keepFocus = false;
    });

    on(input, 'input', () => {
        state();
        save();
    });

    on(media, 'change', () => {
        const selected = media.files[0];

        if (selected && /^(image|video)\//.test(selected.type)) camera.review(selected);
        else choose(selected || null);

        media.value = '';
    });

    on(document, 'visibilitychange', () => {
        if (document.hidden) {
            recorder.cancel();
            camera.suspend();
        }
    });

    const observer = new MutationObserver(() => {
        if (menu.getAttribute('aria-hidden') === 'true') {
            save();
            recorder.cancel();
            camera.close();
        }
    });

    observer.observe(menu, {
        attributes: true,
        attributeFilter: ['aria-hidden']
    });

    return {
        select(id) {
            if (recipient === id) return;

            save();
            recorder.cancel();
            camera.close();
            recipient = id;

            const draft = drafts.get(id);
            input.value = draft?.text || '';
            choose(draft?.file || null, Boolean(draft?.once));
        },

        fill(body) {
            body.delete('media');
            if (file) body.set('media', file);

            body.set('media_kind', file?.type.startsWith('audio/') ? 'audio' : '');
            body.set('view_once', String(Boolean(file?.type.startsWith('image/') && viewOnce)));
        },

        setBusy(value) {
            busy = value;
            state();
        },

        sent(id = recipient, sentText = input.value, sentFile = file) {
            if (id === recipient) {
                if (input.value === sentText) input.value = '';
                if (file === sentFile) choose(null);
                save();
            } else {
                const draft = drafts.get(id);
                if (draft?.file === sentFile && draft?.text === sentText) drafts.delete(id);
            }
        },

        destroy() {
            disposed = true;
            save();
            recorder.destroy();
            camera.destroy();
            events.abort();
            observer.disconnect();

            if (objectURL) URL.revokeObjectURL(objectURL);
        },

        get recording() {
            return recorder.state !== 'idle';
        }
    };
};