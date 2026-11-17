// Optional runner for an already-installed @php-wasm runtime; native PHP can run the .php test directly.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const modules = process.env.MARGOT_PHP_WASM_MODULES;
if (!modules) throw new Error('Set MARGOT_PHP_WASM_MODULES to an existing node_modules directory containing @php-wasm.');
const { PHP, loadPHPRuntime } = await import(pathToFileURL(path.join(modules, '@php-wasm/universal/index.js')));
const { getPHPLoaderModule, createNodeFsMountHandler } = await import(pathToFileURL(path.join(modules, '@php-wasm/node/index.js')));
const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule('8.3')));
php.setSapiName('cli');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await php.mount('/audit', createNodeFsMountHandler(root));
let result = await php.run({code: `<?php foreach (['src/classes/CMS/LocationRecovery.php','src/pages/location-recovery.php','tests/location-recovery.php','tests/fixtures/RecoveryTestDatabase.php','tests/fixtures/location-recovery-http.php'] as $f) { token_get_all(file_get_contents('/audit/'.$f), TOKEN_PARSE); } echo 'PASS: PHP syntax';`});
assert.equal(result.exitCode, 0, result.text + result.errors);
console.log(result.text);
result = await php.run({scriptPath: '/audit/tests/location-recovery.php'});
console.log(result.text);
assert.equal(result.exitCode, 0, result.text + result.errors);
let httpChecks = 0;
const base = {action: 'upload', registration_id: 'd'.repeat(32), request_id: 'e'.repeat(32),
  location_policy_version: 1, latitude: 38.1, longitude: -9.1, accuracy: 5, timestamp: Date.now() - 2000};
async function endpoint(name, changes = {}, {method = 'POST', token = 'a'.repeat(64)} = {}) {
  const response = await php.run({scriptPath: '/audit/tests/fixtures/location-recovery-http.php', method,
    env: {RECOVERY_HTTP_CASE: name}, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: new TextEncoder().encode(JSON.stringify({...base, ...changes}))});
  assert.equal(response.exitCode, 0, name + ': ' + response.text + response.errors);
  httpChecks++;
  return {status: response.httpStatusCode, ...JSON.parse(response.text)};
}
for (const name of ['normal', 'nearby_constructor_failure', 'nearby_snapshot_failure', 'nearby_notification_failure']) {
  const response = await endpoint(name);
  assert.equal(response.status, 200, name);
  assert.equal(response.response.accepted, true, name);
  assert.equal(response.row.visivel, 0, name);
  assert.equal(response.row.localizacao_ativa, 1, name);
  assert.equal(response.row.latitude, 38.1, name);
}
for (const action of ['register', 'check']) {
  const response = await endpoint('nearby_constructor_failure', {action, apns_token: 'c'.repeat(64), environment: 'sandbox', recovery_version: 2});
  assert.equal(response.status, 200, action);
  assert.equal(response.response.success, true, action);
  assert.equal(response.nearby_calls, 0, action);
}
let response = await endpoint('unauthorized', {}, {token: 'b'.repeat(64)});
assert.equal(response.status, 401);
assert.equal(response.nearby_calls, 0);
response = await endpoint('method', {}, {method: 'GET'});
assert.equal(response.status, 405);
response = await endpoint('stale', {timestamp: Date.now() - 121000});
assert.equal(response.status, 400);
assert.equal(response.row.latitude, 38);
response = await endpoint('unrequested', {request_id: 'f'.repeat(32)});
assert.equal(response.response.accepted, false);
assert.equal(response.row.latitude, 38);
console.log(`PASS: ${httpChecks} recovery HTTP endpoint cases`);
