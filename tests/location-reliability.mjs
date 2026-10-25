import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the actual browser coordinators. HTTP, native bridges and time stay entirely local.
const source = name => readFileSync(new URL(`../public/js/${name}.js`, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
const flush = async () => { for (let index = 0; index < 100; index++) await Promise.resolve(); };

function events() {
    const listeners = new Map();
    return {
        addEventListener(type, callback, options = {}) {
            const entries = listeners.get(type) || [];
            entries.push({callback, once: options.once}); listeners.set(type, entries);
        },
        removeEventListener(type, callback) {
            listeners.set(type, (listeners.get(type) || []).filter(entry => entry.callback !== callback));
        },
        dispatchEvent(event) {
            for (const entry of [...(listeners.get(event.type) || [])]) {
                if (entry.once) this.removeEventListener(event.type, entry.callback);
                entry.callback(event);
            }
            return true;
        }
    };
}

function harness({member = 'member-a', storage = new Map(), serverState,
    onboarding = true, nativeOwner = member, platform = 'android', legacyNative = false,
    policyVersion = 'native-battery-2'} = {}) {
    let now = 1_800_000_000_000, nextTimer = 1;
    const timers = new Map(), calls = [], nativeEvents = new Map(), pushEvents = new Map();
    const window = events(), document = events();
    const reply = (body, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => clone(body)});
    const state = {active: true, visible: true, revision: 7, ...serverState};
    const native = {
        active: false, visible: true, token_stored: false, member_id: nativeOwner,
        policy_version: 'native-battery-2', permission: 'precise', authorization: platform === 'ios' ? 'always' : 'granted',
        background_enabled: false, collection_suspended: false
    };
    native.policy_version = policyVersion;
    const nativeStatus = () => {
        const result = clone(native);
        if (legacyNative) {
            delete result.member_id;
            delete result.collection_suspended;
        }
        return result;
    };
    const hooks = {fetch: null, locationPermission: null, pushPermission: null, pushRegister: null};
    const setTimer = (callback, ms, interval = 0) => {
        const id = nextTimer++; timers.set(id, {at: now + ms, callback, interval}); return id;
    };
    class FakeDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    class CustomEvent {
        constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
    Object.assign(document, {
        readyState: 'loading', visibilityState: 'visible', hidden: false,
        documentElement: {setAttribute() {}},
        querySelector(selector) {
            const content = selector.includes('margot-member-id') ? member : selector.includes('csrf-token') ? 'test-csrf' : null;
            return content === null ? null : {content, getAttribute: () => content};
        }
    });
    Object.assign(window, {
        document, membroId: member, Date: FakeDate, CustomEvent,
        localStorage: {
            getItem: key => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key)
        },
        location: {origin: 'https://margot.test', pathname: '/', search: '', assign: url => calls.push({kind: 'navigate', url})},
        crypto: {randomUUID: () => '12345678-1234-4234-9234-123456789abc'},
        setTimeout: (callback, ms = 0) => setTimer(callback, ms),
        clearTimeout: id => timers.delete(id),
        setInterval: (callback, ms) => setTimer(callback, ms, ms),
        clearInterval: id => timers.delete(id)
    });
    if (onboarding) window.MargotLocationOnboarding = {close() {}, open() {}, authorizationChanged() {}};
    const plugin = {
        status: async () => nativeStatus(),
        async start(options) {
            calls.push({kind: 'native-start', ...clone(options)});
            Object.assign(native, {active: options.visible, visible: options.visible,
                member_id: options.memberId, token_stored: true, collection_suspended: false});
            return nativeStatus();
        },
        async stop() {
            calls.push({kind: 'native-stop'});
            Object.assign(native, {active: false, token_stored: false, member_id: ''});
            return nativeStatus();
        },
        async setVisibility({visible}) {
            calls.push({kind: 'native-visibility', visible});
            Object.assign(native, {visible, active: visible && !native.collection_suspended});
            return nativeStatus();
        },
        async configure(options) { calls.push({kind: 'configure', ...clone(options)}); return clone(native); },
        async addListener(type, callback) { nativeEvents.set(type, callback); return {remove() {}}; },
        async openSettings() { return {opened: true}; }
    };
    if (!policyVersion) delete plugin.configure;
    const geo = {
        checkPermissions() { return hooks.locationPermission ? hooks.locationPermission() : Promise.resolve({location: 'granted'}); },
        requestPermissions: async () => ({location: 'granted'})
    };
    const push = {
        async addListener(type, callback) { pushEvents.set(type, callback); return {remove() {}}; },
        checkPermissions() { return hooks.pushPermission ? hooks.pushPermission() : Promise.resolve({receive: 'granted'}); },
        requestPermissions: async () => ({receive: 'granted'}),
        async register() { calls.push({kind: 'push-register'}); if (hooks.pushRegister) return hooks.pushRegister(); },
        async unregister() { calls.push({kind: 'push-unregister'}); },
        async removeAllDeliveredNotifications() {}
    };
    window.Capacitor = {
        getPlatform: () => platform, isNativePlatform: () => true,
        isPluginAvailable: () => true,
        Plugins: {BackgroundLocation: plugin, Geolocation: geo, PushNotifications: push}
    };
    async function defaultFetch(url, options = {}) {
        const body = options.body ? JSON.parse(options.body) : null;
        if (url === '/location-state/') {
            assert.equal(body.member_id, window.membroId, 'state mutation/read must be tied to authenticated member');
            if (body.action === 'set') {
                if (body.expected_revision !== state.revision) {
                    return reply({success: false, reason: 'state_conflict', member_id: window.membroId, state}, 409);
                }
                Object.assign(state, {active: body.active, visible: body.visible, revision: state.revision + 1});
            }
            return reply({success: true, member_id: window.membroId, state});
        }
        if (url === '/background-location-token/') {
            return reply({success: true, member_id: window.membroId, token: 'a'.repeat(64)});
        }
        if (url === '/location-policy.json') return reply({moving_send_seconds: 60, stationary_send_seconds: 180,
            minimum_send_seconds: 5, movement_metres: 20, stationary_after_seconds: 120, android_request_seconds: 30});
        if (url === '/push-device/') return reply({success: true});
        throw new Error(`Unexpected mocked HTTP request: ${url}`);
    }
    window.fetch = async (url, options = {}) => {
        calls.push({kind: 'http', url, body: options.body ? JSON.parse(options.body) : null});
        if (hooks.fetch) return hooks.fetch(url, options, defaultFetch);
        return defaultFetch(url, options);
    };
    const context = vm.createContext({window, document, navigator: {onLine: true, language: 'pt-PT', userAgent: 'Android'},
        console: {warn() {}, error() {}, log() {}}, fetch: window.fetch, CustomEvent, Date: FakeDate,
        AbortController, URL, Uint8Array, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout});
    const load = name => vm.runInContext(source(name), context, {filename: `${name}.js`});
    async function advance(ms) {
        const target = now + ms;
        for (;;) {
            const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            const [id, timer] = due; now = timer.at;
            if (timer.interval) timer.at += timer.interval; else timers.delete(id);
            timer.callback(); await flush();
        }
        now = target; await flush();
    }
    async function prepare({background = true, privacy = true} = {}) {
        load('preferencias');
        if (privacy) { load('location-privacy'); await window.MargotLocationState.ready; }
        if (background) load('background-location');
        await flush();
    }
    return {window, document, calls, state, native, hooks, storage, load, advance, prepare, reply, pushEvents,
        stateWrites: () => calls.filter(call => call.url === '/location-state/' && call.body.action === 'set')};
}

const cases = [];
const test = (name, run) => cases.push({name, run});

test('delayed hide followed by show uses the acknowledged revision and preserves latest choice', async () => {
    const h = harness(); await h.prepare({background: false});
    const first = deferred(); let held = false;
    h.hooks.fetch = (url, options, normal) => {
        if (url === '/location-state/' && JSON.parse(options.body).action === 'set' && !held) {
            held = true; return first.promise;
        }
        return normal(url, options);
    };
    h.window.MargotPreferencias.definir('invisivel', true);
    await flush();
    h.window.MargotPreferencias.definir('invisivel', false);
    Object.assign(h.state, {active: true, visible: false, revision: 8});
    first.resolve(h.reply({success: true, member_id: 'member-a', state: h.state}));
    await flush(); await h.window.MargotLocationState.sync();
    assert.deepEqual(h.stateWrites().map(call => [call.body.expected_revision, call.body.visible]), [[7, false], [8, true]]);
    assert.equal(h.window.MargotPreferencias.obter('invisivel'), false);
    assert.equal(h.window.MargotLocationState.current().visible, true);
});

test('409 from another device adopts its newer state without reasserting an old local hide', async () => {
    const h = harness(); await h.prepare({background: false});
    h.hooks.fetch = (url, options, normal) => {
        if (url === '/location-state/' && JSON.parse(options.body).action === 'set') {
            Object.assign(h.state, {active: false, visible: false, revision: 9});
            return h.reply({success: false, reason: 'state_conflict', member_id: 'member-a', state: h.state}, 409);
        }
        return normal(url, options);
    };
    h.window.MargotPreferencias.definir('invisivel', true);
    await flush(); await h.window.MargotLocationState.sync();
    assert.equal(h.stateWrites().length, 1);
    assert.equal(h.window.MargotPreferencias.obter('localizacao'), false);
    assert.equal(h.window.MargotLocationState.current().revision, 9);
});

test('server revision wins over stale local preferences; revision zero alone migrates a choice', async () => {
    for (const revision of [7, 0]) {
        const storage = new Map([['margot-preferencias-v2:member-a', JSON.stringify({localizacao: false, invisivel: true})]]);
        const h = harness({storage, serverState: {revision}}); await h.prepare({background: false});
        assert.equal(h.window.MargotPreferencias.obter('localizacao'), revision > 0);
        if (revision > 0) assert.equal(h.window.MargotPreferencias.obter('invisivel'), false);
        assert.equal(h.stateWrites().length, revision === 0 ? 1 : 0);
        if (revision === 0) assert.equal(h.stateWrites()[0].body.active, false);
    }
});

test('legacy preferences migrate once and cannot leak from account A into account B', async () => {
    const legacy = JSON.stringify({localizacao: false, notificacoes: false, invisivel: true});
    const storage = new Map([['margot-preferencias-v1', legacy]]);
    const anonymous = harness({member: '', storage}); anonymous.load('preferencias');
    assert.equal(storage.get('margot-preferencias-v1'), legacy);
    assert.equal(anonymous.window.MargotPreferencias.definir('localizacao', true), false);
    const a = harness({storage}); a.load('preferencias');
    assert.equal(a.window.MargotPreferencias.obter('localizacao'), false);
    assert.equal(storage.has('margot-preferencias-v1'), false);
    const b = harness({member: 'member-b', storage}); b.load('preferencias');
    assert.equal(b.window.MargotPreferencias.obter('localizacao'), null);
    assert.equal(b.window.MargotPreferencias.obter('invisivel'), false);
    b.window.MargotPreferencias.definir('localizacao', true);
    assert.equal(a.window.MargotPreferencias.obter('localizacao'), false);
    assert.equal(JSON.parse(storage.get('margot-preferencias-v2:member-b')).localizacao, true);
});

test('offline hide and off stop the actual native coordinator before HTTP settles', async () => {
    for (const [preference, value] of [['invisivel', true], ['localizacao', false]]) {
        const h = harness(); await h.prepare(); await h.window.MargotBackgroundLocation.start();
        const oldStarts = h.calls.filter(call => call.kind === 'native-start').length;
        const oldStops = h.calls.filter(call => call.kind === 'native-stop').length;
        h.hooks.fetch = () => Promise.reject(new Error('offline'));
        h.window.MargotPreferencias.definir(preference, value);
        assert.ok(h.calls.filter(call => call.kind === 'native-stop').length > oldStops, `${preference}: stop must be synchronous`);
        await flush();
        assert.equal(h.native.active, false);
        assert.equal(h.calls.filter(call => call.kind === 'native-start').length, oldStarts);
    }
});

test('a native credential owned by another member is stopped before current owner starts', async () => {
    const h = harness({nativeOwner: 'member-b'}); await h.prepare();
    h.native.active = true; h.native.token_stored = true;
    await h.window.MargotBackgroundLocation.start();
    const stop = h.calls.findIndex(call => call.kind === 'native-stop');
    const start = h.calls.findIndex(call => call.kind === 'native-start');
    assert.ok(stop >= 0 && start > stop);
    assert.equal(h.calls[start].memberId, 'member-a');
    assert.equal(h.native.member_id, 'member-a');
});

test('suspended policy-v2 native tracking revalidates the grant and keeps cache capability', async () => {
    const h = harness(); await h.prepare(); await h.window.MargotBackgroundLocation.start();
    const tokensBefore = h.calls.filter(call => call.url === '/background-location-token/').length;
    Object.assign(h.native, {active: false, collection_suspended: true});
    await h.window.MargotBackgroundLocation.start(); await flush();
    assert.equal(h.calls.filter(call => call.url === '/background-location-token/').length, tokensBefore + 1);
    assert.equal(h.native.collection_suspended, false);
    assert.equal(h.native.active, true);
    assert.equal(h.window.MargotNativeLocationCacheAvailable, true);
    assert.equal(h.calls.filter(call => call.kind === 'configure').length, 1);
});

for (const platform of ['ios', 'android']) {
    for (const policyVersion of [null, 'native-battery-1']) {
        test(`new web state works with ${platform} old native ${policyVersion || 'without capabilities'}`, async () => {
            const h = harness({platform, legacyNative: true, policyVersion});
            await h.prepare();
            await h.window.MargotBackgroundLocation.start(); await flush();
            assert.equal(h.native.active, true, 'old native starts with the existing method');
            assert.equal(h.storage.get('margot-native-location-owner-v1'), 'member-a');
            assert.equal(h.window.MargotNativeLocationCacheAvailable, policyVersion !== null);
            assert.equal(h.calls.filter(call => call.kind === 'configure').length, policyVersion ? 1 : 0);
            const grants = h.calls.filter(call => call.url === '/background-location-token/').length;
            await h.window.MargotBackgroundLocation.start(); await flush();
            assert.equal(h.calls.filter(call => call.url === '/background-location-token/').length, grants,
                'missing native member_id does not cause repeated credential rotation');
            h.window.MargotPreferencias.definir('invisivel', true); await flush();
            await h.window.MargotBackgroundLocation.start(); await flush();
            assert.equal(h.state.visible, false, 'server hides the member');
            assert.equal(h.state.active, true, 'hidden observer can still collect');
            assert.equal(h.native.active, true, 'old bridge can resume after server confirms hidden state');
            h.window.MargotPreferencias.definir('localizacao', false); await flush();
            assert.equal(h.native.active, false, 'explicit off stops old native');
            assert.equal(h.state.active, false, 'explicit off reaches the new server');
        });
    }
}

test('hanging native location permission times out and a subsequent attempt can recover', async () => {
    const h = harness(); await h.prepare();
    let attempt = 0;
    h.hooks.locationPermission = () => ++attempt === 1 ? new Promise(() => {}) : Promise.resolve({location: 'granted'});
    const first = h.window.MargotBackgroundLocation.start();
    await flush(); await h.advance(10_001);
    const failed = await first;
    assert.equal(failed.active, false); assert.match(failed.error, /demorou/);
    const recovered = await h.window.MargotBackgroundLocation.start();
    assert.equal(recovered.active, true);
    assert.equal(h.calls.filter(call => call.kind === 'native-start').length, 1);
});

test('legacy Android permission preparation also releases a hanging bridge call', async () => {
    const h = harness({onboarding: false}); await h.prepare();
    let attempt = 0, settled = false;
    h.hooks.locationPermission = () => ++attempt === 1 ? new Promise(() => {}) : Promise.resolve({location: 'granted'});
    const first = h.window.MargotBackgroundLocation.start().then(value => { settled = true; return value; });
    await flush(); await h.advance(15_001);
    assert.equal(settled, true, 'legacy permission preparation must have a deadline too');
    await first;
    assert.equal((await h.window.MargotBackgroundLocation.start()).active, true);
});

test('logout cancels a location grant response that arrives after native stop', async () => {
    const h = harness(); await h.prepare();
    const token = deferred();
    h.hooks.fetch = (url, options, normal) => url === '/background-location-token/' ? token.promise : normal(url, options);
    const pending = h.window.MargotBackgroundLocation.start(); await flush();
    await h.window.MargotBackgroundLocation.stop();
    token.resolve(h.reply({success: true, member_id: 'member-a', token: 'b'.repeat(64)}));
    const result = await pending;
    assert.equal(result.cancelled, true);
    assert.equal(h.calls.filter(call => call.kind === 'native-start').length, 0);
});

test('a mismatched grant owner cannot start native tracking', async () => {
    const h = harness(); await h.prepare();
    h.hooks.fetch = (url, options, normal) => url === '/background-location-token/'
        ? h.reply({success: true, member_id: 'member-b', token: 'b'.repeat(64)}) : normal(url, options);
    const result = await h.window.MargotBackgroundLocation.start();
    assert.equal(result.active, false); assert.match(result.error, /outra conta/);
    assert.equal(h.calls.filter(call => call.kind === 'native-start').length, 0);
});

test('state responses without the authenticated member cannot authorize native collection', async () => {
    const h = harness();
    h.hooks.fetch = (url, options, normal) => url === '/location-state/'
        ? h.reply({success: true, member_id: 'member-b', state: h.state}) : normal(url, options);
    await h.prepare();
    const result = await h.window.MargotBackgroundLocation.start();
    assert.equal(result.active, false);
    assert.equal(result.reason, 'state_unconfirmed');
    assert.equal(h.calls.filter(call => call.kind === 'native-start').length, 0);
    assert.equal(h.calls.filter(call => call.url === '/background-location-token/').length, 0);
});

test('hanging push checkPermissions cannot lock registration permanently', async () => {
    const h = harness(); await h.prepare({background: false, privacy: false}); h.load('push-notifications');
    let attempt = 0;
    h.hooks.pushPermission = () => ++attempt === 1 ? new Promise(() => {}) : Promise.resolve({receive: 'granted'});
    const first = h.window.MargotPushNotifications.register(); await flush(); await h.advance(10_001);
    assert.equal(await first, false);
    assert.equal(await h.window.MargotPushNotifications.register(), true);
    assert.equal(h.calls.filter(call => call.kind === 'push-register').length, 1);
});

test('logout invalidates an in-flight push permission check before native register', async () => {
    const h = harness(); await h.prepare({background: false, privacy: false}); h.load('push-notifications');
    const permission = deferred(); h.hooks.pushPermission = () => permission.promise;
    const registration = h.window.MargotPushNotifications.register(); await flush();
    await h.window.MargotPushNotifications.unregister();
    permission.resolve({receive: 'granted'});
    assert.equal(await registration, false);
    assert.equal(h.calls.filter(call => call.kind === 'push-register').length, 0);
});

test('late OS registration after logout cannot resurrect a push token or server registration', async () => {
    const h = harness(); await h.prepare({background: false, privacy: false}); h.load('push-notifications');
    await h.window.MargotPushNotifications.register();
    await h.window.MargotPushNotifications.unregister();
    // The logout request has completed, but the old page can remain alive until navigation finishes.
    const registeredBefore = h.calls.filter(call => call.url === '/push-device/' && call.body.action === 'register').length;
    h.pushEvents.get('registration')({value: 'late-os-token'}); await flush();
    assert.equal(h.calls.filter(call => call.url === '/push-device/' && call.body.action === 'register').length, registeredBefore);
    assert.equal(h.storage.has('margot-push-token-v1'), false);
    // A new authorized attempt must still work after cancellation of the previous one.
    assert.equal(await h.window.MargotPushNotifications.register(), true);
    h.pushEvents.get('registration')({value: 'new-authorized-token'}); await flush();
    assert.equal(h.calls.filter(call => call.url === '/push-device/' && call.body.action === 'register').length, registeredBefore + 1);
    assert.equal(h.storage.get('margot-push-token-v1'), 'new-authorized-token');
});

let failures = 0;
for (const {name, run} of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`${cases.length - failures}/${cases.length} location/privacy/push integration regressions passed (offline VM).`);
if (failures) process.exitCode = 1;