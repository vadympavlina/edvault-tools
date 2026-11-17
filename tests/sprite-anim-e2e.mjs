// Спрайт-редактор: тривалість кадрів, теги, напрямок, калька, плитка, експорт (GIF, аркуш+JSON, zip), імпорт аркуша, резервна копія.
//   node tests/sprite-anim-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await newPage(ctx, errors);
await page.goto(server.url + '/pixel-editor.html');
await page.waitForTimeout(400);

const A = () => page.evaluate(() => window.__spriteEditor.anim);
const S = () => page.evaluate(() => { const s = window.__spriteEditor.state; return { W: s.W, H: s.H, cur: s.cur, n: s.frames.length, undo: s.undo }; });
const pt = (type, x, y) => page.evaluate(([type, x, y]) => {
  const cv = document.getElementById('pixel-canvas'), r = cv.getBoundingClientRect(), v = window.__spriteEditor.state.view;
  cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + v.ox + (x + .5) * v.zoom, clientY: r.top + v.oy + (y + .5) * v.zoom, pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1, button: 0, bubbles: true }));
}, [type, x, y]);
const click = async (x, y) => { await pt('pointerdown', x, y); await pt('pointerup', x, y); };
const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(50); };
const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
// перехоплюємо завантаження: ім'я і байти
const hook = () => page.evaluate(() => {
  window.__dl = [];
  const orig = URL.createObjectURL.bind(URL); const map = new Map();
  URL.createObjectURL = b => { const u = orig(b); map.set(u, b); return u; };
  HTMLAnchorElement.prototype.click = function(){ const b = map.get(this.href); if(this.download){ b.arrayBuffer().then(ab => window.__dl.push({ name: this.download, bytes: Array.from(new Uint8Array(ab)) })); } };
});
await hook();
const lastDl = async () => { await page.waitForTimeout(400); return page.evaluate(() => window.__dl[window.__dl.length - 1]); };
const latin = bytes => Buffer.from(bytes).toString('latin1');

await step('новий спрайт 8×8 з трьома кадрами, у кожному по пікселю', async () => {
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200);
  await page.fill('#ns-w', '8'); await page.fill('#ns-h', '8'); await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  await key('KeyB'); await page.fill('#hex-input', '#ff0000'); await blur(); await click(1, 1);
  await key('KeyN'); await page.fill('#hex-input', '#00ff00'); await blur(); await click(2, 2);
  await key('KeyN'); await page.fill('#hex-input', '#0000ff'); await blur(); await click(3, 3);
  assert.equal((await S()).n, 3);
  assert.deepEqual((await A()).seq, [0, 1, 2]);
});
await step('тривалість кадру: за замовчуванням 125 мс (8 кадр/с), змінюємо поточний кадр на 400', async () => {
  assert.equal(await page.inputValue('#fdur'), '125');
  await page.fill('#fdur', '400'); await page.press('#fdur', 'Enter'); await page.waitForTimeout(150);
  assert.deepEqual((await A()).durs.slice(0, 3), [0, 0, 400]);
  assert.equal(await page.locator('.frame-dur').count(), 1);
  assert.match(await page.locator('#frames-info').textContent(), /3 кадри · 0,65 с/);
});
await step('скасування повертає тривалість, повтор — знову ставить', async () => {
  await key('Control+z'); assert.deepEqual((await A()).durs.filter(Boolean), []);
  await key('Control+y'); assert.deepEqual((await A()).durs.filter(Boolean), [400]);
});
await step('«Всім» ставить однакову тривалість усім кадрам', async () => {
  await page.fill('#fdur', '200'); await blur(); await page.click('#fdur-all'); await page.waitForTimeout(100);
  assert.deepEqual((await A()).durs.slice(0, 3), [200, 200, 200]);
  await page.fill('#fdur', '125'); await blur(); await page.click('#fdur-all'); await page.waitForTimeout(100);
  assert.deepEqual((await A()).durs.slice(0, 3), [0, 0, 0], '125 = типове значення, не зберігається');
});
await step('порядок «Туди-назад» будує послідовність 0,1,2,1; «Назад» — 2,1,0', async () => {
  await page.click('#dir-seg [data-d=pp]'); assert.deepEqual((await A()).seq, [0, 1, 2, 1]);
  await page.click('#dir-seg [data-d=rev]'); assert.deepEqual((await A()).seq, [2, 1, 0]);
  await page.click('#dir-seg [data-d=fwd]'); assert.deepEqual((await A()).seq, [0, 1, 2]);
});
await step('тег «Ходьба» на кадрах 1–2 туди-назад: чіп, смужка під кадрами, активація звужує відтворення', async () => {
  await page.click('#tag-list .mini-btn'); await page.waitForTimeout(150);
  await page.fill('#tg-name', 'Ходьба'); await page.fill('#tg-from', '1'); await page.fill('#tg-to', '2');
  await page.click('#tg-dir [data-d=pp]'); await page.locator('[data-ok]').click(); await page.waitForTimeout(150);
  const a = await A();
  assert.equal(a.tags.length, 1); assert.deepEqual([a.tags[0].name, a.tags[0].from, a.tags[0].to, a.tags[0].dir], ['Ходьба', 0, 1, 'pp']);
  assert.equal(a.activeTag, a.tags[0].id); assert.deepEqual(a.seq, [0, 1], 'пінг-понг з двох кадрів — просто 0,1');
  assert.equal(await page.locator('.tag-chip').count(), 1);
  assert.equal(await page.locator('.frame-tagbar:not(.none)').count(), 2);
  await page.click('.tag-chip .tag-pick'); assert.deepEqual((await A()).seq, [0, 1, 2]);
});
await step('теги йдуть за кадрами: вставка перед ним зсуває, видалення першого кадру стискає, скасування повертає', async () => {
  await page.locator('.frame-thumb').nth(0).click(); await key('KeyN'); // новий кадр після першого → тег розтягується
  let t = (await A()).tags[0]; assert.deepEqual([t.from, t.to], [0, 2]);
  await key('Control+z'); t = (await A()).tags[0]; assert.deepEqual([t.from, t.to], [0, 1]);
  await page.locator('.frame-item').nth(0).hover(); await page.locator('.frame-item').nth(0).locator('.fa-del').click(); await page.waitForTimeout(100);
  t = (await A()).tags[0]; assert.deepEqual([t.from, t.to], [0, 0]);
  await key('Control+z'); t = (await A()).tags[0]; assert.deepEqual([t.from, t.to], [0, 1]); assert.equal((await S()).n, 3);
});
await step('збереження й відновлення: тривалості, теги, порядок переживають перезавантаження', async () => {
  await page.fill('#fdur', '300'); await page.press('#fdur', 'Enter'); await page.click('#dir-seg [data-d=pp]');
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(500);
  await page.locator('.tool-card').first().click(); await page.waitForTimeout(500);
  const a = await A(); assert.equal(a.durs.filter(v => v === 300).length, 1); assert.equal(a.tags.length, 1); assert.equal(a.dir, 'pp'); assert.equal(a.tags[0].name, 'Ходьба');
  await hook();
});
await step('калька: налаштування кроків і плитка вмикаються без помилок', async () => {
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  await page.fill('#onion-b', '2'); await page.fill('#onion-a', '0'); await page.press('#onion-a', 'Tab'); await page.waitForTimeout(80);
  const a = await A(); assert.equal(a.onionB, 2); assert.equal(a.onionA, 0);
  await page.click('#onion-btn'); await page.evaluate(() => document.getElementById('tile-toggle').click()); await page.waitForTimeout(100);
  assert.equal((await A()).tile, true);
  await page.evaluate(() => document.getElementById('tile-toggle').click()); await page.click('#onion-btn');
});
await step('експорт GIF: тривалість кожного кадру у файлі, порядок за режимом', async () => {
  await page.click('#export-btn'); await page.waitForTimeout(200);
  await page.click('#ex-kind [data-k=gif]'); await page.waitForTimeout(200);
  assert.match(await page.locator('#ex-info').textContent(), /кадр.*·.*с/);
  await page.locator('[data-ok]').click(); const d = await lastDl(); assert.match(d.name, /\.gif$/);
  // у GIF керуючі блоки 21 F9 04 .. затримка (сотих секунди)
  const b = d.bytes, delays = [];
  for(let i = 0; i < b.length - 7; i++) if(b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 4) delays.push(b[i + 4] | (b[i + 5] << 8));
  assert.ok(delays.length >= 3 && delays.includes(30), 'є кадр 300 мс: ' + delays.join(','));
});
await step('експорт аркуша з JSON: у zip є PNG і JSON з тривалістю й тегами', async () => {
  await page.click('#ex-kind [data-k=sheet]'); await page.waitForTimeout(150);
  await page.fill('#ex-pad', '2'); await page.evaluate(() => document.getElementById('ex-json').click()); await page.waitForTimeout(100);
  await page.locator('[data-ok]').click(); const d = await lastDl(); assert.match(d.name, /-sheet\.zip$/);
  const txt = latin(d.bytes);
  assert.ok(txt.includes('-sheet.png') && txt.includes('-sheet.json'));
  const u8 = Buffer.from(d.bytes).toString('utf8');
  const j = JSON.parse(u8.slice(u8.indexOf('{\n  "meta"'), u8.lastIndexOf('}') + 1).match(/^[\s\S]*?\n}\n?/)[0].trim());
  assert.equal(j.frames.length, 3); assert.equal(j.meta.spacing, 2); assert.equal(j.frames[1].frame.x, 8 * j.meta.scale + 2);
  assert.ok(j.frames.some(f => f.duration === 300)); assert.equal(j.tags[0].name, 'Ходьба'); assert.equal(j.tags[0].direction, 'pingpong');
});
await step('експорт послідовності PNG у zip: файли _001…, діапазон за тегом', async () => {
  await page.click('#ex-kind [data-k=seq]'); await page.waitForTimeout(150);
  await page.click('#ex-range [data-r]:not([data-r=all])'); await page.waitForTimeout(100);
  await page.locator('[data-ok]').click(); const d = await lastDl(); assert.match(d.name, /-ходьба-png\.zip$/);
  const txt = latin(d.bytes); assert.ok(/_001\.png/.test(txt) && /_002\.png/.test(txt) && !/_003\.png/.test(txt), 'лише 2 кадри тегу');
  await page.locator('[data-x]').click();
});
await step('імпорт аркуша кадрів: 3 клітинки 8×8, порожня пропускається', async () => {
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 32; c.height = 8; const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(1, 1, 2, 2); g.fillStyle = '#00ff00'; g.fillRect(8 + 3, 3, 2, 2); g.fillStyle = '#0000ff'; g.fillRect(24 + 5, 5, 2, 2); return c.toDataURL('image/png').split(',')[1]; });
  await page.click('#back-btn'); await page.waitForTimeout(200);
  await page.locator('.tool-card').first().click(); await page.waitForTimeout(400);
  await page.setInputFiles('#import-input', { name: 'sheet.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await page.waitForTimeout(300);
  await page.click('#im-sheet'); await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#sh-c'), '4'); assert.equal(await page.inputValue('#sh-r'), '1');
  assert.match(await page.locator('#sh-info').textContent(), /Кадр 8×8/);
  await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  const s = await S(); assert.equal(s.W, 8); assert.equal(s.n, 3, 'четверта клітинка порожня й пропущена');
  assert.equal(await page.inputValue('#sprite-name'), 'sheet');
});
await step('немає місця у браузері: пропонується копія файлом, яку можна повернути імпортом', async () => {
  await page.evaluate(() => { const o = Storage.prototype.setItem; window.__setItem = o; Storage.prototype.setItem = function(k, v){ if(k === 'edvault-sprites') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
  await key('KeyB'); await page.fill('#hex-input', '#123456'); await blur(); await click(0, 0);
  await page.waitForTimeout(1200);
  assert.match(await page.locator('.modal-title').textContent(), /закінчилося місце/);
  await page.locator('[data-ok]').click(); const d = await lastDl(); assert.match(d.name, /\.edvault-sprite\.json$/);
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  const rec = Buffer.from(d.bytes).toString('utf8');
  await page.evaluate(async r => { await window.__spriteEditor.importBackup(new File([r], 'x.json', { type: 'application/json' })); }, rec);
  await page.click('#back-btn'); await page.waitForTimeout(300);
  assert.ok(await page.locator('.tool-card').count() >= 3);
});
assert.deepEqual(errors, [], 'помилки консолі: ' + errors.join('; '));
await browser.close(); server.close();
console.log('готово');
