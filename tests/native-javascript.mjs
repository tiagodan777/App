// Controladores reais com plugins e rede simulados. Não substitui testes em telemóveis.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
let checks = 0;
const same = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const check = (value, name) => { assert.ok(value, name); checks++; };
const flush = async () => { for (let i=0;i<50;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise, resolve}; };
const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const source = name => fs.readFileSync(new URL('../public/js/'+name, import.meta.url),'utf8');
class Target {
    events = new Map();
    addEventListener(name,fn) { if (!this.events.has(name)) this.events.set(name,[]); this.events.get(name).push(fn); }
    removeEventListener(name,fn) { this.events.set(name,(this.events.get(name)||[]).filter(f=>f!==fn)); }
    dispatchEvent(event) { for (const fn of [...(this.events.get(event.type)||[])]) fn(event); }
}
class CustomEvent { constructor(type,options={}) { this.type=type; this.detail=options.detail; } }
function environment(platform='ios', options={}) {
    const window = new Target(), document = new Target();
    const calls=[], requests=[], destinations=[], errors=[], storage=new Map(), elements=new Map();
    const preferences={notificacoes:true,localizacao:true,invisivel:false,...options.preferences};
    const state={permission:options.permission||'granted',location:options.location||'granted',active:false,token_stored:false};
    const listeners={};
    const element=()=>Object.assign(new Target(),{appendChild(node){if(node.id) elements.set(node.id,node);}, setAttribute(){}, remove(){elements.delete(this.id);}});
    Object.assign(document,{readyState:'loading',visibilityState:'visible',head:element(),body:element(),
        querySelector:selector=>selector.includes('csrf-token')?{content:'test-csrf',getAttribute:()=> 'test-csrf'}:null,
        querySelectorAll:()=>[],createElement:element,getElementById:id=>elements.get(id)||null});
    const push={
        async addListener(name,fn){ listeners[name]=fn; calls.push('listen:'+name); },
        async checkPermissions(){ calls.push('push.check'); return {receive:state.permission}; },
        async requestPermissions(){ calls.push('push.request'); if(options.pushPermission) return options.pushPermission.promise;
            state.permission=options.answer||'granted'; return {receive:state.permission}; },
        async register(){calls.push('push.register');},
        async unregister(){calls.push('push.unregister');},
        async removeAllDeliveredNotifications(){calls.push('push.clear');}
    };
    const background={
        async addListener(name,fn){listeners[name]=fn;},
        async status(){calls.push('background.status');return {...state};},
        async start(data){calls.push('background.start');state.active=true;state.token_stored=true;
            requests.push({nativeStart:JSON.parse(JSON.stringify(data))});return {...state};},
        async stop(){calls.push('background.stop');state.active=false;state.token_stored=false;return {...state};},
        async setVisibility(data){calls.push('background.visible:'+data.visible);state.active=data.visible;return {...state};},
        async openSettings(){calls.push('background.settings');}
    };
    const geo={async checkPermissions(){calls.push('geo.check');return {location:state.location};},
        async requestPermissions(){calls.push('geo.request');return {location:options.locationAnswer||'denied'};}};
    const location={origin:'https://margot.test',href:'https://margot.test/',pathname:'/',search:'',assign:path=>destinations.push(path)};
    const fetch=async (url,config={})=>{
        calls.push('fetch:'+url);requests.push({url,config});
        if (options.tokenResponse && String(url).includes('background-location-token')) return options.tokenResponse.promise;
        if (options.fetchError) throw new Error('Offline');
        return {ok:true,status:200,json:async()=>({success:true,token:'a'.repeat(64)})};
    };
    Object.assign(window,{document,location,crypto:webcrypto,fetch,membroId:options.member===false?'':MEMBER,
        localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
        MargotPreferencias:{obter:key=>preferences[key]},Capacitor:{isNativePlatform:()=>platform!=='web',getPlatform:()=>platform,
            isPluginAvailable:()=>true,Plugins:{PushNotifications:push,BackgroundLocation:background,Geolocation:geo}}});
    const context=vm.createContext({window,document,navigator:{userAgent:platform},localStorage:window.localStorage,
        console:{warn:(...a)=>errors.push(a),error:(...a)=>errors.push(a)},URL,Request,Headers,HTMLFormElement:class {},
        CustomEvent,Uint8Array,fetch,Date,Promise,setTimeout,clearTimeout});
    function load(name){vm.runInContext(source(name),context,{filename:name});}
    function event(type,detail){window.dispatchEvent(new CustomEvent(type,{detail}));}
    async function ready(){document.dispatchEvent({type:'DOMContentLoaded'}); await flush();}
    return {window,document,load,event,ready,calls,requests,listeners,preferences,state,storage,errors,destinations};
}
for (const platform of ['ios','android']) {
    const e=environment(platform);e.load('csrf.js');e.load('push-notifications.js');await e.ready();
    same(e.calls.filter(x=>x==='push.register').length,1,platform+' regista com permissão');
    const token=platform==='ios'?'a'.repeat(64):'FCM-token-de-teste-com-comprimento';
    e.listeners.registration({value:token});await flush();
    const request=e.requests.find(r=>r.url==='/push-device/');
    const body=JSON.parse(request.config.body);
    same(body.platform,platform,platform+' registo identifica plataforma');
    same(body.token,token,platform+' envia token');
    same(request.config.headers.get('X-CSRF-Token'),'test-csrf',platform+' registo protegido por CSRF');
    check(/^[a-f0-9-]{36}$/.test(body.installation_id),platform+' instalação estável');
    let received=0;e.window.addEventListener('app:chat-push-recebido',()=>received++);
    e.listeners.pushNotificationReceived({data:{type:'message'}});
    same(received,1,platform+' evento em foreground');
    e.listeners.pushNotificationActionPerformed({notification:{data:{url:'/messages/'+OTHER}}});
    same(e.destinations.at(-1),'/messages/'+OTHER,platform+' toque abre conversa');
    const count=e.destinations.length;
    for(const url of ['https://evil.test/','//evil.test','/logout','javascript:alert(1)'])
        e.listeners.pushNotificationActionPerformed({notification:{data:{url}}});
    same(e.destinations.length,count,platform+' recusa destinos externos e ações');
    await e.window.MargotPushNotifications.unregister();
    same(JSON.parse(e.requests.at(-1).config.body).action,'unregister',platform+' remove registo do servidor');
    same(e.storage.has('margot-push-token-v1'),false,platform+' limpa token local');
    check(e.calls.includes('push.unregister'),platform+' remove registo nativo');
}
for (const answer of ['granted','denied']) {
    const e=environment('android',{permission:'prompt',answer});e.load('push-notifications.js');await e.ready();
    same(e.calls.filter(x=>x==='push.request').length,1,'Pede autorização uma vez');
    same(e.calls.includes('push.register'),answer==='granted','Respeita resposta '+answer);
    same(e.window.margotNotificationPermissionFlowCompleted,true,'Fluxo termina com '+answer);
}
{
    const e=environment('web');e.load('push-notifications.js');e.load('background-location.js');await e.ready();
    same(e.requests.length,0,'Web não invoca serviços nativos');
}
{
    const e=environment('ios',{member:false});e.load('push-notifications.js');await e.ready();
    same(e.calls.includes('push.register'),false,'Visitante não associa push a conta');
    e.listeners.pushNotificationActionPerformed({notification:{data:{url:'/profile/'+OTHER}}});
    same(e.destinations[0],'/login/','Push sem sessão encaminha para login');
    check(e.storage.has('margot-push-destination-v1'),'Destino preservado para depois do login');
}
{
    const permission=deferred();const e=environment('android',{permission:'prompt',pushPermission:permission});
    e.load('push-notifications.js');e.load('background-location.js');await e.ready();
    same(e.calls.includes('geo.check'),false,'Android não sobrepõe diálogos de permissões');
    permission.resolve({receive:'denied'});await flush();
    check(e.calls.includes('geo.check'),'Localização prossegue mesmo com push recusado');
    same(e.calls.filter(x=>x==='background.start').length,1,'Android inicia serviço após permissões');
    same(e.requests.find(r=>r.nativeStart).nativeStart.visible,true,'Serviço recebe visibilidade');
    const count=e.requests.filter(r=>r.url).length;
    await e.window.MargotBackgroundLocation.start();
    same(e.requests.filter(r=>r.url).length,count,'Retomar serviço ativo não roda token');
}
for(const platform of ['ios','android']) {
    const e=environment(platform);e.load('background-location.js');await e.ready();
    check(e.state.active,platform+' localização inicia');
    e.preferences.invisivel=true;e.event('margot:preferencias-alteradas');await flush();
    check(e.calls.includes('background.visible:false'),platform+' invisibilidade chega ao serviço');
    e.preferences.localizacao=false;e.event('margot:preferencias-alteradas');await flush();
    same(e.state.active,false,platform+' desativar localização para serviço');
    const count=e.requests.length;
    e.listeners.backgroundLocationTokenExpired();await flush();
    same(e.requests.length,count,platform+' token expirado não reativa preferência desligada');
}
{
    const e=environment('android',{location:'denied'});e.load('background-location.js');await e.ready();
    same(e.calls.includes('background.start'),false,'Sem permissão Android não inicia serviço');
    check(e.document.getElementById('margot-background-location-overlay'),'Recusa apresenta acesso às definições');
}
{
    const e=environment('ios');e.load('background-location.js');await e.ready();
    e.listeners.backgroundLocationTokenExpired();await flush();
    same(e.requests.filter(r=>r.nativeStart).length,2,'Expiração renova autorização');
}
for (const platform of ['ios','android']) {
    const pending=deferred();const e=environment(platform,{tokenResponse:pending});
    e.load('background-location.js');await e.ready();
    await e.window.MargotBackgroundLocation.stop();
    pending.resolve({ok:true,status:200,json:async()=>({success:true,token:'a'.repeat(64)})});await flush();
    same(e.state.active,false,platform+' parar durante pedido de token não reinicia localização');
}
{
    const e=environment('ios',{fetchError:true});e.load('background-location.js');await e.ready();
    same(e.calls.includes('background.start'),false,'Falha do servidor não inicia localização');
    check(e.errors.length>0,'Falha de rede reportada');
}
{
    const e=environment('ios',{preferences:{notificacoes:false}});e.load('push-notifications.js');await e.ready();
    same(e.calls.includes('push.register'),false,'Preferência de notificações desativada respeitada');
    e.preferences.notificacoes=true;e.event('margot:preferencias-alteradas',{notificacoes:true});await flush();
    check(e.calls.includes('push.register'),'Ativar preferência regista push');
}
console.log(`OK: ${checks} verificações JS de push/localização (plugins e HTTP simulados).`);
