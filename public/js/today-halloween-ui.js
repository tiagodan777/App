(function () {
    'use strict';

    if (window.MargotHalloweenUI) {
        window.MargotHalloweenUI.destroy();
    }

    var alive = true;
    var observer;
    var gesture = null;
    var stages = new WeakSet();
    var style = document.createElement('style');

    style.textContent = `
        .hw-controls, .hw-detail, .hw-card {
            --hw-surface: #fff;
            --hw-art: #f4f4f6;
            --hw-text: #27252b;
            --hw-muted: #68646e;
            --hw-border: #dedbe2;
            --hw-selected: #eee7f5;
            --hw-accent: #70418e;
            --hw-grip: #c7c3cc;
        }

        .hw-card, .hw-detail, .hw-close {
            background: var(--hw-surface);
            color: var(--hw-text);
            border-color: var(--hw-border);
        }

        .hw-controls {
            color: var(--hw-text);
        }

        .hw-card-art, .hw-detail-art {
            background: var(--hw-art);
        }

        .hw-kind {
            color: var(--hw-accent);
        }

        .hw-source, .hw-detail-hint, .hw-types small {
            color: var(--hw-muted);
        }

        .hw-types button {
            background: var(--hw-art);
            color: var(--hw-text);
            border-color: var(--hw-border);
        }

        .hw-types button[aria-pressed=true] {
            background: var(--hw-selected);
            border-color: var(--hw-accent);
        }

        .hw-tabs button, .hw-filters button, .hw-search input {
            border-color: var(--hw-border);
        }

        .hw-tabs button[aria-pressed=true] {
            border-color: #fa164b;
        }

        .hw-filters button[aria-pressed=true] {
            border-color: #653f84;
        }

        .hw-detail::backdrop {
            background: rgba(0, 0, 0, .38);
            backdrop-filter: none;
        }

        .hw-detail-art {
            position: relative;
            padding: 30px 18px 12px;
            touch-action: pan-x;
        }

        .hw-detail-art::before {
            content: '';
            position: absolute;
            top: 10px;
            left: calc(50% - 20px);
            width: 40px;
            height: 4px;
            border-radius: 4px;
            background: var(--hw-grip);
        }

        .hw-detail-art .hw-garment {
            height: min(26dvh, 190px);
            width: auto;
        }

        .hw-detail-content {
            padding-top: 12px;
        }

        .hw-garment > svg {
            display: block;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }

        #hoje-roupa-concluir {
            position: sticky;
            bottom: 0;
            z-index: 5;
            background: rgba(37, 35, 41, .80);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, .18);
            box-shadow: 0 4px 18px rgba(0, 0, 0, .18);
            -webkit-backdrop-filter: blur(16px);
            backdrop-filter: blur(16px);
        }

        @media (prefers-color-scheme: dark) {
            .hw-controls, .hw-detail, .hw-card {
                --hw-surface: #202024;
                --hw-art: #28282d;
                --hw-text: #f5f4f7;
                --hw-muted: #bbb7c3;
                --hw-border: #48464f;
                --hw-selected: #3a3044;
                --hw-accent: #d5b6ed;
                --hw-grip: #76717e;
            }

            .hw-card[aria-pressed=true] {
                border-color: #c29cde;
            }

            #hoje-roupa-concluir {
                background: rgba(51, 49, 57, .78);
                border-color: rgba(255, 255, 255, .22);
            }
        }
    `;

    document.head.appendChild(style);

    var order = [
        'classicos',
        'terror',
        'cinema',
        'asia',
        'culto',
        'maravilhas',
        'sobreviventes',
        'mundos',
        'musica',
        'palco'
    ];

    /*
     * Limites individuais nas imagens originais de 1024 × 1536.
     * Cada entrada contém: x, y, largura, altura.
     */
    var crops = {
        classicos: [
            [24, 8, 332, 382],
            [390, 8, 280, 382],
            [715, 25, 270, 365],
            [45, 390, 310, 370],
            [390, 390, 280, 370],
            [710, 390, 285, 362],
            [40, 760, 310, 360],
            [380, 760, 300, 360],
            [710, 750, 290, 370],
            [50, 1120, 300, 416],
            [380, 1120, 300, 416],
            [710, 1120, 300, 416]
        ],
        sobreviventes: [
            [95, 0, 230, 408],
            [405, 35, 225, 373],
            [715, 0, 230, 408],
            [65, 412, 285, 360],
            [390, 418, 292, 354],
            [710, 414, 270, 358],
            [35, 778, 325, 354],
            [390, 778, 270, 354],
            [715, 774, 250, 358],
            [45, 1136, 310, 400],
            [400, 1136, 250, 400],
            [710, 1136, 270, 400]
        ]
    };

    function rank(sheet) {
        var index = order.indexOf(sheet);
        return index < 0 ? 100 : index;
    }

    function cropArt(element) {
        if (element.dataset.hwCrop === '2') return;

        var background = element.style.backgroundImage;
        var match = background.match(/url\(["']?(.*?)["']?\)$/);

        if (!match) return;

        var url;

        try {
            url = new URL(match[1], document.baseURI);
        } catch (_) {
            return;
        }

        var sheet = url.pathname.split('/').pop();

        if (!crops[sheet]) return;

        var position = element.style.backgroundPosition.split(/\s+/);
        var column = Math.round(parseFloat(position[0]) / 50);
        var row = Math.round(parseFloat(position[1]) * 3 / 100);

        if (
            !Number.isInteger(column) ||
            !Number.isInteger(row) ||
            column < 0 || column > 2 ||
            row < 0 || row > 3
        ) {
            return;
        }

        var box = crops[sheet][row * 3 + column];
        var ns = 'http://www.w3.org/2000/svg';

        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', box.join(' '));
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        var image = document.createElementNS(ns, 'image');
        image.setAttribute('href', url.href);
        image.setAttribute('width', '1024');
        image.setAttribute('height', '1536');

        /*
         * A janela interior corta a imagem no limite definido.
         * Impede que as margens do SVG mostrem fantasias vizinhas.
         */
        var viewport = document.createElementNS(ns, 'svg');
        viewport.setAttribute('x', box[0]);
        viewport.setAttribute('y', box[1]);
        viewport.setAttribute('width', box[2]);
        viewport.setAttribute('height', box[3]);
        viewport.setAttribute('viewBox', box.join(' '));
        viewport.setAttribute('overflow', 'hidden');

        viewport.appendChild(image);
        svg.appendChild(viewport);

        element.dataset.hwCrop = '2';
        element.style.backgroundImage = 'none';
        element.style.clipPath = 'none';
        element.replaceChildren(svg);
    }

    function resetGesture() {
        if (gesture) {
            gesture.dialog.style.removeProperty('transform');
        }

        gesture = null;
    }

    function closeGesture() {
        var currentDialog = gesture && gesture.dialog;

        resetGesture();

        if (currentDialog && currentDialog.open) {
            currentDialog.close();
        }
    }

    function wire(stage) {
        if (stages.has(stage)) return;

        stages.add(stage);

        stage.addEventListener('touchstart', function (event) {
            resetGesture();

            var currentDialog = stage.closest('dialog');

            if (
                !alive ||
                event.touches.length !== 1 ||
                !currentDialog ||
                !currentDialog.open ||
                currentDialog.scrollTop > 0
            ) {
                return;
            }

            gesture = {
                dialog: currentDialog,
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                dy: 0
            };
        }, { passive: true });

        stage.addEventListener('touchmove', function (event) {
            if (!gesture) return;

            if (event.touches.length !== 1) {
                resetGesture();
                return;
            }

            var dy = event.touches[0].clientY - gesture.y;
            var dx = Math.abs(event.touches[0].clientX - gesture.x);

            if (dy < 0 || dx > Math.max(12, dy)) {
                resetGesture();
                return;
            }

            gesture.dy = dy;

            if (event.cancelable) {
                event.preventDefault();
            }

            gesture.dialog.style.transform =
                'translateY(' + Math.min(dy, 180) + 'px)';
        }, { passive: false });

        stage.addEventListener('touchend', function () {
            if (gesture && gesture.dy >= 70) {
                closeGesture();
            } else {
                resetGesture();
            }
        });

        stage.addEventListener('touchcancel', resetGesture);
    }

    function sortChildren(parent, priority) {
        if (!parent) return;

        var current = Array.from(parent.children);

        var sorted = current.slice().sort(function (a, b) {
            return priority(a) - priority(b);
        });

        var changed = sorted.some(function (element, index) {
            return element !== current[index];
        });

        if (!changed) return;

        var active = document.activeElement;
        var scrollLeft = parent.scrollLeft;

        sorted.forEach(function (element) {
            parent.appendChild(element);
        });

        parent.scrollLeft = scrollLeft;

        if (active && parent.contains(active)) {
            active.focus({ preventScroll: true });
        }
    }

    function update() {
        if (!alive) return;

        document.querySelectorAll('.hw-garment').forEach(cropArt);
        document.querySelectorAll('.hw-detail-art').forEach(wire);

        var api = window.MargotHalloween;

        if (!api || !api.enabled) return;

        var costumeTab = document.querySelector(
            '.hw-types [data-kind="costume"]'
        );

        if (
            !costumeTab ||
            costumeTab.getAttribute('aria-pressed') !== 'true'
        ) {
            return;
        }

        sortChildren(
            document.querySelector('#hoje-pecas-grid.hw-grid'),
            function (card) {
                var item = api.find(card.dataset.type);

                return item
                    ? rank(item.sheet) * 100 + item.cell
                    : 10000;
            }
        );

        sortChildren(
            document.querySelector('.hw-filters'),
            function (button) {
                var id = button.dataset.category;

                if (id === '') return -1;
                if (id === 'new') return 101;

                return rank(id);
            }
        );
    }

    function destroy() {
        alive = false;

        if (observer) {
            observer.disconnect();
        }

        resetGesture();
        style.remove();

        document.removeEventListener('margot:page-leave', destroy);

        if (window.MargotHalloweenUI === controller) {
            window.MargotHalloweenUI = null;
        }
    }

    var controller = {
        destroy: destroy
    };

    window.MargotHalloweenUI = controller;

    observer = new MutationObserver(update);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    document.addEventListener(
        'margot:page-leave',
        destroy,
        { once: true }
    );

    update();
})();