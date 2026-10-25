import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
{
const file = new URL('../public/js/background-location.js', import.meta.url);
const starts = [], pending = [], listeners = {};
let stops = 0;
let native = {active:false,visible:true,token_stored:false,authorization:'always',services_enabled:true,policy_version:'native-battery-2',member_id:null};
const plugin = {
 status:async()=>({...native}),
 start:args=>{starts.push(args.memberId);native={...native,active:true,token_stored:true,member_id:args.memberId};return new Promise(resolve=>pending.push(()=>resolve({...native})));},
 stop:async()=>{stops++;native={...native,active:false,token_stored:false,member_id:null};return {...native};},
 setVisibility:async({visible})=>{native.visible=visible;return {...native};},
 addListener:(name,fn)=>{listeners[name]=fn;}
};
const context = {
 console,Promise,AbortController,Date,Set,Map,setTimeout,clearTimeout,
 setInterval:()=>0,addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},
 membroId:'A',
 document:{visibilityState:'visible',readyState:'loading',querySelector:()=>null,addEventListener:()=>{}},
 Capacitor:{Plugins:{BackgroundLocation:plugin},getPlatform:()=> 'ios',isNativePlatform:()=>true,isPluginAvailable:()=>true},
 MargotPreferencias:{obter:()=>true},
 MargotLocationPrivacy:{allowsCollection:()=>true},
 MargotLocationState:{ready:Promise.resolve(),sync:async()=>({active:true,visible:true,revision:1})},
 fetch:async()=>({ok:true,status:200,json:async()=>({success:true,token:context.membroId==='A'?'a'.repeat(64):'b'.repeat(64),member_id:context.membroId})})
};
context.window=context;
vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:String(file)});
const flush=async()=>{for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));};
const a=context.MargotBackgroundLocation.start();
await flush();assert.equal(pending.length,1);
await context.MargotBackgroundLocation.stop();
context.membroId='B';
const b=context.MargotBackgroundLocation.start();
await flush();
pending.shift()();
await flush();
while(pending.length) pending.shift()();
await flush();
await Promise.all([a,b]);
console.log(JSON.stringify({starts,stops,finalOwner:native.member_id,active:native.active}));
assert.equal(native.member_id,'B','Latest explicit B start lost behind stale A promise');
assert.equal(native.active,true);
console.log('PASS latest-start-wins while old native completion is delayed.');

}
{
const file = new URL('../public/js/background-location.js', import.meta.url);
const starts = [], pending = [], listeners = {};
let stops = 0;
let native = {active:false,visible:true,token_stored:false,authorization:'always',services_enabled:true,policy_version:'native-battery-2',member_id:null};
const plugin = {
 status:async()=>({...native}),
 start:args=>{starts.push(args.memberId);native={...native,active:true,token_stored:true,member_id:args.memberId};return new Promise(resolve=>pending.push(()=>resolve({...native})));},
 stop:async()=>{stops++;native={...native,active:false,token_stored:false,member_id:null};return {...native};},
 setVisibility:async({visible})=>{native.visible=visible;return {...native};},
 addListener:(name,fn)=>{listeners[name]=fn;}
};
const context = {
 console,Promise,AbortController,Date,Set,Map,setTimeout,clearTimeout,
 setInterval:()=>0,addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},
 membroId:'A',
 document:{visibilityState:'visible',readyState:'loading',querySelector:()=>null,addEventListener:()=>{}},
 Capacitor:{Plugins:{BackgroundLocation:plugin},getPlatform:()=> 'ios',isNativePlatform:()=>true,isPluginAvailable:()=>true},
 MargotPreferencias:{obter:()=>true},
 MargotLocationPrivacy:{allowsCollection:()=>true},
 MargotLocationState:{ready:Promise.resolve(),sync:async()=>({active:true,visible:true,revision:1})},
 fetch:async()=>({ok:true,status:200,json:async()=>({success:true,token:context.membroId==='A'?'a'.repeat(64):'b'.repeat(64),member_id:context.membroId})})
};
context.window=context;
vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:String(file)});
const flush=async()=>{for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));};
const a=context.MargotBackgroundLocation.start();
const stop=context.MargotBackgroundLocation.stop();
await flush();
while(pending.length) pending.shift()();
await flush();
await Promise.all([a,stop]);
console.log(JSON.stringify({starts,stops,finalOwner:native.member_id,active:native.active}));
assert.equal(native.active,false,'Start requested before stop must not restart after await-ready');
console.log('PASS latest-stop-wins before initialization awaits settle.');

}
{
const file = new URL('../public/js/background-location.js', import.meta.url);
const starts = [], pending = [], listeners = {};
let stops = 0;
let native = {active:false,visible:true,token_stored:false,authorization:'always',services_enabled:true,policy_version:'native-battery-2',member_id:null};
const plugin = {
 status:async()=>({...native}),
 start:args=>{starts.push(args.memberId);native={...native,active:true,token_stored:true,member_id:args.memberId};return new Promise(resolve=>pending.push(()=>resolve({...native})));},
 stop:async()=>{stops++;native={...native,active:false,token_stored:false,member_id:null};return {...native};},
 setVisibility:async({visible})=>{native.visible=visible;return {...native};},
 addListener:(name,fn)=>{listeners[name]=fn;}
};
const context = {
 console,Promise,AbortController,Date,Set,Map,setTimeout,clearTimeout,
 setInterval:()=>0,addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},
 membroId:'A',
 document:{visibilityState:'visible',readyState:'loading',querySelector:()=>null,addEventListener:()=>{}},
 Capacitor:{Plugins:{BackgroundLocation:plugin},getPlatform:()=> 'ios',isNativePlatform:()=>true,isPluginAvailable:()=>true},
 MargotPreferencias:{obter:()=>true},
 MargotLocationPrivacy:{allowsCollection:()=>true},
 MargotLocationState:{ready:Promise.resolve(),sync:async()=>({active:true,visible:true,revision:1})},
 fetch:async()=>({ok:true,status:200,json:async()=>({success:true,token:context.membroId==='A'?'a'.repeat(64):'b'.repeat(64),member_id:context.membroId})})
};
context.window=context;
vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:String(file)});
const flush=async()=>{for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));};
const a=context.MargotBackgroundLocation.start();
await flush();assert.equal(pending.length,1);
await context.MargotBackgroundLocation.stop();
context.membroId='B';
const b=context.MargotBackgroundLocation.start();
await flush();
await context.MargotBackgroundLocation.stop();
pending.shift()();
await flush();
while(pending.length) pending.shift()();
await flush();
await Promise.all([a,b]);
console.log(JSON.stringify({starts,stops,finalOwner:native.member_id,active:native.active}));
assert.equal(native.active,false,'Final stop must cancel queued start for B');
assert.deepEqual(starts,['A']);
console.log('PASS final stop cancels a newer start queued behind old completion.');

}
{
const file = new URL('../public/js/background-location.js', import.meta.url);
const starts = [], pending = [], listeners = {};
let stops = 0;
let native = {active:false,visible:true,token_stored:false,authorization:'always',services_enabled:true,policy_version:'native-battery-2',member_id:null};
const plugin = {
 status:async()=>({...native}),
 start:args=>{starts.push(args.memberId);native={...native,active:true,collection_suspended:false,token_stored:true,member_id:args.memberId};return new Promise(resolve=>pending.push(()=>resolve({...native})));},
 stop:async()=>{stops++;native={...native,active:false,token_stored:false,member_id:null};return {...native};},
 setVisibility:async({visible})=>{native.visible=visible;return {...native};},
 addListener:(name,fn)=>{listeners[name]=fn;}
};
const context = {
 console,Promise,AbortController,Date,Set,Map,setTimeout,clearTimeout,
 setInterval:()=>0,addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},
 membroId:'A',
 document:{visibilityState:'visible',readyState:'loading',querySelector:()=>null,addEventListener:()=>{}},
 Capacitor:{Plugins:{BackgroundLocation:plugin},getPlatform:()=> 'ios',isNativePlatform:()=>true,isPluginAvailable:()=>true},
 MargotPreferencias:{obter:()=>true},
 MargotLocationPrivacy:{allowsCollection:()=>true},
 MargotLocationState:{ready:Promise.resolve(),sync:async()=>({active:true,visible:true,revision:1})},
 fetch:async()=>({ok:true,status:200,json:async()=>({success:true,token:context.membroId==='A'?'a'.repeat(64):'b'.repeat(64),member_id:context.membroId})})
};
context.window=context;
vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:String(file)});
const flush=async()=>{for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));};
const a=context.MargotBackgroundLocation.start();
await flush();pending.shift()();await a;
native={...native,active:false,collection_suspended:true};
const b=context.MargotBackgroundLocation.start();
await flush();while(pending.length) pending.shift()();await b;
console.log(JSON.stringify({starts,stops,finalOwner:native.member_id,active:native.active,suspended:native.collection_suspended,cache:context.MargotNativeLocationCacheAvailable}));
assert.deepEqual(starts,['A','A'],'Suspended native service requires explicit start after state sync');
assert.equal(native.collection_suspended,false);
assert.equal(context.MargotNativeLocationCacheAvailable,true,'Policy2 must keep native cache enabled');
console.log('PASS explicit start clears suspension; policy2 cache preserved.');

}