(() => {
  'use strict';

  if (window.MargotGestureFeedback) return;

  window.MargotGestureFeedback = true;

  let gesture = null;
  let animation = null;

  const reduced = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    @media (prefers-color-scheme: dark) {
      [data-invitation] [data-invite-status]:not(:empty) {
        background: #402730;
        color: #ffb8c8;
      }
    }
  `;

  document.head.append(style);

  function invite() {
    const page = document.querySelector('[data-invitation]');
    const button = page?.querySelector('[data-copy-link]');
    const status = page?.querySelector('[data-invite-status]');

    if (button && status) {
      button.after(status);
    }
  }

  function reset() {
    animation?.cancel();
    animation = null;

    if (gesture) {
      gesture.page.style.transform = gesture.transform;
      gesture.page.style.willChange = gesture.willChange;
    }

    gesture = null;
  }

  function settle() {
    if (!gesture) return;

    const g = gesture;

    animation?.cancel();

    if (reduced() || !g.page.animate) {
      reset();
      return;
    }

    animation = g.page.animate(
      [
        {
          transform: `translate3d(${g.dx}px,0,0)`
        },
        {
          transform: g.transform || 'none'
        }
      ],
      {
        duration: 180,
        easing: 'cubic-bezier(.22,.72,.2,1)'
      }
    );

    animation.finished
      .then(() => {
        if (gesture === g) reset();
      })
      .catch(() => {});
  }

  document.addEventListener('touchstart', event => {
    if (
      gesture ||
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
      document.body.matches(
        '.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto'
      )
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

    const touch = event.touches[0];

    // Reserva a margem extrema para o gesto nativo do iOS.
    if (touch.clientX <= 24) return;

    gesture = {
      page,
      url: link.href,
      x: touch.clientX,
      y: touch.clientY,
      dx: 0,
      started: performance.now(),
      horizontal: false,
      transform: page.style.transform,
      willChange: page.style.willChange
    };

    // Evita que o controlador antigo também execute este gesto.
    event.stopPropagation();
  }, {
    capture: true,
    passive: true
  });

  document.addEventListener('touchmove', event => {
    if (!gesture) return;

    event.stopPropagation();

    if (event.touches.length !== 1) {
      settle();
      return;
    }

    const g = gesture;
    const dx = event.touches[0].clientX - g.x;
    const dy = event.touches[0].clientY - g.y;

    if (!g.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) {
        return;
      }

      if (dx <= 0 || Math.abs(dy) >= Math.abs(dx)) {
        reset();
        return;
      }

      if (dx < Math.abs(dy) * 1.2) return;

      g.horizontal = true;

      window.MargotNavigation.prefetch?.(g.url);
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    g.dx = Math.max(0, Math.min(innerWidth, dx));

    g.page.style.willChange = 'transform';
    g.page.style.transform = `translate3d(${g.dx}px,0,0)`;
  }, {
    capture: true,
    passive: false
  });

  document.addEventListener('touchend', event => {
    if (!gesture) return;

    event.stopPropagation();

    const g = gesture;

    const velocity =
      g.dx / Math.max(1, performance.now() - g.started);

    const completed =
      g.horizontal &&
      (
        g.dx >= innerWidth * 0.3 ||
        (g.dx >= 60 && velocity >= 0.5)
      );

    if (!completed) {
      settle();
      return;
    }

    // Mantém a posição até o router substituir a página.
    // Não duplica o DOM nem guarda o conteúdo da conversa.
    window.MargotNavigation.navigate(g.url, {
      historico: 'replace',
      direcao: -1
    }).finally(reset);
  }, {
    capture: true,
    passive: true
  });

  document.addEventListener(
    'touchcancel',
    settle,
    { capture: true, passive: true }
  );

  document.addEventListener('margot:page-leave', reset);
  document.addEventListener('margot:page-ready', invite);

  window.addEventListener('pagehide', reset);

  invite();
})();