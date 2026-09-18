import { testChatViewport } from './chat-viewport-tests.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { testChat } from './chat-tests.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = execFileSync('php', [root + '/tests/chat-render.php'], {
    encoding: 'utf8'
});

console.log(
    `OK: ${await testChat(JSDOM, html, root)} verificações do chat (DOM/rede/sensores simulados).`
);

console.log(
    'OK:',
    await testChatViewport(JSDOM, root),
    'viewport/haptic checks (simulated).'
);