/* Gestos partilhados pelas fotografias do chat e pelo visor do perfil. */
window.MargotPhotoGestures = function (surface, image, onSwipe = () => {}) {
    const events = new AbortController();
    const points = new Map();

    let scale = 1,
        x = 0,
        y = 0,
        start,
        moved = false,
        blockedClickUntil = 0;

    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
    const on = (name, handler, options = {}) =>
        surface.addEventListener(name, handler, { ...options, signal: events.signal });

    surface.dataset.margotNoBackSwipe = '';
    surface.style.touchAction = 'none';
    image.style.transformOrigin = 'center';
    image.style.transition = 'none';

    function draw() {
        const width = image.clientWidth,
            height = image.clientHeight;

        x = clamp(x, (width * (scale - 1)) / 2);
        y = clamp(y, (height * (scale - 1)) / 2);
        image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }

    function reset() {
        scale = 1;
        x = y = 0;
        points.clear();
        start = null;
        draw();
    }

    function snapshot() {
        const values = [...points.values()];

        if (!values.length) {
            start = null;
            return;
        }

        const [a, b = a] = values;
        start = {
            cx: (a.x + b.x) / 2,
            cy: (a.y + b.y) / 2,
            distance: Math.hypot(b.x - a.x, b.y - a.y),
            x,
            y,
            scale,
            count: values.length
        };
    }

    on('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button,a')) return;

        if (!points.size) moved = false;
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        surface.setPointerCapture?.(event.pointerId);
        snapshot();
    });

    on('pointermove', (event) => {
        if (!points.has(event.pointerId) || !start) return;

        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const [a, b = a] = [...points.values()];
        const cx = (a.x + b.x) / 2,
            cy = (a.y + b.y) / 2;
        const dx = cx - start.cx,
            dy = cy - start.cy;

        moved ||= Math.hypot(dx, dy) > 8 || points.size > 1;

        if (points.size > 1 && start.distance) {
            scale = Math.max(
                1,
                Math.min(4, (start.scale * Math.hypot(b.x - a.x, b.y - a.y)) / start.distance)
            );
        }

        if (scale > 1) {
            x = start.x + dx;
            y = start.y + dy;
            draw();
        }

        event.preventDefault();
    });

    function end(event) {
        if (!points.has(event.pointerId)) return;

        if (moved) blockedClickUntil = performance.now() + 350;

        if (event.type !== 'pointercancel' && start?.count === 1 && scale === 1) {
            const dx = event.clientX - start.cx,
                dy = event.clientY - start.cy;

            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) onSwipe(dx < 0 ? 1 : -1);
        }

        points.delete(event.pointerId);
        snapshot();
    }

    on('pointerup', end);
    on('pointercancel', end);

    on(
        'click',
        (event) => {
            if (performance.now() < blockedClickUntil) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        { capture: true }
    );

    on('dblclick', (event) => {
        if (event.target.closest('button,a')) return;

        event.preventDefault();
        scale = scale > 1 ? 1 : 2.5;
        x = y = 0;
        draw();
    });

    on(
        'wheel',
        (event) => {
            event.preventDefault();
            scale = Math.max(1, Math.min(4, scale - event.deltaY * 0.005));
            draw();
        },
        { passive: false }
    );

    return {
        reset,
        destroy() {
            events.abort();
            reset();
        }
    };
};

window.MargotPhotoViewer = function () {
    const dialog = document.createElement('dialog');
    dialog.className = 'photo-viewer';
    dialog.setAttribute('aria-label', 'Fotografia. Usa dois dedos para ampliar.');

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