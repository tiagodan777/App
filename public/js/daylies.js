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

    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    async function request(path, options = {}) {
        const response = await fetch(root + path, {
            credentials: 'same-origin',
            ...options
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message || 'Não foi possível carregar. Tenta novamente.'
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
            node.preload = 'metadata';
        } else {
            node.alt = item.legenda || 'Daylie';
        }

        node.src = url;
        return node;
    }

    function stopMedia(container) {
        container.querySelectorAll('video').forEach((video) => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        });

        container.replaceChildren();
    }

    function closeViewer() {
        cancelAnimationFrame(frame);
        loadVersion++;
        stopMedia(stage);

        if (viewer.open) viewer.close();
        previousFocus?.focus({ preventScroll: true });
    }

    function advance(delta) {
        if (position + delta < 0) return;

        if (position + delta >= items.length) {
            closeViewer();
            return;
        }

        position += delta;
        showItem();
    }

    function setPaused(value) {
        paused = value;

        viewer.querySelector('[data-daylie-pause]').textContent =
            paused ? 'Continuar' : 'Pausar';

        const video = stage.querySelector('video');

        if (video) {
            if (paused || held || document.hidden) {
                video.pause();
            } else {
                video.play().catch(() => {
                    paused = true;
                    viewer.querySelector('[data-daylie-pause]').textContent =
                        'Reproduzir';
                });
            }
        }
    }

    function tick(now) {
        if (!viewer.open) return;

        const video = stage.querySelector('video');
        const running = ready && !paused && !held && !document.hidden;

        if (running) elapsed += Math.min(100, now - (lastTime || now));
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
        stopMedia(stage);

        elapsed = lastTime = 0;
        ready = paused = held = false;

        const item = items[position];

        error(viewer);
        viewer.querySelector('.daylie-caption').textContent = item.legenda;
        viewer.querySelector('[data-daylie-delete]').hidden = !owner;
        viewer.querySelector('[data-daylie-prev]').disabled = position === 0;

        progress.replaceChildren(
            ...items.map((_, index) => {
                const bar = document.createElement('span');
                const fill = document.createElement('i');

                fill.style.transform = `scaleX(${index < position ? 1 : 0})`;
                bar.append(fill);

                return bar;
            })
        );

        const node = mediaNode(item, root + 'daylie-media/' + item.id);

        node.addEventListener('error', () => {
            paused = true;
            error(viewer, 'Este Daylie já não está disponível.');
        });

        if (item.tipo === 'video') {
            node.addEventListener(
                'loadeddata',
                () => {
                    ready = true;
                    setPaused(false);
                },
                { once: true }
            );

            node.addEventListener('ended', () => advance(1));
        } else {
            node.addEventListener(
                'load',
                () => {
                    ready = true;
                },
                { once: true }
            );
        }

        stage.append(node);
        viewer.querySelector('[data-daylie-pause]').textContent = 'Pausar';

        if (!reduced()) {
            node.animate(
                [
                    { opacity: 0.3, transform: 'scale(.99)' },
                    { opacity: 1, transform: 'scale(1)' }
                ],
                { duration: 180 }
            );
        }

        frame = requestAnimationFrame(tick);
    }

    async function open(memberId) {
        const version = ++loadVersion;

        previousFocus = document.activeElement;
        member = memberId;

        try {
            const data = await request(
                'daylies/' + encodeURIComponent(memberId)
            );

            if (version !== loadVersion) return;

            items = data.daylies;
            owner = data.owner;

            if (!items.length) {
                window.mostrarMensagemTemporaria?.(
                    'Ainda não há Daylies.',
                    'info'
                );
                return;
            }

            position = 0;
            viewer.showModal();
            showItem();
        } catch (failure) {
            window.mostrarMensagemTemporaria?.(failure.message, 'erro');
        }
    }

    async function refreshMini(memberId) {
        const version = ++miniVersion;
        const button = document.querySelector('[data-daylies-mini]');

        if (!button) return;
        button.hidden = true;

        try {
            const data = await request(
                'daylies/' + encodeURIComponent(memberId)
            );

            if (version !== miniVersion || !button.isConnected) return;

            button.hidden = !data.daylies.length;
            button.onclick = () => open(memberId);
        } catch {
            /* Um perfil sem acesso não apresenta Daylies. */
        }
    }

    async function refreshProfile() {
        const buttons = [
            ...document.querySelectorAll(
                '[data-daylies-profile], [data-daylies-own]'
            )
        ];

        if (!buttons.length || !window.perfilMembroId) return;

        const id = window.perfilMembroId;

        buttons.forEach((button) => {
            button.hidden = true;
        });

        try {
            const data = await request('daylies/' + encodeURIComponent(id));

            buttons
                .filter((button) => button.isConnected)
                .forEach((button) => {
                    button.hidden = !data.daylies.length;
                    button.onclick = () => open(id);
                });
        } catch {
            /* A página mantém as restantes funcionalidades. */
        }
    }

    function clearDraft() {
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
            { tipo: file.type.startsWith('video/') ? 'video' : 'imagem' },
            draftUrl
        );

        if (node.tagName === 'VIDEO') node.controls = true;

        draft.querySelector('.daylie-draft-preview').append(node);
        draft.querySelector('textarea').value = '';

        error(draft);
        draft.showModal();
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
                onError: (message) =>
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

        buttons.forEach((button) => {
            button.disabled = true;
        });

        const publish = draft.querySelector('[data-draft-publish]');
        publish.textContent = 'A publicar…';
        error(draft);

        try {
            const form = new FormData();
            form.append('media', draftFile);
            form.append('caption', draft.querySelector('textarea').value.trim());

            await request('daylies/' + window.membroId, {
                method: 'POST',
                body: form
            });

            clearDraft();
            celebrate('O teu Daylie já está no ar!');
            refreshProfile();
        } catch (failure) {
            error(draft, failure.message);
        } finally {
            publishing = false;
            publish.textContent = 'Publicar Daylie';

            buttons.forEach((button) => {
                button.disabled = false;
            });
        }
    };

    draft.querySelector('[data-draft-cancel]').onclick = clearDraft;

    draft.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (!publishing) clearDraft();
    });

    viewer.querySelector('[data-daylie-close]').onclick = closeViewer;

    viewer.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeViewer();
    });

    viewer.querySelector('[data-daylie-prev]').onclick = () => advance(-1);
    viewer.querySelector('[data-daylie-next]').onclick = () => advance(1);
    viewer.querySelector('[data-daylie-pause]').onclick =
        () => setPaused(!paused);

    viewer.querySelector('[data-daylie-delete]').onclick = async () => {
        setPaused(true);
        if (!confirm('Apagar este Daylie?')) return;

        try {
            await request('daylies/' + items[position].id, {
                method: 'DELETE'
            });

            items.splice(position, 1);

            if (!items.length) {
                closeViewer();
            } else {
                position = Math.min(position, items.length - 1);
                showItem();
            }

            refreshProfile();
        } catch (failure) {
            error(viewer, failure.message);
        }
    };

    let pointerStart;

    stage.addEventListener('pointerdown', (event) => {
        pointerStart = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now()
        };

        stage.setPointerCapture(event.pointerId);
        held = true;
        stage.querySelector('video')?.pause();
    });

    stage.addEventListener('pointerup', (event) => {
        held = false;
        if (!pointerStart) return;

        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;

        if (dy > 100 && Math.abs(dx) < 60) {
            closeViewer();
        } else if (Math.abs(dx) > 55) {
            advance(dx < 0 ? 1 : -1);
        } else if (Date.now() - pointerStart.time < 250) {
            advance(
                event.clientX <
                stage.getBoundingClientRect().left + stage.clientWidth / 3
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

    viewer.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') advance(1);
        if (event.key === 'ArrowLeft') advance(-1);
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('[data-daylie-create]')) create();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && viewer.open) setPaused(true);
    });

    document.addEventListener('margot:page-leave', () => {
        closeViewer();
        if (!publishing) clearDraft();
        camera?.close();
    });

    document.addEventListener('margot:page-ready', refreshProfile);

    window.MargotDaylies = {
        open,
        refreshMini,
        refreshProfile,
        celebrate
    };

    refreshProfile();
})();