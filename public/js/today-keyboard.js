(function (window, document) {
    'use strict';

    var note = document.getElementById('hoje-nota-input');
    var editor = document.getElementById('hoje-editor');
    var capacitor = window.Capacitor;

    if (
        !note || !editor || !capacitor ||
        !capacitor.isNativePlatform?.() ||
        capacitor.getPlatform?.() !== 'ios'
    ) {
        return;
    }

    var keyboard = capacitor.Plugins?.Keyboard ||
        capacitor.registerPlugin?.('Keyboard');

    if (typeof keyboard?.setAccessoryBarVisible !== 'function') {
        return;
    }

    function setVisible(isVisible) {
        try {
            Promise.resolve(
                keyboard.setAccessoryBarVisible({ isVisible: isVisible })
            ).catch(function () {});
        } catch (_) {}
    }

    note.addEventListener('focus', function () {
        setVisible(false);
    });

    note.addEventListener('blur', function () {
        setVisible(true);
    });

    new MutationObserver(function () {
        if (editor.getAttribute('aria-hidden') === 'true') {
            setVisible(true);
        }
    }).observe(editor, {
        attributes: true,
        attributeFilter: ['aria-hidden']
    });

    window.addEventListener('pagehide', function () {
        setVisible(true);
    });
})(window, document);