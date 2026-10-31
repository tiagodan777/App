(function () {
    'use strict';

    // O servidor guarda as rondas e capturas; o cliente apresenta-as.
    function create(options) {
        const member = String(options.memberId || '').toLowerCase();
        const endpoint = new URL(options.endpoint, document.baseURI);
        endpoint.searchParams.set('protocol', '2');

        if (
            !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(member) ||
            endpoint.origin !== window.location.origin
        ) return null;

        let state = null;
        let active = false;
        let disposed = false;
        let stopped = false;
        let busy = false;
        let synced = false;
        let available = false;
        let receivedAt = 0;
        let readyAt = 0;
        let syncAt = 0;
        let retryAt = 0;
        let failures = 0;
        let timer = 0;
        let requestController = null;
        let requestAction = null;
        let epoch = 0;

        const offered = new Set();
        const pending = new Set();
        const captures = [];
        const kinds = ['pumpkin', 'bat'];
        const clock = () => performance.now();

        const copy = value =>
            value === null ? null : JSON.parse(JSON.stringify(value));

        const serverNow = () =>
            state ? state.server_now_ms + clock() - receivedAt : 0;

        const enabled = () =>
            active && !disposed && !stopped && options.isEligible();

        const key = actor =>
            actor.campaignId + ':' + actor.roundId + ':' +
            (actor.objectId || actor.kind);

        function validState(value) {
            if (
                !value ||
                !['active', 'scheduled', 'ended', 'off'].includes(value.phase) ||
                !['pilot', 'public', 'off'].includes(value.mode) ||
                !(
                    value.campaign_id === null ||
                    typeof value.campaign_id === 'string'
                ) ||
                !Number.isFinite(value.server_now_ms) ||
                !Number.isInteger(value.interval_seconds) ||
                value.interval_seconds < (value.mode === 'pilot' ? 20 : 30) ||
                !kinds.every(kind =>
                    Number.isInteger(value.counts?.[kind]) &&
                    value.counts[kind] >= 0 &&
                    value.counts[kind] <= 10
                ) ||
                !['starts_at_ms', 'ends_at_ms', 'next_round_at_ms'].every(name =>
                    value[name] === null || Number.isFinite(value[name])
                )
            ) return false;

            if (value.round === null) return true;

            return value.phase === 'active' &&
                /^[a-f0-9]{32}$/.test(value.round?.id || '') &&
                Number.isFinite(value.round.started_at_ms) &&
                Array.isArray(value.round.objects) &&
                value.round.objects.length <= (value.protocol === 2 ? 4 : 2) &&
                new Set(
                    value.round.objects.map(object =>
                        value.protocol === 2 ? object.id : object.kind
                    )
                ).size === value.round.objects.length &&
                value.round.objects.every(object =>
                    kinds.includes(object.kind) &&
                    (
                        value.protocol !== 2 ||
                        (
                            /^[a-f0-9]{32}$/.test(object.id) &&
                            Number.isInteger(object.difficulty) &&
                            object.difficulty >= 0 &&
                            object.difficulty <= 3
                        )
                    ) &&
                    typeof object.captured === 'boolean' &&
                    Number.isFinite(object.opens_at_ms) &&
                    Number.isFinite(object.expires_at_ms)
                );
        }

        let winnerNotice = null;
        let winnerCampaign = null;

        function showWinner(value) {
            if (!value?.winner) {
                winnerNotice?.remove();
                winnerNotice = null;
                winnerCampaign = null;
                return;
            }

            if (winnerCampaign === value.campaign_id) return;

            winnerNotice?.remove();
            winnerCampaign = value.campaign_id;

            winnerNotice = document.createElement('div');
            winnerNotice.setAttribute('role', 'status');

            winnerNotice.style.cssText =
                'position:fixed;z-index:100001;' +
                'top:calc(env(safe-area-inset-top,0px) + 60px);' +
                'left:5%;width:90%;box-sizing:border-box;' +
                'padding:18px;border-radius:22px;' +
                'background:#241c30f5;color:white;' +
                'font:600 15px/1.4 system-ui;' +
                'box-shadow:0 8px 30px #0005';

            const message = document.createElement('span');

            message.textContent = value.winner.is_you
            ? 'Ganhaste! Foste a primeira pessoa a apanhar 10 abóboras e 10 morcegos. Vamos contactar-te para entregar o prémio.'
            : 'Alguém foi mais rápido que tu! O desafio terminou. Obrigado por participares.';

            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = 'Fechar';

            close.style.cssText =
                'display:block;margin-top:12px;padding:10px 16px;' +
                'border:0;border-radius:14px;background:#fff;' +
                'color:#241c30;font:inherit';

            close.onclick = () => {
                winnerNotice?.remove();
                winnerNotice = null;
            };

            winnerNotice.append(message, close);
            document.body.append(winnerNotice);
        }

        let waveNotice = null;
        function clearWaveNotice() {
            waveNotice?.remove();
            waveNotice = null;
        }
        function showWaveNotice() {
            const notice = state?.wave_notice;
            const left = notice ? Math.ceil((notice.wave_at_ms - serverNow()) / 1000) : 0;
            if (!enabled() || !available || state?.winner || !Number.isFinite(left) || left <= 0 || left > 60) {
                clearWaveNotice();
                return;
            }
            if (!waveNotice) {
                waveNotice = document.createElement('div');
                waveNotice.setAttribute('role', 'status');
                waveNotice.style.cssText = 'position:fixed;z-index:100000;pointer-events:none;top:calc(env(safe-area-inset-top,0px) + 65px);left:8%;width:84%;box-sizing:border-box;padding:14px 18px;border-radius:22px;background:#241c30ed;color:#fff;text-align:center;font:600 15px/1.4 system-ui;box-shadow:0 8px 25px #0004';
                document.body.append(waveNotice);
            }
            const label = left <= 3 ? String(left) + '… 🎃🦇'
                : 'Uma vaga está quase a chegar 🎃🦇 · ' + left + ' s';
            if (waveNotice.textContent !== label) waveNotice.textContent = label;
        }

        function stop() {
            clearWaveNotice();
            winnerNotice?.remove();
            winnerNotice = null;
            stopped = true;
            synced = false;
            available = false;
            state = null;
            captures.length = 0;
            pending.clear();
            clearTimeout(timer);
            options.onState(null);
        }

        function accept(data) {
            if (!data?.member_id) return false;

            if (String(data.member_id).toLowerCase() !== member) {
                stop();
                return false;
            }

            if (!validState(data.state)) return false;

            if (
                state?.campaign_id !== data.state.campaign_id ||
                state?.round?.id !== data.state.round?.id
            ) {
                offered.clear();
            }

            state = copy(data.state);
            receivedAt = clock();
            synced = true;
            available = true;
            failures = 0;
            retryAt = 0;
            syncAt = receivedAt + (
                state.protocol === 2 ? 10000 : 30000
            );

            options.onState(copy(state));
            showWinner(state);

            return true;
        }

        function inEvent() {
            const now = serverNow();

            return state?.phase === 'active' &&
                (state.starts_at_ms === null || now >= state.starts_at_ms) &&
                (state.ends_at_ms === null || now < state.ends_at_ms);
        }

        function canShow(actor) {
            if (
                !enabled() ||
                !synced ||
                !available ||
                !inEvent() ||
                actor.campaignId !== state.campaign_id ||
                actor.roundId !== state.round?.id ||
                pending.has(key(actor))
            ) return false;

            const object = state.round.objects.find(item =>
                item.kind === actor.kind &&
                (
                    state.protocol !== 2 ||
                    item.id === actor.objectId
                )
            );

            const now = serverNow();

            return !!object &&
                !object.captured &&
                state.counts[actor.kind] < 10 &&
                now >= object.opens_at_ms &&
                now < object.expires_at_ms;
        }

        async function fetchState(
            action,
            body,
            requestEpoch,
            csrfRetried = false
        ) {
            const url = new URL(endpoint.href);
            const headers = { Accept: 'application/json' };

            const init = {
                method: action === 'state' ? 'GET' : 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                redirect: 'error',
                headers
            };

            if (action === 'state') {
                url.searchParams.set('action', 'state');
            } else {
                const token = document.querySelector(
                    'meta[name="csrf-token"]'
                )?.content || '';

                if (!/^[a-f0-9]{64}$/.test(token)) {
                    throw new Error('Sessão indisponível.');
                }

                headers['Content-Type'] = 'application/json';
                headers['X-CSRF-Token'] = token;
                init.body = JSON.stringify({ ...body, action });
            }

            requestController = new AbortController();
            init.signal = requestController.signal;

            const thisController = requestController;
            const timeout = setTimeout(
                () => thisController.abort(),
                8000
            );

            let response;
            let data;

            try {
                response = await window.fetch(url.href, init);
                data = await response.json();
            } finally {
                clearTimeout(timeout);

                if (requestController === thisController) {
                    requestController = null;
                }
            }

            if (disposed) return null;

            if (
                response.status === 401 ||
                (
                    data?.member_id &&
                    String(data.member_id).toLowerCase() !== member
                )
            ) {
                stop();
                return null;
            }

            if (requestEpoch !== epoch) {
                return { response, data };
            }

            if (
                response.status === 403 &&
                data.code === 'csrf_expired' &&
                !csrfRetried &&
                String(data.member_id || '').toLowerCase() === member &&
                window.MargotCsrf?.updateToken(data.csrf_token) === true
            ) {
                return fetchState(
                    action,
                    body,
                    requestEpoch,
                    true
                );
            }

            return { response, data };
        }

        function unavailable() {
            available = false;
            failures++;

            retryAt = clock() + Math.min(
                30000,
                2000 * (2 ** Math.min(failures - 1, 4))
            );

            syncAt = retryAt;
            options.onState(null);
        }

        async function begin(
            action,
            body,
            captureJob = null
        ) {
            busy = true;
            requestAction = action;

            const requestEpoch = epoch;

            const before = state
                ? { ...state.counts }
                : { pumpkin: 0, bat: 0 };

            let confirmed = false;
            let retryCapture = false;

            try {
                const result = await fetchState(
                    action,
                    body,
                    requestEpoch
                );

                if (disposed || stopped || !result) return;

                if (requestEpoch !== epoch) {
                    confirmed = !!captureJob &&
                        result.response.ok &&
                        result.data.success === true &&
                        result.data.member_id === member;

                    syncAt = 0;
                    return;
                }

                const accepted = accept(result.data);

                if (
                    result.response.ok &&
                    result.data.success === true &&
                    accepted
                ) {
                    if (
                        captureJob &&
                        state.campaign_id === captureJob.actor.campaignId
                    ) {
                        confirmed = true;
                        const kind = captureJob.actor.kind;

                        const completed =
                            before[kind] < 10 &&
                            state.counts[kind] === 10;

                        const milestone = completed
                            ? (
                                state.counts.pumpkin === 10 &&
                                state.counts.bat === 10
                                    ? 2
                                    : 1
                            )
                            : 0;

                        options.onCapture(kind, milestone);
                    }
                } else if (
                    result.response.status >= 500 ||
                    !accepted
                ) {
                    unavailable();

                    retryCapture =
                        !!captureJob &&
                        captureJob.attempts < 2;
                } else {
                    retryAt = clock() + 1000;
                }
            } catch (_) {
                if (!disposed && !stopped) {
                    if (
                        requestEpoch === epoch ||
                        captureJob
                    ) {
                        unavailable();
                    }

                    retryCapture =
                        !!captureJob &&
                        captureJob.attempts < 2;
                }
            } finally {
                busy = false;
                requestAction = null;

                if (captureJob) {
                    if (
                        retryCapture &&
                        !disposed &&
                        !stopped
                    ) {
                        captures.unshift(captureJob);
                    } else {
                        pending.delete(
                            key(captureJob.actor)
                        );

                        if (
                            !confirmed &&
                            !disposed &&
                            !stopped
                        ) {
                            options.onFailure();
                        }
                    }
                }

                if (!disposed && !stopped) {
                    tick();
                }
            }
        }

        function offerObjects() {
            if (
                !synced ||
                !available ||
                !inEvent() ||
                !state.round
            ) return;

            for (const object of state.round.objects) {
                const actor = {
                    campaignId: state.campaign_id,
                    roundId: state.round.id,
                    kind: object.kind,
                    objectId: object.id,
                    difficulty: object.difficulty,
                    expiresAt: object.expires_at_ms,
                    remainingMs:
                        object.expires_at_ms - serverNow()
                };

                if (
                    !offered.has(key(actor)) &&
                    canShow(actor) &&
                    options.onObject(actor)
                ) {
                    offered.add(key(actor));
                }
            }
        }

        function tick() {
            clearTimeout(timer);
            timer = 0;

            if (disposed || stopped) return;

            showWaveNotice();
            const visible = enabled();
            const now = clock();

            if (visible) {
                offerObjects();
            }

            if (!busy && now >= retryAt) {
                if (captures.length) {
                    const job = captures.shift();

                    if (
                        job.actor.campaignId !== state?.campaign_id
                    ) {
                        pending.delete(key(job.actor));
                        options.onFailure();
                    } else {
                        job.attempts++;

                        void begin('capture', {
                            campaign_id: job.actor.campaignId,
                            round_id: job.actor.roundId,
                            kind: job.actor.kind,
                            object_id: job.actor.objectId
                        }, job);
                    }
                } else if (
                    visible &&
                    now >= syncAt
                ) {
                    void begin('state');
                } else if (
                    visible &&
                    synced &&
                    available &&
                    inEvent() &&
                    state.counts.pumpkin + state.counts.bat < 20 &&
                    now >= readyAt &&
                    state.next_round_at_ms !== null &&
                    serverNow() >= state.next_round_at_ms
                ) {
                    void begin('round', {
                        campaign_id: state.campaign_id
                    });
                }
            }

            if (!visible && !captures.length) return;

            const events = [now + (state?.wave_notice && visible ? 200 : 30000)];

            if (retryAt > now) {
                events.push(retryAt);
            }

            if (visible) {
                if (syncAt > now) {
                    events.push(syncAt);
                }

                if (readyAt > now) {
                    events.push(readyAt);
                }

                if (state && synced && available) {
                    const server = serverNow();

                    for (const at of [
                        state.starts_at_ms,
                        state.ends_at_ms,
                        state.next_round_at_ms,
                        ...(state.round?.objects || []).flatMap(
                            object => [
                                object.opens_at_ms,
                                object.expires_at_ms
                            ]
                        )
                    ]) {
                        if (
                            at !== null &&
                            at > server
                        ) {
                            events.push(
                                now + at - server
                            );
                        }
                    }

                    if (
                        (
                            state.phase === 'scheduled' &&
                            state.starts_at_ms <= server
                        ) ||
                        (
                            state.phase === 'active' &&
                            state.ends_at_ms !== null &&
                            state.ends_at_ms <= server
                        )
                    ) {
                        syncAt = Math.min(syncAt, now);
                        events.push(now + 100);
                    }
                }
            }

            timer = setTimeout(
                tick,
                Math.max(
                    100,
                    Math.min(...events) - now
                )
            );
        }

        return {
            setActive(value) {
                value = !!value;

                if (
                    disposed ||
                    stopped ||
                    value === active
                ) return;

                active = value;
                epoch++;

                if (
                    !value &&
                    requestAction !== 'capture'
                ) {
                    requestController?.abort();
                }

                if (value) {
                    synced = false;
                    available = false;
                    readyAt = clock() + 4000;
                    syncAt = 0;
                    retryAt = 0;
                }

                tick();
            },

            capture(actor) {
                if (!canShow(actor)) return false;

                pending.add(key(actor));

                captures.push({
                    actor: { ...actor },
                    attempts: 0
                });

                tick();
                return true;
            },

            canShow,

            getState: () => ({
                available,
                state: copy(state)
            }),

            destroy() {
                disposed = true;
                clearWaveNotice();

                winnerNotice?.remove();
                winnerNotice = null;

                clearTimeout(timer);
                requestController?.abort();

                captures.length = 0;
                pending.clear();
                offered.clear();
            }
        };
    }

    window.MargotHalloweenHunt = Object.freeze({ create });
})();