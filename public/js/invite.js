(() => {
    'use strict';

    const page = document.querySelector('[data-invitation]');

    if (!page || page.dataset.ready) return;

    page.dataset.ready = '1';

    const url = page.dataset.url;

    if (!url) return;

    const status = page.querySelector('[data-invite-status]');

    const tell = (message, error = false) => {
        status.textContent = message;
        status.toggleAttribute('data-error', error);
    };

    const qrHolder = page.querySelector('[data-invite-qr]');

    if (qrHolder) {
        try {
            const qr = qrcodegen.QrCode.encodeText(
                url,
                qrcodegen.QrCode.Ecc.MEDIUM
            );

            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');

            svg.setAttribute(
                'viewBox',
                `0 0 ${qr.size + 8} ${qr.size + 8}`
            );

            svg.setAttribute('shape-rendering', 'crispEdges');

            const paper = document.createElementNS(ns, 'rect');

            paper.setAttribute('width', '100%');
            paper.setAttribute('height', '100%');
            paper.setAttribute('fill', '#fff');

            const path = document.createElementNS(ns, 'path');
            const modules = [];

            for (let y = 0; y < qr.size; y++) {
                for (let x = 0; x < qr.size; x++) {
                    if (qr.getModule(x, y)) {
                        modules.push(`M${x + 4},${y + 4}h1v1h-1z`);
                    }
                }
            }

            path.setAttribute('d', modules.join(''));
            path.setAttribute('fill', '#17171b');

            svg.append(paper, path);
            qrHolder.replaceChildren(svg);
        } catch {
            qrHolder.hidden = true;

            page.querySelector('[data-qr-help]').textContent =
                'Partilha a ligação ou o código abaixo.';
        }
    }

    async function copy(value, label) {
        try {
            await navigator.clipboard.writeText(value);
            tell(label);
        } catch {
            const fallback = page.querySelector('[data-copy-fallback]');

            fallback.hidden = false;

            const input = fallback.querySelector('input');

            input.value = value;
            input.focus();
            input.select();

            tell('Mantém pressionado o texto para copiar.');
        }
    }

    page.querySelector('[data-copy-code]')?.addEventListener(
        'click',
        (event) => {
            copy(
                event.currentTarget.textContent.trim(),
                'Código copiado.'
            );
        }
    );

    page.querySelector('[data-copy-link]')?.addEventListener(
        'click',
        () => copy(url, 'Ligação copiada.')
    );

    const share = page.querySelector('[data-share-invite]');
    const native = window.Capacitor?.isPluginAvailable?.('MargotShare');

    if (share && !native && !navigator.share) {
        share.textContent = 'Copiar convite';

        page.querySelector('[data-nearby-help]').textContent =
            'Para quem está ao teu lado: mostra o QR. Também podes colar a ligação numa mensagem.';
    }

    share?.addEventListener('click', async () => {
        if (share.disabled) return;

        share.disabled = true;
        tell('');

        try {
            if (native) {
                const plugin = window.Capacitor.registerPlugin('MargotShare');

                const result = await plugin.share({ url });

                if (!result.cancelled) {
                    tell(
                        'Convite pronto. A nova conta fica associada quando usar este código.'
                    );
                }
            } else if (navigator.share) {
                await navigator.share({
                    title: window.MargotI18n?.t('Um olá leva a outro · Margot') ?? 'Um olá leva a outro · Margot',
                    url
                });

                tell(
                    'Convite pronto. A nova conta fica associada quando usar este código.'
                );
            } else {
                await copy(
                    url,
                    'Ligação copiada. Cola-a numa mensagem.'
                );
            }
        } catch (error) {
            if (error?.name !== 'AbortError') {
                tell(
                    'Não foi possível abrir a partilha. Podes copiar a ligação ou mostrar o QR.',
                    true
                );
            }
        } finally {
            share.disabled = false;
        }
    });
})();