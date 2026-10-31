(() => {
    'use strict';

    const base = window.MargotHalloweenHunt;

    if (!base?.create || base.create.decoysVersion === 17) return;

    const random = (a, b) => a + Math.random() * (b - a);

    const drawings = [
        [
            'um fantasma',
            '<path fill="url(#margotDecoyBody17)" d="M16 65V30C16 5 64 5 64 30V65L54 59L44 67L34 59L24 67Z"/>' +
            '<ellipse cx="32" cy="31" rx="4" ry="7" fill="#282139"/>' +
            '<ellipse cx="48" cy="31" rx="4" ry="7" fill="#282139"/>' +
            '<ellipse cx="40" cy="48" rx="5" ry="6" fill="#665578"/>'
        ],
        [
            'uma bruxa',
            '<path d="M7 61L72 47" stroke="#b97c39" stroke-width="4"/>' +
            '<path d="M8 56L2 69L24 64L20 53Z" fill="#e6ad59"/>' +
            '<path d="M36 33L21 57Q42 66 61 54L48 35Z" fill="#8449c5"/>' +
            '<circle cx="42" cy="29" r="10" fill="#b0d788"/>' +
            '<path d="M45 28L59 31L47 34" fill="#b0d788"/>' +
            '<path d="M22 22L35 2L48 8L42 11L52 22Z" fill="#402552"/>' +
            '<path d="M18 23Q39 31 61 23" stroke="#a36ae1" stroke-width="5"/>' +
            '<circle cx="45" cy="27" r="2" fill="#262035"/>'
        ],
        [
            'uma caveira',
            '<path fill="url(#margotDecoyBody17)" d="M16 29C16 3 64 3 64 29V43L54 49V63H26V49L16 43Z"/>' +
            '<ellipse cx="29" cy="32" rx="8" ry="9" fill="#35283f"/>' +
            '<ellipse cx="51" cy="32" rx="8" ry="9" fill="#35283f"/>' +
            '<path d="M40 40L35 49H45Z" fill="#35283f"/>' +
            '<path d="M34 54V63M46 54V63" stroke="#8d7d9b" stroke-width="3"/>'
        ]
    ];

    function create(options) {
        let state = null;
        let syncedAt = 0;
        let disposed = false;

        let timer = 0;
        let frame = 0;
        let actor = null;
        let toast = null;
        let toastTimer = 0;

        let nextAt = performance.now() + random(8000, 14000);

        function eligible() {
            const now =
                state?.server_now_ms + performance.now() - syncedAt;

            return !disposed &&
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
                options.isEligible();
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
            const [name, drawing] =
                drawings[Math.floor(random(0, drawings.length))];

            const button = document.createElement('button');

            button.type = 'button';

            button.setAttribute(
                'aria-label',
                `Apanhar ${name}, não conta para o desafio`
            );

            button.innerHTML = `
                <svg
                    viewBox="0 0 80 80"
                    width="64"
                    height="64"
                    aria-hidden="true"
                >
                    <defs>
                        <radialGradient
                            id="margotDecoyBody17"
                            cx="30%"
                            cy="25%"
                            r="80%"
                        >
                            <stop stop-color="#fff"/>
                            <stop offset=".65" stop-color="#ded3ed"/>
                            <stop offset="1" stop-color="#9784ae"/>
                        </radialGradient>
                    </defs>
                    ${drawing}
                </svg>
            `;

            button.style.cssText = [
                'position:fixed',
                'left:0',
                'top:0',
                'width:64px',
                'height:64px',
                'padding:0',
                'border:0',
                'background:transparent',
                'z-index:99990',
                'touch-action:manipulation',
                'filter:drop-shadow(0 5px 5px #0005)',
                'will-change:transform',
                'cursor:pointer'
            ].join(';');

            actor = button;
            document.body.append(button);

            button.addEventListener('click', event => {
                event.stopPropagation();

                if (actor !== button || !eligible()) return;

                clearActor();
                feedback(name);
            });

            const started = performance.now();
            const duration = random(4700, 6800);
            const reverse = Math.random() < .5;
            const phase = random(0, Math.PI * 2);
            const lane = random(.25, .65);
            const turns = random(1.5, 3);

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
                    .15 *
                    Math.sin(p * Math.PI * 2 * turns) *
                    Math.sin(Math.PI * p);

                const x =
                    -64 +
                    (width + 64) *
                    (reverse ? 1 - travel : travel);

                const y = Math.max(
                    100,
                    Math.min(
                        height - 150,
                        height * lane +
                        Math.sin(p * Math.PI * 4 + phase) * 65
                    )
                );

                const rotation = Math.sin(p * Math.PI * 6) * 18;

                button.style.transform =
                    `translate3d(${x}px,${y}px,0) rotate(${rotation}deg)`;

                frame = requestAnimationFrame(draw);
            }

            frame = requestAnimationFrame(draw);
        }

        function tick() {
            if (disposed) return;

            if (!eligible()) {
                clearActor();
                clearToast();
            } else if (!actor && performance.now() >= nextAt) {
                spawn();

                nextAt = performance.now() + (
                    state.mode === 'pilot'
                        ? random(18000, 32000)
                        : random(35000, 65000)
                );
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

    create.decoysVersion = 17;
    create.motionVersion = base.create.motionVersion;

    window.MargotHalloweenHunt = Object.freeze({
        ...base,
        create
    });
})();