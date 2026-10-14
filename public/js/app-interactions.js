(function (window, document) {
    'use strict';

    if (window.MargotInteractionGuard) return;

    window.MargotInteractionGuard = true;

    const plugin = name =>
        window.Capacitor?.Plugins?.[name] ||
        window.Capacitor?.registerPlugin?.(name);

    const native = () =>
        Boolean(window.Capacitor?.isNativePlatform?.());

    const form = () =>
        document.getElementById('create-account-form');

    let observer;
    let observedForm;
    let direction = 1;
    let lastHaptic = 0;

    function isTextControl(event) {
        const target =
            event.composedPath?.()[0] ||
            event.target;

        const element =
            target instanceof Element
                ? target
                : target?.parentElement;

        return Boolean(
            element &&
            (
                element.isContentEditable ||
                element.closest('input, textarea, select')
            )
        );
    }

    for (const name of [
        'contextmenu',
        'selectstart',
        'dragstart'
    ]) {
        document.addEventListener(
            name,
            event => {
                if (!isTextControl(event)) {
                    event.preventDefault();
                }
            },
            {
                capture: true,
                passive: false
            }
        );
    }

    function hideAccessory() {
        if (
            !form() ||
            !native() ||
            window.Capacitor.getPlatform() !== 'ios'
        ) {
            return;
        }

        try {
            Promise.resolve(
                plugin('Keyboard')?.setAccessoryBarVisible({
                    isVisible: false
                })
            ).catch(() => {});
        } catch (_) {}
    }

    function animateStep(element) {
        if (
            !element?.animate ||
            window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches
        ) {
            return;
        }

        /*
         * Substitui a entrada curta aplicada pelo controlador
         * existente, sem duplicá-la.
         */
        element.getAnimations().forEach(animation => {
            animation.cancel();
        });

        const animation = element.animate(
            [
                {
                    opacity: 0,
                    filter: 'blur(5px)',
                    transform:
                        `translate3d(${direction * 24}px,8px,0) scale(.985)`
                },
                {
                    opacity: 1,
                    filter: 'blur(0)',
                    transform:
                        'translate3d(0,0,0) scale(1)'
                }
            ],
            {
                duration: 380,
                easing: 'cubic-bezier(.2,.8,.2,1)'
            }
        );

        animation.finished.catch(() => {});
    }

    function setup() {
        const current = form();

        hideAccessory();

        if (current === observedForm) return;

        observer?.disconnect();

        observedForm = current;

        if (!current) return;

        observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (
                        node instanceof Element &&
                        node.parentElement === current &&
                        node.tagName === 'DIV'
                    ) {
                        animateStep(node);
                    }
                }
            }

            hideAccessory();
        });

        observer.observe(current, {
            childList: true
        });
    }

    document.addEventListener(
        'click',
        event => {
            const link = event.target.closest?.(
                '#create-account-form [data-etapa]'
            );

            if (
                !link ||
                link.getAttribute('aria-disabled') === 'true'
            ) {
                return;
            }

            const current = form()?.querySelector('div[id]');

            const templates =
                document.getElementById(
                    'create-account-campos-cache'
                )?.content;

            const steps = templates
                ? Array.from(
                    templates.querySelectorAll('div[id]')
                ).map(node => '#' + node.id)
                : [];

            direction =
                steps.indexOf(link.dataset.etapa) <
                steps.indexOf('#' + current?.id)
                    ? -1
                    : 1;

            if (
                !native() ||
                Date.now() - lastHaptic < 140
            ) {
                return;
            }

            lastHaptic = Date.now();

            function fallback() {
                try { navigator.vibrate?.(18); } catch (_) {}
            }
            try {
                if (!window.Capacitor.isPluginAvailable?.('MargotHaptics')) {
                    fallback();
                    return;
                }
                // O tipo mantém compatibilidade; a nova build usa o perfil de navegação.
                Promise.resolve(
                    plugin('MargotHaptics')?.play({
                        type: 'heySent',
                        profile: 'navigation'
                    })
                ).catch(fallback);
            } catch (_) { fallback(); }
        },
        true
    );

    document.addEventListener(
        'focusin',
        hideAccessory
    );

    window.addEventListener(
        'keyboardWillShow',
        hideAccessory
    );

    window.addEventListener(
        'keyboardDidShow',
        hideAccessory
    );

    document.addEventListener(
        'margot:page-ready',
        setup
    );

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            setup,
            { once: true }
        );
    } else {
        setup();
    }
})(window, document);

/* Movimento visual do menu principal. Não altera cliques, navegação ou hápticas. */
(() => {
    'use strict';
    if (window.MargotMenuMotion) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Map();
    let bar = null, selected = null, press = null, frame = 0, motionUntil = 0;
    const buttons = '#menuPrincipal a[href], #menuPrincipal .menu-principal-botao';
    const control = target => target?.closest?.(buttons);

    function animate(element, frames, duration, hold = false) {
        if (!element?.animate || reduced.matches) return;
        animations.get(element)?.cancel();
        const animation = element.animate(frames, {
            duration, easing: 'cubic-bezier(.2,.7,.25,1)', fill: hold ? 'forwards' : 'none'
        });
        animations.set(element, animation);
        motionUntil = performance.now() + duration;
        animation.finished.then(() => {
            if (!hold && animations.get(element) === animation) animations.delete(element);
        }).catch(() => {});
    }

    function icon(button) {
        return Array.from(button?.children || []).find(el =>
            el.matches('img, svg') && getComputedStyle(el).display !== 'none'
        );
    }

    function updateSelection() {
        frame = 0;
        if (!bar) return;
        const button = bar.querySelector('a[aria-current="page"], a.active');
        if (!button) {
            selected = null;
            bar.dataset.menuReady = 'false';
            return;
        }
        if (!button.offsetWidth || !bar.offsetWidth) return;
        // offsetLeft/offsetWidth não incluem a escala animada da barra.
        let x = 0, node = button;
        while (node && node !== bar) { x += node.offsetLeft; node = node.offsetParent; }
        if (node !== bar) return;
        bar.style.setProperty('--menu-choice-x', x + 'px');
        bar.style.setProperty('--menu-choice-width', button.offsetWidth + 'px');
        bar.style.setProperty('--menu-choice-height', button.offsetHeight + 'px');
        if (selected && selected !== button) motionUntil = performance.now() + 340;
        selected = button;
        bar.dataset.menuReady = 'true';
    }

    function schedule() {
        if (!frame) frame = requestAnimationFrame(updateSelection);
    }

    function release(cancelled = false, keyboard = false) {
        if (!press) return;
        const current = press;
        press = null;
        const barStart = getComputedStyle(bar).transform;
        const image = current.image;
        const imageStart = image ? getComputedStyle(image).transform : 'none';
        animations.get(bar)?.cancel();
        if (image) animations.get(image)?.cancel();
        if (reduced.matches) return;
        if (cancelled) {
            animate(bar, [{ transform: barStart }, { transform: 'none' }], 130);
            animate(image, [{ transform: imageStart }, { transform: 'none' }], 130);
            return;
        }
        const side = current.side;
        if (keyboard) {
            animate(bar, [
                { transform: barStart, offset: 0 },
                { transform: 'scale(1.018,1.045)', offset: .25 },
                { transform: 'scale(1.006,.985)', offset: .62 },
                { transform: 'none', offset: 1 }
            ], 360);
            animate(image, [
                { transform: imageStart, offset: 0 },
                { transform: 'translateY(-1px) scale(1.12)', offset: .25 },
                { transform: 'scale(.97)', offset: .62 },
                { transform: 'none', offset: 1 }
            ], 360);
            return;
        }
        animate(bar, [
            { transform: barStart, offset: 0 },
            { transform: `translateX(${side * -.45}px) scale(1.006,.985)`, offset: .38 },
            { transform: `translateX(${side * .2}px) scale(1.002,1.009)`, offset: .68 },
            { transform: 'none', offset: 1 }
        ], 360);
        animate(image, [
            { transform: imageStart, offset: 0 },
            { transform: `translateY(.45px) scale(.97) rotate(${side * -1.2}deg)`, offset: .38 },
            { transform: `translateY(-.2px) scale(1.025) rotate(${side * .5}deg)`, offset: .68 },
            { transform: 'none', offset: 1 }
        ], 360);
    }

    function begin(button, pointerId, x, y) {
        if (!bar || reduced.matches || button.matches(':disabled, [aria-disabled="true"]')) return;
        window.MargotNavigation?.finishAnimation?.();
        if (press) release(true);
        const bounds = bar.getBoundingClientRect();
        const center = button.getBoundingClientRect();
        const side = Math.max(-1, Math.min(1, ((center.left + center.width / 2) - (bounds.left + bounds.width / 2)) / (bounds.width / 2)));
        const image = icon(button);
        const barStart = getComputedStyle(bar).transform;
        const imageStart = image ? getComputedStyle(image).transform : 'none';
        press = { button, pointerId, x, y, side, image };
        animate(bar, [
            { transform: barStart },
            { transform: `translateX(${side * .7}px) scale(1.018,1.045)` }
        ], 110, true);
        animate(image, [
            { transform: imageStart },
            { transform: `translateY(-1px) scale(1.12) rotate(${side * 1.4}deg)` }
        ], 110, true);
    }

    function setup() {
        const next = document.querySelector('#menuPrincipal > nav > ul');
        if (!next || next === bar) return;
        bar = next;
        bar.dataset.menuMotion = 'true';
        new MutationObserver(schedule).observe(bar, {
            subtree: true, attributes: true, attributeFilter: ['class', 'aria-current']
        });
        if (window.ResizeObserver) new ResizeObserver(schedule).observe(bar);
        schedule();
    }

    document.addEventListener('pointerdown', event => {
        const button = control(event.target);
        if (!button || !event.isPrimary || event.button !== 0) return;
        begin(button, event.pointerId, event.clientX, event.clientY);
    }, { capture: true, passive: true });
    document.addEventListener('pointermove', event => {
        if (!press || event.pointerId !== press.pointerId) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 14) release(true);
    }, { passive: true });
    document.addEventListener('pointerup', event => {
        if (press && event.pointerId === press.pointerId) release();
    }, { passive: true });
    document.addEventListener('pointercancel', event => {
        if (press && event.pointerId === press.pointerId) release(true);
    }, { passive: true });
    document.addEventListener('click', event => {
        const button = control(event.target);
        if (!button || event.detail !== 0) return;
        begin(button, null, 0, 0);
        release(false, true);
    }, true);
    function reset() {
        press = null;
        motionUntil = 0;
        animations.forEach(animation => animation.cancel());
        animations.clear();
    }
    reduced.addEventListener?.('change', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    window.addEventListener('pagehide', reset);
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('margot:page-ready', schedule);
    window.MargotMenuMotion = { isAnimating: () => !reduced.matches && (Boolean(press) || performance.now() < motionUntil) };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
})();