/* Pinça e arrasto acompanham os dedos; o duplo toque e a troca de foto animam. */
window.MargotPhotoGestures = function (surface, image, onSwipe = () => {}) {
    const events = new AbortController();
    const points = new Map();
    const reduced = () => window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    let scale = 1;
    let x = 0;
    let y = 0;
    let start = null;
    let moved = false;
    let pinched = false;
    let changing = false;
    let destroyed = false;
    let blockedClickUntil = 0;
    let animation = null;
    let generation = 0;

    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

    const on = (name, handler, options = {}) => {
        surface.addEventListener(name, handler, {
            ...options,
            signal: events.signal
        });
    };

    surface.dataset.margotNoBackSwipe = '';
    surface.style.touchAction = 'none';
    image.style.transformOrigin = 'center';

    function transform() {
        return `translate(${x}px, ${y}px) scale(${scale})`;
    }

    function draw(smooth = false, dragging = false) {
        if (!dragging) {
            x = clamp(x, image.clientWidth * (scale - 1) / 2);
            y = clamp(y, image.clientHeight * (scale - 1) / 2);
        }

        image.style.transition = smooth && !reduced()
            ? 'transform 280ms cubic-bezier(.2,.8,.2,1)'
            : 'none';

        image.style.transform = transform();
    }

    function reset(smooth = false) {
        generation++;
        animation?.cancel();
        animation = null;
        changing = false;
        points.clear();
        start = null;
        scale = 1;
        x = y = 0;
        draw(smooth);
    }

    function snapshot() {
        const [a, b = a] = [...points.values()];

        if (!a) {
            start = null;
            return;
        }

        const rect = image.getBoundingClientRect();

        start = {
            cx: (a.x + b.x) / 2,
            cy: (a.y + b.y) / 2,
            centerX: rect.left + rect.width / 2 - x,
            centerY: rect.top + rect.height / 2 - y,
            distance: Math.hypot(b.x - a.x, b.y - a.y),
            x,
            y,
            scale,
            count: points.size,
            time: performance.now()
        };
    }

    on('pointerdown', (event) => {
        if (changing || event.button !== 0 || event.target.closest('button,a')) {
            return;
        }

        if (!points.size) {
            moved = false;
            pinched = false;
        }

        points.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY
        });

        pinched ||= points.size > 1;
        surface.setPointerCapture?.(event.pointerId);
        image.style.transition = 'none';
        snapshot();
    });

    on('pointermove', (event) => {
        if (!points.has(event.pointerId) || !start) return;

        points.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY
        });

        const [a, b = a] = [...points.values()];
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const dx = cx - start.cx;
        const dy = cy - start.cy;

        moved ||= Math.hypot(dx, dy) > 8 || points.size > 1;

        if (points.size > 1 && start.distance) {
            scale = Math.max(
                1,
                Math.min(
                    4,
                    start.scale *
                    Math.hypot(b.x - a.x, b.y - a.y) /
                    start.distance
                )
            );

            const ratio = scale / start.scale;

            x = start.x + dx +
                (start.cx - start.centerX - start.x) * (1 - ratio);

            y = start.y + dy +
                (start.cy - start.centerY - start.y) * (1 - ratio);

            draw();
        } else if (scale > 1) {
            x = start.x + dx;
            y = start.y + dy;
            draw();
        } else if (Math.abs(dx) > Math.abs(dy)) {
            x = dx;
            y = 0;
            draw(false, true);
        }

        event.preventDefault();
    });

    function end(event) {
        if (!points.has(event.pointerId)) return;

        const origin = start;

        if (moved) blockedClickUntil = performance.now() + 350;

        points.delete(event.pointerId);

        if (points.size) {
            snapshot();
            return;
        }

        start = null;

        if (
            event.type !== 'pointercancel' &&
            !pinched &&
            origin &&
            scale === 1
        ) {
            const dx = event.clientX - origin.cx;
            const dy = event.clientY - origin.cy;
            const speed = Math.abs(dx) / Math.max(
                1,
                performance.now() - origin.time
            );

            const distanceEnough = Math.abs(dx) > 60;
            const fastEnough = Math.abs(dx) > 25 && speed > 0.45;
            const horizontal = Math.abs(dx) > Math.abs(dy) * 1.3;

            if ((distanceEnough || fastEnough) && horizontal) {
                onSwipe(dx < 0 ? 1 : -1);
            }
        }

        if (!changing) draw(true);
    }

    on('pointerup', end);
    on('pointercancel', end);

    on('click', (event) => {
        if (performance.now() < blockedClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, { capture: true });

    on('dblclick', (event) => {
        if (changing || event.target.closest('button,a')) return;

        event.preventDefault();

        const rect = image.getBoundingClientRect();

        if (scale > 1) {
            scale = 1;
            x = y = 0;
        } else {
            scale = 2.5;
            x = (event.clientX - rect.left - rect.width / 2) * (1 - scale);
            y = (event.clientY - rect.top - rect.height / 2) * (1 - scale);
        }

        draw(true);
    });

    on('wheel', (event) => {
        if (changing) return;

        event.preventDefault();
        scale = Math.max(1, Math.min(4, scale - event.deltaY * 0.005));
        draw(true);
    }, { passive: false });

    async function changePhoto(update, direction) {
        if (changing || destroyed) return;

        changing = true;
        const current = ++generation;

        points.clear();
        start = null;

        const distance = Math.max(image.clientWidth, 300) + 24;

        const animate = async (from, to, duration) => {
            if (reduced() || !image.animate) return;

            animation = image.animate(
                [{ transform: from }, { transform: to }],
                {
                    duration,
                    easing: 'cubic-bezier(.2,.8,.2,1)',
                    fill: 'forwards'
                }
            );

            await animation.finished.catch(() => {});
        };

        await animate(
            transform(),
            `translate(${-direction * distance}px,0) scale(1)`,
            160
        );

        if (destroyed || current !== generation) return;

        update();
        scale = 1;
        x = y = 0;
        draw();
        animation?.cancel();

        await animate(
            `translate(${direction * distance}px,0) scale(1)`,
            transform(),
            240
        );

        if (current !== generation) return;

        animation?.cancel();
        animation = null;
        changing = false;
    }

    return {
        reset,
        changePhoto,

        destroy() {
            destroyed = true;
            events.abort();
            reset();
        }
    };
};

window.MargotPhotoViewer = function () {
    const dialog = document.createElement('dialog');
    dialog.className = 'photo-viewer';
    dialog.setAttribute(
        'aria-label',
        'Fotografia. Usa dois dedos para ampliar.'
    );

    const stage = document.createElement('div');
    stage.className = 'photo-viewer-stage';

    const image = document.createElement('img');
    image.alt = 'Fotografia';
    image.draggable = false;

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar fotografia');

    stage.append(image);
    dialog.append(stage, close);
    document.body.append(dialog);

    const gestures = window.MargotPhotoGestures(stage, image);
    let release = null;

    function clear() {
        gestures.reset();
        image.removeAttribute('src');
        release?.();
        release = null;
    }

    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', clear);

    return {
        open(src, onClose) {
            clear();
            release = onClose;
            image.src = src;

            if (!dialog.open) dialog.showModal();

            close.focus({ preventScroll: true });
        },

        close() {
            if (dialog.open) dialog.close();
            clear();
        },

        destroy() {
            clear();
            gestures.destroy();
            dialog.remove();
        }
    };
};