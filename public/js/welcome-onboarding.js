(() => {
  'use strict';

  if (window.MargotWelcome) return;

  const script = document.currentScript;
  const base = new URL('../', script.src);

  const profiles = Object.freeze({
    Sofia: {
      file: 'media/onboarding/sofia.jpg',
      size: '180% auto',
      position: '46% 44%'
    },
    Lara: {
      file: 'media/onboarding/lara.jpg',
      size: 'cover',
      position: '48% 28%'
    },
    Alex: {
      file: 'media/onboarding/alex.jpg',
      size: 'auto 260%',
      position: '56% 6%'
    },
    Miguel: {
      file: 'media/onboarding/miguel.jpg',
      size: '140% auto',
      position: '49% 48%'
    }
  });

  const fallback = new URL('imagens/fotos-perfil/default.webp', base).href;
  const text = (pt, en) => (window.MargotI18n?.language === 'en' ? en : pt);
  const member = () => String(window.membroId || '');
  const home = () => document.getElementById('gridCanvas');

  const gate = () =>
    !window.MargotNativeVersion ||
    window.MargotNativeVersion.getState() === 'allowed';

  const auth = (state) => state?.authorization ?? state?.permission;

  const pending = (state) =>
    ['not_determined', 'prompt', 'prompt-with-rationale'].includes(auth(state));

  const pref = (key) => window.MargotPreferencias?.obter(key);
  const memory = new Set();

  let active;
  let cancelActive;
  let inviteTimer;
  let inviteHost;

  function read(id, name) {
    const key = 'margot-welcome-v2:' + id + ':' + name;

    try {
      return memory.has(key) || localStorage.getItem(key) === '1';
    } catch (_) {
      return memory.has(key);
    }
  }

  function save(id, name) {
    const key = 'margot-welcome-v2:' + id + ':' + name;
    memory.add(key);

    try {
      localStorage.setItem(key, '1');
    } catch (_) {}
  }

  function ownPhoto(img) {
    let src = fallback;

    try {
      const url = new URL(script.dataset.photo || fallback, location.href);
      if (url.origin === location.origin) src = url.href;
    } catch (_) {}

    img.alt = text('Tu', 'You');

    img.onerror = () => {
      img.onerror = null;
      img.src = fallback;
    };

    img.src = src;
  }

  const css = `
    :host{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#19171b;--red:#e12346;display:block;height:100%;color-scheme:light;}
    *{box-sizing:border-box;}
    [hidden]{display:none !important;}
    button,input{font:inherit;}
    button{cursor:pointer;-webkit-tap-highlight-color:transparent;}
    button:focus-visible,a:focus-visible{outline:3px solid var(--red);outline-offset:4px;}
    .view{position:relative;isolation:isolate;display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;background:#fdfcf9;}
    .background{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;}
    .instruction{flex:none;padding:max(24px,env(safe-area-inset-top)) 24px 18px;text-align:center;background:linear-gradient(#fdfcf9 72%,#fdfcf900);}
    .label{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#8b7e83;margin-bottom:13px;}
    h1{font-size:clamp(26px,6.7vw,32px);font-weight:700;line-height:1.13;letter-spacing:-.045em;margin:0 auto 12px;max-width:19ch;}
    h1:focus{outline:none;}
    p{font-size:17px;line-height:1.45;margin:0 auto;max-width:31ch;color:#6b6068;}
    .content{position:relative;flex:1;min-height:240px;display:flex;align-items:center;justify-content:center;}
    .actions{display:grid;gap:10px;padding:14px 24px max(20px,env(safe-area-inset-bottom));flex:none;}
    .actions:empty{display:none;}
    .action{width:100%;min-height:52px;padding:14px 20px;border:0;border-radius:999px;background:var(--red);color:white;font-size:17px;font-weight:600;letter-spacing:-.02em;}
    .secondary{background:transparent;color:#81727a;font-size:14px;font-weight:500;min-height:38px;padding:9px;}
    .action:disabled{cursor:default;}
    .nav{flex:none;min-height:68px;position:relative;padding:0 24px max(12px,env(safe-area-inset-bottom));pointer-events:none;}
    .nav-bar{height:54px;border-radius:999px;background:#ede9e7d9;display:flex;align-items:center;justify-content:space-around;backdrop-filter:blur(12px);}
    .nav-bar img{width:24px;height:24px;object-fit:contain;}
    .nav-bar span{display:grid;place-items:center;width:22%;height:42px;border-radius:999px;}
    .nav-bar span:first-child{background:#ffffff90;}
    .stage{position:absolute;inset:0 8px 25px;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;}
    .peer,.self{position:absolute;left:0;top:0;width:62px;height:62px;border-radius:50%;border:2px solid #fff;box-shadow:0 5px 20px #2017201a;background-size:cover;background-color:#eee8e6;object-fit:cover;transform:translate(-50%,-50%);touch-action:none;padding:0;}
    .peer:active{box-shadow:0 4px 20px #e1234633;}
    .self{pointer-events:none;}
    .peer::after{content:'';position:absolute;inset:-6px;border:1px solid #e1234626;border-radius:50%;opacity:0;transition:opacity .2s;}
    .peer:first-of-type::after{opacity:1;}
    .small{position:absolute;left:12px;right:12px;bottom:0;text-align:center;font-size:12px;line-height:1.4;color:#887981;pointer-events:none;}
    .menu .content{align-items:flex-end;min-height:350px;padding:0 12px;}
    .sheet{width:100%;max-width:430px;background:#fff;box-shadow:0 -8px 35px #24111e12;border-radius:38px 38px 24px 24px;padding:12px 18px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;}
    .handle{width:46px;height:4px;border-radius:99px;background:#e3dfe1;margin:0 0 4px;}
    .portrait{width:clamp(110px,29vw,146px);height:clamp(110px,29vw,146px);flex:none;border-radius:50%;border:3px solid #fff;box-shadow:0 8px 28px #25132314;background-size:cover;background-color:#f1ecea;}
    .person-name{font-size:25px;font-weight:700;letter-spacing:-.04em;line-height:1.2;margin:0;text-align:center;width:100%;}
    .example-tag{font-size:11px;color:#97858e;margin-top:-8px;}
    .hey{display:block;flex:none;width:146px;min-height:50px;border:0;border-radius:999px;background:var(--red);color:white;font-size:23px;font-weight:700;margin:0 0 7px;box-shadow:0 8px 20px #e123461a;}
    .composer{width:100%;min-height:48px;border:1px solid #e3dfe7;border-radius:999px;padding:4px;display:flex;gap:9px;align-items:center;background:#f5f4f8;}
    .composer .inert-icon{display:grid;place-items:center;flex:0 0 29px;color:#242126;}
    .composer svg{width:22px;height:22px;display:block;}
    .composer input{min-width:0;width:100%;flex:1;border:0;outline:none;background:transparent;font-size:15px;color:#28232a;pointer-events:none;}
    .send{width:38px;height:38px;flex:0 0 38px;border-radius:50%;display:grid;place-items:center;border:0;background:#7955ff;color:#fff;padding:8px;}
    .send svg{width:23px;height:23px;}
    .success .content,.paper .content{flex:1;min-height:180px;align-items:center;}
    .paper .instruction,.success .instruction{padding-top:max(32px,env(safe-area-inset-top));background:linear-gradient(#fdfcf9 80%,#fdfcf900);}
    .visual{position:relative;width:220px;height:220px;display:grid;place-items:center;margin:12px auto;}
    .visual::before,.visual::after{content:'';position:absolute;border:1px solid #e1234612;border-radius:50%;inset:0;}
    .visual::after{inset:28px;}
    .visual img{width:82px;height:82px;object-fit:cover;border-radius:50%;border:3px solid white;box-shadow:0 8px 25px #35243014;}
    .visual-label{position:absolute;left:12px;right:12px;bottom:0;text-align:center;font-size:12px;color:#8b7c84;}
    .receipt{display:flex;flex-direction:column;align-items:center;gap:18px;}
    .receipt .portrait{width:112px;height:112px;}
    .bubble{font-size:23px;font-weight:650;line-height:1.2;background:var(--red);color:white;border-radius:25px 25px 25px 6px;padding:16px 30px;box-shadow:0 10px 26px #e123461a;}
    .pocket-scene{height:220px;position:relative;overflow:hidden;width:230px;margin:0 auto;}
    .phone{position:absolute;left:80px;top:12px;width:70px;height:132px;border:5px solid #33313a;border-radius:17px;background:#fff;display:grid;place-items:center;animation:pocket 8s ease-in-out infinite;}
    .phone img{width:44px;height:44px;border-radius:50%;object-fit:cover;}
    .pocket{position:absolute;top:115px;left:30px;width:170px;height:150px;background:#899aae;border:2px dashed #e1e5ec;border-radius:5px 5px 60px 60px;box-shadow:0 0 0 7px #899aae;}
    @keyframes pocket{
      0%,22%,100%{transform:translateY(0) rotate(-8deg);}
      45%,80%{transform:translateY(105px);}
    }
    :host([data-paused]) *{animation-play-state:paused !important;}
    @media (prefers-reduced-motion:reduce){
      *{animation:none !important;transition:none !important;}
    }
    @media (max-height:700px){
      .instruction{padding-bottom:12px;}
      h1{font-size:26px;margin-bottom:8px;}
      p{font-size:16px;}
      .label{margin-bottom:9px;}
      .menu .content{min-height:300px;}
      .sheet{gap:10px;padding-bottom:17px;}
      .portrait{width:106px;height:106px;}
      .person-name{font-size:23px;}
      .hey{min-height:46px;margin-bottom:2px;}
      .actions{padding-top:10px;}
      .visual{width:170px;height:170px;}
    }
    .menu .content{min-height:400px;padding:0;overflow:visible;}
    .menu .stage,.menu .small{opacity:.28;pointer-events:none;}
    .sheet{position:relative;z-index:2;max-width:540px;padding:8px 16px 24px;border-radius:min(16vw,75px) min(16vw,75px) 0 0;gap:0;background:rgba(255,255,255,.975);box-shadow:0 -8px 28px #1412191c,0 -22px 55px #1412190e;}
    .handle{position:relative;flex:none;width:114px;height:24px;margin:-8px 0 0;padding:0;border:0;background:transparent;}
    .handle::after{content:'';position:absolute;top:8px;left:0;width:114px;height:3px;border-radius:999px;background:#17171b1f;}
    .profile-header{display:flex;flex-direction:column;align-items:center;width:100%;margin-top:10px;gap:0;}
    .sheet .portrait{width:min(39vw,164px);height:min(39vw,164px);border-width:2px;}
    .sheet .person-name{margin:12px 0 0;font-size:26px;font-weight:750;line-height:1.04;}
    .sheet .example-tag{margin:6px 0 0;line-height:1.3;}
    .sheet .hey{min-width:148px;width:auto;height:58px;min-height:58px;padding:0 32px;margin:15px auto 0;font-size:21px;font-weight:760;box-shadow:none;}
    .sheet .composer{flex:none;margin:16px 0 0;gap:4px;background:#f3f3f7;border-color:#17171b18;}
    .composer .inert-icon{flex:0 0 38px;height:38px;}
    .sheet .microphone{display:none;}
    .composer input{font-size:16px;padding:0 6px;}
    .send{background:#7657ff;}
    .flying-message{position:absolute;left:50%;top:62%;pointer-events:none;padding:12px 22px;border-radius:22px 22px 22px 5px;background:var(--red);color:white;font-weight:700;opacity:0;}
    .send-notice{flex:none;display:flex;align-items:center;gap:12px;margin:0 20px 14px;padding:14px 16px;border:1px solid #e123461c;border-radius:20px;background:#fff8f8;}
    .notice-mark{flex:none;display:grid;place-items:center;width:34px;height:34px;background:var(--red);color:white;border-radius:50%;font-size:18px;}
    .send-notice strong{display:block;font-size:15px;line-height:1.35;}
    .send-notice p{font-size:13px;line-height:1.4;margin:4px 0 0;max-width:none;color:#7b626b;}
    @media(max-height:740px){
      .menu .instruction{padding-top:max(18px,env(safe-area-inset-top));padding-bottom:12px;}
      .menu .content{min-height:300px;}
      .sheet{padding-bottom:16px;}
      .sheet .portrait{width:110px;height:110px;}
      .sheet .person-name{font-size:24px;margin-top:10px;}
      .sheet .hey{height:50px;min-height:50px;margin-top:12px;}
      .sheet .composer{margin-top:12px;}
      .send-notice{padding:10px 14px;margin-bottom:10px;}
    }
    .tip{position:fixed;z-index:2147483000;top:max(18px,env(safe-area-inset-top));left:16px;right:16px;max-width:420px;margin:auto;padding:22px 48px 22px 22px;background:#fdfcf9;box-shadow:0 8px 35px #21151c24;border-radius:24px;}
    .tip strong{font-size:19px;}
    .tip p{font-size:16px;margin:10px 0;}
    .tip a{color:#c91d3e;font-weight:700;}
    .tip button{position:absolute;right:10px;top:10px;width:32px;height:32px;border:0;border-radius:50%;background:#eee9e9;}
  `;

  function haptic(type, preview) {
    if (preview || document.hidden) return;

    try {
      if (window.MargotHaptics?.feedback) {
        window.MargotHaptics.feedback(type);
        return;
      }

      const cap = window.Capacitor;
      if (!cap?.isNativePlatform?.()) return;

      const plugin =
        cap.Plugins?.MargotHaptics ||
        (cap.isPluginAvailable?.('MargotHaptics')
          ? cap.registerPlugin?.('MargotHaptics')
          : null);

      Promise.resolve(plugin?.play?.({ type })).catch(() => {});
    } catch (_) {}
  }

  function inviteLater(id) {
    clearInterval(inviteTimer);
    if (read(id, 'invite')) return;

    let seconds = 0;

    inviteTimer = setInterval(() => {
      if (member() !== id) {
        clearInterval(inviteTimer);
        return;
      }

      if (
        document.hidden ||
        !home() ||
        active ||
        !gate() ||
        window.MargotPermissionUI?.busy ||
        document.querySelector('dialog[open],[aria-modal="true"]') ||
        document.body.matches(
          '.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto'
        ) ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          document.activeElement?.tagName
        )
      ) return;

      if (++seconds < 40) return;

      clearInterval(inviteTimer);
      inviteHost?.remove();
      inviteHost = document.createElement('div');

      const root = inviteHost.attachShadow({ mode: 'open' });

      root.innerHTML =
        '<style>' + css + '</style>' +
        '<aside class="tip" role="status">' +
        '<strong></strong><p></p><a></a>' +
        '<button type="button">×</button></aside>';

      root.querySelector('strong').textContent = text(
        'Traz os teus amigos.',
        'Bring your friends.'
      );

      root.querySelector('p').textContent = text(
        'Na página de convites tens o teu código, QR e contador.',
        'Your invite page has your code, QR and counter.'
      );

      const link = root.querySelector('a');
      link.href = new URL('invite', base).href;
      link.textContent = text('Ver os meus convites', 'See my invites');

      root.querySelector('button').setAttribute(
        'aria-label',
        text('Fechar', 'Close')
      );

      root.querySelector('button').onclick = () => inviteHost?.remove();

      document.body.append(inviteHost);
      save(id, 'invite');
    }, 1000);
  }

  async function launch({
    state,
    force = false,
    preview = false,
    platform
  } = {}) {
    const id = member();
    if (!id || !home()) return false;

    const native = Boolean(window.Capacitor?.isNativePlatform?.());

    const system = preview
      ? platform || 'ios'
      : window.Capacitor?.getPlatform?.();

    const ios = system === 'ios';

    const granted = (current) =>
      (
        ios
          ? ['when_in_use', 'always']
          : ['granted', 'precise', 'approximate']
      ).includes(auth(current)) &&
      current?.services_enabled !== false;

    if (
      !preview &&
      (
        !native ||
        state?.available === false ||
        (!force && pref('localizacao') === false)
      )
    ) return false;

    if (!preview && !force && read(id, 'complete') && !pending(state)) {
      inviteLater(id);
      return true;
    }

    const bg = window.MargotBackgroundLocation;
    const ui = window.MargotPermissionUI;

    let simulated = {
      authorization: 'not_determined',
      permission_flow_version: 2,
      always_requested: false
    };

    const status = async () =>
      preview ? { ...simulated } : bg.status();

    const controller = new AbortController();
    const signal = controller.signal;
    const abort = () => controller.abort();

    cancelActive = abort;

    const valid = () => {
      if (signal.aborted || member() !== id || !home()) {
        throw new DOMException('Interrupted', 'AbortError');
      }
    };

    const wait = (ms) => new Promise((resolve, reject) => {
      valid();

      const stop = () => {
        clearTimeout(timer);
        reject(new DOMException('Interrupted', 'AbortError'));
      };

      const timer = setTimeout(() => {
        signal.removeEventListener('abort', stop);
        resolve();
      }, ms);

      signal.addEventListener('abort', stop, { once: true });
    });

    async function visible() {
      valid();

      while (document.hidden) {
        await wait(200);
        valid();
      }
    }

    const host = document.createElement('dialog');

    host.setAttribute(
      'aria-label',
      text('Tutorial da Margot', 'Margot tutorial')
    );

    host.style.cssText =
      'padding:0;border:0;margin:0;inset:0;width:100%;' +
      'max-width:none;height:100%;height:100dvh;' +
      'max-height:none;background:#fdfcf9;overflow:auto;';

    const container = document.createElement('div');
    container.style.height = '100%';
    host.append(container);

    const root = container.attachShadow({ mode: 'open' });

    root.innerHTML =
      '<style>' + css + '</style>' +
      '<div class="view">' +
      '<canvas class="background" aria-hidden="true"></canvas>' +
      '<header class="instruction">' +
      '<div class="label"></div><h1 tabindex="-1"></h1><p></p>' +
      '</header><div class="content"></div>' +
      '<footer class="actions"></footer>' +
      '<div class="nav" hidden></div></div>';

    const view = root.querySelector('.view');
    const title = root.querySelector('h1');
    const description = root.querySelector('p');
    const content = root.querySelector('.content');
    const actions = root.querySelector('.actions');
    const nav = root.querySelector('.nav');
    const background = root.querySelector('canvas');
    const context = background.getContext('2d');

    let frame;
    let lastFrame = 0;
    let watcher;
    let scene = null;
    let complete = false;
    let menuDismissible = false;

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set();

    function animate(node, frames, duration = 360, delay = 0) {
      if (motion.matches || !node?.animate || signal.aborted) return;

      node.getAnimations?.().forEach((animation) => animation.cancel());

      const animation = node.animate(frames, {
        duration,
        delay,
        easing: 'cubic-bezier(.22,.8,.25,1)',
        fill: 'backwards'
      });

      animations.add(animation);

      if (document.hidden) animation.pause();

      animation.finished.then(
        () => animations.delete(animation),
        () => animations.delete(animation)
      );
    }

    function mirror(now) {
      if (signal.aborted) return;

      if (
        !document.hidden &&
        context &&
        now - lastFrame > 33 &&
        !view.classList.contains('paper')
      ) {
        lastFrame = now;
        const source = home();

        if (source?.width && source?.height) {
          if (
            background.width !== source.width ||
            background.height !== source.height
          ) {
            background.width = source.width;
            background.height = source.height;
          }

          context.clearRect(0, 0, background.width, background.height);
          context.drawImage(source, 0, 0);
        }
      }

      if (!document.hidden) scene?.draw(now);
      frame = requestAnimationFrame(mirror);
    }

    function heading(a, b) {
      title.textContent = a;
      description.textContent = b;

      animate(
        title,
        [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        420
      );

      animate(
        description,
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        420,
        65
      );

      title.focus({ preventScroll: true });
    }

    function screen(mode, a, b) {
      valid();

      scene?.stop();
      scene = null;

      menuDismissible = false;
      root.querySelector('.send-notice')?.remove();

      view.className = 'view ' + mode;
      content.replaceChildren();
      actions.replaceChildren();
      nav.replaceChildren();
      nav.hidden = true;

      root.querySelector('.label').textContent = preview
        ? text(
            'Pré-visualização • sem pedidos reais • ',
            'Preview • no real requests • '
          ) + (ios ? 'iPhone' : 'Android')
        : text('Começa por um olá', 'Start with a hello');

      heading(a, b);

      animate(
        content,
        [
          { opacity: 0, transform: 'translateY(20px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        480,
        70
      );

      if (mode === 'paper') {
        const visual = document.createElement('div');
        visual.className = 'visual';
        visual.innerHTML = '<img><span class="visual-label"></span>';

        ownPhoto(visual.querySelector('img'));

        visual.querySelector('.visual-label').textContent = text(
          'A tua localização exata não é mostrada.',
          'Your exact location is not shown.'
        );

        content.append(visual);
      }
    }

    function choose(options) {
      valid();

      options.forEach(([value, label, secondary]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.choice = value;
        button.className = 'action' + (secondary ? ' secondary' : '');
        button.textContent = label;
        actions.append(button);
      });

      return new Promise((resolve, reject) => {
        const cleanup = () => {
          root.removeEventListener('click', click);
          signal.removeEventListener('abort', stop);
        };

        const stop = () => {
          cleanup();
          reject(new DOMException('Interrupted', 'AbortError'));
        };

        const click = (event) => {
          const button = event.target.closest?.('[data-choice]');

          const outside =
            !button &&
            menuDismissible &&
            !event.target.closest?.('.sheet');

          if (!outside && (!button || button.disabled)) return;

          const choice = outside ? 'back' : button.dataset.choice;

          event.preventDefault();
          event.stopPropagation();
          cleanup();

          haptic(
            choice === 'hey'
              ? 'heySent'
              : choice === 'message'
                ? 'shutter'
                : 'interaction',
            preview
          );

          root.querySelectorAll('button').forEach((node) => {
            node.disabled = true;
          });

          resolve(choice);
        };

        root.addEventListener('click', click);
        signal.addEventListener('abort', stop, { once: true });
      });
    }

    const next = () => choose([
      ['next', text('Continuar', 'Continue')]
    ]);

    async function result(ok, a, b) {
      await visible();
      if (ok) haptic('interaction', preview);
      screen('paper', a, b);
      await next();
    }

    function face(node, name) {
      const profile = profiles[name];
      if (!profile) return;

      node.style.backgroundImage =
        'url("' + new URL(profile.file, base).href + '")';

      node.style.backgroundSize = profile.size;
      node.style.backgroundPosition = profile.position;

      if (node.tagName !== 'BUTTON') {
        node.setAttribute('role', 'img');
      }

      node.setAttribute('aria-label', name);
    }

    function navigation() {
      const original = document.getElementById('menuPrincipal');
      if (!original) return;

      const bar = document.createElement('div');
      bar.className = 'nav-bar';

      original.querySelectorAll('li').forEach((item) => {
        const source = item.querySelector('img');
        if (!source) return;

        const slot = document.createElement('span');
        const image = document.createElement('img');
        image.src = source.src;
        image.alt = '';

        slot.append(image);
        bar.append(slot);
      });

      bar.setAttribute('aria-hidden', 'true');
      nav.append(bar);
      nav.hidden = false;
    }

    function startPeople() {
      const stage = document.createElement('div');
      stage.className = 'stage';
      content.append(stage);

      const clamp = (value, min, max) =>
        Math.max(min, Math.min(max, value));

      const people = [
        { name: 'Sofia', x: .20, y: .20, phase: 0, rate: .52 },
        { name: 'Alex', x: .80, y: .20, phase: 2, rate: .64 },
        { name: 'Lara', x: .20, y: .80, phase: 4, rate: .47 },
        { name: 'Miguel', x: .80, y: .80, phase: 3, rate: .59 },
        { name: '', x: .50, y: .50, phase: 1, rate: .55 }
      ].map((person) => {
        const node = document.createElement(
          person.name ? 'button' : 'img'
        );

        node.className = person.name ? 'peer' : 'self';

        if (person.name) {
          node.type = 'button';
          node.dataset.choice = person.name;
          face(node, person.name);

          node.setAttribute(
            'aria-label',
            text('Abrir perfil de ', 'Open profile: ') + person.name
          );
        } else {
          ownPhoto(node);
        }

        stage.append(node);

        return {
          ...person,
          node,
          dx: 0,
          dy: 0,
          vx: 0,
          vy: 0,
          rx: 0,
          ry: 0,
          rvx: 0,
          rvy: 0,
          ox: 0,
          oy: 0
        };
      });

      const pointers = new Map();
      const events = new AbortController();

      let gesture = null;
      let drag = null;
      let moved = false;
      let panX = 0;
      let panY = 0;
      let zoom = 1;
      let angle = 0;
      let velocityX = 0;
      let velocityY = 0;
      let previousTime = 0;
      let elapsed = 0;
      let pinch;

      const two = () => {
        const [a, b] = [...pointers.values()];

        return b
          ? {
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
              distance: Math.hypot(b.x - a.x, b.y - a.y),
              angle: Math.atan2(b.y - a.y, b.x - a.x)
            }
          : null;
      };

      function react(dx, dy, source) {
        people.forEach((person) => {
          if (person === source) return;

          const distance = source
            ? Math.hypot(
                person.drawX - source.drawX,
                person.drawY - source.drawY
              )
            : 0;

          const weight = .10 + .24 * Math.exp(-distance / 240);

          person.rvx = clamp(
            person.rvx + clamp(dx, -40, 40) * weight * 12,
            -100,
            100
          );

          person.rvy = clamp(
            person.rvy + clamp(dy, -40, 40) * weight * 12,
            -100,
            100
          );
        });
      }

      stage.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY
        });

        velocityX = velocityY = 0;

        if (pointers.size === 1) {
          gesture = {
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            time: performance.now()
          };

          drag = people.find(
            (person) =>
              person.node === event.target.closest?.('.peer')
          ) || null;

          if (drag) drag.vx = drag.vy = 0;
          moved = false;
        } else {
          if (drag) drag.vx = drag.vy = 0;
          drag = null;
          moved = true;

          pinch = {
            ...two(),
            zoom,
            rotation: angle,
            panX,
            panY
          };
        }
      }, { signal: events.signal });

      stage.addEventListener('pointermove', (event) => {
        if (!pointers.has(event.pointerId) || !gesture) return;

        pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY
        });

        const now = performance.now();

        if (pointers.size > 1) {
          const current = two();

          if (pinch?.distance) {
            zoom = clamp(
              pinch.zoom * current.distance / pinch.distance,
              .5,
              2
            );

            angle = pinch.rotation + Math.atan2(
              Math.sin(current.angle - pinch.angle),
              Math.cos(current.angle - pinch.angle)
            );

            panX = pinch.panX + current.x - pinch.x;
            panY = pinch.panY + current.y - pinch.y;
          }

          moved = true;
          event.preventDefault();
        } else {
          const dx = event.clientX - gesture.x;
          const dy = event.clientY - gesture.y;

          if (
            Math.hypot(
              event.clientX - gesture.startX,
              event.clientY - gesture.startY
            ) > 7
          ) {
            moved = true;
          }

          if (moved) {
            event.preventDefault();

            try {
              stage.setPointerCapture(event.pointerId);
            } catch (_) {}

            const dt = Math.max(8, now - gesture.time) / 1000;

            if (drag) {
              drag.dx += dx;
              drag.dy += dy;
              drag.vx = clamp(dx / dt, -900, 900);
              drag.vy = clamp(dy / dt, -900, 900);
            } else {
              panX += dx;
              panY += dy;
              velocityX = clamp(dx / dt, -900, 900);
              velocityY = clamp(dy / dt, -900, 900);
            }

            react(dx, dy, drag);
          }
        }

        gesture.x = event.clientX;
        gesture.y = event.clientY;
        gesture.time = now;
      }, { signal: events.signal });

      function end(event) {
        if (
          event.type === 'pointercancel' ||
          (gesture && performance.now() - gesture.time > 90)
        ) {
          velocityX = velocityY = 0;
          if (drag) drag.vx = drag.vy = 0;
        }

        pointers.delete(event.pointerId);
        drag = null;
        pinch = null;

        if (!pointers.size) {
          gesture = null;
        } else {
          const remaining = [...pointers.values()][0];

          gesture = {
            ...remaining,
            startX: remaining.x,
            startY: remaining.y,
            time: performance.now()
          };

          moved = true;
        }
      }

      stage.addEventListener('pointerup', end, {
        signal: events.signal
      });

      stage.addEventListener('pointercancel', (event) => {
        moved = true;
        end(event);
      }, { signal: events.signal });

      stage.addEventListener('lostpointercapture', (event) => {
        if (pointers.has(event.pointerId)) {
          moved = true;
          end(event);
        }
      }, { signal: events.signal });

      stage.addEventListener('click', (event) => {
        if (!moved || event.detail === 0) return;

        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }, {
        capture: true,
        signal: events.signal
      });

      scene = {
        draw(now) {
          const dt = previousTime
            ? Math.min((now - previousTime) / 1000, .05)
            : 1 / 60;

          previousTime = now;
          elapsed += dt;

          const width = stage.clientWidth;
          const height = stage.clientHeight;

          if (!width || !height) return;

          const decay = Math.pow(.92, dt * 60);

          if (!pointers.size) {
            if (!motion.matches) {
              panX += velocityX * dt;
              panY += velocityY * dt;
            }

            velocityX *= decay;
            velocityY *= decay;
          }

          panX = clamp(panX, -width * .3, width * .3);
          panY = clamp(panY, -height * .3, height * .3);

          const cx = width / 2;
          const cy = height / 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const photoScale = zoom < 1
            ? Math.max(.45, 1 + (zoom - 1) * .8)
            : 1 + (zoom - 1) * .25;

          people.forEach((person) => {
            if (person !== drag) {
              if (!motion.matches) {
                person.dx += person.vx * dt;
                person.dy += person.vy * dt;
              }

              person.vx *= decay;
              person.vy *= decay;
            }

            person.rvx += (-person.rx * 45 - person.rvx * 12) * dt;
            person.rvy += (-person.ry * 45 - person.rvy * 12) * dt;
            person.rx = clamp(person.rx + person.rvx * dt, -22, 22);
            person.ry = clamp(person.ry + person.rvy * dt, -22, 22);

            if (motion.matches) {
              person.ox = person.oy = 0;
            } else if (!pointers.size) {
              const t = elapsed * person.rate;

              const x =
                4 * Math.sin(t + person.phase) +
                2 * Math.sin(t * .61 + person.phase * 2);

              const y =
                4 * Math.cos(t * .83 + person.phase) +
                2 * Math.sin(t * .47 + person.phase);

              person.ox += (x - person.ox) * Math.min(1, dt * 3);
              person.oy += (y - person.oy) * Math.min(1, dt * 3);
            }

            const x = (person.x * width - cx) * zoom;
            const y = (person.y * height - cy) * zoom;

            const margin = Math.min(
              36 * photoScale,
              width / 2,
              height / 2
            );

            const baseX = cx + x * cos - y * sin + panX;
            const baseY = cy + x * sin + y * cos + panY;

            const boundedX = clamp(
              baseX + person.dx,
              margin,
              width - margin
            );

            const boundedY = clamp(
              baseY + person.dy,
              margin,
              height - margin
            );

            if (boundedX !== baseX + person.dx) person.vx = 0;
            if (boundedY !== baseY + person.dy) person.vy = 0;

            person.dx = boundedX - baseX;
            person.dy = boundedY - baseY;

            person.drawX =
              boundedX + person.ox + (motion.matches ? 0 : person.rx);

            person.drawY =
              boundedY + person.oy + (motion.matches ? 0 : person.ry);

            person.node.style.left = person.drawX + 'px';
            person.node.style.top = person.drawY + 'px';

            person.node.style.transform =
              'translate(-50%,-50%) scale(' + photoScale + ')';
          });
        },

        stop() {
          events.abort();
        }
      };

      scene.draw(performance.now());
    }

    function showMenu(name) {
      const sheet = document.createElement('section');
      sheet.className = 'sheet';

      sheet.setAttribute(
        'aria-label',
        text('Perfil de exemplo: ', 'Example profile: ') + name
      );

      sheet.innerHTML = `
        <button class="handle" type="button" data-choice="back"></button>

        <header class="profile-header">
          <div class="portrait"></div>
          <h2 class="person-name"></h2>
          <span class="example-tag"></span>
        </header>

        <button class="hey" type="button" data-choice="hey">Hey</button>

        <div class="composer">
          <span class="inert-icon camera" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.8">
              <path d="M4 6h4l2-3h4l2 3h4v14H4z"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
          </span>

          <input type="text" readonly tabindex="-1">

          <span class="inert-icon microphone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.8">
              <rect x="9" y="2" width="6" height="13" rx="3"/>
              <path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/>
            </svg>
          </span>

          <button class="send" type="button" data-choice="message">
            <svg viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20V4M5 11l7-7 7 7"/>
            </svg>
          </button>
        </div>
      `;

      sheet.querySelector('.handle').setAttribute(
        'aria-label',
        text('Voltar à descoberta', 'Back to discovery')
      );

      face(sheet.querySelector('.portrait'), name);
      sheet.querySelector('.person-name').textContent = name;

      sheet.querySelector('.example-tag').textContent = text(
        'Perfil de exemplo',
        'Example profile'
      );

      const input = sheet.querySelector('input');
      input.value = text('Olá!', 'Hi!');

      input.setAttribute(
        'aria-label',
        text('Mensagem de exemplo', 'Example message')
      );

      sheet.querySelector('.send').setAttribute(
        'aria-label',
        text('Experimentar mensagem', 'Try a message')
      );

      const source = document.querySelector('.mini-menu');

      [
        ['.camera', '[data-camera-open] svg'],
        ['.microphone', '[data-microphone] svg'],
        ['.send', '.mini-compose-send svg']
      ].forEach(([target, selector]) => {
        const icon = source?.querySelector(selector)?.cloneNode(true);
        if (!icon) return;

        [icon, ...icon.querySelectorAll('*')].forEach((node) => {
          [...node.attributes].forEach((attribute) => {
            if (
              attribute.name === 'id' ||
              attribute.name === 'style' ||
              attribute.name.startsWith('on')
            ) {
              node.removeAttribute(attribute.name);
            }
          });
        });

        icon.setAttribute('aria-hidden', 'true');
        sheet.querySelector(target).replaceChildren(icon);
      });

      content.append(sheet);

      animate(
        sheet,
        [
          { transform: 'translateY(105%)', opacity: .5 },
          { transform: 'translateY(0)', opacity: 1 }
        ],
        520
      );

      return sheet;
    }

    async function closeMenu(sheet) {
      animate(
        sheet,
        [
          { transform: 'translateY(0)', opacity: 1 },
          { transform: 'translateY(105%)', opacity: .5 }
        ],
        240
      );

      await wait(motion.matches ? 0 : 220);

      sheet.remove();
      view.className = 'view demo';

      const stage = content.querySelector('.stage');
      stage.style.removeProperty('height');
      stage.style.removeProperty('bottom');

      nav.hidden = !nav.childElementCount;

      root.querySelectorAll('button').forEach((button) => {
        button.disabled = false;
      });

      heading(
        text('Um olá começa aqui.', 'A hello starts here.'),
        text(
          'Toca numa foto para conheceres o perfil.',
          'Tap a photo to see the profile.'
        )
      );
    }

    async function sendExample(action, name, sheet) {
      const hey = action === 'hey';
      const button = sheet.querySelector(hey ? '.hey' : '.send');

      animate(
        button,
        [
          { transform: 'scale(1)' },
          { transform: 'scale(.88)' },
          { transform: 'scale(1.06)' },
          { transform: 'scale(1)' }
        ],
        420
      );

      const bubble = document.createElement('div');
      bubble.className = 'flying-message';
      bubble.setAttribute('aria-hidden', 'true');
      bubble.textContent = hey ? 'Hey!' : text('Olá!', 'Hi!');
      sheet.append(bubble);

      animate(
        bubble,
        [
          {
            opacity: 0,
            transform: 'translate(-50%,20px) scale(.7)'
          },
          {
            opacity: 1,
            offset: .3,
            transform: 'translate(-50%,-10px) scale(1)'
          },
          {
            opacity: 0,
            transform: 'translate(-50%,-100px) scale(.85)'
          }
        ],
        700
      );

      await wait(motion.matches ? 0 : 680);
      await visible();
      bubble.remove();

      heading(
        hey
          ? text('O teu Hey chega assim.', 'This is how your Hey arrives.')
          : text(
              'É assim que começa a conversa.',
              'This is how a conversation starts.'
            ),
        text(
          'A pessoa recebe um aviso e pode responder-te.',
          'They receive a notification and can reply to you.'
        )
      );

      const notice = document.createElement('aside');
      notice.className = 'send-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.setAttribute('aria-atomic', 'true');

      notice.innerHTML =
        '<span class="notice-mark" aria-hidden="true">✓</span>' +
        '<div><strong></strong><p></p></div>';

      notice.querySelector('strong').textContent =
        (
          hey
            ? text('Hey de exemplo para ', 'Example Hey to ')
            : text('Mensagem de exemplo para ', 'Example message to ')
        ) + name;

      notice.querySelector('p').textContent = text(
        'É só um ensaio. Nada foi enviado.',
        'Just a practice run. Nothing was sent.'
      );

      root.querySelector('.instruction').after(notice);

      animate(
        notice,
        [
          {
            opacity: 0,
            transform: 'translateY(-18px) scale(.96)'
          },
          {
            opacity: 1,
            transform: 'translateY(0) scale(1)'
          }
        ],
        480
      );

      button.textContent = '✓';

      button.setAttribute(
        'aria-label',
        text('Demonstração concluída', 'Demo complete')
      );

      await next();
    }

    async function demo() {
      screen(
        'demo',
        text('Um olá começa aqui.', 'A hello starts here.'),
        text(
          'Toca numa foto para conheceres o perfil.',
          'Tap a photo to see the profile.'
        )
      );

      startPeople();

      const note = document.createElement('span');
      note.className = 'small';

      note.textContent = text(
        'Perfis de exemplo · podes arrastar as fotos',
        'Example profiles · you can drag the photos'
      );

      content.append(note);
      navigation();

      while (true) {
        const selected = await choose([
          ['skip', text('Saltar demonstração', 'Skip demo'), true]
        ]);

        if (selected === 'skip') return;

        if (!Object.prototype.hasOwnProperty.call(profiles, selected)) {
          continue;
        }

        const stage = content.querySelector('.stage');
        stage.style.height = stage.clientHeight + 'px';
        stage.style.bottom = 'auto';

        view.className = 'view demo menu';
        actions.replaceChildren();
        nav.hidden = true;

        heading(
          text('Dá o primeiro olá.', 'Say the first hello.'),
          text(
            'Toca em Hey ou na seta para experimentar.',
            'Tap Hey or the arrow to try it.'
          )
        );

        const sheet = showMenu(selected);
        menuDismissible = true;

        const action = await choose([]);
        menuDismissible = false;

        if (action === 'back') {
          await closeMenu(sheet);
          continue;
        }

        await sendExample(action, selected, sheet);
        return;
      }
    }

    async function requestLocation(always) {
      valid();

      if (preview) {
        simulated.authorization = always
          ? 'always'
          : ios ? 'when_in_use' : 'granted';

        return;
      }

      const fresh = await status();
      valid();

      await ui.run(() => {
        valid();

        return ui.guide(
          always ? 'always' : 'location',
          () => always && fresh.permission_flow_version !== 2
            ? bg.requestAlways()
            : bg.requestPermission(always)
        );
      });

      await visible();
    }

    async function settings() {
      if (preview) {
        simulated.authorization = ios ? 'always' : 'granted';
        return;
      }

      valid();

      const opened = await bg.openSettings();
      valid();

      if (opened === false || opened?.opened === false) {
        throw new Error('Settings unavailable');
      }

      screen(
        'paper',
        text('Depois, volta aqui.', 'Then come back here.'),
        ios
          ? text(
              'Definições → Margot → Localização.',
              'Settings → Margot → Location.'
            )
          : text(
              'Margot → Permissões → Localização.',
              'Margot → Permissions → Location.'
            )
      );

      await choose([
        ['check', text('Continuar', 'Continue')],
        ['later', text('Agora não', 'Not now'), true]
      ]);

      await visible();
    }

    root.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    document.addEventListener('margot:page-leave', abort, { signal });

    document.addEventListener(
      'visibilitychange',
      () => {
        container.toggleAttribute('data-paused', document.hidden);

        animations.forEach((animation) => {
          if (document.hidden) animation.pause();
          else animation.play();
        });
      },
      { signal }
    );

    host.addEventListener('cancel', (event) => {
      event.preventDefault();

      if (menuDismissible) {
        root.querySelector('.sheet .handle')?.click();
      } else {
        abort();
      }
    }, { signal });

    host.addEventListener('close', () => { if (!window.MargotDiscoveryTutorial?.busy) abort(); }, { signal });

    try {
      while (!gate()) {
        await wait(200);
        valid();
      }

      await visible();

      if (!preview) ui.deferNotifications();

      document.body.append(host);
      host.showModal();

      frame = requestAnimationFrame(mirror);

      watcher = setInterval(() => {
        if (member() !== id || !home() || !gate()) abort();
      }, 500);

      if (preview || force || !read(id, 'demo')) {
        await window.MargotDiscoveryTutorial.run({ host, signal, preview });
        if (!preview) save(id, 'demo');
      }

      state = await status();
      valid();

      if (!granted(state) || (!preview && pref('localizacao') === false)) {
        screen(
          'paper',
          text('Quem está perto de ti?', 'Who is nearby?'),
          ios
            ? text(
                'A localização permite encontrar pessoas que estão perto de ti.',
                'Location helps you find people nearby.'
              )
            : text(
                'Permite a localização para veres quem está perto.',
                'Allow location to see people nearby.'
              )
        );

        const choice = await choose([
          ['allow', text('Continuar', 'Continue')],
          ['later', text('Agora não', 'Not now'), true]
        ]);

        if (choice === 'allow') {
          if (!granted(state)) {
            if (pending(state) && state.services_enabled !== false) {
              await requestLocation(false);
            } else {
              await settings();
            }
          }

          state = await status();
          valid();

          if (granted(state) && !preview) {
            window.MargotPreferencias?.definir('localizacao', true);
          }

          await result(
            granted(state),
            granted(state)
              ? text('Localização ativa.', 'Location enabled.')
              : text(
                  'A localização ainda está desligada.',
                  'Location is still off.'
                ),
            granted(state)
              ? text(
                  'Já podemos encontrar pessoas por perto.',
                  'We can now find people nearby.'
                )
              : text(
                  'Podes ativá-la nas Definições.',
                  'You can enable it in Settings.'
                )
          );
        }
      }

      state = await status();
      valid();

      if (
        ios &&
        granted(state) &&
        auth(state) !== 'always' &&
        (preview || pref('localizacao') !== false)
      ) {
        screen(
          'paper',
          text(
            'E com o telemóvel no bolso?',
            'And with your phone in your pocket?'
          ),
          text(
            'Escolhe “Sempre” para permitir atualizações quando sais da Margot.',
            'Choose “Always” to allow updates when you leave Margot.'
          )
        );

        content.innerHTML =
          '<div class="pocket-scene" aria-hidden="true">' +
          '<div class="phone"><img></div><div class="pocket"></div></div>';

        ownPhoto(content.querySelector('img'));

        const choice = await choose([
          ['always', text('Continuar', 'Continue')],
          ['later', text('Agora não', 'Not now'), true]
        ]);

        if (choice === 'always') {
          state = await status();
          valid();

          if (state.always_requested !== true) {
            await requestLocation(true);
          } else {
            await settings();
          }

          state = await status();
          valid();

          if (auth(state) !== 'always') {
            screen(
              'paper',
              text(
                '“Sempre” ainda não está ativo.',
                '“Always” is not enabled yet.'
              ),
              text(
                'Podes escolhê-lo nas Definições. Sem atualizações, podes deixar de aparecer.',
                'You can choose it in Settings. Without updates, you may stop appearing.'
              )
            );

            const fallbackChoice = await choose([
              ['settings', text('Continuar', 'Continue')],
              ['later', text('Agora não', 'Not now'), true]
            ]);

            if (fallbackChoice === 'settings') {
              await settings();
              state = await status();
              valid();
            }
          }

          if (granted(state) && auth(state) === 'always') {
            await result(
              true,
              text('“Sempre” está ativo.', '“Always” is enabled.'),
              text(
                'A localização em segundo plano está autorizada.',
                'Background location is authorised.'
              )
            );
          }
        }
      }

      const push = window.MargotPushNotifications;

      const notification = preview
        ? 'prompt'
        : await push?.permissionState?.();

      valid();

      if (
        ['prompt', 'prompt-with-rationale'].includes(notification) ||
        (
          notification === 'granted' &&
          pref('notificacoes') === false
        )
      ) {
        screen(
          'paper',
          text('Recebe os teus olás.', 'Receive your hellos.'),
          text(
            'As notificações avisam-te quando recebes um Hey ou uma mensagem.',
            'Notifications let you know when you receive a Hey or a message.'
          )
        );

        const choice = await choose([
          ['notifications', text('Continuar', 'Continue')],
          ['later', text('Agora não', 'Not now'), true]
        ]);

        if (choice === 'notifications') {
          const value = preview
            ? 'granted'
            : await push.requestPermission();

          await visible();

          if (!preview && ['granted', 'denied'].includes(value)) {
            window.MargotPreferencias?.definir(
              'notificacoes',
              value === 'granted'
            );

            try {
              localStorage.setItem('margot-notification-intro-v2', value);
            } catch (_) {}
          }

          await result(
            value === 'granted',
            value === 'granted'
              ? text('Notificações ativas.', 'Notifications enabled.')
              : text('Notificações desligadas.', 'Notifications are off.'),
            value === 'granted'
              ? text(
                  'Já podes receber os teus avisos.',
                  'You can now receive your alerts.'
                )
              : text(
                  'Podes ativá-las mais tarde.',
                  'You can enable them later.'
                )
          );
        }
      }

      screen(
        'paper',
        text('Vamos até à descoberta.', 'Let’s discover people nearby.'),
        text(
          'Na área de descoberta encontras as pessoas por perto. Toca numa foto quando quiseres dizer olá.',
          'Find people nearby in the discovery area. Tap a photo whenever you want to say hello.'
        )
      );

      await choose([
        ['finish', text('Entrar na Margot', 'Enter Margot')]
      ]);

      if (!preview) {
        save(id, 'complete');
        complete = true;
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('Margot tutorial:', error);

        try {
          screen(
            'paper',
            text(
              'Não foi possível concluir este passo.',
              'We could not finish this step.'
            ),
            text(
              'Podes continuar e voltar a tentar nas definições da Margot.',
              'You can continue and try again in Margot settings.'
            )
          );

          await next();
        } catch (_) {}
      }
    } finally {
      abort();
      clearInterval(watcher);
      cancelAnimationFrame(frame);
      scene?.stop();

      animations.forEach((animation) => animation.cancel());
      animations.clear();

      host.close();
      host.remove();
      cancelActive = null;

      if (complete) inviteLater(id);
    }

    return true;
  }

  function run(options) {
    if (active) return active;

    active = launch(options).finally(() => {
      active = null;
    });

    return active;
  }

  document.addEventListener('margot:page-leave', () => {
    inviteHost?.remove();
  });

  window.MargotWelcome = {
    run,

    preview: (platform) => run({
      preview: true,
      platform
    }),

    cancel: () => cancelActive?.(),

    get busy() {
      return Boolean(active);
    }
  };
})();