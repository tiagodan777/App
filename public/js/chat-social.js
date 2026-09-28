/* Respostas e seletor de reações, sem alterar o contrato da API do chat. */
window.MargotChatQuotes = function (content) {
    const me = String(window.membroId);
    const person = document.querySelector('.chat-pessoa strong')?.textContent.trim() || 'A outra pessoa';
    let alive = true;
    let queued = false;

    function refresh() {
        queued = false;
        if (!alive) return;
        observer.disconnect();

        for (const quote of content.querySelectorAll('.chat-quote')) {
            const article = quote.closest('.chat-mensagem');
            const bubble = article?.querySelector('.chat-balao');
            if (!bubble) continue;

            let wrap = article.querySelector('.chat-reply-context');

            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'chat-reply-context';

                const label = document.createElement('span');
                label.className = 'chat-reply-label';
                wrap.append(label);

                article.insertBefore(wrap, bubble);
                wrap.append(quote);
            }

            const id = Number(quote.dataset.replyId);
            const source = content.querySelector('[data-mensagem-id="' + id + '"]');
            const current = quote.textContent.trim();

            if (!quote.dataset.replyText || !quote.querySelector('.chat-reply-summary')) {
                quote.dataset.replyUnavailable = String(current === 'Mensagem indisponível');
                quote.dataset.replyText = current.replace(/^(Tu|Resposta) · /, '');
                quote.dataset.replyMine = String(current.startsWith('Tu · '));
            }

            const unavailable = quote.dataset.replyUnavailable === 'true';
            const mine = source ? source.dataset.emissorId === me : quote.dataset.replyMine === 'true';
            const sent = article.classList.contains('minha');

            wrap.querySelector('.chat-reply-label').textContent = unavailable
                ? 'Mensagem original indisponível'
                : sent
                  ? (mine ? 'Respondeste à tua mensagem' : 'Respondeste a ' + person)
                  : (mine ? person + ' respondeu-te' : person + ' respondeu à própria mensagem');

            quote.classList.toggle('chat-reply-own-source', mine);
            quote.disabled = unavailable;

            const originalBubble = source?.querySelector('.chat-balao');
            const once = originalBubble?.querySelector('.chat-once');

            const image = !unavailable && !once
                ? originalBubble?.querySelector('img.chat-imagem')
                : null;

            const video = !unavailable && !once
                ? originalBubble?.querySelector('video')
                : null;

            const audio = originalBubble?.querySelector('audio');

            const text = unavailable
                ? 'Mensagem indisponível'
                : once
                  ? 'Fotografia · Ver uma vez'
                  : originalBubble?.querySelector(':scope > p')?.textContent || quote.dataset.replyText;

            const mediaURL = image?.currentSrc || image?.src || video?.poster || '';
            const signature = JSON.stringify([
                text,
                mediaURL,
                Boolean(video),
                Boolean(audio),
                unavailable
            ]);

            if (quote.dataset.replySignature === signature) continue;
            quote.dataset.replySignature = signature;
            quote.replaceChildren();

            if (mediaURL) {
                const thumb = document.createElement('img');
                thumb.src = mediaURL;
                thumb.alt = '';
                thumb.loading = 'lazy';
                thumb.draggable = false;
                quote.append(thumb);
            }

            const summary = document.createElement('span');
            summary.className = 'chat-reply-summary';
            summary.textContent = (video ? '▶ ' : audio ? '♪ ' : '') + text;
            quote.append(summary);

            quote.setAttribute('aria-label', 'Ver mensagem original: ' + text);
        }

        observer.observe(content, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    const observer = new MutationObserver(() => {
        if (queued || !alive) return;
        queued = true;
        queueMicrotask(refresh);
    });

    refresh();

    return {
        destroy() {
            alive = false;
            observer.disconnect();
        }
    };
};

window.MargotEmojiPicker = function (dialog, onChoose) {
    const events = new AbortController();
    const signal = events.signal;
    const key = 'margot-reactions-v1-' + String(window.membroId);
    const defaults = ['❤️', '😂', '😮', '😢', '😡', '👍'];
    const tones = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];

    const normalize = (text) =>
        text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

    const groups = window.MargotEmojiData.map(([id, title, icon, data]) => ({
        id,
        title,
        icon,
        items: data.trim().split('\n').map((row) => {
            const [emoji, label, tone] = row.split('|');

            return {
                emoji,
                label,
                tone: tone === 'tone',
                search: normalize(label)
            };
        })
    }));

    const items = groups.flatMap((group) => group.items);
    const variants = new Map();

    const variant = (item, tone) => item.tone && tone
        ? item.emoji.replace(/^(\p{Extended_Pictographic})/u, '$1' + tone)
        : item.emoji;

    for (const item of items) {
        for (const tone of item.tone ? tones : ['']) {
            variants.set(variant(item, tone), item);
        }
    }

    let saved = {};

    try {
        saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch {}

    let presets = Array.isArray(saved.presets) &&
        saved.presets.length === 6 &&
        saved.presets.every((x) => variants.has(x))
        ? saved.presets
        : defaults;

    let recent = Array.isArray(saved.recent)
        ? saved.recent.filter((x) => variants.has(x)).slice(0, 24)
        : [];

    let tone = tones.includes(saved.tone) ? saved.tone : '';
    let category = 'recent';
    let editing = false;
    let slot = 0;
    let busy = false;
    let alive = true;
    let generation = 0;

    dialog.innerHTML = `
        <div class="emoji-grip" aria-hidden="true"></div>

        <header class="emoji-header">
            <strong>Reações</strong>
            <button type="button" data-close autofocus aria-label="Fechar reações">×</button>
        </header>

        <label class="emoji-search">
            <span aria-hidden="true">⌕</span>
            <input
                type="search"
                placeholder="Pesquisar emojis"
                aria-label="Pesquisar emojis"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
            >
        </label>

        <div class="emoji-tools">
            <strong>As tuas reações</strong>
            <button type="button" data-customize>Personalizar</button>
            <button type="button" data-tone aria-label="Mudar tom de pele">✋</button>
        </div>

        <div class="emoji-favorites" aria-label="Reações rápidas"></div>
        <p class="emoji-instruction" role="status" hidden></p>
        <div class="emoji-results" role="region" aria-label="Emojis"></div>
        <p class="emoji-error" role="alert" hidden></p>
        <nav class="emoji-categories" aria-label="Categorias de emojis"></nav>
    `;

    const search = dialog.querySelector('input');
    const results = dialog.querySelector('.emoji-results');
    const favorites = dialog.querySelector('.emoji-favorites');
    const errorBox = dialog.querySelector('.emoji-error');
    const instruction = dialog.querySelector('.emoji-instruction');
    const categories = dialog.querySelector('.emoji-categories');
    const customize = dialog.querySelector('[data-customize]');
    const toneButton = dialog.querySelector('[data-tone]');

    const on = (node, name, fn) =>
        node.addEventListener(name, fn, { signal });

    function persist() {
        try {
            localStorage.setItem(key, JSON.stringify({ presets, recent, tone }));
        } catch {}
    }

    function error(message) {
        if (!alive) return;
        errorBox.textContent = message || '';
        errorBox.hidden = !message;
    }

    function button(emoji, label) {
        const node = document.createElement('button');
        node.type = 'button';
        node.dataset.pick = emoji;
        node.textContent = emoji;
        node.setAttribute('aria-label', label || variants.get(emoji)?.label || emoji);
        return node;
    }

    function updatePresets() {
        const buttons = document.querySelectorAll(
            '#chat-actions .chat-reaction-presets [data-emoji]'
        );

        buttons.forEach((node, index) => {
            if (!presets[index]) return;

            node.dataset.emoji = presets[index];
            node.textContent = presets[index];

            node.setAttribute(
                'aria-label',
                'Reagir: ' + (variants.get(presets[index])?.label || presets[index])
            );
        });
    }

    function drawFavorites() {
        favorites.replaceChildren();

        presets.forEach((emoji, index) => {
            const node = button(emoji);
            node.dataset.slot = index;

            if (editing) {
                node.setAttribute('aria-pressed', String(index === slot));
            }

            favorites.append(node);
        });

        customize.textContent = editing ? 'Concluir' : 'Personalizar';
        instruction.hidden = !editing;
        instruction.textContent = 'Escolhe a posição acima e depois o emoji que a substitui.';
        toneButton.textContent = '✋' + tone;

        toneButton.setAttribute(
            'aria-label',
            'Mudar tom de pele, opção ' + (tones.indexOf(tone) + 1) + ' de 6'
        );
    }

    function section(title, values) {
        if (!values.length) return;

        const heading = document.createElement('h3');
        heading.textContent = title;

        const grid = document.createElement('div');
        grid.className = 'emoji-grid';

        for (const value of values) {
            const emoji = typeof value === 'string'
                ? value
                : variant(value, tone);

            grid.append(
                button(emoji, typeof value === 'string' ? undefined : value.label)
            );
        }

        results.append(heading, grid);
    }

    function draw() {
        results.replaceChildren();

        const rawQuery = search.value.trim();
        const query = normalize(rawQuery);

        if (query) {
            const matches = variants.has(rawQuery)
                ? [rawQuery]
                : items.filter((item) =>
                    query.split(/\s+/).every((term) => item.search.includes(term))
                );

            section('Resultados', matches);

            if (!matches.length) {
                const empty = document.createElement('p');
                empty.textContent = 'Sem resultados. Experimenta «amor», «rir» ou «gato».';
                results.append(empty);
            }
        } else if (category === 'recent') {
            section('Recentes', recent);
            section('Caras e pessoas', groups[0].items);
        } else {
            const group = groups.find((item) => item.id === category);
            section(group.title, group.items);
        }

        results.scrollTop = 0;

        categories.querySelectorAll('button').forEach((node) => {
            node.setAttribute(
                'aria-pressed',
                String(!query && node.dataset.category === category)
            );
        });
    }

    for (const group of [
        { id: 'recent', title: 'Recentes', icon: '◷' },
        ...groups
    ]) {
        const node = document.createElement('button');
        node.type = 'button';
        node.dataset.category = group.id;
        node.textContent = group.icon;
        node.setAttribute('aria-label', group.title);
        categories.append(node);
    }

    on(search, 'input', draw);

    on(customize, 'click', () => {
        if (busy) return;
        editing = !editing;
        error('');
        drawFavorites();
    });

    on(toneButton, 'click', () => {
        tone = tones[(tones.indexOf(tone) + 1) % tones.length];
        persist();
        drawFavorites();
        draw();
    });

    on(categories, 'click', (event) => {
        const node = event.target.closest('[data-category]');
        if (!node) return;

        category = node.dataset.category;
        search.value = '';
        search.blur();
        draw();
    });

    on(dialog, 'click', async (event) => {
        const node = event.target.closest('[data-pick]');
        if (!node || busy) return;

        const emoji = node.dataset.pick;

        if (editing) {
            if (node.dataset.slot !== undefined) {
                slot = Number(node.dataset.slot);
            } else {
                presets[slot] = emoji;
                persist();
                updatePresets();
            }

            drawFavorites();
            return;
        }

        busy = true;
        error('');
        dialog.setAttribute('aria-busy', 'true');

        const current = generation;

        try {
            const sent = await onChoose(emoji, (message) => {
                if (alive && current === generation) error(message);
            });

            if (alive && current === generation && sent && dialog.open) {
                dialog.close();
            }
        } catch {
            if (alive && current === generation) {
                error('Não foi possível enviar a reação. Tenta novamente.');
            }
        } finally {
            if (alive && current === generation) {
                busy = false;
                dialog.removeAttribute('aria-busy');
            }
        }
    });

    on(dialog, 'close', () => {
        generation++;
        busy = false;
        dialog.removeAttribute('aria-busy');
    });

    updatePresets();

    return {
        error,
        updatePresets,

        remember(emoji) {
            if (!variants.has(emoji)) return;
            recent = [emoji, ...recent.filter((value) => value !== emoji)].slice(0, 24);
            persist();
        },

        open() {
            generation++;
            busy = false;
            editing = false;
            category = 'recent';
            search.value = '';

            error('');
            drawFavorites();
            draw();

            dialog.showModal();
            dialog.querySelector('[data-close]').focus({ preventScroll: true });
        },

        destroy() {
            alive = false;
            generation++;
            events.abort();
        }
    };
};