// node tests/halloween-hunt.mjs — relógio e transporte simulados, sem dependências.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/js/halloween-hunt.js', import.meta.url), 'utf8');
const member = 'bcad0cb1-9cec-11f1-9863-42010a840002';
const other = '2eca97ae-a46c-11f1-9863-42010a840002';
let checks = 0;
function equal(actual, expected, message) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
    checks++;
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function setup() {
    let now = 0, nextTimer = 0, serial = 0;
    const epoch = 1793487600000;
    const timers = new Map();
    const requests = [], objects = [], confirmations = [], states = [], failures = [];
    const meta = { content: 'a'.repeat(64) };
    const server = {
        mode: 'pilot', campaign: 'pilot-30', interval: 30, counts: { pumpkin: 0, bat: 0 },
        round: null, starts: null, ends: null, member, offline: false, hook: null
    };
    const setTimer = (fn, delay = 0) => {
        timers.set(++nextTimer, { fn, at: now + Math.max(0, delay) });
        return nextTimer;
    };
    function snapshot() {
        const complete = server.counts.pumpkin === 10 && server.counts.bat === 10;
        const phase = server.starts !== null && now < server.starts ? 'scheduled'
            : server.ends !== null && now >= server.ends ? 'ended' : 'active';
        return {
            campaign_id: server.campaign, mode: server.mode, phase,
            server_now_ms: epoch + now,
            starts_at_ms: server.starts === null ? null : epoch + server.starts,
            ends_at_ms: server.ends === null ? null : epoch + server.ends,
            interval_seconds: server.interval, counts: { ...server.counts },
            completed_at: complete ? '2026-10-31T23:00:00.000000Z' : null,
            next_round_at_ms: phase !== 'active' || complete ? null
                : epoch + (server.round ? server.round.started + server.interval * 1000 : now),
            round: phase !== 'active' || complete || !server.round ? null : {
                id: server.round.id, started_at_ms: epoch + server.round.started,
                objects: ['pumpkin', 'bat'].map((kind, i) => ({
                    kind, captured: server.round.captured.has(kind),
                    opens_at_ms: epoch + server.round.started + i * 14000,
                    expires_at_ms: epoch + Math.min(server.round.started + (i ? 28000 : 12000), server.ends ?? Infinity)
                }))
            }
        };
    }
    const response = (status = 200, extra = {}) => ({
        ok: status >= 200 && status < 300, status,
        json: async () => ({ success: status === 200, member_id: server.member, state: snapshot(), ...extra })
    });
    function perform(action, body) {
        if (server.offline) throw new Error('offline');
        if (body?.campaign_id && body.campaign_id !== server.campaign) return response(409);
        if (action === 'round') {
            if (!server.round || now >= server.round.started + server.interval * 1000) {
                server.round = { id: (++serial).toString(16).padStart(32, '0'), started: now, captured: new Set() };
            }
        }
        if (action === 'capture') {
            const round = server.round;
            if (!round || body.round_id !== round.id) return response(409);
            if (!round.captured.has(body.kind)) {
                const i = body.kind === 'bat' ? 1 : 0;
                if (now < round.started + i * 14000 || now >= round.started + (i ? 28000 : 12000)) {
                    return response(409);
                }
                round.captured.add(body.kind);
                server.counts[body.kind] = Math.min(10, server.counts[body.kind] + 1);
            }
        }
        return response();
    }
    const window = {
        location: { origin: 'https://example.test' },
        MargotCsrf: { updateToken(value) { meta.content = value; return true; } },
        async fetch(url, init) {
            const body = init.body ? JSON.parse(init.body) : null;
            const action = body?.action || new URL(url).searchParams.get('action');
            requests.push({ action, body, at: now, init });
            return server.hook ? server.hook(action, body, init, perform) : perform(action, body);
        }
    };
    vm.runInNewContext(source, {
        window, document: { baseURI: 'https://example.test/', querySelector: () => meta },
        URL, AbortController, performance: { now: () => now },
        setTimeout: setTimer, clearTimeout: id => timers.delete(id),
        Date: { now() { throw new Error('O relógio do dispositivo não deve governar as rondas.'); } }
    });
    let eligible = true;
    function createClient() {
        return window.MargotHalloweenHunt.create({
            memberId: member, endpoint: '/halloween-hunt/', isEligible: () => eligible,
            onState: state => states.push(state),
            onObject: object => { objects.push(object); return true; },
            onCapture: (kind, milestone) => confirmations.push({ kind, milestone }),
            onFailure: () => failures.push(now)
        });
    }
    async function advance(ms) {
        const target = now + ms;
        let guard = 0;
        while (true) {
            await flush();
            const first = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
            if (!first || first[1].at > target) break;
            assert.ok(guard++ < 10000, 'Sem ciclos de temporizadores imediatos.');
            now = first[1].at;
            timers.delete(first[0]);
            first[1].fn();
        }
        now = target;
        await flush();
    }
    return {
        server, requests, objects, confirmations, states, failures, timers, meta,
        createClient, advance, response, perform, now: () => now,
        eligible: value => { eligible = value; },
        rounds: () => requests.filter(request => request.action === 'round'),
        captures: () => requests.filter(request => request.action === 'capture')
    };
}

// A primeira ronda chega após alguns segundos; não há grupos nem contagens locais.
{
    const h = setup(), client = h.createClient();
    client.setActive(true);
    await h.advance(3999);
    equal(h.rounds().length, 0, 'GET não inicia uma ronda.');
    await h.advance(1);
    equal(h.rounds().length, 1);
    equal(h.objects.map(object => object.kind), ['pumpkin']);
    let release;
    h.server.hook = async (action, body, init, perform) => {
        const result = perform(action, body);
        return action === 'capture' ? new Promise(resolve => { release = () => resolve(result); }) : result;
    };
    equal(client.capture(h.objects[0]), true);
    equal(client.capture(h.objects[0]), false, 'Um toque duplo não envia duas capturas.');
    await flush();
    equal(client.getState().state.counts.pumpkin, 0, 'Só contar depois da confirmação.');
    release();
    await flush();
    equal(client.getState().state.counts.pumpkin, 1);
    equal(h.confirmations.length, 1);
    await h.advance(14000);
    equal(h.objects.map(object => object.kind), ['pumpkin', 'bat']);
    equal(h.rounds().length, 1);
    client.destroy();
    equal(h.timers.size, 0, 'Destroy limpa os temporizadores.');
}

// Reabrir uma página não reinicia o intervalo, nem soma as rondas perdidas.
{
    const h = setup();
    let client = h.createClient();
    client.setActive(true);
    await h.advance(20000);
    client.destroy();
    client = h.createClient();
    client.setActive(true);
    await h.advance(13999);
    equal(h.rounds().length, 1, 'Refresh não contorna os 30 segundos.');
    await h.advance(1);
    equal(h.rounds().length, 2);
    client.setActive(false);
    await h.advance(600000);
    equal(h.rounds().length, 2, 'Não há rondas no background.');
    client.setActive(true);
    await h.advance(4000);
    equal(h.rounds().length, 3, 'Dez minutos fora dão apenas uma ronda no regresso.');
    client.destroy();
}

// Uma captura confirmada pelo servidor mas cuja resposta se perdeu é repetida com o mesmo ID.
{
    const h = setup(), client = h.createClient();
    client.setActive(true);
    await h.advance(4000);
    let loseOnce = true;
    h.server.hook = (action, body, init, perform) => {
        const result = perform(action, body);
        if (action === 'capture' && loseOnce) { loseOnce = false; throw new Error('resposta perdida'); }
        return result;
    };
    client.capture(h.objects[0]);
    await flush();
    equal(client.getState().state.counts.pumpkin, 0);
    await h.advance(2000);
    equal(h.captures().length, 2);
    equal(h.captures()[0].body, h.captures()[1].body);
    equal(client.getState().state.counts.pumpkin, 1);
    equal(h.confirmations.length, 1);
    client.destroy();
}

// Alterar 30 -> 300 segundos inicia o piloto separado mesmo se a coleção anterior acabou.
{
    const h = setup(), client = h.createClient();
    h.server.counts = { pumpkin: 10, bat: 10 };
    client.setActive(true);
    await h.advance(1000);
    equal(h.rounds().length, 0);
    h.server.campaign = 'pilot-300'; h.server.interval = 300;
    h.server.counts = { pumpkin: 0, bat: 0 };
    await h.advance(29000);
    equal(client.getState().state.campaign_id, 'pilot-300');
    equal(h.rounds().length, 1);
    await h.advance(299999);
    equal(h.rounds().length, 1, 'Cinco minutos completos entre inícios.');
    await h.advance(1);
    equal(h.rounds().length, 2);
    client.destroy();
}

// Janela pública: não gerar antes da abertura nem manter personagens após o fecho.
{
    const h = setup(), client = h.createClient();
    h.server.mode = 'public'; h.server.campaign = 'public';
    h.server.interval = 300; h.server.starts = 10000; h.server.ends = 20000;
    client.setActive(true);
    await h.advance(9999);
    equal(h.rounds().length, 0);
    await h.advance(101);
    equal(h.rounds().length, 1);
    equal(h.objects.length, 1);
    await h.advance(9900);
    equal(client.canShow(h.objects[0]), false);
    equal(client.capture(h.objects[0]), false);
    await h.advance(300000);
    equal(h.rounds().length, 1);
    equal(h.objects.map(object => object.kind), ['pumpkin']);
    client.destroy();
}

// O CSRF renovado só pertence à mesma conta; uma sessão diferente bloqueia o cliente antigo.
{
    const h = setup(), client = h.createClient();
    let renew = true;
    h.server.hook = (action, body, init, perform) => {
        if (action === 'round' && renew) {
            renew = false;
            return h.response(403, { code: 'csrf_expired', csrf_token: 'b'.repeat(64) });
        }
        return perform(action, body);
    };
    client.setActive(true);
    await h.advance(4000);
    equal(h.meta.content, 'b'.repeat(64));
    equal(h.rounds().length, 2, 'Uma única repetição por CSRF expirado.');
    equal(h.rounds()[1].init.headers['X-CSRF-Token'], 'b'.repeat(64));
    h.server.member = other;
    client.setActive(false); client.setActive(true);
    await h.advance(60000);
    equal(client.getState().state, null);
    equal(h.rounds().length, 2, 'Não aceitar nem jogar com outra sessão.');
    client.destroy();
}

// O foreground confirma primeiro o estado; respostas tardias não ressuscitam uma página destruída.
{
    const h = setup(), client = h.createClient();
    let release;
    h.server.hook = () => new Promise(resolve => { release = () => resolve(h.response()); });
    client.setActive(true);
    await flush();
    equal(h.objects.length, 0);
    const signal = h.requests[0].init.signal;
    client.destroy();
    equal(signal.aborted, true);
    release();
    await flush();
    equal(h.states.length, 0);
    equal(h.objects.length, 0);
    equal(h.rounds().length, 0);
}

// Uma resposta emitida antes da pausa não pode reancorar o relógio ao regressar.
{
    const h = setup(), client = h.createClient();
    let releaseOld, releaseFresh;
    const oldResponse = h.response();
    const oldData = await oldResponse.json();
    let calls = 0;
    h.server.hook = () => new Promise(resolve => {
        if (++calls === 1) {
            releaseOld = () => resolve({ ok: true, status: 200, json: async () => oldData });
        } else {
            releaseFresh = () => resolve(h.response());
        }
    });
    client.setActive(true);
    await flush();
    const oldSignal = h.requests[0].init.signal;
    client.setActive(false);
    equal(oldSignal.aborted, true);
    await h.advance(300000);
    client.setActive(true);
    releaseOld();
    await flush();
    equal(h.states.length, 0, 'Não aceitar o estado anterior à pausa.');
    equal(h.objects.length, 0);
    equal(h.rounds().length, 0);
    equal(h.requests.length, 2, 'Pedir estado atual depois da resposta antiga.');
    releaseFresh();
    await flush();
    equal(h.states.length, 1);
    equal(client.getState().state.server_now_ms, 1793487600000 + h.now());
    client.destroy();
}

// O limiter/infraestrutura pode devolver erros sem identidade; recuperar sem trocar de conta.
{
    const h = setup(), client = h.createClient();
    let limited = true;
    h.server.hook = (action, body, init, perform) => {
        if (limited) {
            limited = false;
            return { ok: false, status: 429, json: async () => ({ success: false, message: 'Aguarda.' }) };
        }
        return perform(action, body);
    };
    client.setActive(true);
    await h.advance(1999);
    equal(h.requests.length, 1, 'Respeitar backoff após429.');
    equal(h.objects.length, 0);
    await h.advance(2001);
    equal(h.rounds().length, 1, 'Recuperar sem recarregar a página.');
    equal(h.objects.length, 1);
    client.destroy();
}

// Sem confirmação não incrementar; a tentativa perdida mostra falha e não cria objetos novos.
{
    const h = setup(), client = h.createClient();
    client.setActive(true);
    await h.advance(4000);
    h.server.offline = true;
    client.capture(h.objects[0]);
    await h.advance(3000);
    equal(h.confirmations.length, 0);
    equal(client.getState().state.counts.pumpkin, 0);
    equal(h.failures.length, 1);
    await h.advance(30000);
    equal(h.objects.length, 1, 'Não apresentar o morcego sem comunicação com o servidor.');
    client.destroy();
}

console.log(`OK: ${checks} verificações da caça de Halloween (tempo, capturas, campanhas, sessão e reabertura).`);
