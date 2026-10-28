(function () {
    'use strict';

    window.MargotHalloweenEffects?.destroy();

    const map = document.getElementById('gridCanvas');
    if (!map) return;

    const script = document.currentScript;
    const assetRoot = new URL(
        '../imagens/halloween-effects-2026/',
        script.src
    );

    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');

    const canvas = document.createElement('canvas');
    canvas.id = 'margot-halloween-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
        'position:fixed;pointer-events:none;z-index:20';

    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    if (!ctx) {
        canvas.remove();
        return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    const frames = {
        pumpkin: [
            [24, 30, 608, 570],
            [648, 33, 553, 568],
            [27, 644, 588, 572],
            [663, 641, 567, 570]
        ],
        bat: [
            [10, 241, 790, 304],
            [829, 241, 413, 316],
            [14, 717, 771, 315],
            [798, 717, 441, 315]
        ]
    };

    const pictures = {};
    const failures = [];

    let W = 1;
    let H = 1;
    let left = 0;
    let top = 0;

    let nodes = [];
    let strands = [];
    let actor = null;
    let stains = [];

    let raf = 0;
    let timer = 0;
    let last = 0;
    let restoreAt = 0;
    let webActiveUntil = 0;

    let running = false;
    let disposed = false;
    let ready = false;

    let nextKind = 'pumpkin';
    let pumpkinDirection = 1;
    let batDirection = -1;

    let finger = null;
    let swallowed = null;
    let swallowUntil = 0;

    let observer;
    let sizeObserver;

    const WEB_TOP = 76;

    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => x * x * (3 - 2 * x);

    function visible(el) {
        for (
            let node = el;
            node instanceof Element;
            node = node.parentElement
        ) {
            if (
                node.hidden ||
                node.getAttribute('aria-hidden') === 'true' ||
                node.matches('dialog:not([open])')
            ) {
                return false;
            }

            const css = getComputedStyle(node);

            if (
                css.display === 'none' ||
                css.visibility === 'hidden' ||
                css.visibility === 'collapse'
            ) {
                return false;
            }
        }

        return true;
    }

    function blocked() {
        if (
            !visible(map) ||
            document.body.classList.contains('hoje-editor-aberto') ||
            document.body.classList.contains('margot-mini-menu-aberto')
        ) {
            return true;
        }

        return [...document.querySelectorAll(
            'dialog[open],' +
            '[role="dialog"][aria-modal="true"],' +
            '.mini-menu,' +
            'input:focus,textarea:focus,select:focus,' +
            '[contenteditable="true"]:focus'
        )].some(visible);
    }

    function eligible() {
        return (
            !disposed &&
            map.isConnected &&
            dark.matches &&
            !reduce.matches &&
            !document.hidden &&
            !blocked()
        );
    }

    function request() {
        if (running && !raf) {
            raf = requestAnimationFrame(draw);
        }
    }

    function makeWeb() {
        nodes = [];
        strands = [];

        const radius = Math.min(155, W * 0.38);

        for (let ray = 0; ray < 9; ray++) {
            const angle = Math.PI / 2 + ray * Math.PI / 16;

            for (let ring = 0; ring < 7; ring++) {
                const x =
                    W - 5 +
                    Math.cos(angle) * radius * ring / 6;

                const y =
                    WEB_TOP +
                    Math.sin(angle) * radius * ring / 6;

                nodes.push({
                    x,
                    y,
                    px: x,
                    py: y,
                    hx: x,
                    hy: y,
                    fixed: ring === 0 || ring === 6
                });

                const i = ray * 7 + ring;

                if (ring) join(i - 1, i);
                if (ray && ring) join(i - 7, i);
            }
        }
    }

    function join(a, b) {
        strands.push({
            a,
            b,
            length: Math.hypot(
                nodes[a].x - nodes[b].x,
                nodes[a].y - nodes[b].y
            ),
            cut: 0
        });
    }

    function resize() {
        const rect = map.getBoundingClientRect();

        W = Math.max(1, rect.width);
        H = Math.max(1, rect.height);
        left = rect.left;
        top = rect.top;

        Object.assign(canvas.style, {
            left: left + 'px',
            top: top + 'px',
            width: W + 'px',
            height: H + 'px'
        });

        const dpr = Math.min(devicePixelRatio || 1, 1.5);

        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        actor = null;
        stains = [];
        finger = null;
        restoreAt = 0;
        webActiveUntil = 0;

        makeWeb();
        request();
    }

    function distance(x, y, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const n = dx * dx + dy * dy;

        const t = n
            ? clamp(((x - a.x) * dx + (y - a.y) * dy) / n, 0, 1)
            : 0;

        return Math.hypot(
            x - a.x - t * dx,
            y - a.y - t * dy
        );
    }

    function nearWeb(x, y) {
        return strands.some(strand =>
            !strand.cut &&
            distance(
                x,
                y,
                nodes[strand.a],
                nodes[strand.b]
            ) < 12
        );
    }

    function disturb(x, y, old) {
        const dx = clamp(x - old.x, -24, 24);
        const dy = clamp(y - old.y, -24, 24);

        nodes.forEach(point => {
            const strength = Math.max(
                0,
                1 - Math.hypot(point.x - x, point.y - y) / 40
            );

            if (!point.fixed && strength) {
                point.x += dx * strength * 0.55;
                point.y += dy * strength * 0.55;
            }
        });

        const travel = Math.hypot(x - old.x, y - old.y);

        if (travel > 3) {
            strands.forEach(strand => {
                if (strand.cut) return;

                const steps = Math.min(40, Math.ceil(travel / 4));

                for (let i = 0; i <= steps; i++) {
                    const hit = distance(
                        old.x + (x - old.x) * i / steps,
                        old.y + (y - old.y) * i / steps,
                        nodes[strand.a],
                        nodes[strand.b]
                    ) < 6;

                    if (hit) {
                        strand.cut = performance.now();
                        break;
                    }
                }
            });
        }

        nodes.forEach(point => {
            delete point.rx;
            delete point.ry;
        });

        restoreAt = performance.now() + 4000;
        webActiveUntil = restoreAt + 1500;

        request();
    }

    function simulateWeb() {
        for (let step = 0; step < 2; step++) {
            nodes.forEach(point => {
                if (point.fixed) return;

                const vx = (point.x - point.px) * 0.93;
                const vy = (point.y - point.py) * 0.93;

                point.px = point.x;
                point.py = point.y;

                point.x += vx;
                point.y += vy + 0.045;
            });

            for (let pass = 0; pass < 6; pass++) {
                strands.forEach(strand => {
                    if (strand.cut) return;

                    const a = nodes[strand.a];
                    const b = nodes[strand.b];

                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const length = Math.hypot(dx, dy) || 1;
                    const correction =
                        (length - strand.length) / length;

                    const weight = a.fixed || b.fixed ? 1 : 0.5;

                    if (!a.fixed) {
                        a.x += dx * correction * weight;
                        a.y += dy * correction * weight;
                    }

                    if (!b.fixed) {
                        b.x -= dx * correction * weight;
                        b.y -= dy * correction * weight;
                    }
                });
            }
        }
    }

    function drawWeb(now) {
        const healing = restoreAt && now >= restoreAt;

        const progress = healing
            ? clamp((now - restoreAt) / 1400, 0, 1)
            : 0;

        if (healing) {
            nodes.forEach(point => {
                if (point.rx === undefined) {
                    point.rx = point.x;
                    point.ry = point.y;
                }

                point.x =
                    point.rx +
                    (point.hx - point.rx) * ease(progress);

                point.y =
                    point.ry +
                    (point.hy - point.ry) * ease(progress);

                point.px = point.x;
                point.py = point.y;
            });
        } else if (now < webActiveUntil) {
            simulateWeb();
        }

        ctx.lineWidth = 0.85;
        ctx.lineCap = 'round';

        strands.forEach(strand => {
            const a = nodes[strand.a];
            const b = nodes[strand.b];

            if (strand.cut && !healing) {
                const age = (now - strand.cut) / 1000;
                const sag = Math.min(18, age * 25);

                ctx.strokeStyle = 'rgba(224,230,248,.44)';

                [[a, b], [b, a]].forEach(([point, other], i) => {
                    const sway =
                        Math.sin(age * 7 + i) *
                        7 *
                        Math.exp(-age * 0.8);

                    ctx.beginPath();
                    ctx.moveTo(point.x, point.y);

                    ctx.quadraticCurveTo(
                        point.x + (other.x - point.x) * 0.16 + sway,
                        point.y + sag,
                        point.x + (other.x - point.x) * 0.32 + sway,
                        point.y + (other.y - point.y) * 0.32 + sag
                    );

                    ctx.stroke();
                });

                return;
            }

            const opacity = strand.cut
                ? 0.52 * ease(progress)
                : 0.52;

            ctx.strokeStyle = 'rgba(229,235,255,' + opacity + ')';

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(
                (a.x + b.x) / 2,
                (a.y + b.y) / 2 + 1.5,
                b.x,
                b.y
            );
            ctx.stroke();
        });

        if (progress === 1) {
            makeWeb();
            restoreAt = 0;
        }
    }

    function sprite(kind, view, height, alpha = 1) {
        const rect = frames[kind][view];
        const width = height * rect[2] / rect[3];

        ctx.save();
        ctx.globalAlpha *= alpha;

        ctx.drawImage(
            pictures[kind],
            rect[0], rect[1], rect[2], rect[3],
            -width / 2, -height, width, height
        );

        ctx.restore();
    }

    function turn(kind, sequence, phase, height) {
        const position =
            clamp(phase, 0, 0.9999) * (sequence.length - 1);

        const index = Math.floor(position);

        const blend = ease(
            clamp((position - index - 0.65) / 0.35, 0, 1)
        );

        sprite(kind, sequence[index], height, 1 - blend);

        if (blend) {
            sprite(kind, sequence[index + 1], height, blend);
        }
    }

    function drawPumpkin(item, now) {
        const progress = clamp((now - item.start) / 5000, 0, 1);

        const cycle = progress * 3;
        const index = Math.min(2, Math.floor(cycle));
        const phase = cycle - index;

        const flight = 0.84;
        const air = Math.min(1, phase / flight);

        const lift = phase < flight
            ? 4 * item.jump * air * (1 - air)
            : 0;

        const landing = phase >= flight
            ? Math.sin(Math.PI * (phase - flight) / (1 - flight))
            : 0;

        item.x = item.dir > 0
            ? -60 + (W + 120) * progress
            : W + 60 - (W + 120) * progress;

        item.y = item.floor - lift - 35;

        ctx.save();

        ctx.globalAlpha =
            0.25 * (1 - lift / (item.jump * 1.4));

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(
            item.x,
            item.floor + 2,
            26 - lift * 0.08,
            5,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // A base mantém-se apoiada no chão durante a compressão.
        ctx.save();
        ctx.translate(item.x, item.floor - lift);
        ctx.scale(1 + landing * 0.13, 1 - landing * 0.16);

        ctx.transform(
            1,
            0,
            item.dir * Math.sin(air * Math.PI * 2) * 0.055,
            1,
            0,
            0
        );

        const sequence = item.dir > 0
            ? [0, 1, 2, 3, 0]
            : [0, 3, 2, 1, 0];

        turn('pumpkin', sequence, progress, 78);

        ctx.restore();

        return progress < 1;
    }

    function drawBat(item, now) {
        const progress = clamp((now - item.start) / 6000, 0, 1);
        const travel = W + 140;

        item.x = item.dir > 0
            ? -70 + travel * progress
            : W + 70 - travel * progress;

        item.y = item.y0 + item.vertical * travel * progress;

        ctx.save();
        ctx.translate(item.x, item.y);

        ctx.rotate(
            item.dir * item.vertical * 0.10 +
            Math.sin(progress * Math.PI * 2) * 0.08
        );

        const rect = frames.bat[item.view];
        const height = 54;
        const width = height * rect[2] / rect[3];
        const flap = Math.sin((now - item.start) / 180);

        // As pontas das asas movem-se mais do que o corpo.
        for (let i = 0; i < 24; i++) {
            const position = (i + 0.5) / 24;
            const edge = Math.pow(Math.abs(position - 0.5) * 2, 1.4);

            const scale = 1 - edge * (0.18 + 0.18 * flap);
            const offset = edge * flap * 8;

            const sourceX = rect[0] + rect[2] * i / 24;
            const sourceWidth = rect[2] / 24;

            ctx.drawImage(
                pictures.bat,
                sourceX,
                rect[1],
                sourceWidth,
                rect[3],
                -width / 2 + width * i / 24,
                -height / 2 * scale + offset,
                width / 24 + 0.25,
                height * scale
            );
        }

        ctx.restore();

        return progress < 1;
    }

    function splat(item) {
        const drops = Array.from({ length: 13 }, () => ({
            angle: Math.random() * Math.PI * 2,
            radius: 8 + Math.random() * 25,
            size: 7 + Math.random() * 9,
            drip: 20 + Math.random() * 55
        }));

        stains.push({
            x: item.x,
            y: item.y,
            start: performance.now(),
            color: item.kind === 'pumpkin'
                ? '255,91,0'
                : '217,5,41',
            drops
        });

        actor = null;
        request();
    }

    function drawStains(now) {
        stains = stains.filter(stain => {
            const age = (now - stain.start) / 1000;

            if (age >= 4) return false;

            const spread =
                1 - Math.pow(1 - clamp(age / 0.22, 0, 1), 3);

            const fade = clamp((4 - age) / 1.1, 0, 1);

            ctx.save();
            ctx.globalAlpha = fade;
            ctx.fillStyle = 'rgb(' + stain.color + ')';

            ctx.beginPath();
            ctx.ellipse(
                stain.x,
                stain.y,
                24 * spread,
                20 * spread,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();

            stain.drops.forEach(drop => {
                const x =
                    stain.x +
                    Math.cos(drop.angle) * drop.radius * spread;

                const y =
                    stain.y +
                    Math.sin(drop.angle) * drop.radius * spread;

                const drip =
                    drop.drip *
                    Math.pow(clamp(age / 3.5, 0, 1), 1.65);

                ctx.beginPath();
                ctx.ellipse(
                    x,
                    y,
                    drop.size * spread,
                    drop.size * spread,
                    0,
                    0,
                    Math.PI * 2
                );
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(x - drop.size * 0.3, y);

                ctx.bezierCurveTo(
                    x - 2, y + drip * 0.6,
                    x - 4, y + drip,
                    x, y + drip + 4
                );

                ctx.bezierCurveTo(
                    x + 4, y + drip,
                    x + 2, y + drip * 0.6,
                    x + drop.size * 0.3, y
                );

                ctx.fill();
            });

            ctx.fillStyle = 'rgba(255,229,185,.32)';
            ctx.beginPath();
            ctx.ellipse(
                stain.x - 8,
                stain.y - 10,
                7 * spread,
                3 * spread,
                -0.4,
                0,
                Math.PI * 2
            );
            ctx.fill();

            ctx.restore();
            return true;
        });
    }

    function draw(now) {
        raf = 0;

        if (!running) return;

        if (now - last < 32) {
            request();
            return;
        }

        last = now;

        ctx.clearRect(0, 0, W, H);
        drawWeb(now);

        if (actor) {
            const active = actor.kind === 'pumpkin'
                ? drawPumpkin(actor, now)
                : drawBat(actor, now);

            if (!active) actor = null;
        }

        drawStains(now);

        if (actor || stains.length || now < webActiveUntil) {
            request();
        }
    }

    function schedule(delay = 15000) {
        clearTimeout(timer);
        timer = 0;

        if (!running || !ready) return;

        timer = setTimeout(() => {
            timer = 0;

            if (!running) return;

            if (actor || stains.length) {
                schedule();
                return;
            }

            const now = performance.now();

            if (nextKind === 'pumpkin') {
                actor = {
                    kind: 'pumpkin',
                    dir: pumpkinDirection,
                    start: now,
                    floor: H * (0.42 + Math.random() * 0.32),
                    jump: 48 + Math.random() * 30,
                    x: -200,
                    y: -200
                };

                pumpkinDirection *= -1;
                nextKind = 'bat';
            } else {
                const vertical = Math.random() < 0.5 ? -1 : 1;
                const center = H * (0.4 + Math.random() * 0.2);
                const travel = W + 140;

                const views = batDirection > 0
                    ? [3, 0, 2]
                    : [1, 0, 2];

                actor = {
                    kind: 'bat',
                    dir: batDirection,
                    vertical,
                    start: now,
                    y0: center - vertical * travel / 2,
                    view: views[Math.floor(Math.random() * views.length)],
                    x: -200,
                    y: -200
                };

                batDirection *= -1;
                nextKind = 'pumpkin';
            }

            request();
            schedule();
        }, delay);
    }

    function refresh() {
        const next = eligible();

        if (next === running) return;

        running = next;

        cancelAnimationFrame(raf);
        raf = 0;

        clearTimeout(timer);
        timer = 0;

        actor = null;
        stains = [];
        finger = null;

        canvas.hidden = !running;
        ctx.clearRect(0, 0, W, H);

        if (running) {
            makeWeb();
            restoreAt = 0;
            webActiveUntil = 0;
            last = 0;

            request();
            schedule(30000);
        }
    }

    function allowed(target) {
        return (
            target instanceof Element &&
            !target.closest(
                'button,a,input,textarea,select,' +
                '[contenteditable="true"],[role="button"],video,' +
                '.foto,#menuPrincipal,#heys-area,.mini-menu'
            )
        );
    }

    function start(x, y, target, event) {
        if (!running || !allowed(target)) return;

        const px = x - left;
        const py = y - top;

        if (px < 0 || py < 0 || px > W || py > H) return;

        let caught = false;

        if (
            actor &&
            Math.hypot(px - actor.x, py - actor.y) < 46
        ) {
            splat(actor);
            caught = true;
        } else if (nearWeb(px, py)) {
            finger = { x: px, y: py };
            disturb(px + 2, py + 2, finger);
            caught = true;
        }

        if (caught) {
            swallowed = { x, y };
            swallowUntil = performance.now() + 500;

            if (event.cancelable) {
                event.preventDefault();
            }

            event.stopPropagation();
        }
    }

    function move(x, y, event) {
        if (!finger || !running) return;

        const px = x - left;
        const py = y - top;

        disturb(px, py, finger);
        finger = { x: px, y: py };

        if (event.cancelable) {
            event.preventDefault();
        }

        event.stopPropagation();
    }

    function end() {
        if (finger) {
            swallowed = {
                x: finger.x + left,
                y: finger.y + top
            };

            swallowUntil = performance.now() + 400;
        }

        finger = null;
    }

    const capture = {
        capture: true,
        passive: false,
        signal
    };

    document.addEventListener('touchstart', event => {
        if (event.touches.length === 1) {
            start(
                event.touches[0].clientX,
                event.touches[0].clientY,
                event.target,
                event
            );
        }
    }, capture);

    document.addEventListener('touchmove', event => {
        if (event.touches.length === 1) {
            move(
                event.touches[0].clientX,
                event.touches[0].clientY,
                event
            );
        } else {
            end();
        }
    }, capture);

    document.addEventListener('touchend', end, { signal });
    document.addEventListener('touchcancel', end, { signal });

    document.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch') {
            start(
                event.clientX,
                event.clientY,
                event.target,
                event
            );
        }
    }, capture);

    document.addEventListener('pointermove', event => {
        if (event.pointerType !== 'touch') {
            move(event.clientX, event.clientY, event);
        }
    }, capture);

    document.addEventListener('pointerup', end, { signal });
    document.addEventListener('pointercancel', end, { signal });

    document.addEventListener('click', event => {
        if (
            swallowed &&
            performance.now() < swallowUntil &&
            Math.hypot(
                event.clientX - swallowed.x,
                event.clientY - swallowed.y
            ) < 45 &&
            allowed(event.target)
        ) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, {
        capture: true,
        signal
    });

    function destroy() {
        disposed = true;
        running = false;

        cancelAnimationFrame(raf);
        clearTimeout(timer);
        controller.abort();

        observer?.disconnect();
        sizeObserver?.disconnect();

        dark.removeEventListener('change', refresh);
        reduce.removeEventListener('change', refresh);

        canvas.remove();

        if (window.MargotHalloweenEffects === api) {
            window.MargotHalloweenEffects = null;
        }
    }

    const api = {
        destroy,
        getState: () => ({
            version: 4,
            running,
            ready,
            failures: failures.slice(),
            dark: dark.matches,
            reducedMotion: reduce.matches,
            active: actor?.kind || null
        })
    };

    window.MargotHalloweenEffects = api;

    dark.addEventListener('change', refresh);
    reduce.addEventListener('change', refresh);

    document.addEventListener('visibilitychange', refresh, { signal });
    document.addEventListener('focusin', refresh, { signal });
    document.addEventListener('focusout', refresh, { signal });

    document.addEventListener('margot:page-leave', destroy, {
        once: true,
        signal
    });

    window.addEventListener('blur', end, { signal });
    window.addEventListener('resize', resize, { signal });

    observer = new MutationObserver(records => {
        // O movimento das fotografias não deve redesenhar a teia.
        const relevant = records.some(record =>
            record.target !== canvas &&
            !(
                record.target instanceof Element &&
                record.target.closest('.foto')
            )
        );

        if (relevant) refresh();
    });

    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: [
            'class',
            'style',
            'hidden',
            'aria-hidden',
            'aria-modal',
            'open'
        ]
    });

    sizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(resize)
        : null;

    sizeObserver?.observe(map);

    resize();
    canvas.hidden = true;
    refresh();

    Promise.all(['pumpkin', 'bat'].map(kind =>
        new Promise(resolve => {
            const image = new Image();

            image.onload = () => {
                pictures[kind] = image;
                resolve();
            };

            image.onerror = () => {
                failures.push(kind);
                console.warn('Halloween: imagem indisponível:', kind);
                resolve();
            };

            image.src = new URL(
                kind + '-turnaround.png',
                assetRoot
            ).href;
        })
    )).then(() => {
        if (disposed) return;

        ready = failures.length === 0;

        if (ready && running) {
            schedule(30000);
        }
    });
})();