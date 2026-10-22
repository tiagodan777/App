(() => {
  'use strict';

  if (window.MargotDiscoveryTutorial) return;

  const base = new URL('../', document.currentScript.src);

  const t = (pt, en) =>
    window.MargotI18n?.language === 'en' ? en : pt;

  const profiles = [
    ['Sofia', 'sofia.jpg', '180% auto', '46% 44%', 28, 37],
    ['Lara', 'lara.jpg', 'cover', '48% 28%', 73, 62],
    ['Alex', 'alex.jpg', 'auto 260%', '56% 6%', 73, 32],
    ['Miguel', 'miguel.jpg', '140% auto', '49% 48%', 35, 65]
  ];

  let session = null;

  const stop = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  function feedback(type, preview) {
    if (!preview) window.MargotHaptics?.feedback(type);
  }

  async function run({ host, signal, preview = false }) {
    if (session) throw new Error('Tutorial already active');

    const readyUntil = Date.now() + 10000;

    while (
      !signal.aborted &&
      Date.now() < readyUntil &&
      (
        !window.inicializarFotos ||
        !window.fecharMiniMenu ||
        !window.prepararMiniMenuDaFoto?.supportsTutorial
      )
    ) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const menu = document.querySelector('.mini-menu');
    const eye = document.getElementById('alternar-invisivel');
    const form = menu?.querySelector('form');
    const input = form?.querySelector('[name="mensagem"]');
    const portrait = menu?.querySelector('header img');
    const name = menu?.querySelector('header h1');

    if (
      !menu ||
      !form ||
      !input ||
      !portrait ||
      !name ||
      !eye ||
      !window.inicializarFotos ||
      !window.fecharMiniMenu ||
      !window.prepararMiniMenuDaFoto?.supportsTutorial
    ) {
      throw new Error('Discovery is not ready');
    }

    if (signal.aborted) {
      throw new DOMException('Interrupted', 'AbortError');
    }

    const controller = new AbortController();
    const listeners = { signal: controller.signal };
    const undo = [];
    const photos = [];

    const ownSource = document.querySelector(
      'script[data-photo][src*="welcome-onboarding"]'
    )?.dataset.photo;

    const fallback = new URL(
      'imagens/fotos-perfil/default.webp',
      base
    ).href;

    let ownURL = fallback;

    try {
      const url = new URL(ownSource || fallback, location.href);

      if (url.origin === location.origin) {
        ownURL = url.href;
      }
    } catch (_) {}

    const people = [
      ...profiles,
      [t('Tu', 'You'), ownURL, 'cover', '50% 50%', 48, 48]
    ];

    const photoURL = profile => profile === people[4]
      ? ownURL
      : new URL('media/onboarding/' + profile[1], base).href;

    let invisible = false;
    let selected = null;
    let sent = false;
    let stage = 'people';
    let resolveDone;
    let rejectDone;

    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    function attribute(node, key, value) {
      const old = node.getAttribute(key);

      undo.push(() => {
        if (old === null) node.removeAttribute(key);
        else node.setAttribute(key, old);
      });

      if (value === null) node.removeAttribute(key);
      else node.setAttribute(key, value);
    }

    const oldValue = input.value;

    undo.push(() => {
      input.value = oldValue;
    });

    const oldName = name.textContent;

    undo.push(() => {
      name.textContent = oldName;
    });

    const style = document.createElement('style');

    style.textContent = `
      body.margot-demo .foto:not([data-margot-demo]) {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      body.margot-demo .foto[data-margot-demo] {
        background-repeat: no-repeat;
      }

      body.margot-demo .foto[data-margot-demo-self] {
        outline: 3px solid #e12346;
        outline-offset: 4px;
      }

      body.margot-demo .foto[data-margot-demo-self]::after {
        content: attr(data-label);
        position: absolute;
        top: calc(100% + 7px);
        left: 50%;
        transform: translateX(-50%);
        padding: 3px 9px;
        border-radius: 20px;
        background: #fffef9;
        color: #211e22;
        white-space: nowrap;
        font: 600 12px -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      }

      body.margot-demo.demo-invisible .foto[data-margot-demo-self] {
        opacity: .22 !important;
        outline-style: dashed;
      }

      body.margot-demo #menuPrincipal #alternar-invisivel[data-invisivel="false"] {
        background: transparent !important;
        box-shadow: none !important;
        opacity: 1;
      }

      body.margot-demo #menuPrincipal #alternar-invisivel[data-invisivel="false"]::after {
        display: none !important;
      }

      body.margot-demo #menuPrincipal #alternar-invisivel[data-invisivel="false"] .menu-invisivel-imagem {
        width: 26px;
        height: 26px;
        flex: 0 0 26px;
        filter: none !important;
      }

      body.margot-demo #menuPrincipal #alternar-invisivel[data-invisivel="false"] .menu-invisivel-imagem-visivel {
        display: block !important;
      }

      body.margot-demo #menuPrincipal #alternar-invisivel[data-invisivel="false"] .menu-invisivel-imagem-invisivel {
        display: none !important;
      }

      body.margot-demo #acoes-perfil,
      body.margot-demo #mini-menu-hoje,
      body.margot-demo [data-daylies-mini],
      body.margot-demo #abrir-acoes-perfil {
        display: none !important;
      }

      body.margot-demo .mini-menu [data-camera-open],
      body.margot-demo .mini-menu [data-microphone] {
        opacity: .35;
        pointer-events: none;
      }

      #margot-demo-hud {
        position: fixed;
        inset: 0;
        z-index: 10000;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
        color: #211e22;
      }

      #margot-demo-hud .hint {
        position: absolute;
        top: max(54px, env(safe-area-inset-top));
        left: 20px;
        right: 20px;
        margin: auto;
        max-width: 430px;
        padding: 12px 16px;
        border-radius: 20px;
        background: #fffef9f5;
        box-shadow: 0 4px 22px #22112212;
        text-align: center;
      }

      #margot-demo-hud small {
        display: block;
        font-size: 11px;
        color: #80767b;
        margin-bottom: 5px;
      }

      #margot-demo-hud p {
        margin: 0;
        font-size: 17px;
        line-height: 1.35;
        font-weight: 600;
      }

      #margot-demo-hud .actions {
        position: absolute;
        left: 24px;
        right: 24px;
        bottom: calc(90px + env(safe-area-inset-bottom));
        display: flex;
        justify-content: center;
        gap: 10px;
        pointer-events: auto;
      }

      #margot-demo-hud button {
        border: 0;
        border-radius: 999px;
        padding: 13px 23px;
        font: 600 15px -apple-system, BlinkMacSystemFont, Arial, sans-serif;
        background: #e12346;
        color: #fff;
        cursor: pointer;
      }

      #margot-demo-hud button.secondary {
        background: #fffef9f5;
        color: #74676e;
        box-shadow: 0 3px 15px #22112210;
      }

      #margot-demo-hud button[hidden] {
        display: none;
      }

      #margot-demo-hud button:focus-visible {
        outline: 3px solid #7955ff;
        outline-offset: 3px;
      }

      body.margot-demo.demo-eye #alternar-invisivel {
        outline: 3px solid #e12346;
        outline-offset: 6px;
        border-radius: 50%;
      }
    `;

    const hud = document.createElement('div');
    hud.id = 'margot-demo-hud';

    hud.innerHTML =
      '<div class="hint" role="status" aria-live="polite">' +
      '<small></small><p></p></div>' +
      '<div class="actions">' +
      '<button class="secondary" type="button"></button>' +
      '<button type="button" hidden></button></div>';

    const hint = hud.querySelector('p');
    const skip = hud.querySelector('.secondary');
    const next = hud.querySelector('button:not(.secondary)');

    hud.querySelector('small').textContent = t(
      'TUTORIAL DA MARGOT',
      'MARGOT TUTORIAL'
    );

    skip.textContent = t('Saltar tutorial', 'Skip tutorial');
    next.textContent = t('Continuar', 'Continue');

    function say(message) {
      if (hint.textContent === message) return;

      hint.textContent = message;

      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        hint.getAnimations?.().forEach(animation => {
          animation.cancel();
        });

        hint.animate?.(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 300, easing: 'ease-out' }
        );
      }
    }

    function prepare(element) {
      if (
        stage !== 'people' ||
        !element?.hasAttribute('data-margot-demo') ||
        element.hasAttribute('data-margot-demo-self')
      ) {
        return false;
      }

      selected = profiles[Number(element.dataset.margotDemo)];

      if (!selected) return false;

      name.textContent = selected[0];

      portrait.src =
        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22/%3E';

      portrait.style.backgroundImage =
        'url("' +
        new URL('media/onboarding/' + selected[1], base).href +
        '")';

      portrait.style.backgroundSize = selected[2];
      portrait.style.backgroundPosition = selected[3];
      portrait.style.backgroundRepeat = 'no-repeat';
      portrait.alt = selected[0];
      portrait.style.objectFit = 'cover';
      portrait.style.objectPosition = selected[3];

      input.value = t('Olá!', 'Hi!');

      menu.setAttribute('data-destinatario-id', '');
      form.removeAttribute('action');

      say(
        t(
          'Experimenta um Hey ou uma mensagem.',
          'Try a Hey or a message.'
        )
      );

      return true;
    }

    function send(kind) {
      if (!selected || stage !== 'people') return;

      sent = true;

      feedback(
        kind === 'hey' ? 'heySent' : 'shutter',
        preview
      );

      const message = kind === 'hey'
        ? t('Hey de exemplo para ', 'Example Hey for ')
        : t('Mensagem de exemplo para ', 'Example message for ');

      const receipt =
        message +
        selected[0] +
        t('. Nada foi enviado.', '. Nothing was sent.');

      say(receipt);
      window.mostrarMensagemTemporaria?.(receipt, 'sucesso');

      next.hidden = false;
      next.textContent = t('Continuar', 'Continue');
    }

    session = { prepare };

    const interrupted = () => {
      rejectDone(
        new DOMException('Interrupted', 'AbortError')
      );
    };

    signal.addEventListener('abort', interrupted, { once: true });

    let observer;

    try {
      window.fecharMiniMenu();

      attribute(menu, 'data-destinatario-id', '');
      attribute(menu, 'class', menu.className);

      menu.classList.remove('perfil-proprio');

      attribute(eye, 'data-invisivel', 'false');
      attribute(eye, 'aria-pressed', 'false');

      attribute(
        eye,
        'aria-label',
        t('Experimentar modo invisível', 'Try invisible mode')
      );

      attribute(form, 'action', null);
      attribute(input, 'readonly', '');
      attribute(portrait, 'src', portrait.getAttribute('src'));
      attribute(portrait, 'alt', portrait.getAttribute('alt'));
      attribute(portrait, 'style', portrait.getAttribute('style'));

      const profileLink = menu.querySelector('.mini-menu-perfil');

      if (profileLink) {
        attribute(profileLink, 'href', null);
      }

      const token = form.querySelector(
        '[name="profile_access_token"]'
      );

      if (token) {
        const value = token.value;

        undo.push(() => {
          token.value = value;
        });

        token.value = '';
      }

      document.head.append(style);
      document.body.classList.add('margot-demo');

      for (const [index, profile] of people.entries()) {
        const node = document.createElement('div');

        node.className = 'foto';
        node.id = 'margot-demo-person-' + index;
        node.dataset.margotDemo = String(index);
        node.dataset.nome = profile[0];
        node.dataset.left = String(innerWidth * profile[4] / 100);
        node.dataset.top = String(innerHeight * profile[5] / 100);

        node.style.backgroundImage =
          'url("' + photoURL(profile) + '")';

        node.style.backgroundSize = profile[2];
        node.style.backgroundPosition = profile[3];

        if (index === 4) {
          node.dataset.margotDemoSelf = '';
          node.dataset.label = t('Tu', 'You');
          node.setAttribute('role', 'img');

          node.setAttribute(
            'aria-label',
            t(
              'O teu perfil na demonstração',
              'Your profile in the demo'
            )
          );

          const probe = new Image();

          probe.onerror = () => {
            if (node.isConnected) {
              node.style.backgroundImage =
                'url("' + fallback + '")';
            }
          };

          probe.src = ownURL;

          undo.push(() => {
            probe.onerror = null;
          });
        } else {
          node.setAttribute('role', 'button');
          node.setAttribute('tabindex', '0');

          node.setAttribute(
            'aria-label',
            t('Perfil de exemplo: ', 'Example profile: ') +
            profile[0]
          );

          node.addEventListener('keydown', event => {
            if (!['Enter', ' '].includes(event.key)) return;

            stop(event);

            for (const type of ['pointerdown', 'pointerup']) {
              node.dispatchEvent(
                new PointerEvent(type, {
                  bubbles: true,
                  pointerId: 1,
                  clientX: 0,
                  clientY: 0
                })
              );
            }
          }, listeners);
        }

        photos.push(node);
        document.body.append(node);
      }

      document.body.append(hud);

      // Respeita o bloqueio de cliques após um swipe real.
      menu.addEventListener('click', event => {
        const target = event.target;
        const hey = target.closest?.('#enviar-hey');
        const message = target.closest?.('button[type="submit"]');

        stop(event);

        if (hey) send('hey');
        else if (message) send('message');
      }, { ...listeners, capture: true });

      menu.addEventListener('submit', event => {
        stop(event);
        send('message');
      }, { ...listeners, capture: true });

      document.addEventListener('click', event => {
        if (
          menu.contains(event.target) ||
          hud.contains(event.target) ||
          event.target.closest?.('[data-margot-demo]')
        ) {
          return;
        }

        if (eye.contains(event.target)) {
          stop(event);

          if (!['eye', 'finish'].includes(stage)) return;

          feedback('interaction', preview);

          invisible = !invisible;

          document.body.classList.toggle(
            'demo-invisible',
            invisible
          );

          eye.dataset.invisivel = String(invisible);
          eye.setAttribute('aria-pressed', String(invisible));

          eye.setAttribute(
            'aria-label',
            invisible
              ? t('Voltar a ficar visível', 'Become visible again')
              : t('Experimentar modo invisível', 'Try invisible mode')
          );

          const self = photos[4];

          self.dataset.label = invisible
            ? t('Tu · invisível', 'You · invisible')
            : t('Tu', 'You');

          self.setAttribute('aria-label', self.dataset.label);

          say(
            invisible
              ? t(
                  'Ficas escondido dos outros. Aqui, a tua foto fica esbatida só para veres a diferença.',
                  'You are hidden from others. Your photo is faded here only to show the difference.'
                )
              : t(
                  'Voltaste a ficar visível. Podes tocar no olho outra vez.',
                  'You are visible again. You can tap the eye again.'
                )
          );

          next.hidden = false;
          stage = 'finish';
          return;
        }

        if (event.target.closest?.('a,button,input,form')) {
          stop(event);
        }
      }, { ...listeners, capture: true });

      for (const type of [
        'touchstart',
        'touchmove',
        'touchend',
        'pointerdown',
        'pointerup'
      ]) {
        hud.addEventListener(
          type,
          event => event.stopPropagation(),
          listeners
        );
      }

      skip.addEventListener('click', () => {
        feedback('interaction', preview);
        resolveDone();
      }, listeners);

      next.addEventListener('click', () => {
        feedback('interaction', preview);

        if (stage === 'finish') {
          resolveDone();
          return;
        }

        window.fecharMiniMenu();

        stage = 'eye';
        next.hidden = true;

        document.body.classList.add('demo-eye');

        say(
          t(
            'Experimenta o modo invisível: toca no olho.',
            'Try invisible mode: tap the eye.'
          )
        );
      }, listeners);

      observer = new MutationObserver(() => {
        if (
          stage === 'people' &&
          !sent &&
          menu.getAttribute('aria-hidden') === 'true'
        ) {
          say(
            t(
              'Toca numa pessoa para dizer olá.',
              'Tap someone to say hello.'
            )
          );
        }
      });

      observer.observe(menu, {
        attributes: true,
        attributeFilter: ['aria-hidden']
      });

      say(
        t(
          'Vamos experimentar. Toca numa foto: neste tutorial, nada é enviado.',
          'Let’s try it. Tap a photo: nothing is sent during this tutorial.'
        )
      );

      host.close();
      window.inicializarFotos();

      await done;
    } finally {
      controller.abort();
      signal.removeEventListener('abort', interrupted);
      observer?.disconnect();

      window.fecharMiniMenu?.();

      photos.forEach(node => node.remove());
      hud.remove();
      style.remove();

      document.body.classList.remove(
        'margot-demo',
        'demo-eye',
        'demo-invisible'
      );

      undo.reverse().forEach(restore => restore());

      if (!signal.aborted && host.isConnected) {
        host.showModal();
      }

      // O evento de fecho do diálogo pode estar ainda na fila.
      await new Promise(resolve => setTimeout(resolve, 0));

      session = null;

      if (document.getElementById('gridCanvas')) {
        window.inicializarFotos?.();
      }
    }
  }

  window.MargotDiscoveryTutorial = {
    run,

    prepare: element => session?.prepare(element) ?? false,

    get busy() {
      return session !== null;
    }
  };
})();