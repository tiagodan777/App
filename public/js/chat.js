(function (window, document) {
    'use strict';

    const page = document.getElementById('chat-pagina');
    if (!page) return;

    window.desativarChatMargot?.();

    const byId = (id) => document.getElementById(id);
    const form = byId('chat-form');
    const text = byId('chat-texto');
    const send = byId('chat-enviar');
    const list = byId('chat-mensagens');
    const content = byId('chat-mensagens-conteudo');
    const media = byId('chat-media');
    const preview = byId('chat-media-preview');
    const error = byId('chat-erro');
    const replyPreview = byId('chat-reply-preview');
    const microphone = byId('chat-microphone');
    const recording = byId('chat-recording');
    const otherId = page.dataset.outroId;
    const me = String(window.membroId);
    const url = new URL(form.getAttribute('action'), window.location.href).href;
    const events = new AbortController();
    const signal = events.signal;

    let alive = true;
    let sending = false;
    let file = null;
    let previewUrl = null;
    let reply = null;
    let lastId = 0;
    let polling = false;

    // Mantém anexos e texto ao trocar de página dentro da app; limpa após enviar/apagar.
    const drafts = (window.MargotChatDrafts ||= new Map());
    const draftKey = me + ':' + otherId;

    function saveDraft() {
        if (file || text.value || reply) drafts.set(draftKey, { file, text: text.value, reply });
        else drafts.delete(draftKey);
    }

    const viewport = window.MargotChatViewport(page, list, content);
    const own = (message) => String(message.emissor_id) === me;
    const connected = () => window.AppWebSocket?.isConnected?.();

    const publish = (data) => {
        if (connected()) window.AppWebSocket.send(data);
    };

    const showError = (message) => {
        if (alive) {
            error.textContent = message;
            error.hidden = !message;
        }
    };

    const on = (element, type, handler) => {
        element.addEventListener(type, handler, { signal });
    };

    const summary = (message) =>
        message.text ||
        { imagem: 'Fotografia', video: 'Vídeo', audio: 'Mensagem de voz' }[message.type] ||
        'Mensagem';

    function time(value) {
        const timestamp = String(value || '')
            .replace(' ', 'T')
            .replace(/(\.\d{3})\d+/, '$1');

        const date = new Date(timestamp + (/Z$|[+-]\d\d:\d\d$/.test(timestamp) ? '' : 'Z'));

        return Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    }

    async function request(body) {
        const response = await fetch(url, { method: 'POST', body, credentials: 'same-origin', signal });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                typeof data.message === 'string' ? data.message : 'Não foi possível concluir o pedido.'
            );
        }

        return data;
    }

    function state() {
        const hasContent = Boolean(text.value.trim() || file);
        const busy = recorder.state !== 'idle';

        send.disabled = sending || !hasContent || busy;
        send.classList.toggle('ativo', hasContent);
        send.hidden = !hasContent || busy;
        send.setAttribute('aria-label', sending ? 'A enviar mensagem' : 'Enviar mensagem');
        send.textContent = sending ? '…' : '↑';

        microphone.hidden = hasContent || busy;
        microphone.disabled = sending;

        byId('chat-camera-open').disabled = sending || busy;
        byId('chat-gallery').disabled = sending || busy;

        text.hidden = busy;
        recording.hidden = !busy;
    }

    function selectReply(value, focus = true) {
        reply = value;
        replyPreview.hidden = !reply;
        replyPreview.querySelector('span').textContent = reply ? summary(reply) : '';

        if (reply && focus) text.focus({ preventScroll: true });
    }

    function chooseFile(value) {
        preview.querySelectorAll('audio, video').forEach((element) => element.pause());
        if (previewUrl) URL.revokeObjectURL(previewUrl);

        previewUrl = null;
        file = value;
        preview.replaceChildren();
        preview.hidden = !file;
        media.value = '';

        if (file) {
            const kind = file.type.startsWith('audio/')
                ? 'audio'
                : file.type.startsWith('video/')
                  ? 'video'
                  : 'img';

            const limit = kind === 'video' ? 100 : kind === 'audio' ? 35 : 15;

            if (file.size > limit * 1024 * 1024) {
                file = null;
                preview.hidden = true;
                showError('O ficheiro pode ter no máximo ' + limit + ' MB.');
                state();
                return;
            }

            previewUrl = URL.createObjectURL(file);

            const element = document.createElement(kind);
            element.src = previewUrl;

            if (kind !== 'img') {
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
            remove.addEventListener('click', () => chooseFile(null), { signal });

            preview.append(
                remove,
                kind === 'audio' ? window.MargotChatAudioPlayer(element, showError) : element
            );
            preview.classList.toggle('chat-preview-audio', kind === 'audio');
        }

        state();
        saveDraft();
    }

    const recorder = window.MargotChatRecorder({
        workletUrl: page.dataset.workletUrl,

        onState(status, seconds) {
            if (!alive) return;

            byId('chat-recording-time').textContent =
                status === 'starting'
                    ? 'A abrir microfone…'
                    : status === 'finishing'
                      ? 'A preparar…'
                      : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

            byId('chat-recording-send').disabled = status !== 'recording';
            state();
        },

        onFile(value, sendImmediately) {
            if (alive) {
                chooseFile(value);
                if (sendImmediately) form.requestSubmit();
            }
        },

        onError: showError
    });

    const camera = window.MargotChatCamera({
        dialog: byId('chat-camera'),
        onFile: chooseFile,
        onError: showError,
        gallery: media
    });

    const reactions = window.MargotChatReactions({
        content,
        list,
        request,
        publish,
        onError: showError,
        onReply: selectReply
    });

    function quote(value) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-quote';
        button.dataset.replyId = value.id;

        button.textContent = value.available
            ? (String(value.sender_id) === me ? 'Tu · ' : 'Resposta · ') + summary(value)
            : 'Mensagem indisponível';

        return button;
    }

    function render(message) {
        const article = document.createElement('article');
        article.className = 'chat-mensagem ' + (own(message) ? 'minha' : 'recebida');
        article.dataset.mensagemId = message.id;
        article.dataset.emissorId = message.emissor_id;

        const bubble = document.createElement('div');
        bubble.className = 'chat-balao';
        bubble.tabIndex = 0;
        bubble.setAttribute('aria-label', 'Mensagem. Manter premido para opções.');

        if (message.reply) bubble.append(quote(message.reply));

        if (message.media_url) {
            const tag = { imagem: 'img', video: 'video', audio: 'audio' }[message.tipo];

            if (tag) {
                const element = document.createElement(tag);
                element.className = 'chat-' + message.tipo;
                element.src = message.media_url;

                if (tag === 'img') {
                    element.alt = 'Fotografia';
                    element.draggable = false;
                } else {
                    element.controls = true;
                    element.preload = 'metadata';
                    element.setAttribute('playsinline', '');
                }

                bubble.append(tag === 'audio' ? window.MargotChatAudioPlayer(element, showError) : element);
            }
        }

        if (message.texto) {
            const paragraph = document.createElement('p');
            paragraph.textContent = message.texto;
            bubble.append(paragraph);
        }

        const footer = document.createElement('footer');
        const timestamp = document.createElement('time');
        timestamp.dateTime = message.criada_em;
        timestamp.textContent = time(message.criada_em);
        footer.append(timestamp);

        if (own(message)) {
            const receipt = document.createElement('span');
            receipt.className = 'chat-lida';
            receipt.textContent = message.lida ? '✓✓' : '✓';
            receipt.setAttribute('aria-label', message.lida ? 'Lida' : 'Enviada');
            footer.append(receipt);
        }

        bubble.append(footer);
        article.append(bubble);
        reactions.render(article, message.reactions || []);

        return article;
    }

    function add(message) {
        const id = Number(message.id);

        if (!id || content.querySelector('[data-mensagem-id="' + id + '"]')) {
            return false;
        }

        const article = render(message);

        // Polling e WebSocket podem terminar fora de ordem.
        const next = [...content.children].find((item) => Number(item.dataset.mensagemId) > id);

        if (next) {
            content.insertBefore(article, next);
        } else {
            viewport.insert(article, own(message));
        }

        lastId = Math.max(lastId, id);
        return true;
    }

    async function submit(event) {
        event.preventDefault();

        if (sending || recorder.state !== 'idle' || (!text.value.trim() && !file)) {
            return;
        }

        const sentText = text.value;
        const sentFile = file;
        const sentReply = reply;
        const body = new FormData(form);

        body.set('mensagem', sentText);
        body.set('reply_to', sentReply?.id || '');
        body.set('profile_access_token', window.AppWebSocket?.profileAccessToken?.(otherId) || '');
        body.delete('media');

        if (sentFile) {
            body.set('media', sentFile);
            body.set('media_kind', sentFile.type.startsWith('audio/') ? 'audio' : '');
        }

        sending = true;
        showError('');
        state();

        try {
            const data = await request(body);
            if (!alive) return;

            add(data.message);

            if (text.value === sentText) {
                text.value = '';
                resizeText();
            }

            if (file === sentFile) chooseFile(null);
            if (reply === sentReply) selectReply(null);
            saveDraft();

            publish({ type: 'chat_publish', message_id: data.message.id });
        } catch (error) {
            if (error.name !== 'AbortError') showError(error.message);
        } finally {
            sending = false;
            if (alive) state();
        }
    }

    async function markRead() {
        if (!alive || document.hidden) return;

        try {
            await request(new URLSearchParams({ action: 'mark_read' }));
            publish({ type: 'chat_read', with_member_id: otherId });
        } catch (error) {
            /* A próxima sincronização volta a confirmar a leitura. */
        }
    }

    async function sync(force = false) {
        if (!alive || polling || document.hidden || (!force && connected())) return;

        polling = true;

        try {
            let more;

            do {
                const response = await fetch(url + '?api=history&after_id=' + lastId, {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    signal
                });

                const data = await response.json();
                if (!response.ok || !data.success || !alive) break;

                const previous = lastId;
                data.messages.forEach(add);
                more = data.messages.length === 100 && lastId > previous;
            } while (more);

            markRead();
        } catch (error) {
            /* O intervalo seguinte volta a sincronizar. */
        } finally {
            polling = false;
        }
    }

    function resizeText() {
        text.style.height = 'auto';
        text.style.height = Math.min(text.scrollHeight, 120) + 'px';
    }

    on(form, 'submit', submit);

    // Impede a transferência de foco para o botão; o envio acontece apenas no click.
    on(send, 'pointerdown', (event) => {
        if (event.button === 0) event.preventDefault();
    });

    on(text, 'input', () => {
        resizeText();
        state();
    });

    on(text, 'keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    on(media, 'change', () => chooseFile(media.files[0] || null));
    on(byId('chat-camera-open'), 'click', () => camera.open());
    on(byId('chat-gallery'), 'click', () => media.click());

    on(microphone, 'click', () => {
        showError('');
        recorder.start();
    });

    on(byId('chat-recording-cancel'), 'click', () => recorder.cancel());
    on(byId('chat-recording-send'), 'click', () => recorder.finish());
    on(byId('chat-reply-cancel'), 'click', () => selectReply(null));

    on(content, 'click', (event) => {
        const target = event.target.closest('[data-reply-id]');
        if (!target) return;

        const original = content.querySelector('[data-mensagem-id="' + Number(target.dataset.replyId) + '"]');

        if (original) {
            original.scrollIntoView({
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'center'
            });

            original.classList.add('chat-highlight');
            setTimeout(() => original.classList.remove('chat-highlight'), 900);
        } else {
            showError('A mensagem original não está carregada nesta conversa.');
        }
    });

    on(window, 'app:chat-message', (event) => {
        const message = event.detail?.message;

        if (
            message &&
            ((String(message.emissor_id) === otherId && String(message.destinatario_id) === me) ||
                (String(message.emissor_id) === me && String(message.destinatario_id) === otherId))
        ) {
            if (add(message) && !own(message)) markRead();
        }
    });

    on(window, 'app:chat-messages-read', (event) => {
        if (String(event.detail.reader_id) !== otherId) return;

        content.querySelectorAll('.minha').forEach((article) => {
            if (Number(article.dataset.mensagemId) <= Number(event.detail.last_message_id)) {
                const receipt = article.querySelector('.chat-lida');

                if (receipt) {
                    receipt.textContent = '✓✓';
                    receipt.setAttribute('aria-label', 'Lida');
                }
            }
        });
    });

    on(window, 'app:chat-reaction', (event) => {
        reactions.receive(event.detail || {});
    });

    on(document, 'visibilitychange', () => {
        if (document.hidden) {
            recorder.cancel();
            camera.close();
        } else {
            sync(true);
            markRead();
        }
    });

    content.querySelectorAll('[data-mensagem-id]').forEach((article) => {
        lastId = Math.max(lastId, Number(article.dataset.mensagemId));
    });

    content.querySelectorAll('time').forEach((element) => {
        element.textContent = time(element.dateTime);
    });

    content.querySelectorAll('audio').forEach((audio) => window.MargotChatAudioPlayer(audio, showError));

    const interval = setInterval(() => sync(), 12000);

    const draft = drafts.get(draftKey);

    if (draft) {
        text.value = draft.text;
        chooseFile(draft.file);
        selectReply(draft.reply, false);
        resizeText();
    }

    state();
    markRead();

    function destroy() {
        if (!alive) return;

        saveDraft();
        alive = false;
        clearInterval(interval);
        events.abort();
        page.querySelectorAll('audio, video').forEach((element) => element.pause());
        viewport.destroy();
        reactions.destroy();
        recorder.cancel();
        camera.destroy();

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (window.desativarChatMargot === destroy) delete window.desativarChatMargot;
        if (String(window.chatMembroId) === otherId) delete window.chatMembroId;
    }

    window.desativarChatMargot = destroy;

    on(document, 'margot:page-leave', destroy);
    on(window, 'pagehide', destroy);
})(window, document);