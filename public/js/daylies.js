(() => {
    'use strict';

    if (window.MargotDaylies) return;

    const root = (window.todayUrl || '/today/').replace(/today\/?$/, '');
    const viewer = document.getElementById('daylie-viewer');
    const draft = document.getElementById('daylie-draft');
    const stage = viewer.querySelector('.daylie-stage');
    const progress = viewer.querySelector('.daylie-progress');
    const cameraDialog = document.getElementById('daylie-camera');

    let camera,
        draftFile,
        draftUrl,
        items = [],
        position = 0,
        owner = false,
        member;

    let frame = 0,
        elapsed = 0,
        lastTime = 0,
        paused = false,
        held = false,
        ready = false;

    let loadVersion = 0,
        miniVersion = 0,
        publishing = false,
        previousFocus;

    // Reutiliza o mesmo elemento de vídeo entre Daylies.
    const player = document.createElement('video');

    let mediaVersion = 0,
        playAttempt = 0,
        mediaEvents,
        loadingTimer = 0;

    let profileVersion = 0,
        draftVersion = 0,
        nextImage;

    const listings = new Map();

    const words = (pt, en) => (
        window.MargotI18n?.language ||
        (/^pt\b/i.test(navigator.language) ? 'pt' : 'en')
    ) === 'pt' ? pt : en;

    function statusPanel(container) {
        const panel = document.createElement('div');
        panel.className = 'daylie-loading';
        panel.hidden = true;
        panel.setAttribute('role', 'status');
        panel.setAttribute('aria-live', 'polite');

        const label = document.createElement('span');
        const action = document.createElement('button');

        action.type = 'button';
        action.hidden = true;

        panel.append(label, action);
        container.append(panel);

        return { panel, label, action };
    }

    const loading = statusPanel(viewer);
    const draftLoading = statusPanel(draft);

    // A navegação fica nos gestos, sem os botões inferiores.
    viewer.querySelectorAll(
        '[data-daylie-prev], [data-daylie-next], [data-daylie-pause]'
    ).forEach(button => button.remove());

    viewer.setAttribute('tabindex', '-1');

    const help = document.createElement('p');
    help.id = 'daylie-gesture-help';
    help.className = 'daylie-screen-reader';
    help.textContent = words(
        'Toca nos lados para mudar. Mantém premido para pausar. Desliza para baixo para fechar. No teclado: setas, espaço e Escape.',
        'Tap either side to navigate. Hold to pause. Swipe down to close. Keyboard: arrows, space and Escape.'
    );

    viewer.append(help);
    viewer.setAttribute('aria-describedby', help.id);

    function busy(panel, message, action) {
        panel.panel.hidden = !message;
        panel.panel.classList.toggle('has-action', Boolean(action));
        panel.label.textContent = message || '';
        panel.action.hidden = !action;
        panel.action.textContent = words(
            'Tocar para continuar',
            'Tap to continue'
        );
        panel.action.onclick = action || null;
    }

    function setLoading(value) {
        clearTimeout(loadingTimer);
        viewer.setAttribute('aria-busy', String(value));

        busy(
            loading,
            value ? words('A carregar Daylie…', 'Loading Daylie…') : ''
        );

        if (value) {
            loadingTimer = setTimeout(() => {
                if (!viewer.open) return;

                busy(
                    loading,
                    words(
                        'Está a demorar mais do que o habitual.',
                        'This is taking longer than usual.'
                    ),
                    () => {
                        if (items[position]) showItem();
                        else open(member);
                    }
                );
            }, 15000);
        }
    }

    function remember(id, data) {
        listings.delete(id);
        listings.set(id, { data, time: Date.now() });

        if (listings.size > 8) {
            listings.delete(listings.keys().next().value);
        }

        return data;
    }

    function decorateEntry(button) {
        button.classList.add('daylie-entry-refined');

        if (button.matches('[data-daylies-profile]')) {
            const photo = document.querySelector(
                '#perfil .perfil-foto-area'
            );

            if (photo && button.parentElement !== photo) {
                photo.append(button);
            }
        }

        if (button.matches('[data-daylies-mini]')) {
            const menu = button.closest('.mini-menu');
            const header = menu?.querySelector(':scope > header');

            if (!header) return;

            let slot = menu.querySelector('.mini-menu-daylies-slot');

            if (!slot) {
                slot = document.createElement('section');
                slot.className = 'mini-menu-daylies-slot';
                slot.append(button);
            }

            header.after(slot);
            slot.hidden = button.hidden;
        }
    }

    async function request(path, options = {}) {
        const response = await fetch(root + path, {
            credentials: 'same-origin',
            ...options
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                'Não foi possível carregar. Tenta novamente.'
            );
        }

        return data;
    }

    function celebrate(text) {
        document.querySelector('.today-celebration')?.remove();

        const toast = document.createElement('div');
        toast.className = 'today-celebration';
        toast.setAttribute('role', 'status');
        toast.textContent = text;

        document.body.append(toast);
        window.MargotHaptics?.feedback('interaction');

        setTimeout(() => toast.remove(), 1700);
    }

    function error(target, text = '') {
        target.querySelector('.daylie-error').textContent = text;
    }

    function mediaNode(item, url) {
        const node = document.createElement(
            item.tipo === 'video' ? 'video' : 'img'
        );

        if (node.tagName === 'VIDEO') {
            node.playsInline = true;
            node.preload = 'auto';
            node.setAttribute('playsinline', '');
            node.setAttribute('webkit-playsinline', '');
        } else {
            node.alt = item.legenda || 'Daylie';
        }

        node.src = url;
        return node;
    }

    function stopMedia(container) {
        container.querySelectorAll('video').forEach(video => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        });

        container.replaceChildren();
    }

    function closeViewer() {
        cancelAnimationFrame(frame);
        clearTimeout(loadingTimer);

        loadVersion++;
        mediaVersion++;
        playAttempt++;

        mediaEvents?.abort();
        nextImage = null;

        stopMedia(stage);

        items = [];
        ready = false;
        setLoading(false);

        if (viewer.open) viewer.close();

        if (previousFocus?.isConnected) {
            previousFocus.focus({ preventScroll: true });
        }
    }

    function advance(delta) {
        if (!items.length) return;

        if (position + delta < 0) {
            setPaused(false);
            return;
        }

        if (position + delta >= items.length) {
            closeViewer();
            return;
        }

        position += delta;
        showItem();
    }

    function playVideo(video) {
        const version = mediaVersion;
        const attempt = ++playAttempt;

        // Pede reprodução imediatamente, sem esperar por loadeddata.
        video.muted = false;
        video.defaultMuted = false;

        const result = video.play();

        result?.catch(failure => {
            if (
                version !== mediaVersion ||
                attempt !== playAttempt ||
                !viewer.open ||
                paused ||
                held ||
                document.hidden
            ) {
                return;
            }

            if (failure.name === 'AbortError') return;

            paused = true;
            setLoading(false);

            if (failure.name === 'NotAllowedError') {
                busy(
                    loading,
                    words(
                        'Toca para ver com som',
                        'Tap to watch with sound'
                    ),
                    () => {
                        setLoading(true);
                        setPaused(false);
                    }
                );
            } else {
                error(
                    viewer,
                    words(
                        'Não foi possível reproduzir este vídeo.',
                        'This video could not be played.'
                    )
                );

                busy(
                    loading,
                    words(
                        'Tenta carregar novamente.',
                        'Try loading again.'
                    ),
                    showItem
                );
            }
        });
    }

    function setPaused(value) {
        paused = value;

        const video = stage.querySelector('video');
        if (!video) return;

        if (paused || held || document.hidden) {
            playAttempt++;
            video.pause();
        } else {
            playVideo(video);
        }
    }

    function tick(now) {
        if (!viewer.open) return;

        const video = stage.querySelector('video');
        const running = ready && !paused && !held && !document.hidden;

        if (running) {
            elapsed += Math.min(100, now - (lastTime || now));
        }

        lastTime = now;

        const ratio = video
            ? video.currentTime / (video.duration || 1)
            : elapsed / 6000;

        progress.children[position]?.firstElementChild.style.setProperty(
            'transform',
            `scaleX(${Math.min(1, ratio)})`
        );

        if (running && !video && elapsed >= 6000) {
            advance(1);
            return;
        }

        frame = requestAnimationFrame(tick);
    }

    function showItem() {
        cancelAnimationFrame(frame);

        const version = ++mediaVersion;
        playAttempt++;

        mediaEvents?.abort();
        mediaEvents = new AbortController();

        stopMedia(stage);

        elapsed = lastTime = 0;
        ready = paused = held = false;

        const item = items[position];
        if (!item || !viewer.open) return;

        error(viewer);
        setLoading(true);

        viewer.querySelector('.daylie-caption').textContent =
            item.legenda || '';

        viewer.querySelector('[data-daylie-delete]').hidden = !owner;

        progress.replaceChildren(
            ...items.map((_, index) => {
                const bar = document.createElement('span');
                const fill = document.createElement('i');

                fill.style.transform =
                    `scaleX(${index < position ? 1 : 0})`;

                bar.append(fill);
                return bar;
            })
        );

        const isVideo = item.tipo === 'video';

        const prepared = !isVideo && nextImage?.id === item.id
            ? nextImage.node
            : null;

        const node = isVideo
            ? player
            : (prepared || document.createElement('img'));

        const active = () =>
            viewer.open && version === mediaVersion;

        const listen = (type, fn) => {
            node.addEventListener(
                type,
                () => {
                    if (active()) fn();
                },
                { signal: mediaEvents.signal }
            );
        };

        const display = () => {
            ready = true;
            node.classList.add('daylie-media-ready');

            // Não esconde o pedido de toque se o som foi bloqueado.
            if (
                !paused ||
                !loading.panel.classList.contains('has-action')
            ) {
                setLoading(false);
            }

            const next = items[position + 1];

            if (next && next.tipo !== 'video' && !nextImage) {
                const image = new Image();

                nextImage = {
                    id: next.id,
                    node: image
                };

                image.src = root + 'daylie-media/' + next.id;
            }
        };

        nextImage = null;
        node.classList.remove('daylie-media-ready');

        listen('error', () => {
            paused = true;
            setLoading(false);

            error(
                viewer,
                words(
                    'Não foi possível carregar este Daylie. Pode ter expirado ou a ligação ter falhado.',
                    'This Daylie could not be loaded. It may have expired or the connection failed.'
                )
            );
        });

        if (isVideo) {
            node.playsInline = true;
            node.setAttribute('playsinline', '');
            node.setAttribute('webkit-playsinline', '');
            node.preload = 'auto';
            node.controls = false;
            node.loop = false;

            listen('loadeddata', display);

            listen('playing', () => {
                if (paused || held || document.hidden) {
                    node.pause();
                    return;
                }

                display();
                setLoading(false);
            });

            listen('waiting', () => {
                if (!paused && !held) setLoading(true);
            });

            listen('ended', () => {
                if (!held && !paused) advance(1);
            });
        } else {
            node.alt = item.legenda || 'Daylie';
            node.decoding = 'async';

            listen('load', display);
        }

        // Os eventos ficam registados antes de atribuir a origem.
        stage.append(node);

        if (!prepared || (node.complete && !node.naturalWidth)) {
            node.src = root + 'daylie-media/' + item.id;
        }

        if (isVideo) {
            setPaused(false);
        } else if (node.complete && node.naturalWidth) {
            display();
        }

        frame = requestAnimationFrame(tick);
    }

    async function open(memberId) {
        const wasOpen = viewer.open;

        if (wasOpen) closeViewer();

        const version = ++loadVersion;

        if (!wasOpen) {
            previousFocus = document.activeElement;
        }

        member = memberId;
        items = [];
        position = 0;

        error(viewer);

        viewer.querySelector('.daylie-caption').textContent = '';
        viewer.querySelector('[data-daylie-delete]').hidden = true;

        progress.replaceChildren();

        viewer.showModal();
        viewer.focus({ preventScroll: true });
        setLoading(true);

        try {
            const cached = listings.get(memberId);

            // Reutiliza brevemente a lista que mostrou o botão.
            // O acesso ao ficheiro continua a ser validado pelo servidor.
            const data = cached && Date.now() - cached.time < 15000
                ? cached.data
                : await request(
                    'daylies/' + encodeURIComponent(memberId)
                );

            if (version !== loadVersion || !viewer.open) return;

            items = data.daylies;
            owner = data.owner;

            if (!items.length) {
                closeViewer();

                window.mostrarMensagemTemporaria?.(
                    'Ainda não há Daylies.',
                    'info'
                );

                return;
            }

            showItem();
        } catch (failure) {
            if (version !== loadVersion || !viewer.open) return;

            setLoading(false);
            error(viewer, failure.message);

            busy(
                loading,
                words(
                    'Não foi possível abrir os Daylies.',
                    'Daylies could not be opened.'
                ),
                () => open(memberId)
            );
        }
    }

    async function refreshMini(memberId) {
        const version = ++miniVersion;
        const button = document.querySelector('[data-daylies-mini]');

        if (!button) return;

        button.hidden = true;
        decorateEntry(button);

        try {
            const data = await request(
                'daylies/' + encodeURIComponent(memberId)
            );

            if (
                version !== miniVersion ||
                !button.isConnected
            ) {
                return;
            }

            remember(memberId, data);

            button.hidden = !data.daylies.length;
            decorateEntry(button);
            button.onclick = () => open(memberId);
        } catch {
            // Um perfil sem acesso não apresenta Daylies.
        }
    }

    async function refreshProfile() {
        const version = ++profileVersion;

        const buttons = [
            ...document.querySelectorAll(
                '[data-daylies-profile], [data-daylies-own]'
            )
        ];

        if (!buttons.length || !window.perfilMembroId) return;

        const id = window.perfilMembroId;

        buttons.forEach(button => {
            button.hidden = true;
            decorateEntry(button);
        });

        try {
            const data = await request(
                'daylies/' + encodeURIComponent(id)
            );

            if (
                version !== profileVersion ||
                id !== window.perfilMembroId
            ) {
                return;
            }

            remember(id, data);

            buttons
                .filter(button => button.isConnected)
                .forEach(button => {
                    button.hidden = !data.daylies.length;
                    button.onclick = () => open(id);
                });
        } catch {
            // A página mantém as restantes funcionalidades.
        }
    }

    function clearDraft() {
        draftVersion++;
        busy(draftLoading, '');

        stopMedia(draft.querySelector('.daylie-draft-preview'));

        if (draftUrl) URL.revokeObjectURL(draftUrl);

        draftFile = draftUrl = null;

        if (draft.open) draft.close();
    }

    function review(file) {
        clearDraft();

        draftFile = file;
        draftUrl = URL.createObjectURL(file);

        const node = mediaNode(
            {
                tipo: file.type.startsWith('video/')
                    ? 'video'
                    : 'imagem'
            },
            draftUrl
        );

        const version = draftVersion;

        const loaded = () => {
            if (version === draftVersion) {
                busy(draftLoading, '');
            }
        };

        busy(
            draftLoading,
            words(
                'A preparar pré-visualização…',
                'Preparing preview…'
            )
        );

        node.addEventListener(
            node.tagName === 'VIDEO' ? 'loadeddata' : 'load',
            loaded,
            { once: true }
        );

        node.addEventListener('error', () => {
            if (version !== draftVersion) return;

            loaded();

            error(
                draft,
                words(
                    'Não foi possível pré-visualizar este ficheiro.',
                    'This file could not be previewed.'
                )
            );
        });

        if (node.tagName === 'VIDEO') {
            node.controls = true;
        } else if (node.complete && node.naturalWidth) {
            loaded();
        }

        draft.querySelector('.daylie-draft-preview').append(node);
        draft.querySelector('textarea').value = '';

        error(draft);
        draft.showModal();

        if (node.tagName === 'VIDEO') {
            node.muted = false;

            node.play()?.catch(() => {
                if (version === draftVersion) loaded();
            });
        }
    }

    function create() {
        if (publishing) return;

        if (!camera) {
            const gallery = document.createElement('input');
            gallery.type = 'file';
            gallery.accept = 'image/*,video/*';

            gallery.onchange = () => {
                const file = gallery.files[0];

                if (file) {
                    camera.close();
                    review(file);
                }

                gallery.value = '';
            };

            camera = window.MargotChatCamera({
                dialog: cameraDialog,
                allowViewOnce: false,
                onFile: review,
                onError: message =>
                    window.mostrarMensagemTemporaria?.(
                        String(message),
                        'erro'
                    ),
                gallery
            });
        }

        camera.open();
    }

    draft.querySelector('[data-draft-publish]').onclick = async () => {
        if (!draftFile || publishing) return;

        publishing = true;

        const buttons = draft.querySelectorAll('button');

        buttons.forEach(button => {
            button.disabled = true;
        });

        const publish = draft.querySelector('[data-draft-publish]');
        publish.textContent = 'A publicar…';

        error(draft);

        try {
            const form = new FormData();

            form.append('media', draftFile);
            form.append(
                'caption',
                draft.querySelector('textarea').value.trim()
            );

            await request('daylies/' + window.membroId, {
                method: 'POST',
                body: form
            });

            listings.delete(window.membroId);

            clearDraft();
            celebrate('O teu Daylie já está no ar!');
            refreshProfile();
        } catch (failure) {
            error(draft, failure.message);
        } finally {
            publishing = false;
            publish.textContent = 'Publicar Daylie';

            buttons.forEach(button => {
                button.disabled = false;
            });
        }
    };

    draft.querySelector('[data-draft-cancel]').onclick = clearDraft;

    draft.addEventListener('cancel', event => {
        event.preventDefault();

        if (!publishing) clearDraft();
    });

    viewer.querySelector('[data-daylie-close]').onclick = closeViewer;

    viewer.addEventListener('cancel', event => {
        event.preventDefault();
        closeViewer();
    });

    viewer.querySelector('[data-daylie-delete]').onclick = async () => {
        if (!owner || !items[position]) return;

        const wasPaused = paused;
        setPaused(true);

        if (!confirm('Apagar este Daylie?')) {
            setPaused(wasPaused);
            return;
        }

        const itemId = items[position].id;
        const version = loadVersion;
        const targetMember = member;
        const button = viewer.querySelector('[data-daylie-delete]');

        button.disabled = true;

        try {
            await request('daylies/' + itemId, {
                method: 'DELETE'
            });

            listings.delete(targetMember);

            if (version !== loadVersion || !viewer.open) return;

            const currentId = items[position]?.id;
            items = items.filter(item => item.id !== itemId);

            if (!items.length) {
                closeViewer();
            } else {
                const currentIndex = items.findIndex(
                    item => item.id === currentId
                );

                position = currentIndex < 0
                    ? Math.min(position, items.length - 1)
                    : currentIndex;

                showItem();
            }

            refreshProfile();
        } catch (failure) {
            if (version === loadVersion && viewer.open) {
                error(viewer, failure.message);
            }
        } finally {
            button.disabled = false;
        }
    };

    let pointerStart;

    stage.addEventListener('pointerdown', event => {
        if (
            !items.length ||
            event.isPrimary === false ||
            event.button > 0
        ) {
            return;
        }

        pointerStart = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now()
        };

        stage.setPointerCapture(event.pointerId);

        held = true;
        stage.querySelector('video')?.pause();
    });

    stage.addEventListener('pointerup', event => {
        held = false;

        if (!pointerStart) return;

        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;

        if (dy > 100 && Math.abs(dx) < 60) {
            closeViewer();
        } else if (Math.abs(dx) > 55) {
            advance(dx < 0 ? 1 : -1);
        } else if (
            paused &&
            loading.panel.classList.contains('has-action')
        ) {
            loading.action.click();
        } else if (Date.now() - pointerStart.time < 250) {
            advance(
                event.clientX <
                stage.getBoundingClientRect().left +
                stage.clientWidth / 3
                    ? -1
                    : 1
            );
        } else {
            setPaused(paused);
        }

        pointerStart = null;
    });

    stage.addEventListener('pointercancel', () => {
        held = false;
        pointerStart = null;
        setPaused(paused);
    });

    viewer.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            advance(1);
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            advance(-1);
        }

        if (
            event.code === 'Space' &&
            event.target.tagName !== 'BUTTON'
        ) {
            event.preventDefault();
            setPaused(!paused);
        }
    });

    document.addEventListener('click', event => {
        if (event.target.closest('[data-daylie-create]')) {
            create();
        }
    });

    let resumeOnVisible = false;

    document.addEventListener('visibilitychange', () => {
        if (!viewer.open) return;

        if (document.hidden) {
            resumeOnVisible = !paused;
            held = false;
            pointerStart = null;
            setPaused(true);
        } else if (resumeOnVisible) {
            resumeOnVisible = false;
            setPaused(false);
        }
    });

    document.addEventListener('margot:page-leave', () => {
        listings.clear();
        profileVersion++;
        miniVersion++;

        closeViewer();

        if (!publishing) clearDraft();

        camera?.close();
    });

    document.addEventListener(
        'margot:page-ready',
        refreshProfile
    );

    window.MargotDaylies = {
        open,
        refreshMini,
        refreshProfile,
        celebrate
    };

    refreshProfile();
})();