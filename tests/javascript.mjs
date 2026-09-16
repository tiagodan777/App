// node tests/javascript.mjs — não requer pacotes npm nem acesso à rede.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const equal = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const source = name => fs.readFileSync(path.join(root, 'public/js', name), 'utf8');
for (const file of fs.readdirSync(path.join(root, 'public/js')).filter(name => name.endsWith('.js'))) {
    new vm.Script(source(file), { filename: file });
    checks++;
}
let currentTime = 100000;
class TestDate extends Date { static now() { return currentTime; } }
let watcher, clearCount = 0, permission = 'denied', nativeWatches = 0, clears = 0;
const events = [], notices = [];
const window = { isSecureContext: true, setInterval: () => 1, clearInterval() {} };
const document = { visibilityState: 'visible' };
const navigator = { geolocation: {
    watchPosition(success) { watcher = success; return 1; },
    getCurrentPosition(success) { success({ coords: { latitude: 38.7, longitude: -9.1, accuracy: 5 } }); },
    clearWatch() { clearCount++; }
} };
const context = vm.createContext({ window, document, navigator, Date: TestDate, console });
vm.runInContext(source('websocket-location.js'), context);
const actions = { send: event => { events.push(event); return true; },
    clearMap: () => { clears++; }, showMessage: message => notices.push(message) };
const tracker = window.MargotLocationTracker(actions);
tracker.startLocationTracking();
watcher({ coords: { latitude: 38.7, longitude: -9.1, accuracy: 5 } });
equal(events.length, 1);
equal(events[0].type, 'location');
equal(events[0].latitude, 38.7);
watcher({ coords: { latitude: 38.7, longitude: -9.1, accuracy: 5 } });
equal(events.length, 1); // Evita repetir imediatamente a mesma posição.
currentTime += 15000;
watcher({ coords: { latitude: 38.7, longitude: -9.1, accuracy: 5 } });
equal(events.length, 2);
watcher({ coords: { latitude: 38.71, longitude: -9.1, accuracy: 5 } });
equal(events.length, 3); // Movimento real não fica preso ao intervalo.
window.disableLocationTracking = true;
watcher({ coords: { latitude: 38.8, longitude: -9.1, accuracy: 5 } });
equal(events.length, 3);
equal(tracker.sendLastKnownLocation(), false);
tracker.stopLocationTracking();
equal(clearCount, 1);
window.disableLocationTracking = false;
equal(tracker.sendLastKnownLocation(), false); // Parar elimina a posição guardada.
document.visibilityState = 'hidden';
tracker.requestCurrentLocation();
equal(events.length, 3);
document.visibilityState = 'visible';
tracker.requestCurrentLocation();
equal(events.length, 4);
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { Geolocation: {
    checkPermissions: async () => ({ location: permission }),
    watchPosition: async () => { nativeWatches++; return 'native-1'; },
    clearWatch: async () => { clearCount++; }
} } };
const nativeTracker = window.MargotLocationTracker(actions);
equal(nativeTracker.permissionConfirmed(), false);
nativeTracker.startLocationTracking();
await new Promise(resolve => setImmediate(resolve));
equal(nativeWatches, 0);
equal(clears, 1);
permission = 'granted';
nativeTracker.startLocationTracking();
await new Promise(resolve => setImmediate(resolve));
equal(nativeWatches, 1);
equal(nativeTracker.permissionConfirmed(), true);
nativeTracker.stopLocationTracking();
equal(clearCount, 2);
vm.runInContext(source('websocket-alerts.js'), context);
const alerts = window.MargotMessageAlerts(window, document, () => {});
equal(alerts.rememberNotifiedMessage(1), true);
equal(alerts.rememberNotifiedMessage(1), false); // Push e WebSocket não duplicam o aviso.
for (let id = 2; id <= 202; id++) alerts.rememberNotifiedMessage(id);
equal(alerts.rememberNotifiedMessage(1), true); // Cache limitado.
class SvgNode {
    constructor(name) { this.tagName = name; this.attributes = {}; this.children = []; this.classList = { add: (...names) => { this.attributes.class = names.join(' '); } }; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    appendChild(child) { this.children.push(child); return child; }
}
document.createElementNS = (_, name) => new SvgNode(name);
vm.runInContext(source('today-clothes.js'), context);
for (const piece of window.MargotClothes.pieces) {
    const icon = window.MargotClothes.icon(piece.type, 'blue', 'roupa-teste');
    equal(icon.tagName, 'svg');
    assert.ok(icon.children.length > 0); checks++;
}
const multicolor = window.MargotClothes.icon('tshirt', 'multicolor', 'roupa-teste');
equal(multicolor.children[0].tagName, 'defs');
console.log(`OK: ${checks} verificações JavaScript (sintaxe, localização, avisos e roupas).`);
