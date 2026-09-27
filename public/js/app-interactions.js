(function (window, document) {
    'use strict';

    // O documento é reutilizado pela navegação interna da Margot.
    if (window.MargotInteractionGuard) return;
    window.MargotInteractionGuard = true;

    function isTextControl(event) {
        const target = event.composedPath?.()[0] || event.target;
        const element = target instanceof Element ? target : target?.parentElement;
        return Boolean(
            element &&
            (element.isContentEditable || element.closest('input, textarea, select'))
        );
    }

    function preventBrowserAction(event) {
        if (!isTextControl(event)) event.preventDefault();
    }

    // Cancela só a ação do navegador. Não interrompe os handlers da Margot
    // nem interfere com touch/pointer, scroll, pinch ou os menus das mensagens.
    for (const name of ['contextmenu', 'selectstart', 'dragstart']) {
        document.addEventListener(name, preventBrowserAction, {
            capture: true,
            passive: false
        });
    }
})(window, document);