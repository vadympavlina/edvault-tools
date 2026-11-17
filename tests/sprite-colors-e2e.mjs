// Спрайт-редактор: рампи кольорів, імпорт палітр (.hex/.gpl/Lospec), палітра з малюнка, еталонне зображення.
//   node tests/sprite-colors-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await newPage(ctx, errors);
await page.goto(server.url + '/pixel-editor.html');
await page.waitForTimeout(400);

const S = () => page.evaluate(() => { const s = window.__spriteEditor.state; return { color: s.color, layers: s.layers.map(L => L.cels.map(c => c.slice())) }; });
const pt = (type, x, y) => page.evaluate(([type, x, y]) => {
  const cv = document.getElementById('pixel-canvas'), r = cv.getBoundingClientRect(), v = window.__spriteEditor.state.view;
  cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + v.ox + (x + .5) * v.zoom, clientY: r.top + v.oy + (y + .5) * v.zoom, pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1, button: 0, bubbles: true }));
}, [type, x, y]);
const click = async (x, y) => { await pt('pointerdown', x, y); await pt('pointerup', x, y); };
const setColor = async hex => { await page.fill('#hex-input', hex); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(40); };
const ramp = () => page.evaluate(() => [...document.querySelectorAll('#ramp-row button')].map(b => getComputedStyle(b).backgroundColor));
const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const lum = c => { const m = c.match(/\d+/g).map(Number); return .3 * m[0] + .59 * m[1] + .11 * m[2]; };

await step('новий спрайт 8×8', async () => {
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200);
  await page.fill('#ns-w', '8'); await page.fill('#ns-h', '8'); await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
});
await step('рампа: 7 відтінків, середній — поточний колір, від темних до світлих', async () => {
  await setColor('#d9602e');
  const r = await ramp();
  assert.equal(r.length, 7); assert.equal(r[3], hex2rgb('#d9602e'));
  for(let i = 1; i < 7; i++) assert.ok(lum(r[i]) > lum(r[i - 1]), 'яскравість зростає: ' + r.join(' '));
});
await step('клік по темному відтінку рампи робить його поточним кольором', async () => {
  const r = await ramp();
  await page.locator('#ramp-row button').first().click(); await page.waitForTimeout(60);
  const c = (await S()).color; assert.equal(hex2rgb(c), r[0]);
});
await step('імпорт: вставлені коди Lospec з дублями та сміттям', async () => {
  await page.click('#pal-import'); await page.waitForTimeout(120);
  await page.fill('#pi-text', '1a1c2c\n#5d275d\n#B13E53\n#5d275d\nнічого\n38b764');
  assert.match(await page.locator('[data-ok]').textContent(), /Додати 4/);
  await page.fill('#pi-name', 'Тест'); await page.locator('[data-ok]').click(); await page.waitForTimeout(150);
  assert.equal(await page.locator('#palette-select').inputValue().then(v => v.startsWith('imp-')), true);
  assert.equal(await page.locator('#palette-grid .swatch').count(), 4);
  assert.equal(await page.locator('#pal-del').isVisible(), true);
});
await step('імпорт: файл .gpl і JASC .pal', async () => {
  const gpl = 'GIMP Palette\nName: x\n#\n255 0 0 red\n0 255 0 green\n';
  await page.click('#pal-import'); await page.waitForTimeout(120);
  await page.setInputFiles('#pal-file', { name: 'a.gpl', mimeType: 'text/plain', buffer: Buffer.from(gpl) }); await page.waitForTimeout(150);
  assert.match(await page.locator('[data-ok]').textContent(), /Додати 2/);
  assert.equal(await page.locator('#pi-name').inputValue(), 'a');
  await page.locator('[data-ok]').click(); await page.waitForTimeout(150);
  assert.equal(await page.locator('#palette-grid .swatch').count(), 2);
  const pal = 'JASC-PAL\n0100\n2\n0 0 255\n255 255 0\n';
  await page.click('#pal-import'); await page.waitForTimeout(120);
  await page.setInputFiles('#pal-file', { name: 'b.pal', mimeType: 'text/plain', buffer: Buffer.from(pal) }); await page.waitForTimeout(150);
  assert.match(await page.locator('[data-ok]').textContent(), /Додати 2/);
  await page.locator('[data-ok]').click(); await page.waitForTimeout(150);
});
await step('неправильний текст не дозволяє додати палітру', async () => {
  await page.click('#pal-import'); await page.waitForTimeout(120);
  await page.fill('#pi-text', 'просто слова'); assert.equal(await page.locator('[data-ok]').isDisabled(), true);
  await page.locator('[data-x]').click();
});
await step('імпортовані палітри зберігаються після перезавантаження', async () => {
  await page.reload(); await page.waitForTimeout(500);
  const opts = await page.locator('#palette-select option').allTextContents();
  assert.ok(opts.includes('Тест') && opts.includes('a') && opts.includes('b'), opts.join('|'));
});
await step('після перезавантаження відкриваємо спрайт знову', async () => {
  const card = page.locator('.sprite-card, .tile-card, [data-open]').first();
  if(await card.count()){ await card.click(); await page.waitForTimeout(400); }
  else { await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200); await page.fill('#ns-w', '8'); await page.fill('#ns-h', '8'); await page.locator('[data-ok]').click(); await page.waitForTimeout(500); }
  assert.equal(await page.locator('#palette-select').isVisible(), true);
});
await step('«З малюнка» збирає кольори спрайту; видалення палітри', async () => {
  const sel = await page.locator('#palette-select option').allTextContents();
  assert.ok(sel.length > 3);
  await setColor('#ff00ff'); await page.keyboard.press('KeyB'); await click(1, 1);
  await page.click('#pal-from-sprite'); await page.waitForTimeout(150);
  assert.deepEqual(await page.locator('#palette-grid .swatch').count(), 1);
  await page.locator('#palette-select').selectOption({ label: 'Тест' }); await page.waitForTimeout(100);
  await page.click('#pal-del'); await page.waitForTimeout(120); await page.locator('[data-ok]').click(); await page.waitForTimeout(150);
  assert.ok(!(await page.locator('#palette-select option').allTextContents()).includes('Тест'));
  assert.equal(await page.locator('#pal-del').isVisible(), false);
});
await step('еталонне зображення: додається, не змінює піксели, прозорість і приховування', async () => {
  const proj = await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); return !!document.querySelector('#pixel-canvas'); });
  assert.ok(proj);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
  assert.equal(await page.locator('#ref-ctrl').isVisible(), false);
  await page.setInputFiles('#ref-file', { name: 'r.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(250);
  assert.equal(await page.locator('#ref-ctrl').isVisible(), true);
  await page.fill('#ref-op', '70'); await page.waitForTimeout(60);
  assert.equal(await page.locator('#ref-op-val').textContent(), '70%');
  const before = await S(); await setColor('#00ff00'); await click(3, 3);
  const after = await S(); assert.equal(after.layers[0][0][3 * 8 + 3], '#00ff00');
  assert.equal(after.layers[0][0].filter(Boolean).length, before.layers[0][0].filter(Boolean).length + 1, 'еталон не став пікселями');
  await page.uncheck('#ref-show'); await page.click('#ref-remove'); await page.waitForTimeout(100);
  assert.equal(await page.locator('#ref-ctrl').isVisible(), false);
});
assert.deepEqual(errors, [], 'помилки консолі: ' + errors.join('; '));
await browser.close(); server.close();
console.log('OK');
