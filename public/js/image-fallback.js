(function (document) {
    'use strict';

    document.addEventListener('error', function (event) {
        var image = event.target;

        if (!image || image.tagName !== 'IMG') return;

        var fallback = String(image.getAttribute('data-fallback-src') || '');

        if (!fallback || image.getAttribute('data-fallback-used') === '1') return;

        image.setAttribute('data-fallback-used', '1');
        image.src = fallback;
    }, true);
})(document);
