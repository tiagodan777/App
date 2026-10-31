(() => {
    'use strict';

    const base = window.MargotHalloweenHunt;

    if (!base?.create || base.create.decoysVersion === 18) return;

    const random = (a, b) => a + Math.random() * (b - a);
    const script = document.currentScript;

    const assets = new URL(
        script?.dataset.assets || '../imagens/halloween-effects-2026/',
        script?.src || document.baseURI
    );

    const sprites = [
        {
            name: 'um fantasma',
            file: 'ghost-turnaround-v18.png',
            size: 72
        },
        {
            name: 'uma bruxa',
            file: 'witch-turnaround-v18.png',
            size: 88
        },
        {
            name: 'uma caveira',
            file: 'skull-turnaround-v18.png',
            size: 66
        }
    ].map(sprite => {
        const image = new Image();

        const entry = {
            ...sprite,
            ready: false,
            url: new URL(sprite.file, assets).href
        };

        image.onload = () => {
            entry.ready = image.naturalWidth > 0;
        };

        image.onerror = () => {
            entry.ready = false;
        };

        image.src = entry.url;

        return entry;
    });

    function create(options) {
        let state = null;
        let syncedAt = 0;
        let disposed = false;
        let previousSprite = null;

        let timer = 0;
        let frame = 0;
        let actor = null;
        let toast = null;
        let toastTimer = 0;

        let nextAt = performance.now() + random(8000, 14000);

        function eligible() {
            const now =
                state?.server_now_ms + performance.now() - syncedAt;

            return (
                !disposed &&
                !document.hidden &&
                state?.phase === 'active' &&
                !state.completed_at &&
                (
                    state.starts_at_ms === null ||
                    now >= state.starts_at_ms
                ) &&
                (
                    state.ends_at_ms === null ||
                    now < state.ends_at_ms
                ) &&
                options.isEligible()
            );
        }

        function clearActor() {
            cancelAnimationFrame(frame);
            frame = 0;

            actor?.remove();
            actor = null;
        }

        function clearToast() {
            clearTimeout(toastTimer);

            toast?.remove();
            toast = null;
        }

        function feedback(name) {
            clearToast();

            toast = document.createElement('div');
            toast.setAttribute('role', 'status');

            toast.textContent =
                `Apanhaste ${name} — não conta. Procura 🎃 e 🦇`;

            toast.style.cssText = [
                'position:fixed',
                'z-index:99999',
                'top:calc(env(safe-area-inset-top,0px) + 62px)',
                'left:50%',
                'transform:translateX(-50%)',
                'width:max-content',
                'max-width:85vw',
                'box-sizing:border-box',
                'padding:14px 18px',
                'border-radius:20px',
                'background:#30243ef2',
                'color:#fff',
                'font:600 14px/1.4 system-ui',
                'text-align:center',
                'box-shadow:0 8px 28px #0005',
                'pointer-events:none'
            ].join(';');

            document.body.append(toast);
            toastTimer = setTimeout(clearToast, 2700);

            try {
                const cap = window.Capacitor;

                if (
                    cap?.isNativePlatform?.() &&
                    cap.isPluginAvailable?.('MargotHaptics')
                ) {
                    const plugin =
                        cap.Plugins?.MargotHaptics ||
                        cap.registerPlugin('MargotHaptics');

                    Promise.resolve(
                        plugin.play({
                            type: 'interaction',
                            profile: 'selection'
                        })
                    ).catch(() => {});
                } else {
                    navigator.vibrate?.(20);
                }
            } catch (_) {}
        }

        function spawn() {
            const ready = sprites.filter(sprite => sprite.ready);

            if (!ready.length) return;

            const alternatives = ready.filter(
                sprite => sprite !== previousSprite
            );

            const pool = alternatives.length ? alternatives : ready;

            const sprite = pool[
                Math.floor(random(0, pool.length))
            ];

            previousSprite = sprite;

            const {name, size} = sprite;
            const button = document.createElement('button');

            button.type = 'button';

            button.setAttribute(
                'aria-label',
                `Apanhar ${name}, não conta para o desafio`
            );

            button.style.cssText = [
                'position:fixed',
                'left:0',
                'top:0',
                `width:${size}px`,
                `height:${size}px`,
                'padding:0',
                'border:0',
                'border-radius:0',
                'appearance:none',
                'background-color:transparent',
                'z-index:99990',
                'touch-action:manipulation',
                'filter:drop-shadow(0 4px 4px #0005)',
                'will-change:transform',
                'cursor:pointer',
                'overflow:hidden',
                '-webkit-tap-highlight-color:transparent'
            ].join(';');

            button.style.backgroundImage = `url("${sprite.url}")`;
            button.style.backgroundSize = '200% 200%';
            button.style.backgroundRepeat = 'no-repeat';
            button.style.backgroundPosition = '0% 0%';

            actor = button;
            document.body.append(button);

            button.addEventListener('click', event => {
                event.stopPropagation();

                if (actor !== button || !eligible()) return;

                clearActor();
                feedback(name);
            });

            const started = performance.now();
            const duration = random(5200, 7800);
            const reverse = Math.random() < 0.5;
            const phase = random(0, Math.PI * 2);
            const lane = random(0.25, 0.65);
            const turns = random(1.5, 3);

            let previousX = null;
            let previousView = -1;
            let viewChangedAt = -Infinity;

            function draw(now) {
                if (actor !== button) return;

                const p = (now - started) / duration;

                if (!eligible() || p >= 1) {
                    clearActor();
                    return;
                }

                const width = innerWidth;
                const height = innerHeight;

                const travel =
                    p +
                    0.15 *
                    Math.sin(p * Math.PI * 2 * turns) *
                    Math.sin(Math.PI * p);

                const x =
                    -size +
                    (width + size) *
                    (reverse ? 1 - travel : travel);

                const y = Math.max(
                    100,
                    Math.min(
                        height - 150,
                        height * lane +
                        Math.sin(p * Math.PI * 4 + phase) * 65
                    )
                );

                const dx = previousX === null
                    ? (reverse ? -1 : 1)
                    : x - previousX;

                previousX = x;

                const turning =
                    Math.abs(
                        Math.sin(p * Math.PI * 2 * turns)
                    ) < 0.18;

                const view = turning
                    ? (Math.cos(p * Math.PI * 2) > 0 ? 0 : 2)
                    : (dx < 0 ? 1 : 3);

                // Cada quadrante contém uma vista completa.
                // A mudança é direta para não mostrar partes das outras vistas.
                if (
                    view !== previousView &&
                    now - viewChangedAt >= 180
                ) {
                    button.style.backgroundPosition = [
                        '0% 0%',
                        '100% 0%',
                        '0% 100%',
                        '100% 100%'
                    ][view];

                    previousView = view;
                    viewChangedAt = now;
                }

                const rotation =
                    Math.sin(p * Math.PI * 6) * 12;

                button.style.transform =
                    `translate3d(${x}px,${y}px,0) ` +
                    `rotate(${rotation}deg)`;

                frame = requestAnimationFrame(draw);
            }

            frame = requestAnimationFrame(draw);
        }

        function tick() {
            if (disposed) return;

            if (!eligible()) {
                clearActor();
                clearToast();
            } else if (
                !actor &&
                performance.now() >= nextAt
            ) {
                spawn();

                const delay = state.mode === 'pilot'
                    ? random(10000, 18000)
                    : random(18000, 32000);

                nextAt = performance.now() + delay;
            }

            timer = setTimeout(tick, 500);
        }

        const client = base.create({
            ...options,

            onState(value) {
                if (
                    state?.campaign_id !== value?.campaign_id ||
                    value?.phase !== 'active'
                ) {
                    clearActor();
                    clearToast();
                }

                state = value;
                syncedAt = performance.now();

                return options.onState?.(value);
            }
        });

        tick();

        return {
            ...client,

            destroy() {
                disposed = true;

                clearTimeout(timer);
                clearActor();
                clearToast();

                client.destroy();
            }
        };
    }

    create.decoysVersion = 18;
    create.motionVersion = base.create.motionVersion;

    window.MargotHalloweenHunt = Object.freeze({
        ...base,
        create
    });
})();