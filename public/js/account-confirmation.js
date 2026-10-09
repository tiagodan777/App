(() => {
    'use strict';

    const confirmation = document.querySelector(
        '.account-confirmation'
    );

    if (!confirmation) return;

    try {
        const first =
            sessionStorage.getItem(
                'margot-account-celebration'
            ) === '1';

        sessionStorage.removeItem(
            'margot-account-celebration'
        );

        if (!first) {
            confirmation.classList.add(
                'account-confirmation-static'
            );
        }
    } catch (_) {
        /*
         * A mensagem continua disponível mesmo que
         * o armazenamento da sessão não funcione.
         */
    }

    const input = confirmation.querySelector('#correct-email');
    const editor = confirmation.querySelector(
        '.account-confirmation-edit'
    );

    if (!input || !editor) return;

    const viewport = window.visualViewport;
    const label = editor.querySelector('label');
    const button = editor.querySelector('button[type="submit"]');

    const spacer = document.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.cssText =
        'height:0;pointer-events:none;flex-shrink:0;';

    document.body.appendChild(spacer);

    let fullHeight = window.innerHeight;
    let keyboardHeight = 0;
    let frame = 0;
    let timers = [];

    function adjust() {
        frame = 0;

        const focused = document.activeElement === input;
        const viewTop = viewport ? viewport.offsetTop : 0;

        const viewBottom = viewport
            ? viewTop + viewport.height
            : window.innerHeight;

        /*
         * Os eventos nativos permitem compensar o teclado
         * no iOS quando o WebView não muda de tamanho.
         * O visualViewport cobre o comportamento do navegador.
         *
         * Usamos a altura anterior à abertura do teclado para
         * não descontar duas vezes o espaço no Android.
         */
        const ios = window.Capacitor?.isNativePlatform?.()
            && window.Capacitor?.getPlatform?.() === 'ios';
        const nativeBottom = ios && keyboardHeight > 0
            ? Math.max(0, fullHeight - keyboardHeight)
            : window.innerHeight;

        const bottom = Math.min(viewBottom, nativeBottom);

        const hiddenHeight = Math.max(
            0,
            window.innerHeight - bottom
        );

        spacer.style.height = editor.open
            ? Math.ceil(hiddenHeight) + 'px'
            : '0px';

        if (
            !focused ||
            !editor.open ||
            bottom - viewTop < 80
        ) {
            return;
        }

        const field = input.getBoundingClientRect();
        const top = viewTop + 20;
        const limit = bottom - 24;

        let targetTop = field.top;
        let targetBottom = field.bottom;

        /*
         * Se couberem, mostramos o label, o campo e o botão.
         * Em ecrãs pequenos, a prioridade é o próprio campo.
         */
        if (label && button) {
            const labelBox = label.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();

            if (
                buttonBox.bottom - labelBox.top <= limit - top
            ) {
                targetTop = labelBox.top;
                targetBottom = buttonBox.bottom;
            }
        }

        let distance = 0;

        if (targetBottom > limit) {
            distance = targetBottom - limit;
        }

        if (targetTop - distance < top) {
            distance = targetTop - top;
        }

        if (Math.abs(distance) < 1) return;

        /*
         * Nesta página, body.margot-auth-install é
         * o elemento que permite deslocar o conteúdo.
         */
        document.body.scrollTop += distance;
    }

    function schedule() {
        if (!frame) {
            frame = requestAnimationFrame(adjust);
        }
    }

    function settle() {
        timers.forEach(clearTimeout);

        schedule();

        /*
         * Ajustes curtos durante a animação do teclado.
         * Não existe um intervalo a correr continuamente.
         */
        timers = [80, 220, 420].map(
            delay => setTimeout(schedule, delay)
        );
    }

    function keyboardShown(event) {
        const height = Number(
            event.keyboardHeight ??
            event.detail?.keyboardHeight
        );

        if (Number.isFinite(height) && height >= 0) {
            keyboardHeight = height;
        }

        settle();
    }

    function keyboardHidden() {
        keyboardHeight = 0;
        fullHeight = window.innerHeight;
        settle();
    }

    input.addEventListener('focus', () => {
        if (keyboardHeight === 0) {
            fullHeight = window.innerHeight;
        }

        confirmation.classList.add(
            'account-confirmation-static'
        );

        settle();
    });

    input.addEventListener('blur', settle);
    editor.addEventListener('toggle', settle);

    window.addEventListener(
        'keyboardWillShow',
        keyboardShown
    );

    window.addEventListener(
        'keyboardDidShow',
        keyboardShown
    );

    window.addEventListener(
        'keyboardDidHide',
        keyboardHidden
    );

    window.addEventListener('resize', () => {
        if (
            keyboardHeight === 0 &&
            document.activeElement !== input
        ) {
            fullHeight = window.innerHeight;
        }

        settle();
    });

    if (viewport) {
        viewport.addEventListener('resize', settle);
        viewport.addEventListener('scroll', schedule);
    }

    window.addEventListener('pagehide', () => {
        timers.forEach(clearTimeout);
        cancelAnimationFrame(frame);

        frame = 0;
        keyboardHeight = 0;
        spacer.style.height = '0px';
    });

    window.addEventListener('pageshow', settle);
})();