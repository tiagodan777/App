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
    const gallery = byId('chat-gallery');
    const galleryButton = byId('chat-gallery-open');
    const english = !/^pt(?:[-_]|$)/i.test(window.MargotI18n?.language || navigator.language || 'pt');
    const label = (pt, en) => english ? en : pt;
    const isPhoto = (value) => Boolean(value && (/^image\//i.test(value.type)
        || (!value.type && /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(value.name))));
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
    let pickingGallery = false;
    let file = null;
    let files = [];
    const previewUrls = new Set();
    let reply = null;
    let lastId = 0;
    let polling = false;

    // Mantém anexos e texto ao trocar de página dentro da app; limpa após enviar/apagar.
    const drafts = (window.MargotChatDrafts ||= new Map());
    const draftKey = me + ':' + otherId;

    function saveDraft() {
        if (file || text.value || reply)
            drafts.set(draftKey, {
                file,
                files: files.slice(),
                text: text.value,
                reply,
                once: byId('chat-view-once').checked
            });
        else drafts.delete(draftKey);
    }

    const viewer = window.MargotPhotoViewer();
    const once = byId('chat-view-once');
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

    const jsonHeaders = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

    function responseError(response) {
        if (response.redirected || response.status === 401) {
            return 'A sessão terminou. Volta a entrar na Margot para continuar.';
        }
        if (response.status === 413) return 'O ficheiro é demasiado grande para o servidor.';
        if (response.status === 429) return 'Estás a enviar demasiado depressa. Aguarda um pouco e tenta novamente.';
        if (response.status === 403) return 'Não foi possível autorizar o pedido. Atualiza a página e tenta novamente.';
        return 'Não foi possível confirmar o pedido. Verifica a conversa antes de tentar novamente.';
    }

    async function readJson(response) {
        let data;

        try {
            data = await response.json();
        } catch (failure) {
            if (failure.name === 'AbortError') throw failure;

            // Não registar texto, anexos, tokens ou o corpo da resposta.
            console.warn('[Margot chat] Resposta sem JSON válido.', {
                status: response.status,
                contentType: response.headers.get('Content-Type')
            });

            throw new Error(responseError(response));
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error(responseError(response));
        }

        return data;
    }

    async function post(body, retried = false) {
        let response;

        try {
            response = await fetch(url, {
                method: 'POST',
                body,
                headers: jsonHeaders,
                credentials: 'same-origin',
                signal
            });
        } catch (failure) {
            if (failure.name === 'AbortError') throw failure;

            throw new Error('Não foi possível confirmar o pedido. Verifica a ligação e a conversa antes de tentar novamente.');
        }

        if (response.status === 403) {
            const data = await readJson(response);

            // Só repetir quando o servidor confirma que rejeitou o pedido
            // ANTES de o executar e a sessão continua a ser da mesma conta.
            if (data.code === 'csrf_expired') {
                if (!data.member_id || String(data.member_id) !== me) {
                    throw new Error('A sessão terminou ou mudou de conta. Volta a entrar na Margot para continuar.');
                }

                if (!retried && alive && !signal.aborted && !response.redirected
                    && window.MargotCsrf?.updateToken(data.csrf_token)) {
                    body.set('_csrf', data.csrf_token);
                    return post(body, true);
                }
            }

            throw new Error(typeof data.message === 'string' ? data.message : responseError(response));
        }

        return response;
    }

    async function request(body) {
        const response = await post(body);
        const data = await readJson(response);

        if (!response.ok || response.redirected || data.success !== true) {
            throw new Error(
                typeof data.message === 'string'
                    ? data.message
                    : responseError(response)
            );
        }

        if (body.get('action') === 'send' && (!data.message
            || typeof data.message !== 'object'
            || !Number.isSafeInteger(Number(data.message.id)) || Number(data.message.id) < 1
            || String(data.message.emissor_id) !== me
            || String(data.message.destinatario_id) !== otherId)) {
            throw new Error(responseError(response));
        }

        return data;
    }

    function state() {
        const hasText = Boolean(text.value.trim());
        const hasContent = hasText || Boolean(file);
        const busy = recorder.state !== 'idle';

        send.disabled = sending || pickingGallery || !hasContent || busy;
        send.classList.toggle('ativo', hasContent);
        send.hidden = !hasContent || busy;
        send.setAttribute('aria-label', sending ? 'A enviar mensagem' : 'Enviar mensagem');
        send.textContent = label('Enviar', 'Send');
        byId('chat-recording-send').textContent = label('Enviar', 'Send');
        send.setAttribute('aria-busy', String(sending));

        microphone.hidden = hasContent || busy;
        microphone.disabled = sending || pickingGallery;

        byId('chat-camera-open').hidden = hasText || busy;
        byId('chat-camera-open').disabled = sending || pickingGallery || busy;
        if (galleryButton) {
            galleryButton.hidden = hasText || busy;
            galleryButton.disabled = sending || pickingGallery || busy;
        }
        preview.querySelectorAll('button').forEach((button) => button.disabled = sending || pickingGallery);

        text.hidden = busy;
        recording.hidden = !busy;
    }

    function selectReply(value, focus = true) {
        reply = value;
        replyPreview.hidden = !reply;
        replyPreview.querySelector('span').textContent = reply
            ? (reply.text || (window.MargotI18n?.t(summary(reply)) ?? summary(reply)))
            : '';

        if (reply && focus) text.focus({ preventScroll: true });
    }

    function clearPreview() {
        preview.querySelectorAll('audio, video').forEach((element) => element.pause());
        preview.replaceChildren();
        previewUrls.forEach((value) => URL.revokeObjectURL(value));
        previewUrls.clear();
    }

    function chooseFile(value, viewOnce = false) {
        chooseFiles(value ? [value] : [], viewOnce);
    }

    function chooseFiles(values, viewOnce = false) {
        const selected = Array.from(values);

        if (selected.length > 10) {
            showError(label('Podes selecionar no máximo 10 fotografias.', 'You can select up to 10 photos.'));
            return;
        }

        if (selected.length > 1 && !selected.every(isPhoto)) {
            showError(label('Seleciona apenas fotografias para enviar várias de uma vez.', 'Select only photos to send several at once.'));
            return;
        }

        for (const value of selected) {
            const limit = value.type.startsWith('video/') ? 100 : value.type.startsWith('audio/') ? 35 : 15;

            if (value.size > limit * 1024 * 1024) {
                showError(label('O ficheiro pode ter no máximo ', 'The file must be no larger than ') + limit + ' MB.');
                return;
            }
        }

        clearPreview();

        files = selected;
        file = files[0] || null;
        preview.hidden = !file;
        once.checked = Boolean(file && files.every(isPhoto) && viewOnce);
        media.value = '';
        if (gallery) gallery.value = '';
        preview.classList.remove('chat-preview-audio', 'chat-preview-gallery');

        if (file) {
            const many = files.length > 1;

            if (many) {
                preview.classList.add('chat-preview-gallery');

                const count = document.createElement('small');
                count.className = 'chat-gallery-count';
                count.textContent = files.length + label(' fotografias · máximo 10', ' photos · maximum 10');
                preview.append(count);
            }

            const strip = many ? document.createElement('div') : preview;
            if (many) strip.className = 'chat-gallery-strip';

            files.forEach((value, index) => {
                const kind = value.type.startsWith('audio/') ? 'audio'
                    : value.type.startsWith('video/') ? 'video' : 'img';

                const objectUrl = URL.createObjectURL(value);
                previewUrls.add(objectUrl);

                const element = document.createElement(kind);
                element.src = objectUrl;

                if (kind !== 'img') {
                    element.controls = true;
                    element.setAttribute('playsinline', '');
                } else {
                    element.alt = label('Fotografia a enviar', 'Photo to send');
                }

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'chat-media-remover';
                remove.textContent = '×';
                remove.setAttribute('aria-label', label('Remover anexo', 'Remove attachment') + (many ? ' ' + (index + 1) : ''));

                remove.addEventListener('click', () => {
                    if (!sending && !pickingGallery) chooseFiles(files.filter((_, position) => position !== index), once.checked);
                }, { signal });

                const item = many ? document.createElement('div') : strip;
                if (many) item.className = 'chat-gallery-item';

                item.append(
                    remove,
                    kind === 'audio' ? window.MargotChatAudioPlayer(element, showError) : element
                );

                if (many) strip.append(item);
                if (kind === 'audio') preview.classList.add('chat-preview-audio');
            });

            if (many) preview.append(strip);
        }

        state();
        saveDraft();
    }

    const recorder = window.MargotChatRecorder({
        workletUrl: page.dataset.workletUrl,

        onLevel(level) {
            recording.style.setProperty('--voice-level', String(level));
        },

        onState(status, seconds) {
            if (!alive) return;

            recording.dataset.state = status;
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
        onReply: selectReply,
        onPhoto: (src) => viewer.open(src)
    });

    function quote(value) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-quote';
        button.dataset.replyId = value.id;
        button.dataset.replySystem = String(Boolean(value.available && !value.text));

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

        if (message.view_once) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-once';
            button.dataset.openPhoto = message.id;
            button.disabled = own(message) || message.opened;
            button.textContent = message.opened
                ? 'Fotografia aberta'
                : own(message)
                  ? 'Fotografia · Ver uma vez'
                  : '① Abrir fotografia';

            bubble.append(button);
        }

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

                bubble.append(
                    tag === 'audio' ? window.MargotChatAudioPlayer(element, showError) : element
                );
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

        if (sending || pickingGallery || recorder.state !== 'idle' || (!text.value.trim() && !file)) {
            return;
        }

        const sentText = text.value;
        const sentFiles = files.length ? files.slice() : [null];
        const sentReply = reply;
        const sentOnce = once.checked;

        sending = true;
        showError('');
        state();

        try {
            for (let index = 0; index < sentFiles.length; index++) {
                if (!alive || signal.aborted) return;

                const sentFile = sentFiles[index];
                const body = new FormData(form);

                body.set('view_once', String(Boolean(isPhoto(sentFile) && sentOnce)));
                body.set('mensagem', index === 0 ? sentText : '');
                body.set('reply_to', index === 0 ? (sentReply?.id || '') : '');
                body.set('profile_access_token', window.AppWebSocket?.profileAccessToken?.(otherId) || '');
                body.delete('media');
                body.delete('media_kind');

                if (sentFile) {
                    body.set('media', sentFile);
                    body.set('media_kind', sentFile.type.startsWith('audio/') ? 'audio' : '');
                }

                state();

                const data = await request(body);
                if (!alive) return;

                add(data.message);

                if (index === 0) {
                    if (text.value === sentText) {
                        text.value = '';
                        resizeText();
                    }

                    if (reply === sentReply) selectReply(null);
                }

                if (sentFile) chooseFiles(files.filter((value) => value !== sentFile), sentOnce);

                saveDraft();
                publish({ type: 'chat_publish', message_id: data.message.id });
            }
        } catch (failure) {
            if (failure.name !== 'AbortError') showError(failure.message);
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
                    headers: jsonHeaders,
                    credentials: 'same-origin',
                    cache: 'no-store',
                    signal
                });

                const data = await readJson(response);

                if (!response.ok || response.redirected || data.success !== true
                    || !Array.isArray(data.messages) || !alive) break;

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
    let keepFocus = false;

    on(send, 'pointerdown', (event) => {
        if (event.button !== 0) return;
        keepFocus = document.activeElement === text;
        event.preventDefault();
    });

    on(send, 'pointercancel', () => {
        keepFocus = false;
    });

    on(send, 'click', () => {
        if (keepFocus) text.focus({ preventScroll: true });
        keepFocus = false;
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

    on(media, 'change', () => {
        const selected = media.files[0];

        if (selected && /^(image|video)\//.test(selected.type)) camera.review(selected);
        else chooseFile(selected || null);

        media.value = '';
    });

    if (gallery && galleryButton) {
        galleryButton.setAttribute('aria-label', label('Escolher fotografias da galeria', 'Choose photos from your gallery'));

        on(galleryButton, 'click', async () => {
            if (!alive || sending || pickingGallery || recorder.state !== 'idle') return;

            const capacitor = window.Capacitor;
            const nativeCamera = capacitor?.isNativePlatform?.() ? capacitor.Plugins?.Camera : null;

            // No navegador conserva o seletor existente. Na app abre logo as fotografias.
            if (typeof nativeCamera?.pickImages !== 'function') {
                gallery.value = '';
                gallery.click();
                return;
            }

            pickingGallery = true;
            showError('');
            state();
            text.blur();

            try {
                const result = await nativeCamera.pickImages({ limit: 10, quality: 90 });
                if (!alive || signal.aborted) return;

                const photos = result?.photos;
                if (!Array.isArray(photos)) throw new Error('invalid_gallery_result');
                if (!photos.length) return;
                if (photos.length > 10) {
                    showError(label('Podes selecionar no máximo 10 fotografias.', 'You can select up to 10 photos.'));
                    return;
                }

                const selected = [];
                for (const photo of photos) {
                    if (!alive || signal.aborted) return;
                    if (typeof photo.webPath !== 'string' || !photo.webPath) throw new Error('missing_photo');

                    const response = await fetch(photo.webPath, { signal });
                    if (!response.ok || response.redirected) throw new Error('photo_unavailable');

                    const blob = await response.blob();
                    if (!alive || signal.aborted) return;
                    if (!blob.size) throw new Error('empty_photo');
                    if (blob.size > 15 * 1024 * 1024) {
                        showError(label('O ficheiro pode ter no máximo 15 MB.', 'The file must be no larger than 15 MB.'));
                        return;
                    }

                    const format = String(photo.format || 'jpeg').toLowerCase().replace(/^jpg$/, 'jpeg');
                    const mime = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/' + format;
                    if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(mime)) throw new Error('invalid_photo_type');
                    const extension = mime.split('/')[1].toLowerCase().replace(/^jpeg$/, 'jpg');
                    selected.push(new File([blob], 'gallery-' + Date.now() + '-' + selected.length + '.' + extension, { type: mime }));
                }

                // Só substitui o rascunho depois de todas as fotografias estarem prontas.
                if (alive && !signal.aborted) chooseFiles(selected);
            } catch (failure) {
                const cancelled = /\bcancel(?:led|ed)?\b/i.test(String(failure?.message || failure || ''));
                if (alive && failure?.name !== 'AbortError' && !cancelled) {
                    showError(label('Não foi possível abrir as fotografias. Tenta novamente.', 'Could not open the photos. Please try again.'));
                }
            } finally {
                pickingGallery = false;
                if (alive) state();
            }
        });

        on(gallery, 'change', () => {
            const selected = Array.from(gallery.files || []);
            gallery.value = '';

            if (!alive || sending || pickingGallery || !selected.length) return;

            if (!selected.every(isPhoto)) {
                showError(label('Seleciona apenas fotografias.', 'Select only photos.'));
                return;
            }

            showError('');
            chooseFiles(selected);
        });
    }

    on(byId('chat-camera-open'), 'click', () => camera.open());

    on(microphone, 'click', () => {
        showError('');
        recorder.start();
    });

    on(byId('chat-recording-cancel'), 'click', () => recorder.cancel());
    on(byId('chat-recording-send'), 'click', () => recorder.finish());
    on(byId('chat-reply-cancel'), 'click', () => selectReply(null));

    on(content, 'click', async (event) => {
        const button = event.target.closest('[data-open-photo]');
        if (!button || button.disabled) return;

        button.disabled = true;

        try {
            const response = await post(new URLSearchParams({
                action: 'open_photo',
                message_id: button.dataset.openPhoto
            }));

            if (!response.ok || response.redirected
                || !/^image\//i.test(response.headers.get('Content-Type') || '')) {
                const data = await readJson(response);
                throw new Error(typeof data.message === 'string' ? data.message : responseError(response));
            }

            const blob = await response.blob();
            if (!alive) return;

            const src = URL.createObjectURL(blob);
            viewer.open(src, () => URL.revokeObjectURL(src));
            button.textContent = 'Fotografia aberta';
        } catch (error) {
            if (error.name !== 'AbortError') showError(error.message);
            button.disabled = false;
        }
    });

    on(content, 'click', (event) => {
        const target = event.target.closest('[data-reply-id]');
        if (!target) return;

        const original = content.querySelector(
            '[data-mensagem-id="' + Number(target.dataset.replyId) + '"]'
        );

        if (original) {
            original.scrollIntoView({
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
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
            camera.suspend();
            viewer.close();
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

    content
        .querySelectorAll('audio')
        .forEach((audio) => window.MargotChatAudioPlayer(audio, showError));

    const interval = setInterval(() => sync(), 12000);

    const draft = drafts.get(draftKey);

    if (draft) {
        text.value = draft.text;
        chooseFiles(draft.files || (draft.file ? [draft.file] : []));
        selectReply(draft.reply, false);
        once.checked = Boolean(draft.once);
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

        viewer.destroy();
        viewport.destroy();
        reactions.destroy();
        recorder.destroy();
        camera.destroy();

        clearPreview();

        if (window.desativarChatMargot === destroy) delete window.desativarChatMargot;
        if (String(window.chatMembroId) === otherId) delete window.chatMembroId;
    }

    window.desativarChatMargot = destroy;

    on(document, 'margot:page-leave', destroy);
    on(window, 'pagehide', destroy);
})(window, document);