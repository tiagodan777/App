/* Uma única área visível: cabeçalho, lista flexível e compositor no fluxo. */
window.MargotChatViewport = function (page, list, content) {
    const viewport = window.visualViewport,
        keyboard = window.Capacitor?.Plugins?.Keyboard;
    const native = Boolean(window.Capacitor?.isNativePlatform?.());
    const nativeIOS =
        window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() === 'ios';
    const nativeLayout = window.Capacitor?.Plugins?.MargotKeyboard;
    let followingNative = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alive = true,
        pinned = true,
        nativeHeight = 0,
        baseHeight = window.innerHeight,
        animation = 0,
        listeners = [];

    function bottom(smooth = false) {
        if (!alive) return;
        pinned = true;
        list.scrollTo({ top: list.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    }

    let userMoved = false;

    function scroll() {
        if (userMoved && !animation)
            pinned = list.scrollHeight - list.clientHeight - list.scrollTop < 80;
    }

    function userScroll() {
        userMoved = true;
        cancelAnimationFrame(animation);
        animation = 0;
        pinned = false;
    }

    function layout(animate = false) {
        if (!alive) return;
        if (followingNative) {
            page.style.height = '100%';
            page.style.top = '0px';
            page.style.transition = 'none';
            page.classList.remove('chat-keyboard-open');
            return;
        }
        if (nativeIOS) baseHeight = window.innerHeight;
        else if (!nativeHeight) baseHeight = Math.max(baseHeight, window.innerHeight);
        const visibleHeight = viewport?.height || window.innerHeight;
        const height = nativeIOS
            ? baseHeight - nativeHeight
            : native && nativeHeight
              ? Math.min(visibleHeight, baseHeight - nativeHeight)
              : visibleHeight;
        const top = nativeIOS ? 0 : viewport?.offsetTop || 0;
        page.classList.toggle(
            'chat-keyboard-open',
            nativeHeight > 0 || height < window.innerHeight - 80
        );
        const target = Math.max(0, height) + 'px';
        if (page.style.height !== target) {
            page.style.transition =
                animate && !reduced ? 'height 280ms cubic-bezier(.2,.8,.2,1)' : 'none';
        }
        page.style.height = Math.max(0, height) + 'px';
        page.style.top = top + 'px';
    }

    function resized() {
        if (followingNative) return;
        if (
            nativeIOS &&
            page.style.height === Math.max(0, window.innerHeight - nativeHeight) + 'px'
        )
            return;
        layout();
    }

    function insert(article, own) {
        const follow = pinned || own;
        const before = list.scrollTop;
        content.append(article);
        if (!reduced)
            article.animate?.(
                [
                    { opacity: 0, transform: 'translateY(14px) scale(.98)' },
                    { opacity: 1, transform: 'none' }
                ],
                { duration: 220, easing: 'ease-out' }
            );
        if (!follow) return;
        cancelAnimationFrame(animation);
        pinned = true;
        if (reduced) {
            bottom();
            return;
        }
        const start = performance.now();

        function frame(now) {
            if (!alive) return;
            const progress = Math.min(1, (now - start) / 260),
                eased = 1 - Math.pow(1 - progress, 3);
            const target = Math.max(0, list.scrollHeight - list.clientHeight);
            list.scrollTop = before + (target - before) * eased;
            animation = progress < 1 ? requestAnimationFrame(frame) : 0;
        }

        animation = requestAnimationFrame(frame);
    }

    const observer = new ResizeObserver(() => {
        if (pinned && !animation) bottom();
    });
    observer.observe(content);
    observer.observe(list);

    function mediaLoaded() {
        if (pinned && !animation) bottom();
    }

    list.addEventListener('load', mediaLoaded, true);
    list.addEventListener('loadedmetadata', mediaLoaded, true);
    list.addEventListener('scroll', scroll, { passive: true });
    list.addEventListener('wheel', userScroll, { passive: true });
    list.addEventListener('touchmove', userScroll, { passive: true });
    viewport?.addEventListener('resize', resized);
    viewport?.addEventListener('scroll', resized);
    window.addEventListener('resize', resized);

    if (nativeIOS && nativeLayout) {
        nativeLayout
            .configure({ enabled: true })
            .then((result) => {
                if (!alive) return;
                followingNative = result.nativeLayout === true;
                layout();
                if (pinned) bottom();
            })
            .catch(() => {});
    }

    if (keyboard && native) {
        if (nativeIOS) keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
        for (const [name, show] of [
            ['keyboardWillShow', true],
            ['keyboardWillHide', false]
        ]) {
            Promise.resolve(
                keyboard.addListener(name, (info) => {
                    nativeHeight = show ? info.keyboardHeight : 0;
                    layout(true);
                })
            ).then((handle) => {
                if (alive) listeners.push(handle);
                else handle.remove();
            });
        }
    }

    function ready() {
        layout();
        if (!userMoved) bottom();
    }

    document.addEventListener('margot:page-ready', ready);
    layout();
    bottom();
    list.querySelectorAll('img').forEach((image) => (image.loading = 'eager'));
    requestAnimationFrame(() => {
        if (alive) {
            bottom();
            list.classList.remove('chat-mensagens-a-preparar');
            list.setAttribute('aria-busy', 'false');
        }
    });

    return {
        insert,
        bottom,
        destroy() {
            alive = false;
            if (nativeIOS && nativeLayout)
                nativeLayout.configure({ enabled: false }).catch(() => {});
            cancelAnimationFrame(animation);
            observer.disconnect();
            document.removeEventListener('margot:page-ready', ready);
            list.removeEventListener('load', mediaLoaded, true);
            list.removeEventListener('loadedmetadata', mediaLoaded, true);
            list.removeEventListener('scroll', scroll);
            list.removeEventListener('wheel', userScroll);
            list.removeEventListener('touchmove', userScroll);
            viewport?.removeEventListener('resize', resized);
            viewport?.removeEventListener('scroll', resized);
            window.removeEventListener('resize', resized);
            listeners.forEach((handle) => handle.remove());
            if (keyboard && nativeIOS)
                keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
        }
    };
};