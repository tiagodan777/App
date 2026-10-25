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
const timers = new Map(); let nextTimer = 0;
const window = {isSecureContext: true, setTimeout(fn) { timers.set(++nextTimer,fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); }, setInterval: () => 1, clearInterval() {}};
const document = {visibilityState: 'visible'};
let watcher, clearCount = 0, permission = 'denied', nativeWatches = 0, clears = 0;
const events = [], notices = [];
const navigator = {geolocation: {
    watchPosition(success) { watcher=success; return ++nativeWatches; },
    clearWatch() { clearCount++; }
}};
const context = vm.createContext({window, document, navigator, Date: TestDate, console});
vm.runInContext(source('websocket-location.js'),context);
const actions = {send: event => {events.push(event);return true;}, clearMap:()=>clears++,
    showMessage: message=>notices.push(message)};
const flush = async () => { for (let i=0;i<50;i++) await Promise.resolve(); };
const fix = (extra={}) => ({coords:{latitude:38.7,longitude:-9.1,accuracy:5},timestamp:currentTime,...extra});
const tracker = window.MargotLocationTracker(actions);
tracker.startLocationTracking();await flush();
watcher(fix());await flush();
equal(events.length,1);equal(events[0].type,'location');equal(clearCount,1);
watcher(fix());equal(events.length,1); // Callback posterior ao cancelamento é ignorado.
currentTime+=30000;
tracker.requestCurrentLocation();await flush();watcher(fix());await flush();
equal(events.length,2);equal(clearCount,2);
currentTime+=30000;
tracker.requestCurrentLocation();await flush();watcher(fix({timestamp:currentTime-120000}));
equal(events.length,2); // Amostra antiga não é tornada recente.
window.disableLocationTracking=true;watcher(fix());equal(events.length,2);
tracker.stopLocationTracking();equal(clearCount,3);equal(tracker.sendLastKnownLocation(),false);
window.disableLocationTracking=false;document.visibilityState='hidden';
await tracker.requestCurrentLocation();equal(events.length,2);
document.visibilityState='visible';
window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{Geolocation:{
    checkPermissions:async()=>({location:permission}),
    watchPosition:async(_,callback)=>{watcher=callback;nativeWatches++;return 'native';},
    clearWatch:async()=>{clearCount++;}
}}};
const nativeTracker=window.MargotLocationTracker(actions);
equal(nativeTracker.permissionConfirmed(),false);
await nativeTracker.requestCurrentLocation();equal(clears,1);
permission='granted';currentTime+=30000;
nativeTracker.requestCurrentLocation();await flush();
equal(nativeTracker.permissionConfirmed(),true);
watcher(fix());await flush();equal(events.length,3);
nativeTracker.stopLocationTracking();
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
