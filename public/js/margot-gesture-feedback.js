(() => {
  'use strict';

  if (window.MargotInviteFeedback) return;
  window.MargotInviteFeedback = true;

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

  function prepareInvitation() {
    const page = document.querySelector('[data-invitation]');
    const button = page?.querySelector('[data-copy-link]');
    const status = page?.querySelector('[data-invite-status]');

    if (button && status) {
      button.after(status);
    }
  }

  document.addEventListener(
    'margot:page-ready',
    prepareInvitation
  );

  prepareInvitation();
})();