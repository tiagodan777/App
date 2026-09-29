(function (window, document) {
    'use strict';

    if (window.MargotDocumentNavigation) return;

    const root = document.documentElement;
    const key = 'margot-document-navigation-entry';

    const reduced = () =>
        window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches;

    let navigating = false;
    let failSafe;

    const pause = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    root.classList.add('margot-auth-motion');

    /*
     * Executado no head:
     * a cobertura existe antes do primeiro desenho da página.
     */
    try {
        const value = sessionStorage.getItem(key);

        sessionStorage.removeItem(key);

        let pending;

        try {
            pending = JSON.parse(value || 'null');
        } catch (_) {}

        const age = Date.now() - Number(pending?.time);

        if (
            age >= 0 &&
            age < 15000 &&
            pending?.path === location.pathname
        ) {
            root.classList.add('margot-auth-arriving');
        }
    } catch (_) {}

    function restore() {
        clearTimeout(failSafe);

        navigating = false;

        root.classList.remove(
            'margot-auth-arriving',
            'margot-auth-leaving'
        );
    }

    function reveal() {
        /*
         * Dois frames permitem aplicar o estado coberto
         * antes do fade de entrada.
         */
        requestAnimationFrame(() => {
            requestAnimationFrame(restore);
        });
    }

    function saveEntry(url) {
        try {
            sessionStorage.setItem(
                key,
                JSON.stringify({
                    time: Date.now(),
                    path: new URL(url, location.href).pathname
                })
            );
        } catch (_) {}
    }

    async function navigate(url) {
        if (navigating) return;

        navigating = true;

        document.activeElement?.blur?.();

        root.classList.remove('margot-auth-arriving');
        root.classList.add('margot-auth-leaving');

        /*
         * Se o navegador cancelar a navegação,
         * não deixar uma cobertura presa.
         */
        failSafe = setTimeout(restore, 12000);

        await pause(reduced() ? 0 : 240);

        saveEntry(url);

        try {
            window.location.assign(url);
        } catch (error) {
            restore();
            throw error;
        }
    }

    async function back() {
        if (navigating) return;

        navigating = true;

        root.classList.add('margot-auth-leaving');

        failSafe = setTimeout(restore, 1500);

        await pause(reduced() ? 0 : 240);

        window.history.back();
    }

    document.addEventListener('click', event => {
        const link = event.target.closest?.('a[href]');

        if (
            !link ||
            event.defaultPrevented ||
            (
                event.button !== undefined &&
                event.button !== 0
            ) ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            link.hasAttribute('download') ||
            link.hasAttribute('data-margot-sem-animacao')
        ) {
            return;
        }

        const target = (
            link.getAttribute('target') || ''
        ).toLowerCase();

        if (
            target &&
            target !== '_self' &&
            target !== '_top'
        ) {
            return;
        }

        const href = (
            link.getAttribute('href') || ''
        ).trim();

        if (!href || href.startsWith('#')) {
            return;
        }

        let url;

        try {
            url = new URL(link.href, location.href);
        } catch (_) {
            return;
        }

        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.origin !== location.origin
        ) {
            return;
        }

        if (
            url.pathname === location.pathname &&
            url.search === location.search &&
            url.hash
        ) {
            return;
        }

        event.preventDefault();

        navigate(url.href);
    });

    window.addEventListener('pageshow', event => {
        if (event.persisted) {
            restore();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            reveal,
            { once: true }
        );
    } else {
        reveal();
    }

    window.MargotDocumentNavigation = {
        navigate,
        back
    };
})(window, document);