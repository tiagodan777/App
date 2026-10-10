(() => {
  'use strict';

  if (window.MargotNoticeVideo) return;
  window.MargotNoticeVideo = true;

  const assets = new URL('../media/', document.currentScript.src);
  const portraits = new URL('location-demo-young.jpg', assets).href;
  const en = () => window.MargotI18n?.language === 'en';
  const copy = (pt, english) => en() ? english : pt;

  const style = document.createElement('style');

  style.textContent = `
    .ml-film { margin:10px 0 0; }

    .ml-film summary {
      min-height:44px;display:flex;align-items:center;gap:8px;
      cursor:pointer;font-weight:600;font-size:14px;list-style:none;
    }

    .ml-film summary::-webkit-details-marker { display:none; }

    .ml-film summary::after {
      content:'＋';margin-left:auto;font-size:20px;font-weight:400;
    }

    .ml-film[open] summary::after { content:'−'; }

    .ml-film summary:focus-visible {
      outline:2px solid #b4214d;outline-offset:3px;border-radius:8px;
    }

    .ml-film-content {
      padding:16px 12px 4px;border-radius:20px;color:#242428;
      background:radial-gradient(
        ellipse at 80% 40%,#fbeef2,transparent 70%
      ),#f7f7f9;
      overflow:hidden;
    }

    .ml-stage {
      position:relative;height:220px;isolation:isolate;
    }

    .ml-label {
      position:absolute;top:0;
      font:500 11px/1.3 system-ui,sans-serif;
      color:#66616a;text-align:center;width:45%;
    }

    .ml-label:first-child { left:0; }
    .ml-label:nth-child(2) { right:0; }

    .ml-device {
      position:absolute;left:8%;top:31px;width:70px;height:134px;
      border-radius:20px;padding:4px;
      background:linear-gradient(
        115deg,#f7f7f7,#92959a 35%,#f0f0f0 65%,#8d9095
      );
      box-shadow:0 12px 18px #23233320;
      transform:rotate(-9deg);box-sizing:content-box;
    }

    .ml-display {
      height:100%;border-radius:16px;
      background:radial-gradient(
        #ddd3dd .7px,transparent .8px
      ) 0 0/9px 9px,#fff;
      position:relative;overflow:hidden;
      border:1px solid #29292d;box-sizing:border-box;
    }

    .ml-display::before {
      content:'';position:absolute;top:6px;left:24px;
      width:22px;height:6px;border-radius:8px;background:#242428;
    }

    .ml-display::after {
      content:'';position:absolute;bottom:5px;left:25px;
      width:20px;height:3px;border-radius:4px;background:#b9b6bd;
    }

    .ml-pocket {
      position:absolute;left:3%;top:127px;width:112px;height:88px;
      border-radius:5px 5px 40px 40px;
      background:linear-gradient(130deg,#e8e9ec,#c5c8d0);
      box-shadow:0 -2px 0 #fbfcff,inset 0 1px 3px #63697918;
    }

    .ml-pocket::after {
      content:'';position:absolute;inset:7px;
      border:1px dashed #9499a480;border-top:0;
      border-radius:0 0 33px 33px;
    }

    .ml-map {
      position:absolute;right:0;top:27px;width:51%;height:183px;
      border-radius:24px;
      background:radial-gradient(
        #cdbbcf 1px,transparent 1px
      ) 1px 2px/17px 17px;
    }

    .ml-avatar {
      position:absolute;width:46px;height:46px;border-radius:50%;
      background-color:#e3d9df;background-size:300% 100%;
      background-position:0 50%;
      box-shadow:0 5px 13px #372b3820;
      border:2px solid #fff;box-sizing:border-box;overflow:hidden;
    }

    .ml-avatar img {
      width:100%;height:100%;display:block;object-fit:cover;
    }

    .ml-peer-a { left:4%;top:18px; }

    .ml-peer-b {
      right:1%;bottom:12px;background-position:100% 50%;
    }

    .ml-self {
      width:60px;height:60px;left:35%;top:67px;
      background-position:50% 50%;
      box-shadow:0 0 0 4px #bd285216,0 8px 18px #62253e1c;
      z-index:1;
    }

    .ml-display .ml-self {
      width:36px;height:36px;left:17px;top:48px;
      box-shadow:0 0 0 3px #bd285218;
    }

    .ml-hole {
      position:absolute;left:35%;top:67px;width:60px;height:60px;
      border:1px dashed #b2a6b0;border-radius:50%;
      box-sizing:border-box;opacity:0;
    }

    .ml-caption {
      min-height:42px;margin:8px 0 0!important;text-align:center;
      font:600 15px/1.35 system-ui,sans-serif!important;
    }

    .ml-meta {
      display:flex;align-items:center;
      justify-content:space-between;gap:8px;
    }

    .ml-meta small {
      font:400 10px/1.3 system-ui,sans-serif;color:#706974;
    }

    .margot-location-pill .ml-replay {
      min-height:44px;padding:8px 0;border:0;background:none;
      color:#85334e;font:600 12px system-ui,sans-serif;
      text-decoration:none;
    }

    .ml-playing .ml-device {
      animation:ml-pocket-in 7s cubic-bezier(.22,.61,.36,1) both;
    }

    .ml-playing .ml-map .ml-self {
      animation:ml-vanish 7s ease both;
    }

    .ml-playing .ml-hole {
      animation:ml-hole-in 7s ease both;
    }

    @keyframes ml-pocket-in {
      0%,15% { transform:translateY(0) rotate(-9deg); }
      38%,100% {
        transform:translateY(76px) rotate(0);opacity:0;
      }
    }

    @keyframes ml-vanish {
      0%,63% {
        opacity:1;transform:scale(1);filter:blur(0);
      }
      82%,100% {
        opacity:0;transform:scale(.82);filter:blur(3px);
      }
    }

    @keyframes ml-hole-in {
      0%,65% { opacity:0; }
      84%,100% { opacity:1; }
    }

    @media(prefers-reduced-motion:reduce) {
      .ml-playing * { animation:none!important; }
    }

    .margot-location-pill .ml-error {
      display:block;font-size:13px;margin-top:8px;
    }

    .margot-location-pill .ml-error[hidden],
    .ml-film[hidden] {
      display:none!important;
    }
  `;

  document.head.append(style);
  const mounted = new WeakSet();

  function mount(pill) {
    if (mounted.has(pill)) return;

    const actions = pill.querySelector('.margot-location-pill-actions');
    const settings = pill.querySelector('[data-settings]');
    const guidance = pill.querySelector('[data-guidance]');

    if (!actions || !settings || !guidance) return;
    mounted.add(pill);

    const film = document.createElement('details');
    film.className = 'ml-film';

    film.innerHTML = `
      <summary></summary>
      <div class="ml-film-content">
        <div class="ml-stage" aria-hidden="true">
          <span class="ml-label"></span>
          <span class="ml-label"></span>

          <div class="ml-device">
            <div class="ml-display">
              <div class="ml-avatar ml-self"></div>
            </div>
          </div>

          <div class="ml-pocket"></div>

          <div class="ml-map">
            <div class="ml-avatar ml-peer-a"></div>
            <div class="ml-avatar ml-peer-b"></div>
            <div class="ml-hole"></div>
            <div class="ml-avatar ml-self"></div>
          </div>
        </div>

        <p class="ml-caption"></p>

        <div class="ml-meta">
          <small></small>
          <button type="button" class="ml-replay"></button>
        </div>
      </div>
    `;

    const q = selector => film.querySelector(selector);

    q('summary').textContent = copy('Ver porquê…', 'See why…');

    const labels = film.querySelectorAll('.ml-label');
    labels[0].textContent = copy('O teu telemóvel', 'Your phone');
    labels[1].textContent = copy('Quem está perto', 'People nearby');
    q('.ml-replay').textContent = copy('Repetir ↻', 'Replay ↻');

    actions.before(film);

    const error = document.createElement('small');
    error.className = 'ml-error';
    error.hidden = true;
    error.setAttribute('role', 'status');
    actions.after(error);

    const relevant = () =>
      !guidance.hidden && Boolean(guidance.textContent.trim());

    let timers = [];
    let opening = false;

    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      film.classList.remove('ml-playing');
    };

    function photos() {
      const id = String(window.membroId || '');

      const entries = Array.from(
        document.querySelectorAll('img.foto:not(.a-remover)')
      );

      const isMe = element =>
        Boolean(id) &&
        (element.id === id || element.dataset.membroId === id);

      const own = entries.find(isMe);
      const peers = entries.filter(element => !isMe(element)).slice(0, 2);

      let examples = !own || peers.length < 2;

      function fill(target, source) {
        target.replaceChildren();
        target.style.backgroundImage = `url("${portraits}")`;

        if (!source) return;

        let url;

        try {
          url = new URL(source.currentSrc || source.src, location.href);
        } catch (_) {
          examples = true;
          return;
        }

        if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
          examples = true;
          return;
        }

        if (url.pathname.endsWith('/default.webp')) {
          examples = true;
          return;
        }

        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';

        img.onerror = () => {
          img.remove();
          q('.ml-meta small').textContent = copy(
            'Ilustração · inclui perfis de exemplo',
            'Illustration · includes example profiles'
          );
        };

        img.src = url.href;
        target.append(img);
      }

      film.querySelectorAll('.ml-self').forEach(element => {
        fill(element, own);
      });

      fill(q('.ml-peer-a'), peers[0]);
      fill(q('.ml-peer-b'), peers[1]);

      q('.ml-meta small').textContent = examples
        ? copy(
            'Ilustração · inclui perfis de exemplo',
            'Illustration · includes example profiles'
          )
        : copy(
            'Ilustração com as fotos do teu mapa',
            'Illustration using photos from your map'
          );
    }

    function play() {
      stop();

      if (!film.open || film.hidden || pill.hidden || document.hidden) {
        return;
      }

      photos();

      q('.ml-caption').textContent = copy(
        'Guardas o telemóvel.',
        'You put your phone away.'
      );

      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        q('.ml-caption').textContent = copy(
          'Sem “Sempre”, podes deixar de aparecer.',
          'Without “Always”, you may stop appearing.'
        );
        return;
      }

      void film.offsetWidth;
      film.classList.add('ml-playing');

      timers.push(setTimeout(() => {
        q('.ml-caption').textContent = copy(
          'Algum tempo depois…',
          'Some time later…'
        );
      }, 2700));

      timers.push(setTimeout(() => {
        q('.ml-caption').textContent = copy(
          'Podem deixar de te encontrar.',
          'People may stop finding you.'
        );
      }, 5400));
    }

    film.addEventListener('toggle', () => {
      if (film.open) play();
      else stop();
    });

    q('.ml-replay').onclick = play;

    const sync = () => {
      const hide = !relevant();

      if (film.hidden !== hide) film.hidden = hide;

      if (hide || pill.hidden || document.hidden) {
        stop();
        if (film.open) film.open = false;
      }
    };

    new MutationObserver(sync).observe(pill, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden']
    });

    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', stop);

    settings.addEventListener('click', async event => {
      if (
        !relevant() ||
        !window.MargotBackgroundLocation?.openSettings
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (opening) return;

      opening = true;
      error.hidden = true;
      stop();

      try {
        const result =
          await window.MargotBackgroundLocation.openSettings();

        if (result === false || result?.opened === false) {
          throw Error();
        }
      } catch (_) {
        error.textContent = copy(
          'Abre Definições → Margot → Localização → Sempre.',
          'Open Settings → Margot → Location → Always.'
        );
        error.hidden = false;
      } finally {
        opening = false;
      }
    }, true);

    sync();
  }

  const scan = () => {
    document.querySelectorAll('.margot-location-pill').forEach(mount);
  };

  const start = () => {
    scan();
    new MutationObserver(scan).observe(document.body, {
      childList: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();