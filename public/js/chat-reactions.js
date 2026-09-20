window.MargotChatReactions = function ({
    content,
    list,
    request,
    publish,
    onError,
    onReply,
    onPhoto = () => {}
}) {
    const me = String(window.membroId);
    const events = new AbortController();
    const signal = events.signal;
    const menu = document.getElementById('chat-actions');
    const picker = document.getElementById('chat-emojis');
    const emojiForm = picker.querySelector('form');
    const emojiInput = picker.querySelector('input');
    const emojiError = picker.querySelector('[role="alert"]');
    const emojiSend = picker.querySelector('[type="submit"]');

    let selected;
    let gesture;
    let timer;
    let photoTimer;
    let lastTap;
    let alive = true;
    let pending = new Set();

    const on = (target, type, handler) => target.addEventListener(type, handler, { signal });
    const find = (id) => content.querySelector('[data-mensagem-id="' + Number(id) + '"]');
    const haptic = () => window.MargotHaptics?.feedback?.();

    function render(article, reactions) {
        if (!article) return;

        let container = article.querySelector('.chat-reacoes');

        if (!container) {
            container = document.createElement('div');
            container.className = 'chat-reacoes';
            article.append(container);
        }

        container.replaceChildren();
        container.hidden = !reactions.length;

        const grouped = new Map();

        reactions.forEach((reaction) => {
            const item = grouped.get(reaction.emoji) || { count: 0, own: false };
            item.count++;
            item.own ||= String(reaction.member_id) === me;
            grouped.set(reaction.emoji, item);
        });

        for (const [emoji, item] of grouped) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-reacao' + (item.own ? ' minha-reacao' : '');
            button.dataset.emoji = emoji;
            button.textContent = emoji + (item.count > 1 ? ' ' + item.count : '');
            button.setAttribute('aria-label', 'Reação ' + emoji + ', ' + item.count);
            container.append(button);
        }
    }

    function remove(id) {
        const article = find(id);
        if (!article) return;

        article.remove();

        content.querySelectorAll('[data-reply-id="' + Number(id) + '"]').forEach((quote) => {
            quote.textContent = 'Mensagem indisponível';
        });
    }

    async function react(id, emoji, toggle = true, reportError = onError) {
        if (pending.has(id)) return false;
        pending.add(id);

        try {
            const data = await request(
                new URLSearchParams({ action: 'react', message_id: id, emoji, toggle: String(toggle) })
            );

            if (!alive) return;

            const article = find(id);
            render(article, data.reactions || []);

            if (
                emoji === '❤️' &&
                article &&
                data.reactions.some((item) => item.emoji === emoji && String(item.member_id) === me)
            ) {
                const heart = document.createElement('span');
                heart.className = 'chat-heart';
                heart.textContent = '❤️';
                heart.setAttribute('aria-hidden', 'true');
                article.append(heart);

                setTimeout(() => heart.remove(), 700);
            }

            publish({ type: 'chat_reaction', message_id: Number(id) });
            return true;
        } catch (error) {
            if (error.name !== 'AbortError' && alive) {
                reportError(error.message);
            }

            return false;
        } finally {
            pending.delete(id);
        }
    }

    function cancelGesture() {
        clearTimeout(timer);
        gesture = null;
    }

    function closeMenu() {
        if (menu.open) menu.close();
    }

    function openMenu(article) {
        clearTimeout(photoTimer);
        selected = article;
        lastTap = null;
        menu.querySelector('[data-action="delete"]').hidden = article.dataset.emissorId !== me;
        menu.showModal();
        haptic();
    }

    on(content, 'pointerdown', (event) => {
        clearTimeout(photoTimer);
        if (event.button !== 0 || event.target.closest('button,a,input,video,audio')) return;

        const article = event.target.closest('.chat-mensagem');
        if (!article) return;

        cancelGesture();

        gesture = { article, id: event.pointerId, x: event.clientX, y: event.clientY, long: false };

        timer = setTimeout(() => {
            if (gesture) {
                gesture.long = true;
                openMenu(article);
            }
        }, 500);
    });

    on(content, 'pointermove', (event) => {
        if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) {
            cancelGesture();
            lastTap = null;
        }
    });

    on(content, 'pointerup', (event) => {
        if (!gesture || gesture.id !== event.pointerId) return;

        const { article, long } = gesture;
        cancelGesture();

        if (long) {
            event.preventDefault();
            return;
        }

        const now = performance.now();

        if (lastTap?.article === article && now - lastTap.time < 320) {
            clearTimeout(photoTimer);
            haptic();
            react(article.dataset.mensagemId, '❤️', false);
            lastTap = null;
        } else {
            lastTap = { article, time: now };

            if (event.target.matches('img.chat-imagem')) {
                const image = event.target;

                photoTimer = setTimeout(() => {
                    if (alive) onPhoto(image.src);
                }, 330);
            }
        }
    });

    on(content, 'pointercancel', () => {
        cancelGesture();
        lastTap = null;
    });

    on(window, 'pointerup', cancelGesture);

    on(list, 'scroll', () => {
        cancelGesture();
        lastTap = null;
    });

    on(content, 'contextmenu', (event) => {
        if (event.target.closest('.chat-balao')) event.preventDefault();
    });

    on(content, 'keydown', (event) => {
        if (
            event.target.closest('.chat-balao') &&
            (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey) || event.key === 'Enter')
        ) {
            if (event.target.closest('button,video,audio')) return;

            event.preventDefault();
            openMenu(event.target.closest('.chat-mensagem'));
        }
    });

    on(content, 'click', (event) => {
        const reaction = event.target.closest('[data-emoji]');

        if (reaction) {
            react(reaction.closest('.chat-mensagem').dataset.mensagemId, reaction.dataset.emoji);
        }
    });

    function openPicker() {
        closeMenu();
        emojiForm.reset();
        emojiError.textContent = '';
        picker.showModal();
        emojiInput.focus({ preventScroll: true });
    }

    on(emojiForm, 'submit', async (event) => {
        event.preventDefault();

        if (!selected || emojiSend.disabled) return;

        const article = selected;
        const emoji = emojiInput.value.trim();

        if (!emoji) {
            emojiError.textContent = 'Escolhe um emoji no teclado.';
            return;
        }

        emojiError.textContent = '';
        emojiSend.disabled = true;

        const sent = await react(article.dataset.mensagemId, emoji, true, (message) => {
            if (selected === article && picker.open) {
                emojiError.textContent = message;
            }
        });

        emojiSend.disabled = false;

        if (alive && sent && selected === article && picker.open) {
            picker.close();
        }
    });

    on(emojiInput, 'input', () => {
        emojiError.textContent = '';
    });

    on(menu, 'click', async (event) => {
        const button = event.target.closest('button');
        if (!button || !selected) return;

        const id = Number(selected.dataset.mensagemId);
        const action = button.dataset.action;

        if (button.dataset.emoji) {
            closeMenu();
            react(id, button.dataset.emoji);
        }

        if (action === 'all') openPicker();
        if (action === 'close') closeMenu();

        if (action === 'reply') {
            closeMenu();

            const media = selected.querySelector('audio,video,img');

            onReply({
                id,
                text: selected.querySelector('.chat-balao > p')?.textContent || '',
                type:
                    media?.tagName === 'AUDIO'
                        ? 'audio'
                        : media?.tagName === 'VIDEO'
                          ? 'video'
                          : media
                            ? 'imagem'
                            : 'texto'
            });
        }

        if (action === 'delete') {
            closeMenu();

            try {
                await request(new URLSearchParams({ action: 'delete_message', message_id: id }));

                if (alive) {
                    remove(id);
                    publish({ type: 'chat_delete', message_id: id });
                }
            } catch (error) {
                if (error.name !== 'AbortError') onError(error.message);
            }
        }
    });

    on(picker, 'click', (event) => {
        if (event.target.closest('[data-close]')) picker.close();
    });

    [menu, picker].forEach((dialog) => {
        on(dialog, 'click', (event) => {
            if (event.target === dialog) {
                const rect = dialog.getBoundingClientRect();

                if (
                    event.clientX < rect.left ||
                    event.clientX > rect.right ||
                    event.clientY < rect.top ||
                    event.clientY > rect.bottom
                ) {
                    dialog.close();
                }
            }
        });
    });

    return {
        render,

        receive(data) {
            if (data.deleted) {
                remove(data.message_id);
            } else {
                render(find(data.message_id), data.reactions || []);
            }
        },

        destroy() {
            alive = false;
            clearTimeout(photoTimer);
            cancelGesture();
            events.abort();
            closeMenu();

            if (picker.open) picker.close();
        }
    };
};