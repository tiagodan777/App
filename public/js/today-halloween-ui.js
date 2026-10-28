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
        .hw-detail {
            background: #fff;
        }

        .hw-detail::backdrop {
            background: rgba(0, 0, 0, .38);
            backdrop-filter: none;
        }

        .hw-detail-art {
            position: relative;
            background: #fff;
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
            background: #d4d1d6;
        }

        .hw-detail-art .hw-garment {
            height: min(26dvh, 190px);
            width: auto;
        }

        .hw-detail-content {
            padding-top: 12px;
        }

        .hw-detail-content .hw-kind,
        .hw-detail-content .hw-source {
            color: #69656c;
        }

        .hw-status-open .hw-garment {
            background-color: transparent;
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

    function rank(sheet) {
        var index = order.indexOf(sheet);
        return index < 0 ? 100 : index;
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
            var dx = Math.abs(
                event.touches[0].clientX - gesture.x
            );

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

        document.querySelectorAll('.hw-detail-art')
            .forEach(wire);

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

        document.removeEventListener(
            'margot:page-leave',
            destroy
        );

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