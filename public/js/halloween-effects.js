(function () {
    'use strict';

    if (window.MargotHalloweenEffects) {
        window.MargotHalloweenEffects.destroy();
    }

    // Estes efeitos pertencem apenas ao mapa de pessoas.
    var map = document.getElementById('gridCanvas');
    if (!map) return;

    var dark = matchMedia('(prefers-color-scheme: dark)');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)');

    var canvas = document.createElement('canvas');
    canvas.id = 'margot-halloween-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
        'position:fixed;pointer-events:none;z-index:20';

    document.body.appendChild(canvas);

    var ctx = canvas.getContext('2d');

    if (!ctx) {
        canvas.remove();
        return;
    }

    var W, H;
    var left = 0;
    var top = 0;
    var points = [];
    var links = [];
    var actors = [];
    var stains = [];

    var raf = 0;
    var timer = 0;
    var last = 0;
    var healAt = 0;
    var webUntil = 0;

    var stopped = false;
    var dragging = false;
    var previous = null;
    var direction = 1;

    var swallowUntil = 0;
    var swallowedPoint = null;

    var events = new AbortController();
    var signal = events.signal;

    function visible(element) {
        for (
            var node = element;
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

            var css = getComputedStyle(node);

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

        var candidates = document.querySelectorAll(
            'dialog[open], ' +
            '[role="dialog"][aria-modal="true"], ' +
            '.mini-menu, ' +
            'input:focus, textarea:focus, select:focus, ' +
            '[contenteditable="true"]:focus'
        );

        return Array.prototype.some.call(candidates, visible);
    }

    function enabled() {
        return (
            !stopped &&
            map.isConnected &&
            dark.matches &&
            !reduce.matches &&
            !document.hidden
        );
    }

    function web() {
        points = [];
        links = [];

        var radius = Math.min(145, W * 0.36);

        for (var ray = 0; ray < 8; ray++) {
            var angle = Math.PI / 2 + ray * Math.PI / 14;

            for (var ring = 0; ring < 6; ring++) {
                var x =
                    W - 5 +
                    Math.cos(angle) * radius * ring / 5;

                var y =
                    8 +
                    Math.sin(angle) * radius * ring / 5;

                points.push({
                    x: x,
                    y: y,
                    px: x,
                    py: y,
                    homeX: x,
                    homeY: y,
                    fixed: ring === 0 || ring === 5
                });

                if (ring) {
                    join(ray * 6 + ring - 1, ray * 6 + ring);
                }

                if (ray && ring) {
                    join((ray - 1) * 6 + ring, ray * 6 + ring);
                }
            }
        }
    }

    function join(a, b) {
        links.push({
            a: a,
            b: b,
            length: Math.hypot(
                points[a].x - points[b].x,
                points[a].y - points[b].y
            ),
            broken: false
        });
    }

    function resize() {
        var rect = map.getBoundingClientRect();

        W = Math.max(1, rect.width);
        H = Math.max(1, rect.height);
        left = rect.left;
        top = rect.top;

        canvas.style.left = left + 'px';
        canvas.style.top = top + 'px';
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';

        var dpr = Math.min(devicePixelRatio || 1, 1.5);

        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        actors = [];
        stains = [];
        healAt = 0;
        webUntil = 0;

        web();
        request();
    }

    function distance(x, y, a, b) {
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var n = dx * dx + dy * dy;

        var t = n
            ? Math.max(
                0,
                Math.min(
                    1,
                    ((x - a.x) * dx + (y - a.y) * dy) / n
                )
            )
            : 0;

        return Math.hypot(
            x - a.x - t * dx,
            y - a.y - t * dy
        );
    }

    function tear(x, y, old) {
        var changed = false;

        links.forEach(function (link) {
            if (link.broken) return;

            var a = points[link.a];
            var b = points[link.b];
            var hit = distance(x, y, a, b) < 11;

            if (old) {
                var steps = Math.min(
                    30,
                    Math.ceil(Math.hypot(x - old.x, y - old.y) / 5)
                );

                for (var k = 1; !hit && k <= steps; k++) {
                    hit = distance(
                        old.x + (x - old.x) * k / steps,
                        old.y + (y - old.y) * k / steps,
                        a,
                        b
                    ) < 11;
                }
            }

            if (!hit) return;

            link.broken = true;
            changed = true;

            [a, b].forEach(function (p) {
                if (p.fixed) return;

                p.px = p.x - (old ? x - old.x : 6) * 0.35;
                p.py = p.y - 5;
            });
        });

        if (changed) {
            healAt = performance.now() + 4000;
            webUntil = healAt + 1200;
            request();
        }
    }

    function physics(dt) {
        points.forEach(function (p) {
            if (p.fixed) return;

            var vx = (p.x - p.px) * 0.94;
            var vy = (p.y - p.py) * 0.94;

            p.px = p.x;
            p.py = p.y;

            p.x += vx;
            p.y += vy + 90 * dt * dt;
        });

        for (var pass = 0; pass < 5; pass++) {
            links.forEach(function (link) {
                if (link.broken) return;

                var a = points[link.a];
                var b = points[link.b];

                var dx = b.x - a.x;
                var dy = b.y - a.y;
                var length = Math.hypot(dx, dy) || 1;
                var correction = (length - link.length) / length;
                var weight = a.fixed || b.fixed ? 1 : 0.5;

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

    function drawWeb(now) {
        var rebuilding = healAt && now >= healAt;

        var progress = rebuilding
            ? Math.min(1, (now - healAt) / 1000)
            : 0;

        if (rebuilding) {
            points.forEach(function (p) {
                p.x += (p.homeX - p.x) * 0.12;
                p.y += (p.homeY - p.y) * 0.12;
                p.px = p.x;
                p.py = p.y;
            });
        }

        links.forEach(function (link) {
            if (link.broken && !rebuilding) return;

            var a = points[link.a];
            var b = points[link.b];
            var opacity = link.broken ? progress * 0.5 : 0.5;

            ctx.strokeStyle = 'rgba(231,232,246,' + opacity + ')';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        });

        if (progress === 1) {
            web();
            healAt = 0;
        }
    }

    function pumpkin(actor, now) {
        var progress = (now - actor.start) / 2600;
        var hop = (progress * 3) % 1;

        actor.x = actor.dir > 0
            ? -48 + (W + 96) * progress
            : W + 48 - (W + 96) * progress;

        actor.y =
            actor.floor -
            4 * actor.jump * hop * (1 - hop);

        var squash =
            Math.max(
                0,
                1 - Math.min(hop, 1 - hop) / 0.12
            ) * 0.17;

        ctx.save();

        ctx.globalAlpha =
            0.2 *
            (1 - (actor.floor - actor.y) / (actor.jump * 1.25));

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(
            actor.x,
            actor.floor + 29,
            24,
            5,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(actor.x, actor.y);
        ctx.rotate(actor.dir * Math.sin(progress * 22) * 0.12);
        ctx.scale(1 + squash, 1 - squash);

        for (var i = -2; i <= 2; i++) {
            var gradient = ctx.createRadialGradient(
                i * 7 - 5, -9, 2,
                i * 7, 0, 30
            );

            gradient.addColorStop(0, '#ffc85b');
            gradient.addColorStop(0.45, '#f58116');
            gradient.addColorStop(1, '#a93806');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(i * 7, 0, 15, 25, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#577638';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -23);
        ctx.quadraticCurveTo(
            2, -35,
            9 + Math.sin(progress * 28) * 4, -32
        );
        ctx.stroke();

        ctx.fillStyle = '#38221a';

        ctx.beginPath();
        ctx.moveTo(-16, -6);
        ctx.lineTo(-6, -6);
        ctx.lineTo(-11, -15);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(6, -6);
        ctx.lineTo(16, -6);
        ctx.lineTo(11, -15);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-15, 7);
        ctx.lineTo(-5, 11);
        ctx.lineTo(0, 6);
        ctx.lineTo(5, 11);
        ctx.lineTo(15, 7);
        ctx.quadraticCurveTo(0, 26, -15, 7);
        ctx.fill();

        ctx.restore();

        return progress < 1;
    }

    function bat(actor, now) {
        var progress = (now - actor.start) / 2600;

        actor.x = actor.dir > 0
            ? -50 + (W + 100) * progress
            : W + 50 - (W + 100) * progress;

        actor.y =
            actor.y0 +
            actor.vertical * (W + 100) * progress;

        ctx.save();
        ctx.translate(actor.x, actor.y);
        ctx.rotate(actor.vertical * actor.dir * Math.PI / 4);

        var flap =
            0.45 +
            0.55 * Math.abs(Math.sin((now - actor.start) / 85));

        ctx.scale(1, flap);

        var gradient = ctx.createLinearGradient(0, -18, 0, 18);
        gradient.addColorStop(0, '#82708e');
        gradient.addColorStop(1, '#322739');
        ctx.fillStyle = gradient;

        [-1, 1].forEach(function (side) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(
                side * 12, -24,
                side * 33, -27,
                side * 44, -14
            );
            ctx.quadraticCurveTo(side * 30, -13, side * 30, 6);
            ctx.quadraticCurveTo(side * 17, -2, side * 13, 15);
            ctx.lineTo(0, 8);
            ctx.fill();
        });

        ctx.restore();

        ctx.save();
        ctx.translate(actor.x, actor.y);
        ctx.fillStyle = '#392c40';

        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(-7, -20);
        ctx.lineTo(0, -13);
        ctx.lineTo(7, -20);
        ctx.lineTo(6, -8);
        ctx.fill();

        ctx.fillStyle = '#ffd899';
        ctx.fillRect(-4, -9, 2, 2);
        ctx.fillRect(2, -9, 2, 2);

        ctx.restore();

        return progress < 1;
    }

    function splat(actor) {
        var drops = [];

        for (var i = 0; i < 15; i++) {
            drops.push({
                angle: Math.random() * Math.PI * 2,
                radius: 15 + Math.random() * 60,
                size: 3 + Math.random() * 10,
                drip: 20 + Math.random() * 95
            });
        }

        stains.push({
            x: actor.x,
            y: actor.y,
            start: performance.now(),
            color: actor.kind === 'pumpkin'
                ? '244,113,22'
                : '165,35,55',
            drops: drops
        });

        actors = actors.filter(function (item) {
            return item !== actor;
        });

        request();
    }

    function drawStains(now) {
        stains = stains.filter(function (stain) {
            var age = (now - stain.start) / 1000;

            if (age >= 3.4) return false;

            var spread = Math.min(1, age * 7);
            var fade = Math.min(1, (3.4 - age) / 1.2);

            ctx.fillStyle =
                'rgba(' + stain.color + ',' + (0.78 * fade) + ')';

            stain.drops.forEach(function (drop) {
                var x =
                    stain.x +
                    Math.cos(drop.angle) * drop.radius * spread;

                var y =
                    stain.y +
                    Math.sin(drop.angle) * drop.radius * spread;

                var drip =
                    drop.drip *
                    Math.pow(Math.min(1, age / 3.4), 1.8);

                ctx.beginPath();
                ctx.ellipse(
                    x, y,
                    drop.size, drop.size,
                    0, 0, Math.PI * 2
                );
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(x - drop.size * 0.3, y);

                ctx.bezierCurveTo(
                    x - drop.size * 0.2, y + drip * 0.6,
                    x - 3, y + drip,
                    x, y + drip + 5
                );

                ctx.bezierCurveTo(
                    x + 3, y + drip,
                    x + drop.size * 0.2, y + drip * 0.6,
                    x + drop.size * 0.3, y
                );

                ctx.fill();
            });

            return true;
        });
    }

    function frame(now) {
        raf = 0;

        if (!enabled()) return;

        if (now - last < 32) {
            request();
            return;
        }

        var dt = Math.min((now - last) / 1000 || 0.033, 0.04);
        last = now;

        ctx.clearRect(0, 0, W, H);

        if (blocked()) {
            actors = [];
            stains = [];
            dragging = false;
            return;
        }

        if (now < webUntil) {
            physics(dt);
        }

        drawWeb(now);

        actors = actors.filter(function (actor) {
            if (now < actor.start) return true;

            return actor.kind === 'pumpkin'
                ? pumpkin(actor, now)
                : bat(actor, now);
        });

        drawStains(now);

        if (actors.length || stains.length || now < webUntil) {
            request();
        }
    }

    function request() {
        if (!raf && enabled()) {
            raf = requestAnimationFrame(frame);
        }
    }

    function schedule() {
        clearTimeout(timer);

        if (!enabled()) return;

        timer = setTimeout(function () {
            if (enabled() && !blocked()) {
                var now = performance.now();

                actors.push({
                    kind: 'pumpkin',
                    dir: direction,
                    start: now,
                    floor: H * (0.35 + Math.random() * 0.4),
                    jump: 40 + Math.random() * 45,
                    x: -100,
                    y: -100
                });

                var vertical = Math.random() < 0.5 ? -1 : 1;

                actors.push({
                    kind: 'bat',
                    dir: -direction,
                    vertical: vertical,
                    start: now + 700,
                    y0: vertical > 0 ? H * 0.15 : H * 0.85,
                    x: -100,
                    y: -100
                });

                direction *= -1;
                request();
            }

            schedule();
        }, 30000);
    }

    function allowedTarget(target) {
        return (
            target instanceof Element &&
            !target.closest(
                'button,a,input,textarea,select,' +
                '[contenteditable="true"],[role="button"],video,' +
                '.foto,#menuPrincipal,#heys-area,.mini-menu'
            )
        );
    }

    function hit(x, y) {
        if (x < 0 || y < 0 || x > W || y > H) {
            return false;
        }

        for (var i = actors.length - 1; i >= 0; i--) {
            var actor = actors[i];

            if (
                performance.now() >= actor.start &&
                Math.hypot(x - actor.x, y - actor.y) < 40
            ) {
                splat(actor);
                return true;
            }
        }

        if (
            x > W - Math.min(145, W * 0.36) - 12 &&
            y < 170
        ) {
            dragging = true;
            previous = { x: x, y: y };
            tear(x, y, null);
            return true;
        }

        return false;
    }

    function start(x, y, target, event) {
        if (
            !enabled() ||
            blocked() ||
            !allowedTarget(target)
        ) {
            return;
        }

        if (hit(x - left, y - top)) {
            swallowedPoint = { x: x, y: y };
            swallowUntil = performance.now() + 500;

            if (event.cancelable) {
                event.preventDefault();
            }

            event.stopPropagation();
        }
    }

    document.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) return;

        start(
            event.touches[0].clientX,
            event.touches[0].clientY,
            event.target,
            event
        );
    }, {
        capture: true,
        passive: false,
        signal: signal
    });

    document.addEventListener('touchmove', function (event) {
        if (!dragging) return;

        if (event.touches.length !== 1) {
            dragging = false;
            return;
        }

        var touch = event.touches[0];
        var x = touch.clientX - left;
        var y = touch.clientY - top;

        tear(x, y, previous);
        previous = { x: x, y: y };

        if (event.cancelable) {
            event.preventDefault();
        }

        event.stopPropagation();
    }, {
        capture: true,
        passive: false,
        signal: signal
    });

    function end() {
        if (dragging) {
            swallowedPoint = previous
                ? {
                    x: previous.x + left,
                    y: previous.y + top
                }
                : null;

            swallowUntil = performance.now() + 400;
        }

        dragging = false;
        previous = null;
    }

    document.addEventListener('touchend', end, {
        signal: signal
    });

    document.addEventListener('touchcancel', end, {
        signal: signal
    });

    document.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'touch') {
            start(
                event.clientX,
                event.clientY,
                event.target,
                event
            );
        }
    }, {
        capture: true,
        signal: signal
    });

    document.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch' || !dragging) return;

        var x = event.clientX - left;
        var y = event.clientY - top;

        tear(x, y, previous);
        previous = { x: x, y: y };
    }, {
        signal: signal
    });

    document.addEventListener('pointercancel', end, {
        signal: signal
    });

    document.addEventListener('pointerup', function (event) {
        if (event.pointerType !== 'touch') {
            end();
        }
    }, {
        signal: signal
    });

    document.addEventListener('click', function (event) {
        if (
            performance.now() < swallowUntil &&
            swallowedPoint &&
            Math.hypot(
                event.clientX - swallowedPoint.x,
                event.clientY - swallowedPoint.y
            ) < 45 &&
            allowedTarget(event.target)
        ) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, {
        capture: true,
        signal: signal
    });

    function sync() {
        cancelAnimationFrame(raf);
        raf = 0;

        clearTimeout(timer);
        actors = [];
        stains = [];
        end();

        canvas.hidden = !enabled();
        ctx.clearRect(0, 0, W, H);

        if (enabled()) {
            web();
            healAt = 0;
            webUntil = 0;
            last = 0;

            request();
            schedule();
        }
    }

    function destroy() {
        if (uiObserver) {
            uiObserver.disconnect();
        }

        if (sizeObserver) {
            sizeObserver.disconnect();
        }

        stopped = true;

        cancelAnimationFrame(raf);
        clearTimeout(timer);
        events.abort();

        dark.removeEventListener('change', sync);
        reduce.removeEventListener('change', sync);

        canvas.remove();

        if (window.MargotHalloweenEffects === api) {
            window.MargotHalloweenEffects = null;
        }
    }

    var api = {
        destroy: destroy
    };

    window.MargotHalloweenEffects = api;

    dark.addEventListener('change', sync);
    reduce.addEventListener('change', sync);

    document.addEventListener('focusin', request, {
        signal: signal
    });

    document.addEventListener('focusout', request, {
        signal: signal
    });

    document.addEventListener('visibilitychange', sync, {
        signal: signal
    });

    document.addEventListener('margot:page-leave', destroy, {
        once: true,
        signal: signal
    });

    window.addEventListener('resize', resize, {
        signal: signal
    });

    window.addEventListener('blur', end, {
        signal: signal
    });

    var uiObserver = new MutationObserver(function () {
        request();
    });

    uiObserver.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: [
            'class',
            'style',
            'hidden',
            'open',
            'aria-hidden',
            'aria-modal'
        ]
    });

    var sizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(resize)
        : null;

    if (sizeObserver) {
        sizeObserver.observe(map);
    }

    window.addEventListener('scroll', resize, {
        passive: true,
        signal: signal
    });

    resize();
    sync();
})();