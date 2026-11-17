// Спрайт-редактор: блокування й соло шарів, меню шару, крок сітки, фон, еталон, плитка з переносом, вставка/перетягування картинок, копії.
//   node tests/sprite-extras-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await newPage(ctx, errors);
await page.goto(server.url + '/pixel-editor.html');
await page.waitForTimeout(400);

const S = () => page.evaluate(() => { const s = window.__spriteEditor.state; return { W: s.W, H: s.H, n: s.frames.length, curLayer: s.curLayer, layers: s.layers.map(L => ({ name: L.name, visible: L.visible, locked: !!L.locked, cel: L.cels[s.cur].slice() })) }; });
const pt = (type, x, y) => page.evaluate(([type, x, y]) => {
  const cv = document.getElementById('pixel-canvas'), r = cv.getBoundingClientRect(), v = window.__spriteEditor.state.view;
  cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + v.ox + (x + .5) * v.zoom, clientY: r.top + v.oy + (y + .5) * v.zoom, pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1, button: 0, bubbles: true }));
}, [type, x, y]);
const click = async (x, y) => { await pt('pointerdown', x, y); await pt('pointerup', x, y); };
const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(50); };
const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
const setColor = async hex => { await page.fill('#hex-input', hex); await blur(); await page.waitForTimeout(40); };
const names = () => page.evaluate(() => [...document.querySelectorAll('#layer-list .l-name')].map(e => e.textContent));
const count = c => c.filter(Boolean).length;
const hook = () => page.evaluate(() => {
  window.__dl = []; const orig = URL.createObjectURL.bind(URL), map = new Map();
  URL.createObjectURL = b => { const u = orig(b); map.set(u, b); return u; };
  HTMLAnchorElement.prototype.click = function(){ const b = map.get(this.href); if(this.download && b) b.arrayBuffer().then(ab => window.__dl.push({ name: this.download, bytes: Array.from(new Uint8Array(ab)) })); };
});

await hook();
await step('спрайт 8×8 з двома шарами', async () => {
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200);
  await page.fill('#ns-w', '8'); await page.fill('#ns-h', '8'); await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  await page.click('[data-tab=layers]'); await page.click('#layer-add'); await page.waitForTimeout(80);
  assert.deepEqual(await names(), ['Шар 2', 'Шар 1']);
});
await step('заблокований шар не малюється, не перетворюється і не вставляє', async () => {
  await key('KeyB'); await setColor('#ff0000'); await click(1, 1);
  await page.locator('#layer-list .layer-row').first().hover(); await page.locator('#layer-list .layer-row').first().locator('.l-lock').click(); await page.waitForTimeout(80);
  assert.equal((await S()).layers[1].locked, true);
  await click(3, 3); let s = await S(); assert.equal(count(s.layers[1].cel), 1, 'новий піксель не з’явився');
  await key('Shift+KeyH'); s = await S(); assert.equal(s.layers[1].cel[1 * 8 + 1], '#ff0000', 'дзеркалення не спрацювало на заблокованому');
  await page.locator('#layer-list .layer-row').first().locator('.l-lock').click(); await page.waitForTimeout(80);
  await click(3, 3); s = await S(); assert.equal(count(s.layers[1].cel), 2);
});
await step('заблокований шар зберігається й відновлюється', async () => {
  await page.locator('#layer-list .layer-row').first().locator('.l-lock').click(); await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(500); await page.locator('.tool-card').first().click(); await page.waitForTimeout(500);
  assert.equal((await S()).layers[1].locked, true);
  await page.click('[data-tab=layers]');
  await page.locator('#layer-list .layer-row').first().locator('.l-lock').click(); await page.waitForTimeout(80);
});
await step('Alt+клік по оку: лише цей шар, повторно — усі', async () => {
  await page.locator('#layer-list .layer-row').nth(1).locator('.l-eye').click({ modifiers: ['Alt'] }); await page.waitForTimeout(80);
  let s = await S(); assert.deepEqual(s.layers.map(l => l.visible), [true, false]);
  await page.locator('#layer-list .layer-row').nth(1).locator('.l-eye').click({ modifiers: ['Alt'] }); await page.waitForTimeout(80);
  s = await S(); assert.deepEqual(s.layers.map(l => l.visible), [true, true]);
});
await step('права кнопка по шару: меню, «Опустити нижче» змінює порядок', async () => {
  await page.locator('#layer-list .layer-row').first().click({ button: 'right' }); await page.waitForTimeout(100);
  assert.ok(await page.locator('.pop-item', { hasText: 'Опустити нижче' }).count());
  await page.locator('.pop-item', { hasText: 'Опустити нижче' }).click(); await page.waitForTimeout(100);
  assert.deepEqual(await names(), ['Шар 1', 'Шар 2']);
  await key('Control+z'); assert.deepEqual(await names(), ['Шар 2', 'Шар 1']);
});
await step('фон полотна й крок сітки зберігаються між запусками', async () => {
  await page.click('[data-tab=canvas]');
  await page.click('#bg-dots [data-bg=green]'); await page.selectOption('#major-step', '4'); await page.waitForTimeout(100);
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('edvault-sprite-view')));
  assert.equal(v.bg, 'green'); assert.equal(v.major, 4);
  await page.reload(); await page.waitForTimeout(400); await page.locator('.tool-card').first().click(); await page.waitForTimeout(400);
  await page.click('[data-tab=canvas]');
  assert.equal(await page.inputValue('#major-step'), '4'); assert.equal(await page.locator('#bg-dots [data-bg=green].active').count(), 1);
  await page.click('#bg-dots [data-bg=checker]'); await page.selectOption('#major-step', '8');
});
await step('еталон: розмір і зсув змінюються, прибирання скидає', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#ref-file', { name: 'r.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(250);
  await page.fill('#ref-scale', '200'); assert.equal(await page.textContent('#ref-scale-val'), '200%');
  await page.fill('#ref-x', '2'); await page.press('#ref-x', 'Enter'); await page.waitForTimeout(50);
  await page.click('#ref-remove'); await page.waitForTimeout(80);
  assert.equal(await page.inputValue('#ref-x'), '0'); assert.equal(await page.textContent('#ref-scale-val'), '100%');
});
await step('плитка: мазок через край переноситься на протилежний бік', async () => {
  await page.click('[data-tab=layers]'); await page.locator('#layer-list .layer-row').first().click();
  await page.click('[data-tab=canvas]'); await page.evaluate(() => document.getElementById('tile-toggle').click());
  await key('KeyB'); await page.locator('[data-b="3"]').click(); await setColor('#00aa00');
  await click(0, 0); const s = await S(), c = s.layers[s.curLayer].cel;
  assert.equal(c[0], '#00aa00'); assert.equal(c[7], '#00aa00', 'лівий край → правий'); assert.equal(c[7 * 8], '#00aa00', 'верх → низ'); assert.equal(c[7 * 8 + 7], '#00aa00', 'кут → протилежний кут');
  await key('Control+z'); await page.evaluate(() => document.getElementById('tile-toggle').click());
});
await step('вставка картинки з буфера відкриває імпорт; перетягування файлу — теж', async () => {
  const mk = () => page.evaluate(async () => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = '#f00'; g.fillRect(0, 0, 2, 2); const b = await new Promise(r => c.toBlob(r)); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  const bytes = await mk();
  await page.evaluate(b => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(b)], 'p.png', { type: 'image/png' })); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, bytes);
  await page.waitForTimeout(300); assert.match(await page.locator('.modal-title').textContent(), /Імпорт картинки/);
  await page.locator('[data-x]').click(); await page.waitForTimeout(100);
  await page.evaluate(b => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(b)], 'd.png', { type: 'image/png' })); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, bytes);
  await page.waitForTimeout(300); assert.match(await page.locator('.modal-title').textContent(), /Імпорт картинки/);
  await page.locator('[data-x]').click();
});
await step('копія всіх спрайтів: файл завантажується й відновлюється як масив', async () => {
  await hook();
  await page.click('#back-btn'); await page.waitForTimeout(300);
  await page.click('#add-tile'); await page.waitForTimeout(150); await page.locator('[data-ok]').click(); await page.waitForTimeout(500); await page.click('#back-btn'); await page.waitForTimeout(300);
  const before = await page.locator('.tool-card').count(); assert.ok(before >= 2);
  await page.click('#backup-all-btn'); await page.waitForTimeout(400);
  const d = await page.evaluate(() => window.__dl[window.__dl.length - 1]); assert.match(d.name, /^edvault-sprites-.*\.json$/);
  const data = JSON.parse(Buffer.from(d.bytes).toString('utf8')); assert.equal(data.sprites.length, before);
  await page.evaluate(async txt => { await window.__spriteEditor.importBackup(new File([txt], 'all.json', { type: 'application/json' })); }, JSON.stringify(data));
  await page.waitForTimeout(200); assert.equal(await page.locator('.tool-card').count(), before * 2);
});
assert.deepEqual(errors, [], 'помилки консолі: ' + errors.join('; '));
await browser.close(); server.close();
console.log('готово');
