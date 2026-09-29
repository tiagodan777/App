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

            try {
                /*
                 * Na build instalada, heySent identifica
                 * o impacto de intensidade 1.0.
                 *
                 * Esta API apenas produz háptica;
                 * não envia qualquer Hey.
                 */
                Promise.resolve(
                    plugin('MargotHaptics')?.play({
                        type: 'heySent'
                    })
                ).catch(() => {});
            } catch (_) {}
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