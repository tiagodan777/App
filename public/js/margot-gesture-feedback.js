(() => {
  'use strict';

  if (window.MargotInteractiveBack) return;
  window.MargotInteractiveBack = true;

  let snapshot = null;
  let owner = '';
  let gesture = null;
  let layer = null;
  let motion = null;
  let entering = false;

  const member = () => String(window.membroId || '');

  const reduced = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  const editable = 'input,textarea,select,[contenteditable]';

  const blocked =
    `${editable},button,a,audio,video,[data-margot-no-back-swipe]`;

  const properties = [
    'transform',
    'z-index',
    'will-change'
  ];

  const style = document.createElement('style');

  style.textContent = `
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

  document.head.append(style);

  function capture() {
    const source = document.querySelector('[data-margot-pagina]');

    if (!source || !source.querySelector('#conversas-lista')) {
      return false;
    }

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

      for (let i = 0; i < computed.length; i++) {
        const key = computed[i];

        target.style.setProperty(
          key,
          computed.getPropertyValue(key)
        );
      }

      target.style.animation = 'none';
      target.style.transition = 'none';

      target.removeAttribute('id');
      target.removeAttribute('data-margot-pagina');

      target.dataset.previewScroll = String(node.scrollTop);

      for (const attribute of [...target.attributes]) {
        if (/^on/i.test(attribute.name)) {
          target.removeAttribute(attribute.name);
        }
      }

      if (node instanceof HTMLImageElement) {
        target.loading = 'eager';

        if (node.currentSrc) {
          target.src = node.currentSrc;
        }

        target.removeAttribute('srcset');
      }
    });

    copy.querySelectorAll(
      'script,dialog,iframe,object,embed'
    ).forEach(node => node.remove());

    Object.assign(copy.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      margin: '0',
      transform: 'none',
      visibility: 'visible',
      overflow: 'hidden'
    });

    snapshot = copy;
    owner = member();

    return true;
  }

  function showPreview() {
    if (layer || !snapshot || owner !== member()) return;

    layer = document.createElement('div');
    layer.inert = true;

    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.margotBackPreview = '';

    layer.style.cssText =
      'position:fixed;inset:0;overflow:hidden;' +
      'pointer-events:none;z-index:1040;' +
      'background:var(--mensagens-fundo,#fbfafc)';

    layer.append(snapshot.cloneNode(true));
    document.body.append(layer);

    layer.querySelectorAll(
      '[data-preview-scroll]'
    ).forEach(node => {
      node.scrollTop = Number(node.dataset.previewScroll);
    });
  }

  function restore(current) {
    if (!current) return;

    properties.forEach((key, index) => {
      const [value, priority] = current.original[index];

      if (value) {
        current.chat.style.setProperty(key, value, priority);
      } else {
        current.chat.style.removeProperty(key);
      }
    });
  }

  function clear() {
    motion?.cancel();
    motion = null;

    restore(gesture);

    gesture = null;
    entering = false;

    layer?.remove();
    layer = null;

    document.body.classList.remove('margot-interactive-back');
  }

  function record(chat) {
    return {
      chat,

      original: properties.map(key => [
        chat.style.getPropertyValue(key),
        chat.style.getPropertyPriority(key)
      ]),

      base: getComputedStyle(chat).transform,
      dx: 0,
      horizontal: false,
      ending: false,
      committed: false
    };
  }

  function transform(current, x) {
    const base = current.base === 'none'
      ? ''
      : current.base;

    return `translate3d(${x}px,0,0) ${base}`;
  }

  function position(current, x) {
    current.dx = Math.max(0, Math.min(innerWidth, x));

    current.chat.style.transform = transform(
      current,
      current.dx
    );
  }

  async function animate(current, destination) {
    if (reduced() || !current.chat.animate) {
      position(current, destination);
      return;
    }

    const animation = current.chat.animate(
      [
        {
          transform: transform(current, current.dx)
        },
        {
          transform: transform(current, destination)
        }
      ],
      {
        duration: 240,
        easing: 'cubic-bezier(.22,.72,.2,1)',
        fill: 'forwards'
      }
    );

    motion = animation;

    await animation.finished.catch(() => {});

    if (gesture !== current) return;

    position(current, destination);
    animation.cancel();

    if (motion === animation) {
      motion = null;
    }
  }

  async function finish(commit) {
    const current = gesture;

    if (!current || current.ending) return;

    if (!current.horizontal) {
      clear();
      return;
    }

    current.ending = true;
    current.committed = commit;

    await animate(current, commit ? innerWidth : 0);

    if (gesture !== current) return;

    if (!commit) {
      clear();
      return;
    }

    if (document.activeElement?.matches(editable)) {
      document.activeElement.blur();
    }

    try {
      await window.MargotNavigation.navigate(current.url, {
        historico: 'replace',
        direcao: -1
      });
    } finally {
      if (gesture === current) {
        clear();
      }
    }
  }

  function startHorizontal(current) {
    current.horizontal = true;

    showPreview();

    current.chat.style.zIndex = '1041';
    current.chat.style.willChange = 'transform';

    document.body.classList.add('margot-interactive-back');

    window.MargotNavigation.prefetch?.(current.url);
  }

  document.addEventListener('touchstart', event => {
    if (entering) {
      clear();
    }

    if (
      gesture ||
      event.touches.length !== 1 ||
      document.hidden ||
      document.body.hasAttribute('aria-busy')
    ) {
      return;
    }

    const chat = document.getElementById('chat-pagina');
    const link = chat?.querySelector('[data-margot-voltar]');

    if (
      !chat?.contains(event.target) ||
      !link ||
      !window.MargotNavigation
    ) {
      return;
    }

    // No próprio chat, este atributo bloqueia o controlador antigo.
    const control = event.target.closest(blocked);

    if (control && control !== chat) return;

    if (
      document.querySelector('dialog[open]') ||
      document.body.matches(
        '.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto'
      )
    ) {
      return;
    }

    if (!snapshot || owner !== member()) return;

    const touch = event.touches[0];

    gesture = Object.assign(record(chat), {
      x: touch.clientX,
      y: touch.clientY,
      start: performance.now(),
      url: link.href
    });
  }, {
    passive: true
  });

  document.addEventListener('touchmove', event => {
    const current = gesture;

    if (!current || current.ending || entering) return;

    if (event.touches.length !== 1) {
      void finish(false);
      return;
    }

    const dx = event.touches[0].clientX - current.x;
    const dy = event.touches[0].clientY - current.y;

    if (!current.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) {
        return;
      }

      if (dx <= 0 || Math.abs(dy) >= dx) {
        clear();
        return;
      }

      if (dx < Math.abs(dy) * 1.4) return;

      // Não disputar um scroll que o sistema já assumiu.
      if (!event.cancelable) {
        clear();
        return;
      }

      startHorizontal(current);
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    position(current, dx);
  }, {
    passive: false
  });

  document.addEventListener('touchend', event => {
    const current = gesture;

    if (!current || current.ending || entering) return;

    const touch = event.changedTouches[0];

    const dx = touch
      ? touch.clientX - current.x
      : current.dx;

    const dy = touch
      ? touch.clientY - current.y
      : 0;

    const speed =
      dx / Math.max(1, performance.now() - current.start);

    const horizontal =
      dx > 0 && dx > Math.abs(dy) * 1.4;

    const commit =
      horizontal &&
      (
        dx >= innerWidth * 0.3 ||
        (dx >= 40 && speed >= 0.5)
      );

    // Um swipe rápido pode terminar sem um touchmove utilizável.
    if (!current.horizontal && commit) {
      startHorizontal(current);
    }

    if (current.horizontal) {
      if (event.cancelable) {
        event.preventDefault();
      }

      // Ao confirmar, a animação parte do último ponto desenhado.
      if (!commit) {
        position(current, dx);
      }
    }

    void finish(commit);
  }, {
    passive: false
  });

  document.addEventListener('touchcancel', () => {
    if (!gesture?.committed) {
      clear();
    }
  }, {
    passive: true
  });

  document.addEventListener('margot:page-leave', () => {
    // A pré-visualização fica até a página seguinte estar pronta.
    if (gesture?.committed) return;

    clear();

    if (capture()) {
      entering = true;
      showPreview();
    }
  });

  document.addEventListener('margot:page-ready', () => {
    const chat = document.getElementById('chat-pagina');

    if (chat && snapshot && owner === member()) {
      chat.setAttribute('data-margot-no-back-swipe', '');
    }

    if (entering && chat && !document.hidden) {
      gesture = record(chat);

      const current = gesture;

      current.chat.style.zIndex = '1041';
      current.chat.style.willChange = 'transform';

      position(current, innerWidth);

      void animate(current, 0).then(() => {
        if (gesture === current) {
          clear();
        }
      });
    } else {
      clear();
    }

    const page = document.querySelector('[data-invitation]');
    const button = page?.querySelector('[data-copy-link]');
    const status = page?.querySelector('[data-invite-status]');

    if (button && status) {
      button.after(status);
    }
  });

  document.addEventListener('focusin', event => {
    if (entering && event.target.matches(editable)) {
      clear();
    }
  });

  window.addEventListener('resize', () => {
    if (!gesture?.committed) {
      clear();
    }
  });

  window.visualViewport?.addEventListener('resize', () => {
    if (!gesture?.committed) {
      clear();
    }
  });

  const forget = () => {
    clear();
    snapshot = null;
    owner = '';
  };

  window.addEventListener('pagehide', forget);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clear();
    }

    if (owner !== member()) {
      forget();
    }
  });
})();