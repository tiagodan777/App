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

    let batLayers = null;
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
            let n = el;
            n instanceof Element;
            n = n.parentElement
        ) {
            if (
                n.hidden ||
                n.getAttribute('aria-hidden') === 'true' ||
                n.matches('dialog:not([open])')
            ) {
                return false;
            }

            const css = getComputedStyle(n);

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
            'dialog[open],[role="dialog"][aria-modal="true"],.mini-menu,' +
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

        const radius = Math.min(150, W * .37);
        const rings = [0, .10, .225, .38, .565, .77, 1];

        for (let ray = 0; ray < 9; ray++) {
            const angle =
                Math.PI / 2 +
                ray * Math.PI / 16 +
                (
                    ray === 0 || ray === 8
                        ? 0
                        : Math.sin(ray * 2.1) * .028
                );

            for (let ring = 0; ring < 7; ring++) {
                const r =
                    radius *
                    rings[ring] *
                    (1 + Math.sin(ray * 1.7 + ring * .8) * .035);

                const x = W - 6 + Math.cos(angle) * r;
                const y = WEB_TOP + Math.sin(angle) * r;

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

                if (ring) join(i - 1, i, false, ring);
                if (ray && ring) join(i - 7, i, true, ring);
            }
        }
    }

    function join(a, b, arc, ring) {
        strands.push({
            a,
            b,
            arc,
            ring,
            length: Math.hypot(
                nodes[a].x - nodes[b].x,
                nodes[a].y - nodes[b].y
            ),
            cut: 0
        });
    }

    function resize() {
        const r = map.getBoundingClientRect();

        W = Math.max(1, r.width);
        H = Math.max(1, r.height);
        left = r.left;
        top = r.top;

        Object.assign(canvas.style, {
            left: left + 'px',
            top: top + 'px',
            width: W + 'px',
            height: H + 'px'
        });

        const dpr = Math.min(devicePixelRatio || 1, 2);

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
        return strands.some(s =>
            !s.cut &&
            distance(x, y, nodes[s.a], nodes[s.b]) < 12
        );
    }

    function disturb(x, y, old) {
        const dx = clamp(x - old.x, -12, 12);
        const dy = clamp(y - old.y, -12, 12);
        const travel = Math.hypot(x - old.x, y - old.y);

        nodes.forEach(p => {
            const k = Math.max(
                0,
                1 - Math.hypot(p.x - x, p.y - y) / 32
            );

            if (!p.fixed && k) {
                p.x += dx * k * .4;
                p.y += dy * k * .4;
            }

            delete p.rx;
            delete p.ry;
        });

        if (travel > 3) {
            strands.forEach(s => {
                if (s.cut) return;

                const n = Math.min(40, Math.ceil(travel / 4));

                for (let i = 0; i <= n; i++) {
                    const hit = distance(
                        old.x + (x - old.x) * i / n,
                        old.y + (y - old.y) * i / n,
                        nodes[s.a],
                        nodes[s.b]
                    );

                    if (hit < 5) {
                        s.cut = performance.now();
                        break;
                    }
                }
            });
        }

        restoreAt = performance.now() + 4000;
        webActiveUntil = restoreAt + 2200;

        request();
    }

    function simulateWeb() {
        for (let step = 0; step < 2; step++) {
            nodes.forEach(p => {
                if (p.fixed) return;

                const vx = clamp((p.x - p.px) * .82, -2, 2);
                const vy = clamp((p.y - p.py) * .82, -2, 2);

                p.px = p.x;
                p.py = p.y;

                p.x += vx + (p.hx - p.x) * .016;
                p.y += vy + (p.hy - p.y) * .016 + .025;
            });

            for (let pass = 0; pass < 5; pass++) {
                strands.forEach(s => {
                    if (s.cut) return;

                    const a = nodes[s.a];
                    const b = nodes[s.b];

                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len = Math.hypot(dx, dy) || 1;

                    const f = (len - s.length) / len * .8;
                    const w = a.fixed || b.fixed ? 1 : .5;

                    if (!a.fixed) {
                        a.x += dx * f * w;
                        a.y += dy * f * w;
                    }

                    if (!b.fixed) {
                        b.x -= dx * f * w;
                        b.y -= dy * f * w;
                    }
                });
            }

            nodes.forEach(p => {
                const dx = p.x - p.hx;
                const dy = p.y - p.hy;
                const d = Math.hypot(dx, dy);

                if (d > 14) {
                    p.x = p.hx + dx * 14 / d;
                    p.y = p.hy + dy * 14 / d;
                    p.px = p.x;
                    p.py = p.y;
                }
            });
        }
    }

    function drawWeb(now) {
        const healing = restoreAt && now >= restoreAt;
        const t = healing
            ? clamp((now - restoreAt) / 2100, 0, 1)
            : 0;

        if (healing) {
            nodes.forEach(p => {
                if (p.rx === undefined) {
                    p.rx = p.x;
                    p.ry = p.y;
                }

                p.x = p.rx + (p.hx - p.rx) * ease(t);
                p.y = p.ry + (p.hy - p.ry) * ease(t);
                p.px = p.x;
                p.py = p.y;
            });
        } else if (now < webActiveUntil) {
            simulateWeb();
        }

        ctx.lineCap = 'round';

        strands.forEach(s => {
            const a = nodes[s.a];
            const b = nodes[s.b];

            let alpha = .40 + .07 * Math.sin(s.a * 1.7);
            let grow = 1;

            ctx.lineWidth = .65 + .10 * Math.sin(s.b * .9);

            if (s.cut) {
                if (healing) {
                    grow = ease(clamp(
                        (t - (s.ring - 1) * .09) / .55,
                        0,
                        1
                    ));

                    alpha *= grow;
                } else {
                    const recoil = ease(clamp(
                        (now - s.cut) / 360,
                        0,
                        1
                    ));

                    alpha *= 1 - recoil;
                    grow = 1 - recoil * .70;
                }
            }

            if (alpha < .005) return;

            // Cada fio é desenhado uma única vez, mesmo depois de cortado.
            const bend = s.arc ? .035 : 0;

            const cx =
                (a.x + b.x) / 2 +
                (W - 6 - (a.x + b.x) / 2) * bend;

            const cy =
                (a.y + b.y) / 2 +
                (WEB_TOP - (a.y + b.y) / 2) * bend;

            const ex =
                (1 - grow) * (1 - grow) * a.x +
                2 * (1 - grow) * grow * cx +
                grow * grow * b.x;

            const ey =
                (1 - grow) * (1 - grow) * a.y +
                2 * (1 - grow) * grow * cy +
                grow * grow * b.y;

            ctx.strokeStyle = 'rgba(222,231,246,' + alpha + ')';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);

            ctx.quadraticCurveTo(
                a.x + (cx - a.x) * grow,
                a.y + (cy - a.y) * grow,
                ex,
                ey
            );

            ctx.stroke();
        });

        if (t === 1) {
            strands.forEach(s => s.cut = 0);

            nodes.forEach(p => {
                delete p.rx;
                delete p.ry;
            });

            restoreAt = 0;
        }
    }

    function sprite(kind, view, height, alpha = 1) {
        const r = frames[kind][view];
        const width = height * r[2] / r[3];

        ctx.save();
        ctx.globalAlpha *= alpha;

        ctx.drawImage(
            pictures[kind],
            r[0], r[1], r[2], r[3],
            -width / 2, -height, width, height
        );

        ctx.restore();
    }

    function drawPumpkin(a, now) {
        const p = clamp((now - a.start) / 5000, 0, 1);
        const cycle = p * 4;

        const index = Math.min(3, Math.floor(cycle));
        const u = cycle - index;

        const air = clamp((u - .10) / .78, 0, 1);
        const flying = u >= .10 && u < .88;

        const lift = flying
            ? 4 * a.jump * air * (1 - air)
            : 0;

        const anticipation = u < .10
            ? Math.sin(Math.PI * u / .10) * .07
            : 0;

        const landing = u >= .88
            ? Math.sin(Math.PI * (u - .88) / .12) * .14
            : 0;

        const squash = anticipation + landing;

        const stretch = flying
            ? Math.sin(air * Math.PI * 2) * .035
            : 0;

        const position = (index + ease(air)) / 4;

        a.x = a.dir > 0
            ? -60 + (W + 120) * position
            : W + 60 - (W + 120) * position;

        a.y = a.floor - lift - 35;

        ctx.save();
        ctx.globalAlpha = .28 * (1 - lift / (a.jump * 1.4));
        ctx.fillStyle = '#000';
        ctx.beginPath();

        ctx.ellipse(
            a.x,
            a.floor + 2,
            24 - lift * .08,
            4,
            0,
            0,
            Math.PI * 2
        );

        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(a.x, a.floor - lift);

        ctx.scale(
            1 + squash - stretch * .6,
            1 - squash + stretch
        );

        ctx.transform(
            1,
            0,
            flying ? a.dir * Math.sin(air * Math.PI * 2) * .045 : 0,
            1,
            0,
            0
        );

        // Uma única vista, sempre opaca.
        sprite('pumpkin', a.dir > 0 ? 1 : 3, 78);

        ctx.restore();

        return p < 1;
    }

    function makeBatLayers() {
        const r = frames.bat[0];
        const w = r[2];
        const h = r[3];

        function layer(path) {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;

            const g = c.getContext('2d');

            g.beginPath();
            path(g, w, h);
            g.clip();

            g.drawImage(
                pictures.bat,
                r[0], r[1], w, h,
                0, 0, w, h
            );

            return c;
        }

        function wing(g, mirror) {
            const pts = [
                [0, 0],
                [260, 0],
                [260, 132],
                [342, 172],
                [354, 250],
                [240, 330],
                [0, 330]
            ];

            pts.forEach(([x, y], i) => {
                x = mirror ? w - x : x;

                if (i) {
                    g.lineTo(x, y);
                } else {
                    g.moveTo(x, y);
                }
            });

            g.closePath();
        }

        const l = layer(g => wing(g, false));
        const rgt = layer(g => wing(g, true));

        const body = layer(g => {
            g.ellipse(395, 179, 88, 128, 0, 0, Math.PI * 2);

            g.moveTo(385, 74);
            g.ellipse(345, 74, 43, 80, -.25, 0, Math.PI * 2);

            g.moveTo(488, 74);
            g.ellipse(445, 74, 43, 80, .25, 0, Math.PI * 2);
        });

        return {
            left: l,
            right: rgt,
            body,
            w,
            h
        };
    }

    function drawBat(a, now) {
        const p = clamp((now - a.start) / 6000, 0, 1);
        const travel = W + 170;

        a.x = a.dir > 0
            ? -85 + travel * p
            : W + 85 - travel * p;

        const phase = (now - a.start) / 1000 * Math.PI * 2 * 2.5;

        a.y =
            a.y0 +
            a.vertical * travel * p +
            Math.sin(phase) * 1.5;

        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.dir * a.vertical * .13);

        const scale = 62 / batLayers.h;

        ctx.scale(scale, scale);
        ctx.translate(-395, -165);

        const flap = Math.sin(phase);
        const angle = .78 * flap;

        function wing(image, pivot, sign) {
            ctx.save();
            ctx.translate(pivot, 177);
            ctx.rotate(sign * angle);
            ctx.scale(.92 + .08 * Math.cos(phase), 1);
            ctx.translate(-pivot, -177);
            ctx.drawImage(image, 0, 0);
            ctx.restore();
        }

        wing(batLayers.left, 326, 1);
        wing(batLayers.right, 464, -1);

        ctx.drawImage(batLayers.body, 0, 0);
        ctx.restore();

        return p < 1;
    }

    function splat(a) {
        const drops = Array.from({ length: 13 }, () => ({
            angle: Math.random() * Math.PI * 2,
            radius: 8 + Math.random() * 25,
            size: 7 + Math.random() * 9,
            drip: 20 + Math.random() * 55
        }));

        stains.push({
            x: a.x,
            y: a.y,
            start: performance.now(),
            color: a.kind === 'pumpkin'
                ? '255,91,0'
                : '217,5,41',
            drops
        });

        actor = null;
        request();
    }

    function drawStains(now) {
        stains = stains.filter(s => {
            const age = (now - s.start) / 1000;

            if (age >= 4) return false;

            const spread =
                1 - Math.pow(1 - clamp(age / .22, 0, 1), 3);

            const fade = clamp((4 - age) / 1.1, 0, 1);

            ctx.save();
            ctx.globalAlpha = fade;
            ctx.fillStyle = 'rgb(' + s.color + ')';
            ctx.beginPath();

            ctx.ellipse(
                s.x,
                s.y,
                24 * spread,
                20 * spread,
                0,
                0,
                Math.PI * 2
            );

            ctx.fill();

            s.drops.forEach(d => {
                const x =
                    s.x + Math.cos(d.angle) * d.radius * spread;

                const y =
                    s.y + Math.sin(d.angle) * d.radius * spread;

                const drip =
                    d.drip * Math.pow(clamp(age / 3.5, 0, 1), 1.65);

                ctx.beginPath();

                ctx.ellipse(
                    x,
                    y,
                    d.size * spread,
                    d.size * spread,
                    0,
                    0,
                    Math.PI * 2
                );

                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x - d.size * .3, y);

                ctx.bezierCurveTo(
                    x - 2, y + drip * .6,
                    x - 4, y + drip,
                    x, y + drip + 4
                );

                ctx.bezierCurveTo(
                    x + 4, y + drip,
                    x + 2, y + drip * .6,
                    x + d.size * .3, y
                );

                ctx.fill();
            });

            ctx.fillStyle = 'rgba(255,229,185,.32)';
            ctx.beginPath();

            ctx.ellipse(
                s.x - 8,
                s.y - 10,
                7 * spread,
                3 * spread,
                -.4,
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

        if (now - last < (actor ? 16 : 32)) {
            request();
            return;
        }

        last = now;

        ctx.clearRect(0, 0, W, H);
        drawWeb(now);

        if (
            actor &&
            !(
                actor.kind === 'pumpkin'
                    ? drawPumpkin(actor, now)
                    : drawBat(actor, now)
            )
        ) {
            actor = null;
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
                    floor: H * (.42 + Math.random() * .32),
                    jump: 48 + Math.random() * 30,
                    x: -200,
                    y: -200
                };

                pumpkinDirection *= -1;
                nextKind = 'bat';
            } else {
                const vertical = Math.random() < .5 ? -1 : 1;
                const center = H * (.4 + Math.random() * .2);
                const travel = W + 170;

                actor = {
                    kind: 'bat',
                    dir: batDirection,
                    vertical,
                    start: now,
                    y0: center - vertical * travel / 2,
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
                '[contenteditable="true"],[role="button"],' +
                'video,.foto,#menuPrincipal,#heys-area,.mini-menu'
            )
        );
    }

    function start(x, y, target, e) {
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

            if (e.cancelable) e.preventDefault();

            e.stopPropagation();
        }
    }

    function move(x, y, e) {
        if (!finger || !running) return;

        const px = x - left;
        const py = y - top;

        disturb(px, py, finger);
        finger = { x: px, y: py };

        if (e.cancelable) e.preventDefault();

        e.stopPropagation();
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

    document.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            start(
                e.touches[0].clientX,
                e.touches[0].clientY,
                e.target,
                e
            );
        }
    }, capture);

    document.addEventListener('touchmove', e => {
        if (e.touches.length === 1) {
            move(
                e.touches[0].clientX,
                e.touches[0].clientY,
                e
            );
        } else {
            end();
        }
    }, capture);

    document.addEventListener('touchend', end, { signal });
    document.addEventListener('touchcancel', end, { signal });

    document.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') {
            start(e.clientX, e.clientY, e.target, e);
        }
    }, capture);

    document.addEventListener('pointermove', e => {
        if (e.pointerType !== 'touch') {
            move(e.clientX, e.clientY, e);
        }
    }, capture);

    document.addEventListener('pointerup', end, { signal });
    document.addEventListener('pointercancel', end, { signal });

    document.addEventListener('click', e => {
        if (
            swallowed &&
            performance.now() < swallowUntil &&
            Math.hypot(
                e.clientX - swallowed.x,
                e.clientY - swallowed.y
            ) < 45 &&
            allowed(e.target)
        ) {
            e.preventDefault();
            e.stopImmediatePropagation();
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
            version: 5,
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
        // As fotografias movem-se frequentemente.
        // Isso não deve reiniciar o desenho da teia.
        if (records.some(r =>
            r.target !== canvas &&
            !(
                r.target instanceof Element &&
                r.target.closest('.foto')
            )
        )) {
            refresh();
        }
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

                console.warn(
                    'Halloween: imagem indisponível:',
                    kind
                );

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

        if (ready) {
            batLayers = makeBatLayers();
        }

        if (ready && running) {
            schedule(30000);
        }
    });
})();