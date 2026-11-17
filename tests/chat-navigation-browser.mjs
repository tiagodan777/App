// Browser regression tests: real DOM/CSS, history, animations and touch events.
// No production server, account, database or message is used.
// npm install --no-save --prefix /tmp/margot-browser playwright
// MARGOT_PLAYWRIGHT_MODULE=/tmp/margot-browser/node_modules/playwright/index.mjs \
// MARGOT_BROWSER_EXECUTABLE=/path/to/chrome node tests/chat-navigation-browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, webkit } = await import(process.env.MARGOT_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let delay = 0;
let assetDelay = 0;
const requests = [];
const rows = Array.from({ length: 20 }, (_, i) => ({
  chat_url: `/messages/${i + 1}`, outro_id: i + 1, id: i + 1,
  outro_nome: `Pessoa ${i + 1}`, resumo: 'Uma conversa de teste',
  outro_foto_url: '/avatar.svg', criada_em: '2026-11-17 10:00:00', nao_lidas: 0
}));
const script = name => `<script src="/js/${name}.js"></script>`;
const style = name => `<link rel="stylesheet" data-margot-page-style href="/estilos/${name}.css">`;
// Reuse the actual chat chrome; a simplified fixture missed layout jumps.
const header = (await readFile(resolve(root, 'templates/partials/chat-header.html'), 'utf8'))
  .replaceAll('{{ doc_root }}', '/').replaceAll('{{ outro.perfil_url }}', '/profile/1')
  .replaceAll('{{ outro.foto_url }}', '/avatar.svg').replaceAll('{{ outro.nome }}', 'Pessoa 1');
const composer = (await readFile(resolve(root, 'templates/partials/chat-composer.html'), 'utf8'))
  .replaceAll('{{ doc_root }}', '/').replaceAll('{{ outro.id }}', '1');
function html(path) {
  const chat = /^\/messages\/\d+/.test(path);
  const list = path === '/messages';
  const content = chat ? `<main id="chat-pagina" class="chat-pagina">
    ${header}
    <section id="chat-mensagens" class="chat-mensagens"><div id="chat-mensagens-conteudo">
      ${Array.from({ length: 18 }, (_, i) => `<article class="chat-mensagem"><div class="chat-balao">Mensagem ${i}</div></article>`).join('')}
    </div></section>${composer}
    </main>${script('chat-test-ready')}${script('chat-viewport')}<script>
      document.getElementById('chat-enviar').hidden = true;
      (() => { const stop = MargotChatViewport(document.getElementById('chat-pagina'),document.getElementById('chat-mensagens'),document.getElementById('chat-mensagens-conteudo'));
      document.addEventListener('margot:page-leave',()=>stop.destroy(),{once:true});
      })();
    </script>` : list ? `<main id="mensagens-pagina" class="mensagens-pagina"><div class="mensagens-conteudo">
    <header class="mensagens-cabecalho"><h1>Mensagens</h1></header><section id="conversas-lista" class="conversas-lista">
    ${rows.map(r => `<a class="conversa-item" href="${r.chat_url}" data-membro-id="${r.outro_id}"><span class="conversa-foto-caixa"><img src="/avatar.svg" alt=""></span><span class="conversa-conteudo"><strong>${r.outro_nome}</strong><span>${r.resumo}</span></span></a>`).join('')}
    </section><p id="conversas-erro" hidden></p></div></main>${script('messages')}` : '<main id="other-page">Outra página</main>';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste Margot</title>
    <style>body{margin:0;font:16px Arial}*{box-sizing:border-box}#menuPrincipal{position:fixed;bottom:0;width:100%;padding:20px;background:#eee}body:has(#chat-pagina) #menuPrincipal{display:none}</style>
    <link rel="stylesheet" href="/estilos/style.css"><link rel="stylesheet" href="/estilos/theme.css"><link rel="stylesheet" href="/estilos/app-interactions.css">
    <link rel="stylesheet" href="/estilos/chat.css">${chat ? '' : style('messages')}${script('jquery-4.0.0')}</head><body>
    ${script('app-interactions')}
    <div data-margot-pagina>${content}</div><nav id="menuPrincipal"><a href="/index">Início</a><a href="/messages">Mensagens</a></nav>
    <script>window.membroId=1;window.messagesUrl='/messages';window.requestIdleCallback=()=>0;</script>
    <template id="margot-chat-opening-template">${header}<section class="chat-mensagens" inert><p role="status"></p></section>${composer}</template>
    <template id="margot-chat-resources">${script('chat-viewport')}</template>
    ${script('experience-feedback')}${script('javascript-geral')}${script('margot-gesture-feedback')}
    </body></html>`;
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    requests.push(url.pathname + url.search);
    if (url.pathname === '/avatar.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="30" cy="30" r="30" fill="#f59"/></svg>');
    } else if (url.searchParams.get('api') === 'conversations') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, conversations: rows }));
    } else if (url.pathname === '/js/chat-test-ready.js') {
      await new Promise(r => setTimeout(r, assetDelay));
      res.setHeader('Content-Type', 'text/javascript');
      res.end('/* fixture: optional chat dependency */');
    } else if (/^\/(js|estilos)\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) {
      res.setHeader('Content-Type', extname(url.pathname) === '.js' ? 'text/javascript' : 'text/css');
      res.end(await readFile(resolve(root, 'public', '.' + url.pathname)));
    } else if (url.pathname === '/favicon.ico') {
      res.writeHead(204).end();
    } else {
      if (req.headers['x-requested-with']) await new Promise(r => setTimeout(r, delay));
      res.setHeader('Content-Type', 'text/html');
      res.end(html(url.pathname));
    }
  } catch (error) { res.writeHead(404).end(String(error)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.MARGOT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless: true, ...(process.env.MARGOT_BROWSER_EXECUTABLE ? { executablePath: process.env.MARGOT_BROWSER_EXECUTABLE } : {}) });
const errors = [];
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
async function fresh(options = {}) {
  delay = 0;
  assetDelay = 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...options });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.motionLog = [];
    window.openingLog = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.id === 'chat-pagina') motionLog.push({ frames, options });
      if (this.hasAttribute('data-margot-chat-opening')) openingLog.push({ frames, options });
      return original.call(this, frames, options);
    };
  });
  await page.goto(origin + '/messages');
  return page;
}
async function settled(page, path) {
  await page.waitForFunction(path => location.pathname === path && !document.body.hasAttribute('aria-busy') &&
    !document.querySelector('[data-margot-back-preview], [data-margot-chat-opening]'), path);
}
async function open(page) {
  await page.locator('.conversa-item').first().tap();
  await settled(page, '/messages/1');
}
async function touch(page, type, x, y = 320, selector = '#chat-mensagens') {
  await page.evaluate(({ type, x, y, selector }) => {
    const target = document.querySelector(selector);
    const data = { identifier: 7, target, clientX: x, clientY: y };
    let event;
    try {
      const point = new Touch(data);
      event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' || type === 'touchcancel' ? [] : [point], changedTouches: [point] });
    } catch (_) {
      // Desktop WebKit exposes touch events but does not construct Touch objects.
      event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [data] },
        changedTouches: { value: [data] }
      });
    }
    target.dispatchEvent(event);
  }, { type, x, y, selector });
}
const left = page => page.locator('#chat-pagina').evaluate(e => e.getBoundingClientRect().left);
async function idleGesture(page) { await page.waitForFunction(() => !document.querySelector('[data-margot-back-preview]')); }
try {
  let page = await fresh();
  await check('preloading fetches static scripts once without opening or reading a conversation', async () => {
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('/js/chat-viewport.js')));
    assert.equal(await page.evaluate(() => typeof window.MargotChatViewport), 'undefined');
    assert.equal(requests.some(url => /^\/messages\/\d+/.test(url)), false);
  });
  await check('entry slides from right, no duplicate chat or loading overlay', async () => {
    await open(page);
    const log = await page.evaluate(() => openingLog);
    assert.equal(log.length, 1);
    assert.match(log[0].frames[0].transform, /100vw/);
    assert.equal(log[0].frames[1].transform, 'translateX(-50%)');
    assert.equal(await page.evaluate(() => motionLog.length), 0, 'Chat does not slide a second time');
    assert.equal(await page.locator('#chat-pagina').count(), 1);
    assert.equal(await page.locator('#margot-page-loading').isVisible(), false);
    assert.equal(requests.filter(url => url === '/js/chat-viewport.js').length, 1);
  });
  await check('drag follows finger, reveals list and survives keyboard/height resize', async () => {
    await touch(page, 'touchstart', 60);
    await touch(page, 'touchmove', 170);
    assert.ok(Math.abs(await left(page) - 110) < 2);
    assert.equal(await page.locator('[data-margot-back-preview]').count(), 1);
    assert.equal(await page.locator('[data-margot-back-preview] nav').count(), 1);
    assert.equal(await page.locator('[data-margot-back-preview] [id]').count(), 0);
    const visibleLayers = await page.evaluate(() => {
      const preview = document.querySelector('[data-margot-back-preview]');
      preview.inert = false;
      preview.style.pointerEvents = 'auto';
      try {
        return [40, 250].map(x => {
          const target = document.elementFromPoint(x, 300);
          if (target?.closest('#chat-pagina')) return 'chat';
          if (target?.closest('[data-margot-back-preview]')) return 'list';
          return 'other';
        });
      } finally {
        preview.inert = true;
        preview.style.pointerEvents = 'none';
      }
    });
    assert.deepEqual(visibleLayers, ['list', 'chat']);
    await page.setViewportSize({ width: 390, height: 650 });
    await page.evaluate(() => visualViewport.dispatchEvent(new Event('resize')));
    assert.ok(Math.abs(await left(page) - 110) < 2);
    if (process.env.MARGOT_TEST_ARTIFACTS) {
      await mkdir(process.env.MARGOT_TEST_ARTIFACTS, { recursive: true });
      await page.screenshot({ path: resolve(process.env.MARGOT_TEST_ARTIFACTS, 'chat-drag.png') });
    }
    await touch(page, 'touchcancel', 170);
    await idleGesture(page);
    assert.ok(Math.abs(await left(page)) < 2);
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await check('short slow swipe returns to chat', async () => {
    await touch(page, 'touchstart', 60);
    await touch(page, 'touchmove', 100);
    await page.waitForTimeout(160);
    await touch(page, 'touchend', 100);
    await idleGesture(page);
    assert.equal(new URL(page.url()).pathname, '/messages/1');
    assert.ok(Math.abs(await left(page)) < 2);
  });
  await check('reversing a long swipe cancels instead of navigating', async () => {
    await touch(page, 'touchstart', 60);
    await touch(page, 'touchmove', 300);
    await page.waitForTimeout(140);
    await touch(page, 'touchmove', 295);
    await page.waitForTimeout(20);
    await touch(page, 'touchmove', 205);
    await touch(page, 'touchend', 195);
    await idleGesture(page);
    assert.equal(new URL(page.url()).pathname, '/messages/1');
    assert.ok(Math.abs(await left(page)) < 2);
  });
  await check('quick short swipe commits once; synthetic click cannot reopen chat', async () => {
    await touch(page, 'touchstart', 60);
    await touch(page, 'touchmove', 125);
    await touch(page, 'touchend', 140);
    await settled(page, '/messages');
    await page.locator('.conversa-item').first().evaluate(e => e.click());
    await page.waitForTimeout(200);
    assert.equal(new URL(page.url()).pathname, '/messages');
    assert.equal(await page.evaluate(() => history.state.margotPosition), 0);
  });
  await check('a deliberate new tap opens chat, back button animates right', async () => {
    await open(page);
    const count = await page.evaluate(() => motionLog.length);
    await page.locator('[data-margot-voltar]').tap();
    await settled(page, '/messages');
    const log = await page.evaluate(() => motionLog);
    assert.equal(log.length, count + 1);
    assert.match(log.at(-1).frames[1].transform, /390px/);
    assert.equal(await page.evaluate(() => history.state.margotPosition), 0);
  });
  await check('browser forward/back preserves route and history without duplicate list entries', async () => {
    await page.evaluate(() => history.forward());
    await settled(page, '/messages/1');
    await page.evaluate(() => history.back());
    await settled(page, '/messages');
    assert.equal(await page.evaluate(() => history.state.margotPosition), 0);
  });
  await check('vertical scroll, message bubbles and composer do not dismiss the chat', async () => {
    await open(page);
    for (const selector of ['#chat-mensagens', '.chat-balao', 'textarea']) {
      await touch(page, 'touchstart', 60, 320, selector);
      await touch(page, 'touchmove', selector === '#chat-mensagens' ? 65 : 300, 500, selector);
      await touch(page, 'touchend', 300, 500, selector);
      assert.equal(await page.locator('[data-margot-back-preview]').count(), 0);
    }
    assert.equal(new URL(page.url()).pathname, '/messages/1');
  });
  await check('repeated cancelled swipes release styles and leave the chat usable', async () => {
    for (let i = 0; i < 4; i++) {
      await touch(page, 'touchstart', 40);
      await touch(page, 'touchmove', 60);
      await touch(page, 'touchend', 60);
      await idleGesture(page);
    }
    assert.equal(await page.locator('#chat-pagina').evaluate(e => e.style.transform), '');
    assert.equal(await page.locator('#chat-pagina').evaluate(e => e.style.boxShadow), '');
    await page.locator('textarea').fill('Ainda consigo escrever');
    assert.equal(await page.locator('textarea').inputValue(), 'Ainda consigo escrever');
  });
  await page.context().close();
  page = await fresh();
  await check('back during entry animation finishes on the list without duplicating history', async () => {
    await page.evaluate(() => { void MargotNavigation.navigate('/messages/1', { historico: 'push' }); });
    await page.waitForFunction(() => motionLog.length > 0);
    await page.locator('[data-margot-voltar]').evaluate(e => e.click());
    await settled(page, '/messages');
    assert.equal(await page.evaluate(() => history.state.margotPosition), 0);
  });
  await page.context().close();
  page = await fresh();
  await check('list scroll position is preserved in preview and after going back', async () => {
    assert.equal(await page.locator('#mensagens-pagina').evaluate(e => getComputedStyle(e).scrollbarWidth), 'none');
    await page.locator('#mensagens-pagina').evaluate(e => { e.scrollTop = 400; });
    const scroll = await page.locator('#mensagens-pagina').evaluate(e => e.scrollTop);
    assert.ok(scroll > 0, 'The list still scrolls with its scrollbar hidden');
    const row = '[href="/messages/8"]';
    const liveTop = await page.locator('#conversas-lista ' + row).evaluate(e => e.getBoundingClientRect().top);
    await page.evaluate(() => MargotNavigation.navigate('/messages/1', { historico: 'push' }));
    await touch(page, 'touchstart', 40);
    await touch(page, 'touchmove', 180);
    assert.equal(await page.locator('[data-margot-back-preview] .mensagens-pagina').evaluate(e => e.scrollTop), scroll);
    const previewRow = page.locator('[data-margot-back-preview] ' + row);
    assert.match(await previewRow.textContent(), /Pessoa 8/);
    assert.ok(Math.abs(await previewRow.evaluate(e => e.getBoundingClientRect().top) - liveTop) <= 1);
    await page.waitForTimeout(150);
    await touch(page, 'touchend', 180);
    await settled(page, '/messages');
    assert.equal(await page.locator('#mensagens-pagina').evaluate(e => e.scrollTop), scroll);
  });
  await page.context().close();
  page = await fresh();
  await check('a directly loaded chat can still go back when there is no list snapshot', async () => {
    await page.goto(origin + '/messages/1');
    await page.locator('[data-margot-voltar]').tap();
    await settled(page, '/messages');
  });
  if (engine === chromium) {
    await page.context().close();
    page = await fresh();
    await check('browser-dispatched touch input drags and dismisses from blank space', async () => {
      await open(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 15, y: 550 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 550 }] });
      assert.ok(await left(page) > 50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y: 550 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settled(page, '/messages');
      await cdp.detach();
    });
  }
  await page.context().close();
  page = await fresh();
  await check('chat slides in while the 650ms response is still pending', async () => {
    delay = 650;
    const openingStartedOnClick = await page.locator('.conversa-item').first().evaluate(link => {
      link.click();
      return openingLog.length === 1 && location.pathname === '/messages';
    });
    assert.ok(openingStartedOnClick);
    const opening = page.locator('[data-margot-chat-opening]');
    assert.equal(await opening.locator('strong').textContent(), 'Pessoa 1');
    await page.waitForFunction(() => {
      const stage = document.querySelector('[data-margot-chat-opening]');
      return stage && stage.getBoundingClientRect().left < 350;
    });
    assert.equal(await page.locator('#chat-pagina').count(), 0);
    assert.equal(await page.locator('#margot-page-loading').isVisible(), false);
    await settled(page, '/messages/1');
    assert.equal(await page.evaluate(() => motionLog.length), 0);
    assert.equal(await page.locator('#margot-page-loading').isVisible(), false);
  });
  await page.context().close();
  page = await fresh();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await check(`header and composer keep their geometry and colour (${colorScheme})`, async () => {
      delay = 900;
      await page.locator('.conversa-item').first().tap();
      await page.waitForFunction(() => !document.querySelector('[data-margot-chat-opening]').getAnimations().some(a => a.playState === 'running'));
      const measure = selector => page.locator(selector).evaluate(root => {
        const selectors = ['.chat-cabecalho', '.chat-voltar', '.chat-pessoa img', '.chat-pessoa strong', '.chat-pessoa small', '.chat-form', '.chat-compositor', 'textarea'];
        return selectors.map(selector => {
          const el = root.querySelector(selector), rect = el.getBoundingClientRect(), css = getComputedStyle(el);
          return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, color: css.color, background: css.backgroundColor };
        });
      });
      const before = await measure('[data-margot-chat-opening]');
      assert.equal(await page.locator('[data-margot-chat-opening] [id]').count(), 0);
      assert.equal(await page.evaluate(() => document.elementFromPoint(180, innerHeight - 40)?.closest('[data-margot-chat-opening]') !== null), true, 'Opening covers the bottom navigation');
      await settled(page, '/messages/1');
      const after = await measure('#chat-pagina');
      before.forEach((box, i) => {
        for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(box[key] - after[i][key]) < 1, `${i} ${key}: ${box[key]} -> ${after[i][key]}`);
        assert.equal(box.color, after[i].color, `element ${i} color`);
        assert.equal(box.background, after[i].background, `element ${i} background`);
      });
      await page.locator('[data-margot-voltar]').tap();
      await settled(page, '/messages');
    });
  }
  await page.context().close();
  page = await fresh();
  await check('authorized messages appear before slow chat dependencies finish loading', async () => {
    assetDelay = 1000;
    await page.locator('.conversa-item').first().tap();
    await page.waitForSelector('[data-margot-chat-opening] .chat-mensagem');
    assert.equal(await page.locator('#chat-pagina').count(), 0);
    assert.equal(await page.locator('[data-margot-chat-opening] .chat-mensagem').count(), 18);
    assert.equal(await page.locator('[data-margot-chat-opening] .chat-mensagens').evaluate(e => e.inert && getComputedStyle(e).opacity === '1'), true);
    await settled(page, '/messages/1');
  });
  await page.context().close();
  page = await fresh();
  await check('back cancels a pending chat without opening it or changing history', async () => {
    delay = 1000;
    await page.locator('.conversa-item').first().tap();
    await page.locator('[data-margot-cancel-chat]').tap();
    await settled(page, '/messages');
    assert.equal(await page.evaluate(() => history.state.margotPosition), 0);
    assert.equal(await page.locator('#chat-pagina').count(), 0);
    delay = 0;
    await open(page);
  });
  await page.context().close();
  page = await fresh();
  await check('genuinely slow request shows skeleton and restores interactive page afterwards', async () => {
    delay = 1400;
    await page.evaluate(() => { void MargotNavigation.navigate('/messages/1', { historico: 'push' }); });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#margot-page-loading').isVisible(), true);
    assert.equal(await page.locator('[data-margot-pagina]').evaluate(e => e.inert), true);
    await settled(page, '/messages/1');
    assert.equal(await page.locator('#margot-page-loading').isVisible(), false);
    assert.equal(await page.locator('[data-margot-pagina]').evaluate(e => e.inert), false);
  });
  await page.context().close();
  page = await fresh({ reducedMotion: 'reduce' });
  await check('reduced motion avoids entry/exit animations while preserving navigation', async () => {
    await open(page);
    await page.locator('[data-margot-voltar]').tap();
    await settled(page, '/messages');
    assert.equal(await page.evaluate(() => motionLog.length), 0);
  });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`${checks} browser scenarios passed (${process.env.MARGOT_BROWSER || 'chromium'}).`);
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
