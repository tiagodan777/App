import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(
    new URL('../public/js/halloween-waves-client.js', import.meta.url),
    'utf8'
);

const member = 'bcad0cb1-9cec-11f1-9863-42010a840002';
const other = '2eca97ae-a46c-11f1-9863-42010a840002';

let tests = 0;

function ok(value, label) {
    assert.ok(value, label);
    tests++;
}

const flush = async () => {
    for (let i = 0; i < 50; i++) {
        await Promise.resolve();
    }
};

function harness(withNotice = false) {
    let now = 0;
    let seq = 0;
    let issued = false;
    let online = true;
    let owner = member;
    let winner = null;

    const timers = new Map();
    const offers = [];
    const calls = [];
    const confirmed = [];
    const notices = [];

    const counts = {pumpkin: 0, bat: 0};
    const caught = new Set();

    const wave = {
        id: 'a'.repeat(32),
        started_at_ms: 20000,
        objects: ['pumpkin', 'pumpkin', 'bat'].map((kind, i) => ({
            id: String(i + 1).repeat(32),
            kind,
            difficulty: i,
            opens_at_ms: 20000,
            expires_at_ms: 29500,
            captured: false
        }))
    };

    const element = () => ({
        style: {},
        setAttribute() {},
        append() {},
        remove() {
            this.removed = true;
        }
    });

    const state = () => ({
        wave_notice: withNotice && now < 20000 ? {wave_at_ms: 20000} : null,
        protocol: 2,
        campaign_id: 'pilot-test',
        mode: 'pilot',
        phase: winner
            ? 'ended'
            : now >= 60000
                ? 'ended'
                : 'active',
        server_now_ms: now,
        starts_at_ms: 0,
        ends_at_ms: 60000,
        interval_seconds: 30,
        counts: {...counts},
        completed_at: null,
        winner,
        next_round_at_ms: now >= 29500 || winner
            ? null
            : issued
                ? null
                : Math.max(now, wave.started_at_ms),
        round: issued && now >= 20000 && now < 29500 && !winner
            ? {
                ...wave,
                objects: wave.objects.map(o => ({
                    ...o,
                    captured: caught.has(o.id)
                }))
            }
            : null
    });

    const window = {
        location: {origin: 'https://test.invalid'},

        fetch: async (url, init) => {
            ok(
                new URL(url).searchParams.get('protocol') === '2',
                'protocol version sent'
            );

            if (!online) throw Error('offline');

            const body = init.body ? JSON.parse(init.body) : null;
            const action = body?.action || 'state';

            calls.push({action, body, now});

            if (action === 'round' && now >= 20000 && now < 29500) {
                issued = true;
            }

            if (action === 'capture') {
                ok(
                    init.headers['X-CSRF-Token'] === 'b'.repeat(64),
                    'CSRF capture header'
                );

                ok(
                    wave.objects.some(o =>
                        o.id === body.object_id && o.kind === body.kind
                    ),
                    'object ID and kind transmitted'
                );

                if (!caught.has(body.object_id)) {
                    caught.add(body.object_id);
                    counts[body.kind]++;
                }
            }

            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    member_id: owner,
                    state: state()
                })
            };
        }
    };

    vm.runInNewContext(source, {
        window,
        document: {
            baseURI: 'https://test.invalid/',
            querySelector: () => ({content: 'b'.repeat(64)}),
            createElement: element,
            body: {
                append: n => notices.push(n)
            }
        },
        URL,
        AbortController,
        performance: {
            now: () => now
        },
        setTimeout: (fn, ms) => {
            timers.set(++seq, {fn, at: now + ms});
            return seq;
        },
        clearTimeout: id => timers.delete(id)
    });

    const client = window.MargotHalloweenHunt.create({
        memberId: member,
        endpoint: '/halloween-hunt/',
        isEligible: () => true,
        onState() {},
        onObject: o => {
            offers.push(o);
            return true;
        },
        onCapture: kind => confirmed.push(kind),
        onFailure() {}
    });

    const advance = async ms => {
        const until = now + ms;
        let guard = 0;

        for (;;) {
            await flush();

            const next = [...timers].sort(
                (a, b) => a[1].at - b[1].at
            )[0];

            if (!next || next[1].at > until) break;

            ok(guard++ < 500, 'no tight timer loop');
            now = next[1].at;
            timers.delete(next[0]);
            next[1].fn();
        }

        now = until;
        await flush();
    };

    return {
        client,
        advance,
        offers,
        calls,
        confirmed,
        notices,
        counts,
        timers,
        online: v => online = v,
        owner: v => owner = v,
        winner: v => winner = v
    };
}

{
    const h = harness();

    h.client.setActive(true);
    await h.advance(19999);
    ok(h.offers.length === 0, 'no early display');

    await h.advance(1);
    ok(h.offers.length === 3, 'trio offered without restart');

    ok(
        new Set(h.offers.map(o => o.objectId)).size === 3,
        'same-kind unique identities'
    );

    ok(h.client.capture(h.offers[0]), 'first accepted');
    ok(!h.client.capture(h.offers[0]), 'double click suppressed');

    await flush();

    ok(h.client.capture(h.offers[1]), 'second pumpkin independent');
    await flush();

    ok(h.client.capture(h.offers[2]), 'bat independent');
    await flush();

    ok(
        h.counts.pumpkin === 2 && h.counts.bat === 1,
        'counts confirmed'
    );

    ok(h.confirmed.length === 3, 'three celebrations');

    h.winner({is_you: false, completed_at: 'test'});
    await h.advance(10000);

    ok(h.notices.length === 1, 'winner shown');
    ok(!h.client.canShow(h.offers[2]), 'winner stops actors');

    h.client.destroy();

    ok(h.timers.size === 0, 'destroy clears timers');
    ok(h.notices[0].removed, 'destroy clears notice');
}

{
    const h = harness();

    h.client.setActive(true);
    await h.advance(1000);

    h.online(false);
    await h.advance(30000);

    ok(h.offers.length === 0, 'offline has no invented actors');

    h.online(true);
    await h.advance(15000);

    ok(h.offers.length === 0, 'expired wave not replayed');

    h.client.destroy();
}

{
    const h = harness();

    h.client.setActive(true);
    await h.advance(20000);

    h.owner(other);
    await h.advance(10000);

    ok(
        h.client.getState().state === null,
        'account mismatch stops'
    );

    h.client.destroy();
}


{
    const h = harness(true);
    h.client.setActive(true);
    await flush();
    await h.advance(1000);
    ok(h.notices.length === 1, 'upcoming wave banner shown');
    ok(h.notices[0].textContent.includes('19 s'), 'banner uses server countdown');
    await h.advance(16000);
    ok(h.notices[0].textContent.includes('3…'), 'three second countdown');
    await h.advance(3000);
    ok(h.notices[0].removed, 'countdown removed at wave start');
    h.client.destroy();
}

console.log(
    `PASS ${tests} wave-client assertions (mock clock/network/DOM).`
);
