// Local simulation only. Needs Java, Swift (unless MARGOT_PHASE_NO_IOS=1),
// and an existing @php-wasm installation, just like the recovery test runner.
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modules=process.env.MARGOT_PHP_WASM_MODULES;
if(!modules)throw new Error('Set MARGOT_PHP_WASM_MODULES to existing node_modules containing @php-wasm.');
const work=mkdtempSync(path.join(tmpdir(),'margot-transport-phase-'));
const javaTool=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name):name;
const run=(command,args)=>execFileSync(command,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
try {
    mkdirSync(path.join(work,'classes'));
    const source=path.join(root,'android/app/src/main/java/com/margot/app');
    run(javaTool('javac'),['-d',path.join(work,'classes'),path.join(source,'LocationPolicy.java'),
        path.join(source,'TransportPhasePolicy.java'),path.join(root,'tests/fixtures/AndroidTransportTrace.java')]);
    writeFileSync(path.join(work,'android.json'),run(javaTool('java'),['-cp',path.join(work,'classes'),'com.margot.app.AndroidTransportTrace']));
    const ios=process.env.MARGOT_PHASE_NO_IOS!=='1';
    if(ios) {
        run('swiftc',['-module-cache-path',path.join(work,'swift-cache'),path.join(root,'ios/App/App/LocationPolicy.swift'),
            path.join(root,'tests/fixtures/IOSTransportPhaseTrace.swift'),'-o',path.join(work,'ios-trace')]);
        writeFileSync(path.join(work,'ios.json'),run(path.join(work,'ios-trace'),[]));
    }
    const {PHP,loadPHPRuntime}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js')));
    const {getPHPLoaderModule,createNodeFsMountHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
    const php=new PHP(await loadPHPRuntime(await getPHPLoaderModule('8.3')));php.setSapiName('cli');
    await php.mount('/app',createNodeFsMountHandler(root));await php.mount('/sim',createNodeFsMountHandler(work));
    const env={MARGOT_PHASE_TRACE:'/sim/android.json',MARGOT_TEST_ROOT:'/app',MARGOT_PHASE_RESULTS:'/sim/results.json'};
    if(ios)env.MARGOT_PHASE_IOS_TRACE='/sim/ios.json';
    try {
        const r=await php.run({scriptPath:'/app/tests/android-transport-phase.php',env});
        console.log(r.text);if(r.errors)console.error(r.errors);if(r.exitCode)process.exitCode=r.exitCode;
    }catch(error){if(error.response)console.error(error.response.text);else throw error;process.exitCode=1;}
    if(process.env.MARGOT_PHASE_RESULTS)writeFileSync(process.env.MARGOT_PHASE_RESULTS,readFileSync(path.join(work,'results.json')));
    console.log(ios?'Java + Swift policies exercised. No physical battery measurement.':'iOS simulation explicitly skipped. No physical battery measurement.');
}finally{rmSync(work,{recursive:true,force:true});}
