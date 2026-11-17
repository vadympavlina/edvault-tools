// Спрайт-редактор: шари (додавання, видимість, прозорість, порядок, назви, об'єднання), кадри з шарами, збереження.
//   node tests/sprite-layers-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await newPage(ctx, errors);
await page.goto(server.url + '/pixel-editor.html');
await page.waitForTimeout(400);

const S = () => page.evaluate(() => { const s = window.__spriteEditor.state; return { W: s.W, H: s.H, cur: s.cur, curLayer: s.curLayer, comp: s.frames.map(f => f.slice()), layers: s.layers.map(L => ({ name: L.name, visible: L.visible, opacity: L.opacity, cels: L.cels.map(c => c.slice()) })) }; });
const pt = (type, x, y, mods = {}) => page.evaluate(([type, x, y, mods]) => {
  const cv = document.getElementById('pixel-canvas'), r = cv.getBoundingClientRect(), v = window.__spriteEditor.state.view;
  cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + v.ox + (x + .5) * v.zoom, clientY: r.top + v.oy + (y + .5) * v.zoom, pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1, button: 0, shiftKey: !!mods.shift, bubbles: true }));
}, [type, x, y, mods]);
const click = async (x, y) => { await pt('pointerdown', x, y); await pt('pointerup', x, y); };
const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(40); };
const setColor = async hex => { await page.fill('#hex-input', hex); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(40); };
const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
const rows = () => page.locator('#layer-list .layer-row');
const names = () => page.evaluate(() => [...document.querySelectorAll('#layer-list .l-name')].map(e => e.textContent));
const at = (arr, x, y, w = 8) => arr[y * w + x];

await step('новий спрайт 8×8: один шар «Шар 1», видалити й об’єднати недоступні', async () => {
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200);
  await page.fill('#ns-w', '8'); await page.fill('#ns-h', '8'); await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  await page.click('[data-tab=layers]');
  assert.deepEqual(await names(), ['Шар 1']);
  assert.equal(await page.locator('#layer-del').isDisabled(), true); assert.equal(await page.locator('#layer-merge').isDisabled(), true);
});
await step('малюємо червоний на шарі 1, додаємо шар 2 (активним стає верхній) і малюємо синій', async () => {
  await key('KeyB'); await setColor('#ff0000'); await click(1, 1);
  await page.click('#layer-add'); await page.waitForTimeout(80);
  assert.deepEqual(await names(), ['Шар 2', 'Шар 1']); assert.equal((await S()).curLayer, 1);
  await setColor('#0000ff'); await click(2, 2);
  const s = await S();
  assert.equal(at(s.layers[0].cels[0], 1, 1), '#ff0000'); assert.equal(at(s.layers[0].cels[0], 2, 2), null);
  assert.equal(at(s.layers[1].cels[0], 2, 2), '#0000ff'); assert.equal(at(s.layers[1].cels[0], 1, 1), null);
  assert.equal(at(s.comp[0], 1, 1), '#ff0000'); assert.equal(at(s.comp[0], 2, 2), '#0000ff', 'складений кадр містить обидва');
});
await step('клік по шару вибирає його; малювання йде лише в активний шар', async () => {
  await rows().nth(1).click(); // «Шар 1» (нижній)
  assert.equal((await S()).curLayer, 0);
  await setColor('#00ff00'); await click(4, 4);
  const s = await S(); assert.equal(at(s.layers[0].cels[0], 4, 4), '#00ff00'); assert.equal(at(s.layers[1].cels[0], 4, 4), null);
  await key('Control+z');
});
await step('око ховає шар у складеному кадрі; малювати на схованому шарі не можна; скасування повертає', async () => {
  await rows().nth(1).locator('.l-eye').click(); await page.waitForTimeout(60);
  let s = await S(); assert.equal(s.layers[0].visible, false); assert.equal(at(s.comp[0], 1, 1), null); assert.equal(at(s.comp[0], 2, 2), '#0000ff');
  const before = JSON.stringify(s.layers[0].cels[0]); await click(5, 5); s = await S();
  assert.equal(JSON.stringify(s.layers[0].cels[0]), before, 'малювання на схованому шарі заблоковано');
  await key('Control+z'); s = await S(); assert.equal(s.layers[0].visible, true); assert.equal(at(s.comp[0], 1, 1), '#ff0000');
});
await step('прозорість шару 50%: колір у складеному кадрі стає напівпрозорим, скасування повертає 100%', async () => {
  await rows().nth(0).click(); // верхній
  await page.locator('#layer-op-range').fill('50'); await blur(); await page.waitForTimeout(80);
  let s = await S(); assert.equal(s.layers[1].opacity, 0.5);
  const c = at(s.comp[0], 2, 2); assert.ok(/^#0000ff[0-9a-f]{2}$/i.test(c) && Math.abs(parseInt(c.slice(7), 16) - 128) <= 2, c);
  assert.match(await page.locator('#layer-list .layer-row').first().textContent(), /50%/);
  await key('Control+z'); s = await S(); assert.equal(s.layers[1].opacity, 1); assert.equal(at(s.comp[0], 2, 2), '#0000ff');
});
await step('перейменування: двічі клац по назві, Enter зберігає, Esc скасовує', async () => {
  await rows().nth(0).locator('.l-name').dblclick();
  await page.locator('.l-edit').fill('Контур'); await page.keyboard.press('Enter');
  assert.deepEqual(await names(), ['Контур', 'Шар 1']);
  await rows().nth(1).locator('.l-name').dblclick(); await page.locator('.l-edit').fill('Тест'); await page.keyboard.press('Escape');
  assert.deepEqual(await names(), ['Контур', 'Шар 1']);
});
await step('порядок: перетягування нижнього шару вгору міняє їх місцями у складі', async () => {
  await setColor('#ff00ff'); await rows().nth(1).click(); await click(2, 2); // на нижньому шарі малюємо на тій самій клітинці
  let s = await S(); assert.equal(at(s.comp[0], 2, 2), '#0000ff', 'верхній синій перекриває');
  await page.evaluate(() => { const rows = document.querySelectorAll('#layer-list .layer-row'); const dt = new DataTransfer(); rows[1].dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); rows[0].dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
  // нижній (індекс 0) перетягнуто на позицію верхнього рядка (індекс 1)
  s = await S(); assert.equal(s.layers[1].name, 'Шар 1'); assert.equal(at(s.comp[0], 2, 2), '#ff00ff', 'тепер пурпурний зверху');
  await key('Control+z'); s = await S(); assert.equal(s.layers[0].name, 'Шар 1'); assert.equal(at(s.comp[0], 2, 2), '#0000ff');
});
await step('дублювати шар, видалити шар (Ctrl+Z повертає)', async () => {
  await page.click('#layer-dup'); assert.equal((await names()).length, 3); assert.ok((await names()).some(n => /копія/.test(n)), JSON.stringify(await names()));
  await page.click('#layer-del'); assert.equal((await names()).length, 2);
  await key('Control+z'); assert.equal((await names()).length, 3);
  await page.click('#layer-del'); assert.equal((await names()).length, 2);
});
await step('об’єднати з нижнім: два шари стають одним, складений кадр лишається тим самим', async () => {
  const before = (await S()).comp[0].slice();
  await rows().nth(0).click(); await page.click('#layer-merge');
  const s = await S(); assert.equal(s.layers.length, 1); assert.deepEqual(s.comp[0], before);
  await key('Control+z'); assert.equal((await S()).layers.length, 2);
});
await step('кадри: новий кадр має порожню картинку в кожному шарі; дублювання й видалення зберігають шари синхронними', async () => {
  await key('KeyN'); await page.waitForTimeout(80);
  let s = await S(); assert.equal(s.layers.every(L => L.cels.length === 2), true); assert.equal(s.comp.length, 2); assert.ok(s.comp[1].every(c => c === null));
  await key('Shift+KeyN'); await page.waitForTimeout(80);
  s = await S(); assert.equal(s.layers.every(L => L.cels.length === 3), true);
  await page.locator('.frame-thumb').nth(0).click(); await page.waitForTimeout(60);
  await key('Shift+KeyN'); s = await S(); // дубль кадру 1: вміст шарів збігається
  assert.deepEqual(s.layers.map(L => L.cels[1].filter(Boolean).length), s.layers.map(L => L.cels[0].filter(Boolean).length));
  await key('Control+z'); await key('Control+z'); await key('Control+z');
  s = await S(); assert.equal(s.comp.length, 1);
});
await step('віддзеркалення перетворює всі шари, а не лише активний', async () => {
  await key('Shift+KeyH'); await page.waitForTimeout(80);
  const s = await S(); assert.equal(at(s.layers[0].cels[0], 6, 1), '#ff0000', 'червоний дзеркально на 6,1'); assert.equal(at(s.layers[1].cels[0], 5, 2), '#0000ff', 'синій дзеркально на 5,2');
  await key('Control+z');
});
await step('піпетка бере видимий колір зі складеного кадру, а не з порожнього активного шару', async () => {
  await rows().nth(0).click(); await key('KeyI'); await click(1, 1); // на верхньому шарі червоного немає
  assert.equal((await S()).comp.length, 1);
  assert.equal(await page.inputValue('#hex-input'), '#FF0000');
});
await step('«Кольори спрайту» не містять напівпрозорих складених відтінків', async () => {
  await rows().nth(0).click(); await page.locator('#layer-op-range').fill('50'); await blur();
  const cols = await page.evaluate(() => [...document.querySelectorAll('#used-grid .swatch')].map(b => b.dataset.c));
  assert.ok(cols.every(c => c.length === 7), JSON.stringify(cols));
  await page.locator('#layer-op-range').fill('100'); await blur(); await page.waitForTimeout(50);
});
await step('збереження: після перезавантаження шари, назви, видимість і прозорість на місці; формат v3', async () => {
  await rows().nth(0).click(); await page.locator('#layer-op-range').fill('70'); await blur(); await rows().nth(1).locator('.l-eye').click();
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('edvault-sprites'))[0]);
  assert.equal(stored.v, 3); assert.equal(stored.layers.length, 2);
  const before = await S();
  await page.reload(); await page.waitForTimeout(500);
  await page.locator('.tool-card .thumb-wrap').first().click(); await page.waitForTimeout(500);
  const after = await S();
  assert.deepEqual(after.layers.map(L => [L.name, L.visible, L.opacity]), before.layers.map(L => [L.name, L.visible, L.opacity]));
  assert.deepEqual(after.layers.map(L => L.cels[0]), before.layers.map(L => L.cels[0]));
  assert.deepEqual(await names(), ['Контур', 'Шар 1']);
});
await step('GIF з напівпрозорими шарами кодується без помилок', async () => {
  const head = await page.evaluate(() => { const s = window.__spriteEditor.state; const b = window.__spriteEditor.encodeGIF(s.frames, s.W, s.H, 4, 100, null); return String.fromCharCode(...b.slice(0, 6)); });
  assert.equal(head, 'GIF89a');
});
await step('звичайний спрайт з одним шаром зберігається у старому форматі v2', async () => {
  await page.evaluate(() => document.getElementById('back-btn') && document.getElementById('back-btn').click());
  await page.waitForTimeout(200);
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200); await page.locator('[data-ok]').click(); await page.waitForTimeout(1200);
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('edvault-sprites')).map(s => s.v));
  assert.ok(v.includes(2) && v.includes(3), JSON.stringify(v));
});
await step('жодної помилки в консолі', async () => { assert.deepEqual(errors, []); });
await browser.close(); server.close();
console.log('готово');
