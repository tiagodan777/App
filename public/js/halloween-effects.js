(function () {
    'use strict';

    window.MargotHalloweenEffects?.destroy();

    const map = document.getElementById('gridCanvas');
    const page = document.querySelector(
        '#gridCanvas,#mensagens-pagina,#chat-pagina,#perfil'
    );

    if (!page) return;

    const script = document.currentScript;
    const assets = script?.getAttribute('data-assets');

    if (!assets) return;

    const assetRoot = new URL(assets, document.baseURI);
    const memberId = (
        script.getAttribute('data-member') || ''
    ).trim().toLowerCase();

    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');

    const canvas = document.createElement('canvas');
    canvas.id = 'margot-halloween-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;pointer-events:none;z-index:20';
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
    const pulseTimers = new Set();

    let batLayers = null;
    let spiderBody = null;
    let builders = [];
    let repairJobs = [];
    let repairTimer = 0;

    let W = 1, H = 1, left = 0, top = 0;
    let nodes = [], strands = [], actors = [], stains = [];
    let raf = 0, timer = 0, last = 0, webActiveUntil = 0;
    let running = false, disposed = false, ready = false;
    let nextKind = 'pumpkin', pumpkinDirection = 1, batDirection = -1;
    let finger = null, swallowed = null, swallowUntil = 0;
    let observer;

    let lastHaptic = -1000;
    let hapticBusy = false;
    let hapticPlugin;
    let physicsDebt = 0;
    let lastTear = -1000;

    let lastPhysics = 0;
    let previousFloor = .7;
    let previousCenter = .5;
    let lastGroup = -2;
    let passages = 0;

    const WEB_TOP = 76;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = x => x * x * (3 - 2 * x);
    const random = (a, b) => a + Math.random() * (b - a);

    function different(previous, a, b, gap) {
        const x = random(a, b);

        return Math.abs(x - previous) >= gap
            ? x
            : previous < (a + b) / 2 ? b : a;
    }

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
            ) return false;

            const css = getComputedStyle(n);

            if (
                css.display === 'none' ||
                css.visibility === 'hidden' ||
                css.visibility === 'collapse'
            ) return false;
        }

        return true;
    }

    function blocked() {
        if (
            !visible(page) ||
            document.body.classList.contains('hoje-editor-aberto') ||
            document.body.classList.contains('margot-mini-menu-aberto')
        ) return true;

        return [...document.querySelectorAll(
            'dialog[open],[role="dialog"][aria-modal="true"],.mini-menu,' +
            'input:focus,textarea:focus,select:focus,' +
            '[contenteditable="true"]:focus'
        )].some(visible);
    }

    function eligible() {
        return (
            !disposed &&
            page.isConnected &&
            dark.matches &&
            !reduce.matches &&
            !document.hidden &&
            !(
                window.visualViewport &&
                visualViewport.height < innerHeight * .8
            ) &&
            !blocked()
        );
    }

    function request() {
        if (running && !raf) {
            raf = requestAnimationFrame(draw);
        }
    }

    function makeWeb() {
        stopRepairs();
        nodes = [];
        strands = [];

        if (!map) return;

        function web(cx, cy, radius, rays, rings, start, sweep, flat, seed) {
            const base = nodes.length;

            for (let ray = 0; ray < rays; ray++) {
                const angle =
                    start +
                    sweep * ray / (rays - 1) +
                    Math.sin(ray * 2.4 + seed) * .025;

                for (let ring = 0; ring < rings.length; ring++) {
                    const r =
                        radius *
                        rings[ring] *
                        (1 + Math.sin(ray * 1.8 + ring + seed) * .045);

                    const x = cx + Math.cos(angle) * r;
                    const y = cy + Math.sin(angle) * r * flat;

                    nodes.push({
                        x, y,
                        px: x, py: y,
                        hx: x, hy: y,
                        fixed: ring === 0 || ring === rings.length - 1
                    });

                    const i = base + ray * rings.length + ring;

                    if (ring) {
                        join(i - 1, i, false, ring, cx, cy);
                    }

                    if (ray && ring) {
                        join(i - rings.length, i, true, ring, cx, cy);
                    }
                }
            }
        }

        web(
            W - 5,
            WEB_TOP,
            Math.min(235, W * .56, H * .33),
            10,
            [0, .10, .22, .37, .55, .76, 1],
            Math.PI / 2,
            Math.PI / 2,
            1,
            1
        );

        const menu = document
            .getElementById('menuPrincipal')
            ?.getBoundingClientRect();

        const bottom = menu && menu.height > 0
            ? Math.min(H - 85, menu.top - top - 18)
            : H - 110;

        web(
            7,
            Math.max(260, bottom),
            Math.min(195, W * .46, H * .27),
            8,
            [0, .16, .34, .57, .80, 1],
            -Math.PI / 2,
            Math.PI / 2,
            .80,
            4
        );
    }

    function join(a, b, arc, ring, cx, cy) {
        strands.push({
            a, b, arc, ring, cx, cy,
            length: Math.hypot(
                nodes[a].x - nodes[b].x,
                nodes[a].y - nodes[b].y
            ),
            cut: 0
        });
    }

    function resize() {
        const r = map
            ? map.getBoundingClientRect()
            : {
                width: innerWidth,
                height: innerHeight,
                left: 0,
                top: 0
            };

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

        actors = [];
        stains = [];
        finger = null;
        webActiveUntil = 0;
        lastPhysics = performance.now();
        physicsDebt = 0;

        clearPulses();
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

    function clearPulses() {
        pulseTimers.forEach(id => clearTimeout(id));
        pulseTimers.clear();
    }

    function haptic(level = 0, interval = 160, profile) {
        if (!running || !eligible() || hapticBusy) return;

        const now = performance.now();
        level = clamp(Math.round(level), 0, 2);

        if (now - lastHaptic < interval) return;

        lastHaptic = now;

        const type = ['shutter', 'interaction', 'heySent'][level];

        profile ||= level === 2
            ? 'navigation'
            : level === 1 ? 'selection' : undefined;

        try {
            const cap = window.Capacitor;

            if (
                cap?.isNativePlatform?.() &&
                cap.isPluginAvailable?.('MargotHaptics')
            ) {
                hapticPlugin ||=
                    cap.Plugins?.MargotHaptics ||
                    cap.registerPlugin('MargotHaptics');

                hapticBusy = true;

                Promise.resolve(hapticPlugin.play({
                    type,
                    ...(profile ? { profile } : {})
                }))
                    .catch(() => {})
                    .finally(() => {
                        hapticBusy = false;
                    });
            } else {
                navigator.vibrate?.([10, 16, 24][level]);
            }
        } catch (_) {
            hapticBusy = false;
        }
    }

    function captureHaptic(kind, milestone = 0) {
        clearPulses();

        haptic(
            2,
            100,
            kind === 'pumpkin' || milestone
                ? 'navigation'
                : undefined
        );

        const pattern = milestone === 2
            ? [[170, 1], [360, 2], [620, 2]]
            : milestone === 1
                ? [[180, 1], [390, 2]]
                : [[kind === 'pumpkin' ? 190 : 130, 0]];

        pattern.forEach(([delay, level]) => {
            const id = setTimeout(() => {
                pulseTimers.delete(id);

                haptic(
                    level,
                    100,
                    milestone && level === 2
                        ? 'navigation'
                        : undefined
                );
            }, delay);

            pulseTimers.add(id);
        });
    }

    function webPull() {
        if (!finger) return 0;

        return Math.max(0, ...finger.grips.map(g => {
            const p = nodes[g.i];
            return Math.hypot(p.x - p.hx, p.y - p.hy);
        }));
    }

    function grab(x, y) {
        return nodes
            .map((p, i) => ({
                i,
                d: Math.hypot(p.x - x, p.y - y)
            }))
            .filter(n => !nodes[n.i].fixed && n.d < 40)
            .sort((a, b) => a.d - b.d)
            .slice(0, 2)
            .map(n => ({
                i: n.i,
                dx: nodes[n.i].x - x,
                dy: nodes[n.i].y - y
            }));
    }

    function segmentNear(ax, ay, bx, by, p, q) {
        const cross = (x, y, u, v) => x * v - y * u;

        const dx = bx - ax;
        const dy = by - ay;
        const ex = q.x - p.x;
        const ey = q.y - p.y;

        const den = cross(dx, dy, ex, ey);

        if (Math.abs(den) > .00001) {
            const t = cross(p.x - ax, p.y - ay, ex, ey) / den;
            const u = cross(p.x - ax, p.y - ay, dx, dy) / den;

            if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                return true;
            }
        }

        return Math.min(
            distance(ax, ay, p, q),
            distance(bx, by, p, q),
            distance(p.x, p.y, { x: ax, y: ay }, { x: bx, y: by }),
            distance(q.x, q.y, { x: ax, y: ay }, { x: bx, y: by })
        ) < 12;
    }

    function tearWeb(x, y, speed, travel, now) {
        if (travel < 3 || now - lastTear < 110) return 0;

        const pull = webPull();

        if (pull < 45 && !(speed > .55 && finger.travel > 28)) {
            return 0;
        }

        const grips = new Set(finger.grips.map(g => g.i));

        const candidates = strands.filter(s => {
            if (s.cut) return false;

            const a = nodes[s.a];
            const b = nodes[s.b];

            const stretched =
                (grips.has(s.a) || grips.has(s.b)) &&
                pull > 45 &&
                Math.hypot(b.x - a.x, b.y - a.y) > s.length * 1.25 + 2;

            return stretched || segmentNear(
                finger.x, finger.y, x, y, a, b
            );
        });

        candidates.sort((a, b) =>
            distance(x, y, nodes[a.a], nodes[a.b]) -
            distance(x, y, nodes[b.a], nodes[b.b])
        );

        const chosen = candidates.slice(0, 3);

        chosen.forEach(s => {
            const a = nodes[s.a];
            const b = nodes[s.b];

            s.cut = now;
            s.mx = (a.x + b.x) / 2;
            s.my = (a.y + b.y) / 2;
        });

        if (chosen.length) {
            lastTear = now;
            haptic(2, 130);
        }

        return chosen.length;
    }

    function silkPoint(s, t, from = 0) {
        const a = nodes[from ? s.b : s.a];
        const b = nodes[from ? s.a : s.b];
        const bend = s.arc ? .045 : 0;

        const cx = (a.x + b.x) / 2 +
            (s.cx - (a.x + b.x) / 2) * bend;

        const cy = (a.y + b.y) / 2 +
            (s.cy - (a.y + b.y) / 2) * bend;

        return {
            x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
            y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y,
            cx,
            cy,
            a
        };
    }

    function stopRepairs(retreat = false) {
        clearTimeout(repairTimer);
        repairTimer = 0;
        repairJobs = [];

        if (retreat) {
            builders.forEach(b => {
                b.phase = 'exit';
                b.job = null;
            });
        } else {
            builders = [];
        }
    }

    function planRepairs(delay = 4000) {
        clearTimeout(repairTimer);
        repairTimer = 0;

        if (!map || !running || !strands.some(s => s.cut)) return;

        repairTimer = setTimeout(() => {
            repairTimer = 0;

            if (!running || !eligible() || finger) return;

            beginRepairs(performance.now());
            request();
        }, delay);
    }

    function assignRepair(b, now) {
        let best = null;
        let cost = Infinity;
        let from = 0;

        repairJobs.forEach(job => {
            if (job.claimed || !job.s.cut) return;

            [0, 1].forEach(end => {
                if (job.s.weave && end !== job.s.weave.from) return;

                const p = silkPoint(
                    job.s,
                    job.s.weave?.progress || 0,
                    end
                );

                const crowded = builders.some(other =>
                    other !== b &&
                    other.job &&
                    other.phase !== 'exit' &&
                    Math.hypot(
                        silkPoint(other.job.s, 0, other.from).x - p.x,
                        silkPoint(other.job.s, 0, other.from).y - p.y
                    ) < 32
                );

                const d = Math.hypot(p.x - b.x, p.y - b.y) +
                    (crowded ? 120 : 0);

                if (d < cost) {
                    cost = d;
                    best = job;
                    from = end;
                }
            });
        });

        if (!best) {
            b.job = null;
            b.phase = 'exit';
            return;
        }

        best.claimed = true;
        b.job = best;
        b.from = from;
        b.phase = 'travel';
        b.since = now;
    }

    function beginRepairs(now) {
        stopRepairs();

        repairJobs = strands
            .filter(s => s.cut)
            .map(s => ({ s, claimed: false }));

        if (!repairJobs.length) return;

        const count = repairJobs.length > 18
            ? 3
            : repairJobs.length > 6 ? 2 : 1;

        const right = repairJobs.filter(j => j.s.cx > W / 2);
        const bottom = repairJobs.filter(j => j.s.cx <= W / 2);

        builders = [];

        for (let i = 0; i < count; i++) {
            const group = (i % 2 && bottom.length) || !right.length
                ? bottom
                : right;

            const job = group[
                Math.floor(group.length * i / count) % group.length
            ];

            const side = job.s.cx > W / 2 ? 1 : -1;
            const p = silkPoint(job.s, 0);

            const b = {
                x: side > 0 ? W + 48 : -48,
                y: clamp(p.y + (i - 1) * 25, 50, H - 90),
                side,
                angle: side > 0 ? -Math.PI / 2 : Math.PI / 2,
                gait: i * 2.1,
                size: 1 - i * .08,
                phase: 'travel',
                job: null,
                wait: now + i * 280,
                last: now
            };

            builders.push(b);
            assignRepair(b, now);
        }

        lastPhysics = now;
        physicsDebt = 0;
    }

    function faceSpider(b, dx, dy, dt) {
        if (Math.abs(dx) + Math.abs(dy) < .001) return;

        const target = Math.atan2(dy, dx) + Math.PI / 2;

        const delta = Math.atan2(
            Math.sin(target - b.angle),
            Math.cos(target - b.angle)
        );

        b.angle += delta * (1 - Math.exp(-dt / 90));
    }

    function walkSpider(b, p, dt) {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy);
        const move = Math.min(d, dt * .092);

        faceSpider(b, dx, dy, dt);

        if (d) {
            b.x += dx / d * move;
            b.y += dy / d * move;
            b.gait += move * .13;
        }

        return d < 2;
    }

    function updateBuilders(now) {
        builders = builders.filter(b => {
            const dt = clamp(now - b.last, 0, 50);
            b.last = now;

            if (now < b.wait) return true;

            if (b.phase === 'exit') {
                return !walkSpider(b, {
                    x: b.side > 0 ? W + 52 : -52,
                    y: clamp(b.y, 50, H - 80)
                }, dt);
            }

            const s = b.job?.s;

            if (!s || !s.cut) {
                assignRepair(b, now);
                return true;
            }

            if (b.phase === 'travel') {
                const p = silkPoint(
                    s,
                    s.weave?.progress || 0,
                    b.from
                );

                if (walkSpider(b, p, dt)) {
                    b.phase = 'tie';
                    b.since = now;
                    b.gait += .3;
                }
            } else if (b.phase === 'tie') {
                b.gait += dt * .003;

                if (now - b.since >= 180) {
                    s.weave ||= {
                        from: b.from,
                        progress: 0
                    };

                    b.begin = s.weave.progress;
                    b.phase = 'weave';
                    b.since = now;

                    b.duration =
                        clamp(s.length / 55 * 1000, 420, 1500) *
                        (1 - b.begin);
                }
            } else if (b.phase === 'weave') {
                const progress = b.begin +
                    (1 - b.begin) *
                    clamp(
                        (now - b.since) / Math.max(80, b.duration),
                        0,
                        1
                    );

                const p = silkPoint(s, progress, b.from);
                const dx = p.x - b.x;
                const dy = p.y - b.y;

                faceSpider(b, dx, dy, dt);
                b.gait += Math.hypot(dx, dy) * .13;

                b.x = p.x;
                b.y = p.y;
                s.weave.progress = progress;

                if (progress >= 1) {
                    b.phase = 'seal';
                    b.since = now;
                }
            } else if (b.phase === 'seal') {
                b.gait += dt * .004;

                if (now - b.since >= 200) {
                    s.cut = 0;
                    delete s.weave;
                    assignRepair(b, now);
                }
            }

            return true;
        });

        if (!builders.length) {
            repairJobs = [];
        }
    }

    function drawSpider(b, now) {
        if (now < b.wait) return;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.scale(b.size, b.size);

        const busy = b.phase === 'tie' || b.phase === 'seal';

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const side of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const phase =
                    b.gait +
                    i * Math.PI * .85 +
                    (side < 0 ? Math.PI : 0);

                const stride = Math.sin(phase) *
                    (busy && i === 0 ? 2.1 : 3.2);

                const lift = Math.max(0, Math.cos(phase));

                const hip = {
                    x: side * 5,
                    y: -5 + i * 3.3
                };

                const knee = {
                    x: side * (
                        16 + Math.sin(i * .9) * 5 + lift * 1.2
                    ),
                    y: -15 + i * 10 + stride * .5
                };

                const foot = {
                    x: side * (
                        21 + Math.sin(i * .9) * 5 - lift * 2
                    ),
                    y: -23 + i * 14 + stride
                };

                const path = () => {
                    ctx.beginPath();
                    ctx.moveTo(hip.x, hip.y);
                    ctx.lineTo(knee.x, knee.y);
                    ctx.lineTo(foot.x, foot.y);
                };

                ctx.save();
                ctx.translate(1, 2);
                ctx.strokeStyle = 'rgba(0,0,0,.4)';
                ctx.lineWidth = 4.2;
                path();
                ctx.stroke();
                ctx.restore();

                function bone(a, z, r0, r1) {
                    const length =
                        Math.hypot(z.x - a.x, z.y - a.y) || 1;

                    const nx = -(z.y - a.y) / length;
                    const ny = (z.x - a.x) / length;
                    const mx = (a.x + z.x) / 2;
                    const my = (a.y + z.y) / 2;

                    const shine = ctx.createLinearGradient(
                        mx - nx * r0,
                        my - ny * r0,
                        mx + nx * r0,
                        my + ny * r0
                    );

                    shine.addColorStop(0, '#26162f');
                    shine.addColorStop(.28, '#765185');
                    shine.addColorStop(.45, '#a87ab5');
                    shine.addColorStop(.65, '#593968');
                    shine.addColorStop(1, '#281b35');

                    ctx.fillStyle = shine;
                    ctx.beginPath();
                    ctx.moveTo(a.x + nx * r0, a.y + ny * r0);
                    ctx.lineTo(z.x + nx * r1, z.y + ny * r1);

                    ctx.quadraticCurveTo(
                        z.x + ny * r1,
                        z.y - nx * r1,
                        z.x - nx * r1,
                        z.y - ny * r1
                    );

                    ctx.lineTo(a.x - nx * r0, a.y - ny * r0);
                    ctx.closePath();
                    ctx.fill();
                }

                bone(hip, knee, 1.8, 1.45);
                bone(knee, foot, 1.45, .35);

                const joint = ctx.createRadialGradient(
                    knee.x - .5,
                    knee.y - .6,
                    .1,
                    knee.x,
                    knee.y,
                    1.7
                );

                joint.addColorStop(0, '#b18abd');
                joint.addColorStop(.4, '#70487f');
                joint.addColorStop(1, '#34203e');

                ctx.fillStyle = joint;
                ctx.beginPath();
                ctx.arc(knee.x, knee.y, 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const bob = Math.sin(b.gait * 2) * .35;

        if (spiderBody) {
            ctx.drawImage(
                spiderBody,
                -14,
                -20 + bob,
                28,
                42
            );
        } else {
            const fill = ctx.createRadialGradient(
                -4, 2, 1, 0, 5, 13
            );

            fill.addColorStop(0, '#ad7eb7');
            fill.addColorStop(.5, '#654176');
            fill.addColorStop(1, '#271932');

            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.ellipse(0, 6 + bob, 10, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(0, -9 + bob, 7, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#eee2ff';

            for (const x of [-3, 3]) {
                ctx.beginPath();
                ctx.arc(x, -12 + bob, 1.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (busy) {
            ctx.strokeStyle = 'rgba(234,219,255,.7)';
            ctx.lineWidth = .65;

            const loop = Math.sin((now - b.since) / 35) * 2;

            ctx.beginPath();
            ctx.ellipse(
                0,
                -19,
                3 + loop * .3,
                2,
                loop * .2,
                0,
                Math.PI * 2
            );
            ctx.stroke();
        }

        ctx.restore();
    }

    function disturb(x, y) {
        const now = performance.now();
        const travel = Math.hypot(x - finger.x, y - finger.y);
        const speed = travel / Math.max(16, now - finger.at);

        finger.speed = speed;
        finger.travel += travel;

        const torn = tearWeb(x, y, speed, travel, now);

        if (!torn && travel > 1.5 && finger.travel > 7) {
            const tension = webPull() / 85;
            const level = tension > .55 || speed > .7 ? 2 : 1;

            haptic(level, level === 2 ? 160 : 210);
        }

        finger.x = x;
        finger.y = y;
        finger.at = now;

        webActiveUntil = Infinity;
        request();
    }

    function simulateWeb(now) {
        physicsDebt += clamp(now - lastPhysics, 0, 70);
        lastPhysics = now;

        const stepMs = 1000 / 60;

        while (physicsDebt >= stepMs) {
            physicsDebt -= stepMs;

            nodes.forEach(p => {
                if (p.fixed) return;

                const damping = finger ? .965 : .95;
                const vx = clamp((p.x - p.px) * damping, -8, 8);
                const vy = clamp((p.y - p.py) * damping, -8, 8);

                p.px = p.x;
                p.py = p.y;

                const pull = Math.hypot(p.x - p.hx, p.y - p.hy);
                const spring = .004 + Math.min(pull, 120) * .000045;

                p.x += vx + (p.hx - p.x) * spring;
                p.y += vy + (p.hy - p.y) * spring;
            });

            if (finger) {
                finger.grips.forEach(g => {
                    const p = nodes[g.i];
                    const dx = finger.x + g.dx - p.hx;
                    const dy = finger.y + g.dy - p.hy;
                    const d = Math.hypot(dx, dy);

                    const k = d
                        ? 200 * (1 - Math.exp(-d / 200)) / d
                        : 0;

                    p.x += (p.hx + dx * k - p.x) * .40;
                    p.y += (p.hy + dy * k - p.y) * .40;
                });
            }

            for (let pass = 0; pass < 3; pass++) {
                strands.forEach(s => {
                    if (s.cut) return;

                    const a = nodes[s.a];
                    const b = nodes[s.b];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len = Math.hypot(dx, dy) || 1;

                    const tension = clamp(
                        (len / s.length - 1) / 1.2,
                        0,
                        1
                    );

                    const stiffness = .03 + .13 * tension * tension;
                    const f = (len - s.length) / len * stiffness;
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

                if (d > 170) {
                    p.x = p.hx + dx * 170 / d;
                    p.y = p.hy + dy * 170 / d;
                    p.px = p.x;
                    p.py = p.y;
                }
            });
        }
    }

    function drawWeb(now) {
        if (now < webActiveUntil || builders.length) {
            simulateWeb(now);
        }

        updateBuilders(now);
        ctx.lineCap = 'round';

        strands.forEach(s => {
            const a = nodes[s.a];
            const b = nodes[s.b];
            let alpha = .66 + .08 * Math.sin(s.a * 1.7);
            let grow = 1;

            ctx.lineWidth = .90 + .14 * Math.sin(s.b * .9);

            if (s.cut && !s.weave) {
                const age = clamp((now - s.cut) / 1300, 0, 1);

                if (age === 1) return;

                ctx.strokeStyle =
                    'rgba(193,157,255,' +
                    alpha * (1 - ease(age)) + ')';

                [a, b].forEach((p, i) => {
                    const k = 1 - ease(age) * .85;
                    const ex = p.x + (s.mx - p.x) * k;
                    const ey = p.y + (s.my - p.y) * k;

                    const wave =
                        Math.sin(age * 12 + i * Math.PI) *
                        (1 - age) * 7;

                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);

                    ctx.quadraticCurveTo(
                        (p.x + ex) / 2 + wave,
                        (p.y + ey) / 2 + age * 10,
                        ex,
                        ey
                    );

                    ctx.stroke();
                });

                return;
            }

            if (s.cut) {
                grow = s.weave.progress;
            }

            if (alpha < .005) return;

            const p = silkPoint(s, grow, s.weave?.from || 0);

            ctx.strokeStyle = 'rgba(193,157,255,' + alpha + ')';
            ctx.beginPath();
            ctx.moveTo(p.a.x, p.a.y);

            ctx.quadraticCurveTo(
                p.a.x + (p.cx - p.a.x) * grow,
                p.a.y + (p.cy - p.a.y) * grow,
                p.x,
                p.y
            );

            ctx.stroke();
        });

        builders.forEach(b => drawSpider(b, now));
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
        const p = clamp((now - a.start) / a.duration, 0, 1);
        const cycle = p * a.hops;
        const index = Math.min(a.hops - 1, Math.floor(cycle));
        const u = cycle - index;
        const air = clamp((u - .12) / .68, 0, 1);
        const flying = u >= .12 && u < .80;

        const lift = flying
            ? 4 * a.jumps[index] * air * (1 - air)
            : 0;

        const position = (index + ease(air)) / a.hops;

        a.x = a.dir > 0
            ? -60 + (W + 120) * position
            : W + 60 - (W + 120) * position;

        a.y = a.floor - lift - a.size / 2;

        ctx.save();
        ctx.globalAlpha = .28 * (
            1 - lift / (a.jumps[index] * 1.4)
        );
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(
            a.x,
            a.floor + 2,
            15 - lift * .06,
            3,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(a.x, a.floor - lift);
        sprite('pumpkin', a.dir > 0 ? 1 : 3, a.size);
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
                i ? g.lineTo(x, y) : g.moveTo(x, y);
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
        const p = clamp((now - a.start) / a.duration, 0, 1);
        const travel = W + 170;

        a.x = a.dir > 0
            ? -85 + travel * p
            : W + 85 - travel * p;

        const phase =
            (now - a.start) / 1000 *
            Math.PI * 2 * a.flaps;

        a.y =
            a.y0 +
            (a.y1 - a.y0) * p +
            Math.sin(p * Math.PI) * a.bend +
            Math.sin(p * Math.PI * 2) * a.wave;

        ctx.save();
        ctx.translate(a.x, a.y);

        ctx.rotate(
            a.dir *
            clamp(
                (
                    a.y1 - a.y0 +
                    Math.cos(p * Math.PI) * a.bend * Math.PI
                ) / travel,
                -1,
                1
            ) * .18
        );

        const scale = a.size / batLayers.h;

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
        const drops = Array.from({ length: 16 }, () => ({
            angle: Math.random() * Math.PI * 2,
            radius: 10 + Math.random() * 37,
            size: 8 + Math.random() * 10,
            drip: 25 + Math.random() * 65
        }));

        stains.push({
            x: a.x,
            y: a.y,
            start: performance.now(),
            color: a.kind === 'pumpkin' ? '255,91,0' : '217,5,41',
            drops
        });

        actors = actors.filter(item => item !== a);
        request();
    }

    function drawStains(now) {
        stains = stains.filter(s => {
            const age = (now - s.start) / 1000;

            if (age >= 6) return false;

            const spread =
                1 - Math.pow(1 - clamp(age / .22, 0, 1), 3);

            const fade = clamp((6 - age) / 1.8, 0, 1);

            ctx.save();
            ctx.globalAlpha = fade;
            ctx.fillStyle = 'rgb(' + s.color + ')';

            ctx.beginPath();
            ctx.ellipse(
                s.x, s.y,
                29 * spread,
                24 * spread,
                0, 0, Math.PI * 2
            );
            ctx.fill();

            s.drops.forEach(d => {
                const x =
                    s.x + Math.cos(d.angle) * d.radius * spread;

                const y =
                    s.y + Math.sin(d.angle) * d.radius * spread;

                const drip =
                    d.drip *
                    Math.pow(clamp(age / 5, 0, 1), 1.65);

                ctx.beginPath();
                ctx.ellipse(
                    x, y,
                    d.size * spread,
                    d.size * spread,
                    0, 0, Math.PI * 2
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

        if (
            now - last <
            (actors.length || finger || builders.length ? 16 : 32)
        ) {
            request();
            return;
        }

        last = now;

        ctx.clearRect(0, 0, W, H);
        drawWeb(now);

        actors = actors.filter(a =>
            now < a.start ||
            (
                a.kind === 'pumpkin'
                    ? drawPumpkin(a, now)
                    : drawBat(a, now)
            )
        );

        drawStains(now);

        if (
            actors.length ||
            stains.length ||
            builders.length ||
            now < webActiveUntil
        ) request();
    }

    function newActor(kind, index) {
        const a = {
            kind,
            start: performance.now() + index * 550,
            x: -200,
            y: -200
        };

        if (kind === 'pumpkin') {
            previousFloor = different(previousFloor, .36, .78, .14);

            Object.assign(a, {
                dir: pumpkinDirection,
                floor: H * previousFloor,
                size: random(43, 49),
                duration: random(7200, 8500),
                hops: Math.floor(random(6, 9))
            });

            a.jumps = Array.from(
                { length: a.hops },
                () => random(14, 24)
            );

            pumpkinDirection *= -1;
        } else {
            previousCenter = different(previousCenter, .32, .68, .13);

            const span = Math.min(
                H * .53,
                (W + 170) * random(.60, 1.0)
            ) * (Math.random() < .5 ? -1 : 1);

            Object.assign(a, {
                dir: batDirection,
                size: random(31, 37),
                duration: random(6200, 7800),
                flaps: random(2.2, 2.9),
                y0: clamp(H * previousCenter - span / 2, 90, H - 120),
                y1: clamp(H * previousCenter + span / 2, 90, H - 120),
                bend: random(-45, 45),
                wave: random(-12, 12)
            });

            batDirection *= -1;
        }

        return a;
    }

    function schedule(delay = 15000) {
        clearTimeout(timer);
        timer = 0;

        if (!running || !ready) return;

        timer = setTimeout(() => {
            timer = 0;

            if (!running) return;

            if (actors.length || stains.length || builders.length) {
                schedule();
                return;
            }

            passages++;

            const group =
                passages - lastGroup >= 3 &&
                Math.random() < .18;

            const count = group
                ? Math.random() < .25 ? 3 : 2
                : 1;

            if (group) {
                lastGroup = passages;
            }

            actors = Array.from({ length: count }, (_, i) =>
                newActor(
                    i === 0
                        ? nextKind
                        : Math.random() < .5 ? 'pumpkin' : 'bat',
                    i
                )
            );

            nextKind = nextKind === 'pumpkin' ? 'bat' : 'pumpkin';

            request();
            schedule();
        }, delay);
    }

    function refresh() {
        const next = eligible();

        if (next === running) return;

        running = next;
        hunt?.setVisible(running && ready);

        clearPulses();
        cancelAnimationFrame(raf);
        raf = 0;

        clearTimeout(timer);
        timer = 0;

        stopRepairs();

        actors = [];
        stains = [];
        finger = null;
        canvas.hidden = !running;

        ctx.clearRect(0, 0, W, H);

        if (running) {
            planRepairs(1200);

            webActiveUntil = nodes.some(p =>
                Math.hypot(p.x - p.hx, p.y - p.hy) > 1
            ) ? performance.now() + 2200 : 0;

            last = 0;
            lastPhysics = performance.now();

            request();
            schedule(hunt && hunt.total() < 20 ? 4000 : 30000);
        }
    }

    function allowed(target) {
        return target instanceof Element && !target.closest(
            'button,a,input,textarea,select,' +
            '[contenteditable="true"],[role="button"],' +
            'video,audio,.foto,#menuPrincipal,#heys-area,' +
            '.mini-menu,#chat-form,.chat-cabecalho'
        );
    }

    function start(x, y, target, e) {
        if (!running || !allowed(target)) return;

        const px = x - left;
        const py = y - top;

        if (px < 0 || py < 0 || px > W || py > H) return;

        let caught = false;

        const hit = actors.find(a =>
            performance.now() >= a.start &&
            Math.hypot(
                (px - a.x) / (a.kind === 'bat' ? 47 : 30),
                (py - a.y) / 30
            ) < 1
        );

        if (hit) {
            const milestone = hunt?.capture(hit.kind) || 0;

            captureHaptic(hit.kind, milestone);
            splat(hit);
            caught = true;
        } else if (nearWeb(px, py)) {
            stopRepairs(true);

            const grips = grab(px, py);

            finger = {
                x: px,
                y: py,
                at: performance.now(),
                grips,
                speed: 0,
                travel: 0
            };

            clearPulses();
            haptic(1, 120);

            lastPhysics = performance.now();
            physicsDebt = 0;

            disturb(px, py);
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

        disturb(x - left, y - top);

        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }

    function end() {
        if (finger) {
            if (webPull() > 18) {
                haptic(webPull() > 65 ? 2 : 1, 150);
            }

            swallowed = {
                x: finger.x + left,
                y: finger.y + top
            };

            swallowUntil = performance.now() + 400;
            webActiveUntil = performance.now() + 2200;

            planRepairs();
            request();
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
    }, { capture: true, signal });

    function destroy() {
        disposed = true;
        running = false;

        stopRepairs();
        clearPulses();
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        controller.abort();
        observer?.disconnect();

        dark.removeEventListener('change', refresh);
        reduce.removeEventListener('change', refresh);

        canvas.remove();
        hunt?.destroy();

        if (window.MargotHalloweenEffects === api) {
            window.MargotHalloweenEffects = null;
        }
    }

    function createHunt() {
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(memberId)) {
            return null;
        }

        const key = 'margot:halloween-hunt:2026:dual:' + memberId;
        const memory = window.__margotHalloweenProgress ||= new Map();
        const kinds = ['pumpkin', 'bat'];

        const valid = items => Array.isArray(items)
            ? items.filter(x =>
                typeof x === 'string' &&
                /^[a-z0-9-]{8,90}$/i.test(x)
            )
            : [];

        const merge = (...states) => Object.fromEntries(
            kinds.map(kind => [
                kind,
                [
                    ...new Set(
                        states.flatMap(state => valid(state?.[kind]))
                    )
                ].sort().slice(0, 10)
            ])
        );

        const read = () => {
            try {
                return merge(JSON.parse(
                    localStorage.getItem(key) || '{}'
                ));
            } catch (_) {
                return merge();
            }
        };

        let ids = merge(read(), memory.get(key));
        let enabled = false;
        let lastKind = 'pumpkin';

        let closeTimer = 0;
        let fadeTimer = 0;
        let burstTimer = 0;

        const host = document.createElement('div');
        host.id = 'margot-halloween-progress';
        host.hidden = true;

        const shadow = host.attachShadow({ mode: 'open' });

        shadow.innerHTML = `
<style>
:host{
    position:fixed;
    z-index:21;
    top:calc(env(safe-area-inset-top,0px) + ${map ? '12px' : '68px'});
    left:50%;
    transform:translateX(-50%);
    width:min(270px,calc(100vw - 72px));
    pointer-events:none;
    color:#fff;
    font:500 12px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    opacity:1;
    transition:opacity 260ms,translate 260ms;
}
:host([hidden]){display:none!important}
:host(.leaving){opacity:0;translate:0 -8px}
.card{
    --accent:#ff8b48;
    position:relative;
    box-sizing:border-box;
    padding:14px 16px 15px;
    border-radius:26px;
    background:rgba(25,24,31,.94);
    border:1px solid rgba(255,255,255,.17);
    box-shadow:0 8px 28px #0005;
    -webkit-backdrop-filter:blur(18px);
    backdrop-filter:blur(18px);
}
.card.bat{--accent:#b88aff}
.card.all{--accent:#dbbaff}
.title{
    font-size:14px;
    font-weight:800;
    letter-spacing:-.2px;
    margin:0 0 3px;
}
.message{
    font-size:12px;
    color:#d9d5e2;
    margin:0 0 12px;
    min-height:15px;
}
.row{margin-top:10px}
.labels{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:8px;
    margin-bottom:5px;
    font-size:11px;
    color:#eeeaf4;
}
.number{
    font-weight:750;
    font-variant-numeric:tabular-nums;
    white-space:nowrap;
}
.dot{
    display:inline-block;
    width:6px;
    height:6px;
    border-radius:50%;
    margin-right:6px;
    background:#ff8b48;
}
.bat-row .dot{background:#b387ff}
.track{
    height:8px;
    border-radius:999px;
    background:#ffffff1c;
    overflow:hidden;
}
.fill{
    height:100%;
    width:0%;
    border-radius:inherit;
    background:linear-gradient(90deg,#ffb15e,#ff6b31);
    transition:width 440ms cubic-bezier(.18,.8,.25,1);
}
.bat-row .fill{
    background:linear-gradient(90deg,#d0adff,#9865ff);
}
.burst{
    position:absolute;
    inset:0;
    overflow:visible;
    pointer-events:none;
}
.spark{
    position:absolute;
    left:50%;
    top:30%;
    width:5px;
    height:8px;
    border-radius:2px;
    background:var(--color);
    animation:hw-spark 1150ms cubic-bezier(.12,.6,.2,1) forwards;
    animation-delay:var(--delay);
    opacity:0;
}
.flare{
    position:absolute;
    inset:-5px;
    border:2px solid var(--accent);
    border-radius:30px;
    box-shadow:0 0 25px var(--accent);
    animation:hw-flare 850ms ease-out forwards;
}
.pop{animation:hw-pop 480ms ease-out}
.win{animation:hw-win 700ms cubic-bezier(.2,.8,.3,1)}
@keyframes hw-pop{
    0%{transform:translateY(-7px) scale(.97)}
    45%{transform:translateY(0) scale(1.025)}
    100%{transform:scale(1)}
}
@keyframes hw-win{
    0%{transform:scale(.94)}
    38%{transform:scale(1.08)}
    65%{transform:scale(.99)}
    100%{transform:scale(1)}
}
@keyframes hw-spark{
    0%{
        opacity:0;
        transform:translate(-50%,-50%) scale(.5);
    }
    15%{opacity:1}
    100%{
        opacity:0;
        transform:
            translate(
                calc(-50% + var(--dx)),
                calc(-50% + var(--dy))
            )
            rotate(var(--spin))
            scale(.4);
    }
}
@keyframes hw-flare{
    0%{opacity:.8;transform:scale(.95)}
    100%{opacity:0;transform:scale(1.22)}
}
.sr{
    position:absolute;
    width:1px;
    height:1px;
    overflow:hidden;
    clip-path:inset(50%);
    white-space:nowrap;
}
@media(prefers-reduced-motion:reduce){
    .fill,:host{transition:none}
    .pop,.win,.spark,.flare{animation:none}
}
</style>
<div class="card">
    <div class="title">Boa apanhada!</div>
    <div class="message"></div>

    <div class="row pumpkin-row">
        <div class="labels">
            <span><i class="dot"></i>Abóboras</span>
            <span class="number">0/10</span>
        </div>
        <div
            class="track"
            role="progressbar"
            aria-label="Abóboras"
            aria-valuemin="0"
            aria-valuemax="10"
            aria-valuenow="0"
        ><div class="fill"></div></div>
    </div>

    <div class="row bat-row">
        <div class="labels">
            <span><i class="dot"></i>Morcegos</span>
            <span class="number">0/10</span>
        </div>
        <div
            class="track"
            role="progressbar"
            aria-label="Morcegos"
            aria-valuemin="0"
            aria-valuemax="10"
            aria-valuenow="0"
        ><div class="fill"></div></div>
    </div>

    <div class="burst" aria-hidden="true"></div>
</div>
<span
    class="sr"
    role="status"
    aria-live="polite"
    aria-atomic="true"
></span>`;

        document.body.appendChild(host);

        const card = shadow.querySelector('.card');
        const title = shadow.querySelector('.title');
        const message = shadow.querySelector('.message');
        const live = shadow.querySelector('.sr');
        const burst = shadow.querySelector('.burst');

        function counts() {
            return {
                pumpkin: ids.pumpkin.length,
                bat: ids.bat.length
            };
        }

        function save() {
            memory.set(key, merge(ids));

            try {
                localStorage.setItem(key, JSON.stringify(ids));
            } catch (_) {}
        }

        function paint() {
            kinds.forEach(kind => {
                const n = ids[kind].length;
                const row = shadow.querySelector('.' + kind + '-row');

                row.querySelector('.number').textContent = n + '/10';

                const track = row.querySelector('.track');
                track.setAttribute('aria-valuenow', String(n));
                track.setAttribute('aria-valuetext', n + ' de 10');

                row.querySelector('.fill').style.width = (n * 10) + '%';
            });
        }

        function remaining(kind) {
            const n = 10 - ids[kind].length;

            const noun = kind === 'pumpkin'
                ? n === 1 ? 'abóbora' : 'abóboras'
                : n === 1 ? 'morcego' : 'morcegos';

            return n === 1
                ? 'Só falta 1 ' + noun + '!'
                : 'Só faltam ' + n + ' ' + noun + '!';
        }

        function words(kind, milestone) {
            const other = kind === 'pumpkin' ? 'bat' : 'pumpkin';

            if (ids.pumpkin.length === 10 && ids.bat.length === 10) {
                title.textContent = 'HALLOWEEN DOMINADO!';
                message.textContent =
                    '10 abóboras. 10 morcegos. Caça completa.';
            } else if (milestone === 1) {
                title.textContent = kind === 'pumpkin'
                    ? 'ABÓBORAS DOMINADAS!'
                    : 'MORCEGOS DOMINADOS!';

                message.textContent = remaining(other);
            } else {
                title.textContent = ids[kind].length === 10
                    ? 'Esse grupo já está completo!'
                    : 'Boa apanhada!';

                message.textContent = remaining(
                    ids[kind].length < 10 ? kind : other
                );
            }
        }

        function clearTimers() {
            clearTimeout(closeTimer);
            clearTimeout(fadeTimer);
            clearTimeout(burstTimer);
        }

        function hide() {
            clearTimers();
            host.hidden = true;
            host.classList.remove('leaving');
            card.classList.remove('pop', 'win');
            burst.replaceChildren();
            live.textContent = '';
        }

        function celebrate(kind, milestone) {
            burst.replaceChildren();

            if (!milestone) return;

            const halo = document.createElement('span');
            halo.className = 'flare';
            burst.appendChild(halo);

            const palette = milestone === 2
                ? ['#ffad60', '#b88aff', '#fff3ce']
                : kind === 'pumpkin'
                    ? ['#ff9b48', '#ffcf80', '#fff0ce']
                    : ['#ad7bff', '#dec8ff', '#f6edff'];

            for (let i = 0; i < (milestone === 2 ? 30 : 20); i++) {
                const particle = document.createElement('i');
                particle.className = 'spark';

                const angle =
                    Math.PI * 2 * i / (milestone === 2 ? 30 : 20);

                const radius = random(65, 145);

                particle.style.setProperty(
                    '--dx',
                    (Math.cos(angle) * radius) + 'px'
                );

                particle.style.setProperty(
                    '--dy',
                    (Math.sin(angle) * radius * .65 + 25) + 'px'
                );

                particle.style.setProperty(
                    '--spin',
                    random(-180, 180) + 'deg'
                );

                particle.style.setProperty(
                    '--delay',
                    random(0, 90) + 'ms'
                );

                particle.style.setProperty(
                    '--color',
                    palette[i % palette.length]
                );

                burst.appendChild(particle);
            }

            burstTimer = setTimeout(() => {
                burst.replaceChildren();
            }, 1300);
        }

        function show(kind, milestone) {
            if (!enabled) return;

            clearTimers();
            host.classList.remove('leaving');
            host.hidden = false;

            card.classList.remove('pop', 'win', 'bat', 'all');
            card.classList.toggle('bat', kind === 'bat');
            card.classList.toggle('all', milestone === 2);

            void card.offsetWidth;

            paint();
            words(kind, milestone);
            card.classList.add(milestone ? 'win' : 'pop');

            live.textContent =
                title.textContent + ' ' + message.textContent;

            celebrate(kind, milestone);

            closeTimer = setTimeout(() => {
                host.classList.add('leaving');
                fadeTimer = setTimeout(hide, 280);
            }, milestone ? 7500 : 5000);
        }

        window.addEventListener('storage', e => {
            if (e.key !== key) return;

            ids = merge(ids, read());
            paint();

            if (!host.hidden) {
                words(lastKind, 0);
            }

            if (JSON.stringify(ids) !== JSON.stringify(read())) {
                save();
            }
        }, { signal });

        save();
        paint();

        return {
            capture(kind) {
                if (!kinds.includes(kind)) return 0;

                ids = merge(ids, read());
                const before = ids[kind].length;

                if (before < 10) {
                    const id = window.crypto?.randomUUID?.() ||
                        Date.now().toString(36) + '-' +
                        Math.random().toString(36).slice(2) +
                        '-capture';

                    ids = merge(ids, { [kind]: [id] });
                    save();
                }

                const completed =
                    before < 10 && ids[kind].length === 10;

                const milestone = completed
                    ? ids.pumpkin.length === 10 && ids.bat.length === 10
                        ? 2
                        : 1
                    : 0;

                lastKind = kind;
                show(kind, milestone);

                return milestone;
            },

            total: () => ids.pumpkin.length + ids.bat.length,
            counts,

            setVisible(value) {
                enabled = value;
                if (!value) hide();
            },

            destroy() {
                hide();
                host.remove();
            }
        };
    }

    const hunt = createHunt();

    const api = {
        destroy,

        getState: () => ({
            version: 12,
            builders: builders.length,
            damagedThreads: strands.filter(s => s.cut).length,
            progress: hunt?.counts() ?? null,
            running,
            ready,
            failures: failures.slice(),
            dark: dark.matches,
            reducedMotion: reduce.matches,
            active: actors.map(a => a.kind),
            webs: map ? 2 : 0
        })
    };

    window.MargotHalloweenEffects = api;

    dark.addEventListener('change', refresh);
    reduce.addEventListener('change', refresh);

    document.addEventListener('visibilitychange', refresh, { signal });
    document.addEventListener('focusin', refresh, { signal });

    document.addEventListener('focusout', () => {
        queueMicrotask(refresh);
    }, { signal });

    document.addEventListener(
        'margot:page-leave',
        destroy,
        { once: true, signal }
    );

    window.addEventListener('blur', end, { signal });
    window.addEventListener('resize', resize, { signal });

    observer = new MutationObserver(records => {
        if (records.some(r =>
            r.target !== canvas &&
            !(
                r.target instanceof Element &&
                r.target.closest('.foto')
            )
        )) refresh();
    });

    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: [
            'class', 'style', 'hidden',
            'aria-hidden', 'aria-modal', 'open'
        ]
    });

    window.visualViewport?.addEventListener(
        'resize',
        refresh,
        { signal }
    );

    resize();
    canvas.hidden = true;
    refresh();

    if (map) {
        const image = new Image();

        image.onload = () => {
            if (!disposed) {
                spiderBody = image;
                request();
            }
        };

        image.onerror = () => {
            if (!disposed) {
                failures.push('spider');

                console.warn(
                    'Halloween: imagem da aranha indisponível; ' +
                    'a usar desenho de reserva.'
                );
            }
        };

        image.src = new URL(
            'spider-body-v12.png',
            assetRoot
        ).href;
    }

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

        ready = !!(pictures.pumpkin && pictures.bat);
        hunt?.setVisible(running && ready);

        if (ready) {
            batLayers = makeBatLayers();
        }

        if (ready && running) {
            schedule(hunt && hunt.total() < 20 ? 4000 : 30000);
        }
    });
})();