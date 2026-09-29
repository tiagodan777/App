(() => {
    'use strict';

    if (window.MargotDaylieInterface) return;

    const draft = document.getElementById('daylie-draft');
    if (!draft) return;

    window.MargotDaylieInterface = true;

    const caption = draft.querySelector('textarea');
    const viewport = window.visualViewport;

    let keyboardHeight = 0;
    let fullHeight = window.innerHeight;
    let wasOpen = false;
    let frame = 0;

    function fitCaption() {
        caption.style.height = 'auto';

        caption.style.height =
            Math.min(
                96,
                Math.max(48, caption.scrollHeight + 2)
            ) + 'px';
    }

    function update() {
        frame = 0;
        if (!draft.open) return;

        const rect = draft.getBoundingClientRect();

        const viewportBottom = viewport
            ? viewport.offsetTop + viewport.height
            : window.innerHeight;

        // O navegador ou o iOS podem já ter reduzido a área visível.
        // Não descontamos a altura do teclado duas vezes.
        const nativeBottom = keyboardHeight > 0
            ? fullHeight - keyboardHeight
            : window.innerHeight;

        const bottom = Math.min(
            window.innerHeight,
            viewportBottom,
            nativeBottom
        );

        const inset = Math.max(0, rect.bottom - bottom);

        const typing = keyboardHeight > 0 || (
            document.activeElement === caption &&
            (
                inset > 80 ||
                fullHeight - viewportBottom > 80
            )
        );

        draft.style.setProperty(
            '--daylie-keyboard-inset',
            inset + 'px'
        );

        draft.classList.toggle('daylie-typing', typing);
    }

    function schedule() {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
    }

    function syncOpen() {
        if (draft.open && !wasOpen) {
            fullHeight = window.innerHeight;
            keyboardHeight = 0;

            draft.querySelector('[data-draft-cancel]').focus({
                preventScroll: true
            });

            fitCaption();
        }

        wasOpen = draft.open;

        if (!draft.open) {
            draft.style.removeProperty('--daylie-keyboard-inset');
            draft.classList.remove('daylie-typing');
        }

        schedule();
    }

    new MutationObserver(syncOpen).observe(draft, {
        attributes: true,
        attributeFilter: ['open']
    });

    caption.addEventListener('input', () => {
        fitCaption();
        schedule();
    });

    caption.addEventListener('focus', schedule);
    caption.addEventListener('blur', schedule);

    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);

    window.addEventListener('resize', () => {
        if (
            !keyboardHeight &&
            document.activeElement !== caption
        ) {
            fullHeight = window.innerHeight;
        }

        schedule();
    });

    // Eventos emitidos pelo plugin Keyboard já instalado na app.
    for (const name of ['keyboardWillShow', 'keyboardDidShow']) {
        window.addEventListener(name, (event) => {
            if (!draft.open) return;

            keyboardHeight = Math.max(
                0,
                Number(
                    event.keyboardHeight ??
                    event.detail?.keyboardHeight
                ) || 0
            );

            schedule();
        });
    }

    for (const name of ['keyboardWillHide', 'keyboardDidHide']) {
        window.addEventListener(name, () => {
            keyboardHeight = 0;
            schedule();
        });
    }

    syncOpen();
})();