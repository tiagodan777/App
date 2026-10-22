(() => {
  'use strict';

  if (window.MargotInteractiveBack) return;
  window.MargotInteractiveBack = true;

  let saved = null;
  let owner = '';
  let state = null;
  let animation = null;

  const member = () => String(window.membroId || '');

  const reduced = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = document.createElement('style');

  css.textContent = `
    [data-invitation] [data-copy-link] {
      margin-top: 20px;
    }

    [data-invitation] [data-invite-status]:not(:empty) {
      padding: 12px 16px;
      border-radius: 14px;
      background: #fbe9ee;
      color: #92233c;
      font-size: 15px;
      font-weight: 600;
    }

    body.margot-interactive-back #margot-page-loading {
      display: none !important;
    }

    @media (prefers-color-scheme: dark) {
      [data-invitation] [data-invite-status]:not(:empty) {
        background: #402730;
        color: #ffb8c8;
      }
    }
  `;

  document.head.append(css);

  function invite() {
    const page = document.querySelector('[data-invitation]');
    const button = page?.querySelector('[data-copy-link]');
    const status = page?.querySelector('[data-invite-status]');

    if (button && status) {
      button.after(status);
    }
  }

  function capture() {
    if (!document.getElementById('conversas-lista')) return;

    const source = document.querySelector('[data-margot-pagina]');
    if (!source) return;

    const copy = source.cloneNode(true);

    const originals = [
      source,
      ...source.querySelectorAll('*')
    ];

    const copies = [
      copy,
      ...copy.querySelectorAll('*')
    ];

    originals.forEach((node, index) => {
      const target = copies[index];
      const computed = getComputedStyle(node);

      for (const property of computed) {
        target.style.setProperty(
          property,
          computed.getPropertyValue(property)
        );
      }

      if (node.scrollTop) {
        target.dataset.previewScroll = String(node.scrollTop);
      }

      target.style.animation = 'none';
      target.style.transition = 'none';

      target.removeAttribute('id');
      target.removeAttribute('data-margot-pagina');

      for (const attribute of [...target.attributes]) {
        if (/^on/i.test(attribute.name)) {
          target.removeAttribute(attribute.name);
        }
      }
    });

    copy.querySelectorAll(
      'script,dialog,iframe,object,embed'
    ).forEach(node => node.remove());

    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');

    copy.style.cssText +=
      ';position:absolute;inset:0;width:100%;height:100%;' +
      'margin:0;transform:none;pointer-events:none;overflow:hidden';

    saved = copy;
    owner = member();
  }

  function cleanup() {
    animation?.cancel();
    animation = null;

    if (state) {
      state.page.style.cssText = state.originalStyle;
      state.page.inert = state.originalInert;
      state.layer.remove();
    }

    state = null;
    document.body.classList.remove('margot-interactive-back');
  }

  async function end(commit) {
    const current = state;

    if (!current || current.ending) return;

    current.ending = true;

    const destination = commit ? innerWidth : 0;

    if (!reduced() && current.page.animate) {
      animation = current.page.animate(
        [
          {
            transform: `translate3d(${current.dx}px,0,0)`
          },
          {
            transform: `translate3d(${destination}px,0,0)`
          }
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(.22,.72,.2,1)',
          fill: 'forwards'
        }
      );

      await animation.finished.catch(() => {});
    }

    if (state !== current) return;

    if (!commit) {
      cleanup();
      return;
    }

    current.page.inert = true;
    current.page.style.transform =
      `translate3d(${innerWidth}px,0,0)`;

    try {
      await window.MargotNavigation.navigate(current.url, {
        historico: 'replace',
        direcao: -1
      });
    } finally {
      cleanup();
    }
  }

  window.addEventListener('touchstart', event => {
    if (
      state ||
      !saved ||
      owner !== member() ||
      document.hidden ||
      document.body.hasAttribute('aria-busy')
    ) {
      return;
    }

    const chat = document.getElementById('chat-pagina');
    const page = chat?.closest('[data-margot-pagina]');
    const link = chat?.querySelector('[data-margot-voltar]');

    if (
      !page ||
      !link ||
      !window.MargotNavigation ||
      event.touches.length !== 1
    ) {
      return;
    }

    if (
      !chat.contains(event.target) ||
      document.querySelector('dialog[open]')
    ) {
      return;
    }

    if (
      event.target.closest(
        'input,textarea,select,button,a,audio,video,' +
        '[contenteditable],.chat-balao,[data-margot-no-back-swipe]'
      )
    ) {
      return;
    }

    if (
      document.body.matches(
        '.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto'
      )
    ) {
      return;
    }

    const touch = event.touches[0];

    // A margem extrema continua reservada ao gesto nativo.
    if (touch.clientX <= 24) return;

    const layer = document.createElement('div');

    layer.inert = true;
    layer.setAttribute('aria-hidden', 'true');

    layer.style.cssText =
      'position:fixed;inset:0;overflow:hidden;' +
      'pointer-events:none;z-index:1040;' +
      'background:var(--mensagens-fundo,#fbfafc);' +
      'transform:translateZ(0);display:none';

    layer.append(saved.cloneNode(true));
    document.body.append(layer);

    state = {
      page,
      layer,
      url: link.href,
      x: touch.clientX,
      y: touch.clientY,
      dx: 0,
      start: performance.now(),
      horizontal: false,
      ending: false,
      originalStyle: page.style.cssText,
      originalInert: page.inert
    };

    // Impede que o controlador antigo também inicie este gesto.
    event.stopPropagation();
  }, {
    capture: true,
    passive: true
  });

  window.addEventListener('touchmove', event => {
    const current = state;

    if (!current) return;

    event.stopPropagation();

    if (current.ending) return;

    if (event.touches.length !== 1) {
      void end(false);
      return;
    }

    const dx = event.touches[0].clientX - current.x;
    const dy = event.touches[0].clientY - current.y;

    if (!current.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) {
        return;
      }

      if (dx <= 0 || Math.abs(dy) >= Math.abs(dx)) {
        cleanup();
        return;
      }

      if (dx < Math.abs(dy) * 1.2) return;

      current.horizontal = true;
      current.layer.style.display = 'block';

      current.layer.querySelectorAll(
        '[data-preview-scroll]'
      ).forEach(node => {
        node.scrollTop = Number(node.dataset.previewScroll);
      });

      current.page.style.position = 'fixed';
      current.page.style.inset = '0';
      current.page.style.width = '100%';
      current.page.style.height = '100%';
      current.page.style.overflow = 'hidden';
      current.page.style.zIndex = '1041';
      current.page.style.willChange = 'transform';

      document.body.classList.add('margot-interactive-back');

      window.MargotNavigation.prefetch?.(current.url);
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    current.dx = Math.max(0, Math.min(innerWidth, dx));

    current.page.style.transform =
      `translate3d(${current.dx}px,0,0)`;
  }, {
    capture: true,
    passive: false
  });

  window.addEventListener('touchend', event => {
    const current = state;

    if (!current) return;

    event.stopPropagation();

    const speed =
      current.dx /
      Math.max(1, performance.now() - current.start);

    const completed =
      current.horizontal &&
      (
        current.dx >= innerWidth * 0.3 ||
        (current.dx >= 60 && speed >= 0.5)
      );

    void end(completed);
  }, {
    capture: true,
    passive: true
  });

  window.addEventListener(
    'touchcancel',
    () => void end(false),
    { capture: true, passive: true }
  );

  document.addEventListener('margot:page-leave', () => {
    capture();
    cleanup();
  });

  document.addEventListener('margot:page-ready', invite);

  const forget = () => {
    cleanup();
    saved = null;
    owner = '';
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) forget();
  });

  window.addEventListener('pagehide', forget);
  window.addEventListener('resize', forget);

  invite();
})();