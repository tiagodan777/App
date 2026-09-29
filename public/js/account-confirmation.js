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
})();