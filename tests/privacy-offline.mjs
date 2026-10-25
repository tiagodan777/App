import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const preferencesSource = readFileSync(new URL('../public/js/preferencias.js', import.meta.url), 'utf8');
const privacySource = readFileSync(new URL('../public/js/location-privacy.js', import.meta.url), 'utf8');
const foregroundSource = readFileSync(new URL('../public/js/websocket-location.js', import.meta.url), 'utf8');

class PersistentStorage {
    values = new Map();
    getItem(key) { return this.values.get(String(key)) ?? null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
}

function server(initial) {
    return {
        state: new Map(Object.entries(initial)),
        offline: false,
        requests: [],
        async fetch(_url, options) {
            const body = JSON.parse(options.body);
            this.requests.push({...body, offline: this.offline});
            if (this.offline) throw new Error('offline');
            const current = this.state.get(body.member_id);
            assert.ok(current, 'The request must belong to the authenticated test member');
            const conflict = body.action === 'set' && body.expected_revision !== current.revision;
            if (body.action === 'set' && !conflict) {
                this.state.set(body.member_id, {
                    active: body.active, visible: body.active && body.visible, revision: current.revision + 1
                });
            }
            const result = {...this.state.get(body.member_id)};
            return {
                ok: !conflict, status: conflict ? 409 : 200,
                json: async () => ({success: !conflict, reason: conflict ? 'state_conflict' : undefined,
                    member_id: body.member_id, state: result})
            };
        }
    };
}

function page(member, storage, network) {
    const handlers = new Map();
    const native = {stops: 0, starts: 0};
    const context = {
        Promise, AbortController, Date, JSON, Number, Boolean, setTimeout, clearTimeout,
        console: {warn() {}}, membroId: member, localStorage: storage,
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        document: {
            visibilityState: 'visible',
            documentElement: {setAttribute() {}},
            querySelector(selector) { return {content: selector.includes('margot-member-id') ? member : 'test-csrf'}; },
            addEventListener() {}
        },
        addEventListener(name, callback) {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push(callback);
        },
        dispatchEvent(event) { for (const callback of handlers.get(event.type) || []) callback(event); },
        MargotBackgroundLocation: {
            async stop() { native.stops++; },
            async start() { native.starts++; }
        },
        fetch: network.fetch.bind(network)
    };
    context.window = context;
    vm.runInNewContext(preferencesSource, context, {filename: 'preferencias.js'});
    vm.runInNewContext(privacySource, context, {filename: 'location-privacy.js'});
    return {context, native, preferences: context.MargotPreferencias, state: context.MargotLocationState};
}

const pendingKey = member => 'margot-location-pending-v2:' + member;

test('a failed offline show cannot override a newer hide from another phone', async () => {
    const storage = new PersistentStorage();
    const network = server({A: {active: true, visible: false, revision: 1}});
    const first = page('A', storage, network);
    await first.state.ready;
    network.offline = true;
    first.preferences.definir('invisivel', false);
    assert.equal(await first.state.sync(), null);
    assert.equal(JSON.parse(storage.getItem(pendingKey('A'))).revision, 1);

    network.state.set('A', {active: true, visible: false, revision: 2});
    network.offline = false;
    await first.state.sync(true);

    assert.deepEqual(network.state.get('A'), {active: true, visible: false, revision: 2});
    assert.equal(first.preferences.obter('invisivel'), true);
    assert.equal(storage.getItem(pendingKey('A')), null);
    assert.deepEqual(network.requests.filter(value => value.action === 'set').map(value => value.expected_revision), [1]);
});

test('an offline hide survives a new document before server acknowledgement', async () => {
    const storage = new PersistentStorage();
    const network = server({A: {active: true, visible: true, revision: 1}});
    const first = page('A', storage, network);
    await first.state.ready;
    network.offline = true;
    first.preferences.definir('invisivel', true);
    assert.equal(first.native.stops, 1, 'Hide must stop native collection before the network replies');
    assert.equal(await first.state.sync(), null);
    assert.equal(JSON.parse(storage.getItem(pendingKey('A'))).visible, false);

    network.offline = false;
    const reloaded = page('A', storage, network);
    await reloaded.state.ready;

    assert.deepEqual(network.state.get('A'), {active: true, visible: false, revision: 2});
    assert.equal(reloaded.preferences.obter('invisivel'), true);
    assert.equal(storage.getItem(pendingKey('A')), null);
});

test('another member does not consume or inherit the first member\'s pending hide', async () => {
    const storage = new PersistentStorage();
    const network = server({
        A: {active: true, visible: true, revision: 1},
        B: {active: true, visible: true, revision: 8}
    });
    const first = page('A', storage, network);
    await first.state.ready;
    network.offline = true;
    first.preferences.definir('invisivel', true);
    await first.state.sync();
    const pendingA = storage.getItem(pendingKey('A'));
    assert.ok(pendingA);

    network.offline = false;
    const other = page('B', storage, network);
    await other.state.ready;

    assert.deepEqual(network.state.get('B'), {active: true, visible: true, revision: 8});
    assert.equal(other.preferences.obter('invisivel'), false);
    assert.equal(storage.getItem(pendingKey('A')), pendingA);
    assert.equal(storage.getItem(pendingKey('B')), null);
});

test('disabling collection offline also survives reopening', async () => {
    const storage = new PersistentStorage();
    const network = server({A: {active: true, visible: true, revision: 1}});
    const first = page('A', storage, network);
    await first.state.ready;
    network.offline = true;
    first.preferences.definir('localizacao', false);
    assert.equal(first.native.stops, 1);
    await first.state.sync();

    network.offline = false;
    const reloaded = page('A', storage, network);
    await reloaded.state.ready;

    assert.deepEqual(network.state.get('A'), {active: false, visible: false, revision: 2});
    assert.equal(reloaded.preferences.obter('localizacao'), false);
    assert.equal(reloaded.context.MargotLocationPrivacy.allowsCollection(), false);
    assert.equal(storage.getItem(pendingKey('A')), null);
});


test('foreground uploads pause during pending hide and resume only after hidden state is confirmed', async () => {
    const storage = new PersistentStorage();
    const network = server({A: {active: true, visible: true, revision: 1}});
    const first = page('A', storage, network);
    await first.state.ready;
    const sent = [];
    let captures = 0;
    first.context.isSecureContext = true;
    first.context.navigator = {geolocation: {
        watchPosition(callback) {
            captures++;
            callback({coords: {latitude: 0, longitude: 0, accuracy: 10}, timestamp: Date.now()});
            return captures;
        },
        clearWatch() {}
    }};
    vm.runInNewContext(foregroundSource, first.context, {filename: 'websocket-location.js'});
    const tracker = first.context.MargotLocationTracker({
        send(value) { sent.push(value); return true; }, clearMap() {}, showMessage() {}
    });

    network.offline = true;
    first.preferences.definir('invisivel', true);
    await first.state.sync();
    assert.equal(first.context.MargotLocationPrivacy.allowsCollection(), false);
    await tracker.requestCurrentLocation();
    assert.equal(captures, 0, 'Do not start another GPS request while the hide is pending');
    assert.equal(sent.length, 0, 'Do not refresh a public server position before hide acknowledgement');

    network.offline = false;
    await first.state.sync(true);
    assert.equal(network.state.get('A').visible, false);
    assert.equal(first.context.MargotLocationPrivacy.allowsCollection(), true);
    await tracker.requestCurrentLocation();
    assert.equal(captures, 1);
    assert.equal(sent.length, 1, 'Hidden members retain their authorized private discovery position');
    assert.equal(sent[0].type, 'location');
    assert.equal(sent[0].location_policy_version, 1);
    assert.equal(network.state.get('A').visible, false);
    tracker.stopLocationTracking();
});