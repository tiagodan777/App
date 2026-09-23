(() => {
    'use strict';

    if (window.__margotReminders) return;
    window.__margotReminders = true;

    const endpoint = (window.todayUrl || '/today/').replace(/today\/?$/, 'notification-preferences');
    let preferences,
        loading,
        syncedAt = 0;

    async function save(values = {}) {
        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                ...values
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error('Não foi possível guardar. Tenta novamente.');
        preferences = data.preferences;
        syncedAt = Date.now();
        return preferences;
    }

    function render() {
        if (!preferences) return;
        document.querySelectorAll('[data-reminder]').forEach((input) => {
            input.checked = preferences[input.dataset.reminder];
            input.disabled = false;
        });
    }

    async function sync() {
        if (loading) return loading;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        if (preferences?.timezone === timezone && Date.now() - syncedAt < 5 * 60 * 1000) return;
        loading = save()
            .then(render)
            .catch(() => {
                const message = document.querySelector('[data-reminder-error]');
                if (message)
                    message.textContent =
                        'Não foi possível carregar as preferências. Volta a abrir esta página.';
            })
            .finally(() => {
                loading = null;
            });
        return loading;
    }

    document.addEventListener('change', async (event) => {
        const input = event.target.closest('[data-reminder]');
        if (!input) return;
        input.disabled = true;
        const message = document.querySelector('[data-reminder-error]');
        if (message) message.textContent = '';
        try {
            await save({ [input.dataset.reminder]: input.checked });
        } catch (error) {
            if (message) message.textContent = error.message;
        } finally {
            input.disabled = false;
            render();
        }
    });

    function pageReady() {
        render();
        sync();
        if (new URLSearchParams(location.search).get('today') === '1') window.MargotToday?.openEditor();
    }

    document.addEventListener('margot:page-ready', pageReady);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) sync();
    });
    pageReady();
})();