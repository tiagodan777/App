(() => {
  'use strict';

  if (window.MargotExperience) return;

  const base = new URL('../', document.currentScript.src);
  const text = (pt, en) =>
    window.MargotI18n?.language === 'en' ? en : pt;

  const pending = state =>
    ['not_determined', 'prompt', 'prompt-with-rationale']
      .includes(state?.authorization ?? state?.permission);

  async function waitForLocation(request) {
    const member = String(window.membroId || '');
    const controller = new AbortController();
    const { signal } = controller;
    const abort = () => controller.abort();

    const error = () =>
      new DOMException('Pedido interrompido', 'AbortError');

    const valid = () => {
      if (
        signal.aborted ||
        String(window.membroId || '') !== member
      ) {
        throw error();
      }
    };

    const race = promise => new Promise((resolve, reject) => {
      const cancel = () => reject(error());

      signal.addEventListener('abort', cancel, { once: true });

      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => {
          signal.removeEventListener('abort', cancel);
        });

      if (signal.aborted) cancel();
    });

    document.addEventListener('margot:page-leave', abort);
    window.addEventListener('pagehide', abort);

    try {
      await race(Promise.resolve().then(request));

      for (;;) {
        valid();

        const state = await race(
          window.MargotBackgroundLocation.status()
        );

        valid();

        if (state?.available === false) {
          throw new Error('Localização indisponível');
        }

        if (
          !pending(state) ||
          state.services_enabled === false
        ) {
          return state;
        }

        await race(
          new Promise(resolve => setTimeout(resolve, 400))
        );
      }
    } finally {
      document.removeEventListener('margot:page-leave', abort);
      window.removeEventListener('pagehide', abort);
      controller.abort();
    }
  }

  const style = document.createElement('style');

  style.textContent = `
    #margot-page-loading {
      position: fixed;
      inset: 0;
      z-index: 1050;
      box-sizing: border-box;
      overflow: hidden;
      padding: max(62px, env(safe-area-inset-top)) 24px 110px;
      background: #fff;
      color: #756e75;
      font: 15px -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      touch-action: none;
    }

    #margot-page-loading[hidden] {
      display: none;
    }

    #margot-page-loading .loading-body {
      max-width: 720px;
      margin: auto;
    }

    #margot-page-loading .loading-status {
      margin: 18px 0;
      text-align: center;
    }

    #margot-page-loading .bone {
      display: block;
      background: #efedf0;
      border-radius: 14px;
      animation: margot-loading-pulse 1.5s ease-in-out infinite;
    }

    #margot-page-loading .title {
      width: 48%;
      height: 28px;
      margin: 12px 0 32px;
    }

    #margot-page-loading .row {
      display: flex;
      gap: 16px;
      align-items: center;
      margin: 26px 0;
    }

    #margot-page-loading .avatar {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      flex: none;
    }

    #margot-page-loading .lines {
      flex: 1;
    }

    #margot-page-loading .line {
      width: 70%;
      height: 12px;
      margin: 12px 0;
    }

    #margot-page-loading .line + .line {
      width: 95%;
    }

    #margot-page-loading .bubble {
      width: 62%;
      height: 60px;
      margin: 26px 0;
    }

    #margot-page-loading .bubble.right {
      margin-left: auto;
      background: #f8e8ed;
    }

    #margot-page-loading .photo {
      width: 100%;
      height: min(42vh, 360px);
      border-radius: 30px;
    }

    #margot-page-loading .people {
      position: relative;
      height: 48vh;
    }

    #margot-page-loading .people .avatar {
      position: absolute;
    }

    #margot-page-loading .people .avatar:nth-child(1) {
      left: 18%;
      top: 10%;
    }

    #margot-page-loading .people .avatar:nth-child(2) {
      right: 15%;
      top: 30%;
    }

    #margot-page-loading .people .avatar:nth-child(3) {
      left: 35%;
      bottom: 8%;
    }

    @keyframes margot-loading-pulse {
      50% {
        opacity: .45;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #margot-page-loading .bone {
        animation: none;
      }
    }

    @media (prefers-color-scheme: dark) {
      #margot-page-loading {
        background: #1c1c1e;
        color: #b5afb6;
      }

      #margot-page-loading .bone {
        background: #313135;
      }

      #margot-page-loading .bubble.right {
        background: #442a34;
      }
    }
  `;

  document.head.append(style);

  const panel = document.createElement('aside');
  panel.id = 'margot-page-loading';
  panel.hidden = true;

  panel.innerHTML =
    '<div class="loading-body" aria-hidden="true"></div>' +
    '<p class="loading-status" role="status" aria-live="polite"></p>';

  document.body.append(panel);

  const body = panel.querySelector('.loading-body');
  const status = panel.querySelector('.loading-status');

  const bone = type =>
    '<span class="bone ' + type + '"></span>';

  const row =
    '<div class="row">' +
    bone('avatar') +
    '<div class="lines">' +
    bone('line') +
    bone('line') +
    '</div></div>';

  let previous;
  let previousInert;
  let timer;
  let revealTimer;
  let cssWarmed = false;
  let loadScript;
  let warmed = false;

  function finish() {
    clearTimeout(timer);
    clearTimeout(revealTimer);

    if (previous) {
      previous.inert = previousInert;
    }

    previous = null;
    panel.hidden = true;
    status.textContent = '';
  }

  function navigationStart(url, scriptLoader) {
    finish();

    loadScript = scriptLoader;

    if (
      /\/messages(?:\/|$)/.test(
        new URL(url, location.href).pathname
      )
    ) {
      warmChat(true);
    }

    if (
      window.MargotNativeVersion &&
      window.MargotNativeVersion.getState() !== 'allowed'
    ) {
      return;
    }

    const path =
      new URL(url, location.href).pathname.replace(/\/+$/, '') ||
      '/';

    previous = document.querySelector('[data-margot-pagina]');

    if (previous) {
      previousInert = previous.inert;
      previous.inert = true;
    }

    let skeleton = bone('title');

    if (/\/messages\/.+/.test(path)) {
      skeleton =
        row +
        bone('bubble') +
        bone('bubble right') +
        bone('bubble');
    } else if (/\/messages$/.test(path)) {
      skeleton += row.repeat(5);
    } else if (/\/profile\//.test(path)) {
      skeleton =
        bone('photo') +
        bone('title') +
        bone('line') +
        bone('line');
    } else if (path === '/' || /\/index$/.test(path)) {
      skeleton +=
        '<div class="people">' +
        bone('avatar').repeat(3) +
        '</div>';
    } else {
      skeleton += row.repeat(3);
    }

    body.innerHTML = skeleton;

    // Não mostra um ecrã intermédio nas transições rápidas.
    revealTimer = setTimeout(() => {
      if (!document.body.hasAttribute('aria-busy')) return;

      panel.hidden = false;
      status.textContent = text('A carregar…', 'Loading…');
    }, 250);

    timer = setTimeout(() => {
      status.textContent = text(
        'A ligação está a demorar. A carregar…',
        'The connection is taking longer. Loading…'
      );
    }, 8000);
  }

  new MutationObserver(() => {
    if (!document.body.hasAttribute('aria-busy')) {
      finish();
    }
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ['aria-busy']
  });

  // Prepara apenas recursos estáticos.
  // Não abre conversas nem as marca como lidas.
  function warmChat(entering = false) {
    if (
      warmed ||
      !loadScript ||
      (
        !entering &&
        !document.getElementById('conversas-lista')
      ) ||
      document.hidden ||
      navigator.connection?.saveData
    ) {
      return;
    }

    warmed = true;

    if (!cssWarmed) {
      cssWarmed = true;

      [
        'chat.css?v=20260927-build',
        'chat-social.css?v=20260928-1',
        'chat-gallery.css?v=20261008-camera-dark-1',
        'messages.css?v=20260916'
      ].forEach(file => {
        const link = document.createElement('link');

        link.rel = 'preload';
        link.as = 'style';
        link.href = new URL('estilos/' + file, base).href;

        document.head.append(link);
      });
    }

    const files = [
      'chat-viewport.js?v=20260927-scroll-keyboard-2',
      'chat-recorder.js?v=20260920-video',
      'chat-camera.js?v=20260923-camera',
      'chat-emoji-data.js?v=20260928-1',
      'chat-social.js?v=20260928-1',
      'chat-reactions.js?v=20261007-video-hold-1',
      'chat-audio-player.js?v=20260920-video',
      'chat.js?v=20261007-gallery-1'
    ];

    let index = 0;

    async function next() {
      while (index < files.length && !document.hidden) {
        const url = new URL(
          'js/' + files[index++],
          base
        ).href;

        try {
          await loadScript(url);
        } catch (_) {
          // A navegação volta a tentar se o recurso falhar.
        }
      }
    }

    void next();
    void next();
  }

  // Deixa a transição lateral visível assim que a página está pronta.
  document.addEventListener('margot:page-ready', finish);

  document.addEventListener('margot:page-ready', () => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(
        () => warmChat(),
        { timeout: 1500 }
      );
    } else {
      setTimeout(() => warmChat(), 300);
    }
  });

  window.addEventListener('pagehide', finish);

  window.MargotExperience = {
    waitForLocation,
    navigationStart
  };
})();