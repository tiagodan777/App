/* O iOS controla a animação nativa; os ajustes web são agrupados por frame. */
window.MargotChatViewport = function (page, list, content) {
    'use strict';

    const cap = window.Capacitor;
    const native = Boolean(cap?.isNativePlatform?.());
    const ios = native && cap?.getPlatform?.() === 'ios';
    const visual = window.visualViewport;
    const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    function plugin(name) {
        if (!native || !cap.isPluginAvailable?.(name)) return null;

        return cap.registerPlugin?.(name)
            || cap.Plugins?.[name]
            || null;
    }

    const keyboard = plugin('Keyboard');
    const nativeLayout = ios ? plugin('MargotKeyboard') : null;
    const handles = [];
    const removers = [];

    let alive = true;
    let pinned = true;
    let userMoved = false;
    let frame = 0;
    let keyboardHeight = 0;
    let fullHeight = window.innerHeight;
    let followingNative = false;
    let configuringNative = Boolean(nativeLayout);
    let reveal = true;

    function on(target, name, handler, options) {
        target?.addEventListener(name, handler, options);

        removers.push(() => {
            target?.removeEventListener(name, handler, options);
        });
    }

    function schedule() {
        if (!alive || frame) return;
        frame = requestAnimationFrame(update);
    }

    function update() {
        frame = 0;
        if (!alive) return;

        const visible = visual?.height || window.innerHeight;
        const top = visual?.offsetTop || 0;

        page.style.transition = 'none';

        if (followingNative || configuringNative) {
            page.style.height = '100%';
            page.style.top = '0px';
        } else {
            if (!keyboardHeight) {
                fullHeight = window.innerHeight;
            }

            const height = ios && keyboardHeight
                ? Math.min(visible, fullHeight - keyboardHeight)
                : visible;

            page.style.height = Math.max(0, height) + 'px';
            page.style.top = (ios ? 0 : top) + 'px';
        }

        const open = keyboardHeight > 0
            || (!followingNative && visible < fullHeight - 80);

        page.classList.toggle('chat-keyboard-open', open);

        if (pinned) {
            const end = Math.max(
                0,
                list.scrollHeight - list.clientHeight
            );

            if (Math.abs(list.scrollTop - end) > 1) {
                list.scrollTop = end;
            }

            userMoved = false;
        }

        if (reveal) {
            reveal = false;
            list.classList.remove('chat-mensagens-a-preparar');
            list.setAttribute('aria-busy', 'false');
        }
    }

    function bottom(smooth = false) {
        if (!alive) return;

        pinned = true;
        userMoved = false;

        if (smooth && !reduced && !keyboardHeight) {
            list.scrollTo({
                top: list.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            schedule();
        }
    }

    function userScroll() {
        userMoved = true;
        pinned = false;
    }

    function scrolled() {
        if (!userMoved) return;

        pinned = (
            list.scrollHeight
            - list.clientHeight
            - list.scrollTop
        ) < 80;
    }

    function insert(article, own) {
        const follow = pinned || own;

        content.append(article);

        if (!reduced) {
            article.animate?.(
                [
                    {
                        opacity: 0,
                        transform: 'translateY(8px)'
                    },
                    {
                        opacity: 1,
                        transform: 'none'
                    }
                ],
                {
                    duration: 180,
                    easing: 'ease-out'
                }
            );
        }

        if (follow) bottom();
    }

    const observer = new ResizeObserver(schedule);

    observer.observe(content);
    observer.observe(list);

    on(list, 'load', schedule, true);
    on(list, 'loadedmetadata', schedule, true);
    on(list, 'scroll', scrolled, { passive: true });
    on(list, 'wheel', userScroll, { passive: true });
    on(list, 'touchmove', userScroll, { passive: true });

    on(visual, 'resize', schedule);
    on(visual, 'scroll', schedule);
    on(window, 'resize', schedule);
    on(document, 'margot:page-ready', schedule);

    if (keyboard) {
        if (ios) {
            keyboard.setAccessoryBarVisible({
                isVisible: false
            }).catch(() => {});
        }

        for (const [name, show] of [
            ['keyboardWillShow', true],
            ['keyboardDidShow', true],
            ['keyboardWillHide', false],
            ['keyboardDidHide', false]
        ]) {
            Promise.resolve(
                keyboard.addListener(name, (info) => {
                    if (!alive) return;

                    if (
                        show
                        && !keyboardHeight
                        && !followingNative
                    ) {
                        fullHeight = Math.max(
                            fullHeight,
                            window.innerHeight
                        );
                    }

                    keyboardHeight = show
                        ? Number(info?.keyboardHeight) || 0
                        : 0;

                    schedule();
                })
            ).then((handle) => {
                if (alive) {
                    handles.push(handle);
                } else {
                    handle.remove();
                }
            }).catch(() => {});
        }
    }

    if (nativeLayout) {
        nativeLayout.configure({
            enabled: true
        }).then((result) => {
            if (alive) {
                followingNative = result.nativeLayout === true;
            }
        }).catch(() => {}).finally(() => {
            configuringNative = false;
            schedule();
        });
    }

    schedule();

    return {
        insert,
        bottom,

        destroy() {
            if (!alive) return;

            alive = false;

            cancelAnimationFrame(frame);
            observer.disconnect();

            removers.forEach((remove) => remove());
            handles.forEach((handle) => handle.remove());

            if (nativeLayout) {
                nativeLayout.configure({
                    enabled: false
                }).catch(() => {});
            }

            if (keyboard && ios) {
                keyboard.setAccessoryBarVisible({
                    isVisible: true
                }).catch(() => {});
            }
        }
    };
};