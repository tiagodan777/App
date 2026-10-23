(() => {
  'use strict';

  if (window.MargotChatEntryMotion) return;
  window.MargotChatEntryMotion = true;

  let fromList = false;
  let animation = null;

  function cancel() {
    animation?.cancel();
    animation = null;
  }

  document.addEventListener('margot:page-leave', () => {
    cancel();

    fromList = Boolean(
      document.getElementById('conversas-lista')
    );
  });

  document.addEventListener('margot:page-ready', () => {
    const chat = document.getElementById('chat-pagina');
    const shouldAnimate = fromList;

    fromList = false;

    if (
      !shouldAnimate ||
      !chat ||
      document.hidden ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.activeElement?.matches(
        'input,textarea,[contenteditable]'
      ) ||
      chat.classList.contains('chat-keyboard-open')
    ) {
      return;
    }

    cancel();

    // Preserva a centragem existente do chat.
    // A animação começa quando a página já está preparada.
    animation = chat.animate?.(
      [
        {
          transform: 'translateX(calc(-50% + 100vw))'
        },
        {
          transform: 'translateX(-50%)'
        }
      ],
      {
        duration: 220,
        easing: 'cubic-bezier(.22,.72,.2,1)'
      }
    ) || null;
  });

  document.addEventListener('focusin', event => {
    if (
      event.target.matches(
        'input,textarea,[contenteditable]'
      )
    ) {
      cancel();
    }
  });

  window.addEventListener('resize', cancel);
  window.visualViewport?.addEventListener('resize', cancel);
  window.addEventListener('pagehide', cancel);
})();