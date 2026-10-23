(() => {
  'use strict';

  if (window.MargotDiscoveryInviteNotice) return;

  const base = new URL('../', document.currentScript.src);

  const text = (pt, en) =>
    window.MargotI18n?.language === 'en' ? en : pt;

  // Temporário para a gravação: voltar a 3 depois do vídeo.
  const MAX_PEOPLE = 6;
  const MAX_DAILY_SHOWS = 2;
  const MIN_SHOW_INTERVAL = 4 * 60 * 60 * 1000;
  const dailyMemory = new Map();
  const dismissed = new Set();

  let eligibleSince = 0;
  let previousMember = '';

  // Substitui apenas a antiga dica de convites.
  // Não altera os registos de conclusão do tutorial ou permissões.
  function retireOldTip(id) {
    if (!id) return;

    try {
      localStorage.setItem(
        'margot-welcome-v2:' + id + ':invite',
        '1'
      );
    } catch (_) {}
  }

  const host = document.createElement('aside');
  host.id = 'margot-discovery-invite';
  host.hidden = true;

  const style = document.createElement('style');

  style.textContent = `
    #margot-discovery-invite {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 14px);
      left: 16px;
      right: 16px;
      z-index: 950;
      max-width: 460px;
      margin-inline: auto;
      box-sizing: border-box;
      padding: 14px 48px 14px 16px;
      border: 1px solid rgba(225,35,70,.12);
      border-radius: 20px;
      background: #fffaf9;
      box-shadow: 0 6px 24px rgba(40,20,30,.09);
      color: #252229;
      font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    }

    #margot-discovery-invite[hidden] {
      display: none !important;
    }

    #margot-discovery-invite a {
      display: block;
      color: inherit;
      text-decoration: none;
    }

    #margot-discovery-invite strong {
      display: block;
      font-size: 15px;
      line-height: 1.3;
      margin-bottom: 4px;
    }

    #margot-discovery-invite span {
      display: block;
      font-size: 13px;
      line-height: 1.4;
      color: #746b73;
    }

    #margot-discovery-invite em {
      color: #e12346;
      font-style: normal;
      font-weight: 650;
      white-space: nowrap;
    }

    #margot-discovery-invite button {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #665e65;
      font: 26px/1 Arial, sans-serif;
      cursor: pointer;
    }

    #margot-discovery-invite a:focus-visible,
    #margot-discovery-invite button:focus-visible {
      outline: 2px solid #e12346;
      outline-offset: 3px;
    }

    @media (prefers-color-scheme: dark) {
      #margot-discovery-invite {
        background: #292329;
        color: #fff;
        border-color: #69404b;
      }

      #margot-discovery-invite span,
      #margot-discovery-invite button {
        color: #d0c5cc;
      }

      #margot-discovery-invite em {
        color: #ff829b;
      }
    }
  `;

  host.innerHTML =
    '<a><strong></strong><span></span></a>' +
    '<button type="button">×</button>';

  const link = host.querySelector('a');
  const close = host.querySelector('button');

  link.href = new URL('invite', base).href;

  const member = () => String(window.membroId || '');

  function localDay() {
    const now = new Date();

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
  }

  const key = () =>
    'margot-discovery-invite-dismissed:' + member() + ':' + localDay();

  function reservePresentation() {
    const storageKey = 'margot-discovery-invite-daily:' + member();
    const day = localDay();

    let record = { day, count: 0, lastShown: 0 };
    let saved = null;

    try {
      saved = JSON.parse(localStorage.getItem(storageKey));
    } catch (_) {}

    // A memória mantém o limite se o armazenamento estiver indisponível.
    for (const candidate of [saved, dailyMemory.get(storageKey)]) {
      if (
        candidate?.day === day &&
        Number.isInteger(candidate.count) &&
        candidate.count >= 0 &&
        Number.isFinite(candidate.lastShown) &&
        candidate.lastShown >= 0
      ) {
        record.count = Math.max(record.count, candidate.count);
        record.lastShown = Math.max(record.lastShown, candidate.lastShown);
      }
    }

    const now = Date.now();

    if (
      record.count >= MAX_DAILY_SHOWS ||
      (record.count > 0 && now - record.lastShown < MIN_SHOW_INTERVAL)
    ) {
      return false;
    }

    record.count += 1;
    record.lastShown = now;
    dailyMemory.set(storageKey, record);

    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch (_) {}

    return true;
  }

  function wasDismissed() {
    if (dismissed.has(key())) return true;

    try {
      return sessionStorage.getItem(key()) === '1';
    } catch (_) {
      return false;
    }
  }

  function dismiss() {
    dismissed.add(key());

    try {
      sessionStorage.setItem(key(), '1');
    } catch (_) {}

    host.hidden = true;
    eligibleSince = 0;
  }

  close.addEventListener('click', dismiss);

  link.addEventListener('click', event => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (!window.MargotNavigation) return;

    event.preventDefault();
    dismiss();

    window.MargotNavigation.navigate(link.href, {
      historico: 'push',
      direcao: 1
    });
  });

  function visibleNotice(selector) {
    return Array.from(
      document.querySelectorAll(selector)
    ).some(node =>
      !node.hidden &&
      node.getClientRects().length > 0
    );
  }

  function refresh() {
    const id = member();

    if (id !== previousMember) {
      host.hidden = true;
      previousMember = id;
      retireOldTip(id);
      eligibleSince = 0;
    }

    const blocked =
      !id ||
      wasDismissed() ||
      document.hidden ||
      !document.getElementById('gridCanvas') ||
      !window.AppWebSocket?.isConnected?.() ||
      window.MargotWelcome?.busy ||
      window.MargotDiscoveryTutorial?.busy ||
      window.MargotPermissionUI?.busy ||
      document.body.hasAttribute('aria-busy') ||
      (
        window.MargotNativeVersion &&
        window.MargotNativeVersion.getState() !== 'allowed'
      ) ||
      document.querySelector('dialog[open]') ||
      document.body.matches(
        '.perfil-modal-aberta,.heys-abertos,.margot-mini-menu-aberto'
      ) ||
      visibleNotice('.margot-location-pill') ||
      document.activeElement?.matches(
        'input,textarea,select,[contenteditable="true"]'
      );

    const others = new Set();

    document.querySelectorAll(
      '.foto[data-membro-id]:not([data-margot-demo]):not(.a-remover)'
    ).forEach(photo => {
      const person = String(photo.dataset.membroId || '');

      if (person && person !== id) {
        others.add(person);
      }
    });

    if (blocked || others.size > MAX_PEOPLE) {
      host.hidden = true;
      eligibleSince = 0;
      return;
    }

    if (!eligibleSince) {
      eligibleSince = Date.now();
    }

    if (Date.now() - eligibleSince < 5000) return;
    if (host.hidden && !reservePresentation()) return;

    host.querySelector('strong').textContent = text(
      'Um olá fica melhor com amigos.',
      'A hello is better with friends.'
    );

    const description = host.querySelector('span');

    description.replaceChildren(
      document.createTextNode(
        text(
          'Convida os teus para a Margot. ',
          'Invite yours to Margot. '
        )
      )
    );

    const action = document.createElement('em');

    action.textContent = text(
      'Ver convites →',
      'See invites →'
    );

    description.append(action);

    close.setAttribute(
      'aria-label',
      text('Fechar convite', 'Dismiss invitation')
    );

    host.hidden = false;
  }

  document.head.append(style);
  document.body.append(host);

  document.addEventListener('margot:page-leave', () => {
    host.hidden = true;
    eligibleSince = 0;
  });

  document.addEventListener('margot:page-ready', refresh);
  document.addEventListener('visibilitychange', refresh);

  refresh();
  setInterval(refresh, 1000);

  window.MargotDiscoveryInviteNotice = { refresh };
})();