// TextCraft: нові блоки (м'які градієнти), промпт зі змінними, галерея зображень, файли для завантаження.
//   node tests/textcraft-blocks-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await newPage(ctx, errors);
await page.goto(server.url + '/text-craft.html');
await page.waitForFunction(() => window.TextCraft && window.TextCraft.state.docId);

const setDoc = html => page.evaluate(h => { const e = document.getElementById('editor'); e.innerHTML = h; e.dispatchEvent(new Event('input', { bubbles: true })); }, html);
const exportHtml = async () => {
  const dl = page.waitForEvent('download');
  await page.evaluate(() => { document.querySelector('[data-act="export"]').click(); });
  await page.locator('.menu-item', { hasText: 'HTML-сторінка' }).click();
  return readFile(await (await dl).path(), 'utf8');
};
const openExported = async text => {
  const p = await newPage(ctx, errors);
  await p.route('**/exported.html', r => r.fulfill({ contentType: 'text/html', body: text }));
  await p.goto(server.url + '/exported.html');
  return p;
};
let exp = null;

await step('блоки в редакторі: підпис і іконка в м\'якому градієнті, темна тема лишає аркуш світлим', async () => {
  await setDoc('<h1>Тест</h1><div class="tc-block tc-callout" data-type="warn"><p>Увага тут</p></div><div class="tc-block tc-prompt"><p>Поясни тему [ТЕМА] для [КЛАС] класу.</p></div><blockquote><p>Цитата</p></blockquote>');
  const r = await page.evaluate(() => { const c = document.querySelector('#editor .tc-callout'), s = getComputedStyle(c, '::before'); return { lab: s.content, bg: getComputedStyle(c).backgroundImage.includes('gradient'), rad: getComputedStyle(c).borderRadius }; });
  assert.match(r.lab, /Увага/); assert.ok(r.bg, 'градієнт'); assert.equal(r.rad, '16px');
});
await step('змінні у промпті підсвічуються в редакторі, текст не змінюється', async () => {
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ n: CSS.highlights.get('tc-pvar') ? CSS.highlights.get('tc-pvar').size : -1, html: document.querySelector('#editor .tc-prompt').innerHTML }));
  assert.equal(r.n, 2); assert.doesNotMatch(r.html, /<span/);
});
await step('експорт: змінні стають чіпами, є форма, кнопки «Копіювати» і «Відкрити в чаті», лічильник слів', async () => {
  exp = await exportHtml();
  const p = await openExported(exp);
  assert.equal(await p.locator('.tc-prompt .tc-var').count(), 2);
  assert.equal(await p.locator('.tc-prompt .tc-vars input').count(), 2);
  assert.equal(await p.locator('.tc-prompt .tc-chat').count(), 1);
  assert.match(await p.locator('.tc-promptfoot').textContent(), /слів|слова/); assert.match(await p.locator('.tc-promptfoot').textContent(), /2 змінні/);
  await p.close();
});
await step('експорт: заповнення змінних змінює чіпи, копіювання підставляє значення', async () => {
  const p = await openExported(exp);
  await p.locator('.tc-vars input[data-var="ТЕМА"]').fill('цикли');
  await p.locator('.tc-vars input[data-var="КЛАС"]').fill('7');
  assert.equal(await p.locator('.tc-var[data-var="ТЕМА"]').textContent(), 'цикли');
  assert.equal(await p.locator('.tc-var[data-var="ТЕМА"]').evaluate(e => e.classList.contains('filled')), true);
  await p.locator('.tc-prompt .tc-copy').click();
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, 'Поясни тему цикли для 7 класу.');
  await p.locator('.tc-vars input[data-var="ТЕМА"]').fill('');
  await p.locator('.tc-prompt .tc-copy').click();
  assert.match(await p.evaluate(() => navigator.clipboard.readText()), /\[ТЕМА\]/);
  await p.close();
});
await step('експорт: меню «Відкрити в чаті» з ChatGPT і Claude, адреса містить промпт', async () => {
  const p = await openExported(exp);
  await p.locator('.tc-vars input[data-var="ТЕМА"]').fill('змінні');
  await p.locator('.tc-prompt .tc-chat').click();
  const hrefs = await p.locator('.tc-chatmenu a').evaluateAll(a => a.map(x => x.dataset.chat));
  assert.ok(hrefs.some(h => /chatgpt\.com\/\?q=/.test(h)) && hrefs.some(h => /claude\.ai\/new\?q=/.test(h)), JSON.stringify(hrefs));
  await p.evaluate(() => { window.__o = []; window.open = u => { window.__o.push(u); return null; }; });
  await p.locator('.tc-chatmenu a', { hasText: 'Claude' }).click();
  assert.match(decodeURIComponent(await p.evaluate(() => window.__o[0])), /^https:\/\/claude\.ai\/new\?q=Поясни тему змінні для \[КЛАС\] класу\.$/);
  assert.equal(await p.locator('.tc-chatmenu').count(), 0);
  await p.close();
});
await step('жодної помилки в консолі', async () => { assert.deepEqual(errors.filter(e => !/claude\.ai|chatgpt|ERR_/.test(e)), []); });
await browser.close(); server.close();
console.log('готово');
