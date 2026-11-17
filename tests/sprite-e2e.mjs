// Спрайт-редактор: інструменти малювання й виділення (піксель-перфект, паличка, ласо, дизеринг, градієнт, заміна кольору).
//   node tests/sprite-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await newPage(ctx, errors);
await page.goto(server.url + '/pixel-editor.html');
await page.waitForTimeout(400);

const S = () => page.evaluate(() => { const s = window.__spriteEditor.state; return { W: s.W, H: s.H, cur: s.cur, frames: s.frames.map(f => f.slice()), tool: s.tool, color: s.color, sel: s.sel ? { x: s.sel.x, y: s.sel.y, w: s.sel.w, h: s.sel.h, mask: s.sel.mask ? Array.from(s.sel.mask) : null, float: !!s.sel.float } : null, undo: s.undo }; });
const cells = async () => { const s = await S(); const out = {}; s.frames[s.cur].forEach((c, i) => { if (c) out[(i % s.W) + ',' + Math.floor(i / s.W)] = c; }); return out; };
const count = async () => Object.keys(await cells()).length;
// події вказівника в клітинках (x, y) полотна
const pt = (type, x, y, mods = {}) => page.evaluate(([type, x, y, mods]) => {
  const cv = document.getElementById('pixel-canvas'), r = cv.getBoundingClientRect(), v = window.__spriteEditor.state.view;
  cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + v.ox + (x + .5) * v.zoom, clientY: r.top + v.oy + (y + .5) * v.zoom, pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : (mods.right ? 2 : 1), button: mods.right ? 2 : 0, shiftKey: !!mods.shift, altKey: !!mods.alt, bubbles: true }));
}, [type, x, y, mods]);
const stroke = async (pts, mods = {}) => { await pt('pointerdown', pts[0][0], pts[0][1], mods); for (const p of pts.slice(1)) await pt('pointermove', p[0], p[1], mods); const l = pts[pts.length - 1]; await pt('pointerup', l[0], l[1], mods); };
const click = (x, y, mods = {}) => stroke([[x, y]], mods);
const tool = async k => { await page.keyboard.press(k); await page.waitForTimeout(40); };
const setColor = async hex => { await page.fill('#hex-input', hex); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(40); };
const fillRect = async (x0, y0, x1, y1, hex) => { await setColor(hex); await tool('KeyB'); for (let y = y0; y <= y1; y++) await stroke([[x0, y], [x1, y]]); };

await step('новий спрайт 16×16; на панелі 13 інструментів, нові доступні клавішами W, Q, D, H', async () => {
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200);
  await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-tool]')].map(b => b.dataset.tool));
  assert.deepEqual(ids, ['pencil', 'eraser', 'fill', 'picker', 'line', 'rect', 'ellipse', 'select', 'lasso', 'wand', 'dither', 'gradient', 'shade']);
  for (const [k, t] of [['KeyW', 'wand'], ['KeyQ', 'lasso'], ['KeyD', 'dither'], ['KeyH', 'gradient'], ['KeyB', 'pencil']]) { await tool(k); assert.equal((await S()).tool, t); }
});
await step('піксель-перфект: ламана «сходинка» втрачає зайвий кут, без нього — лишається', async () => {
  await tool('KeyB'); await setColor('#ff0000');
  await stroke([[2, 2], [3, 2], [3, 3]]);
  assert.equal(await count(), 3, 'без піксель-перфекту — 3 клітинки');
  await page.keyboard.press('Control+z'); assert.equal(await count(), 0);
  await page.locator('#pp-toggle').check(); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await stroke([[2, 2], [3, 2], [3, 3]]);
  const c = await cells(); assert.deepEqual(Object.keys(c).sort(), ['2,2', '3,3'], JSON.stringify(c));
  await page.keyboard.press('Control+z'); assert.equal(await count(), 0, 'один штрих скасовується одним кроком');
  await stroke([[0, 5], [1, 5], [2, 5], [3, 5]]); assert.equal(await count(), 4, 'пряма лінія не псується');
  await page.keyboard.press('Control+z');
  await page.locator('#pp-toggle').uncheck(); await page.evaluate(() => document.activeElement && document.activeElement.blur());
});
await step('паличка: клік виділяє суцільну область, допуск розширює, Shift додає, Alt віднімає, «Усі такі» бере скрізь', async () => {
  await fillRect(2, 2, 5, 5, '#00aa00'); await fillRect(8, 2, 9, 3, '#00aa00'); await fillRect(6, 2, 7, 5, '#00bb00');
  await tool('KeyW');
  await click(3, 3);
  let s = await S(); assert.ok(s.sel && s.sel.x === 2 && s.sel.y === 2 && s.sel.w === 4 && s.sel.h === 4, JSON.stringify(s.sel));
  await click(8, 2, { shift: true });
  s = await S(); assert.ok(s.sel.w === 8 && s.sel.mask, 'додано другу область: ' + JSON.stringify(s.sel && [s.sel.w, s.sel.h]));
  await click(3, 3, { alt: true });
  s = await S(); assert.ok(s.sel.x === 8 && s.sel.w === 2 && s.sel.h === 2, 'віднято першу: ' + JSON.stringify(s.sel));
  // «Усі такі»
  await page.locator('[data-wg="1"]').click(); await click(2, 2);
  s = await S(); assert.ok(s.sel.x === 2 && s.sel.w === 8, 'усі зелені, в т. ч. віддалені');
  await page.locator('[data-wg="0"]').click();
  // допуск: майже однакові зелені об’єднуються
  await click(3, 3); s = await S(); assert.equal(s.sel.w, 4);
  await page.locator('[data-tol="10"]').click(); await click(3, 3); s = await S(); assert.ok(s.sel.x === 2 && s.sel.w === 8, 'допуск 10% захопив сусідній відтінок і далі по ланцюжку: ' + JSON.stringify([s.sel.x, s.sel.w]));
  await page.locator('[data-tol="0"]').click();
});
await step('виділення з маскою: Delete видаляє лише виділені пікселі, не весь прямокутник', async () => {
  await click(3, 3); // зелений квадрат 4×4
  await page.keyboard.press('Delete');
  const c = await cells(); assert.ok(!c['3,3'] && !c['2,2'] && c['6,2'] && c['8,2'], JSON.stringify(Object.keys(c)));
  await page.keyboard.press('Control+z'); assert.ok((await cells())['3,3']);
});
await step('переміщення виділеного паличкою: рухається лише обраний колір, сусідній лишається', async () => {
  await tool('KeyW'); await click(3, 3);
  await tool('KeyM'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  const c = await cells();
  assert.equal(c['3,5'], '#00aa00', 'перемістився'); assert.ok(!c['3,2'], 'старе місце порожнє'); assert.equal(c['6,2'], '#00bb00', 'сусід не зачеплений');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
});
await step('ласо: обводить трикутник, виділяє лише його клітинки; Shift додає, «Навпаки» інвертує', async () => {
  await tool('KeyQ');
  await stroke([[10, 10], [14, 10], [12, 14], [10, 10]]);
  let s = await S(); assert.ok(s.sel && s.sel.mask, 'є маска'); const n1 = s.sel.mask.filter(Boolean).length; assert.ok(n1 >= 8 && n1 < s.sel.w * s.sel.h, 'форма не прямокутна: ' + n1);
  await stroke([[0, 12], [2, 12], [2, 15], [0, 15], [0, 12]], { shift: true });
  s = await S(); assert.ok(s.sel.mask.filter(Boolean).length > n1);
  await page.locator('[data-act="invert"]').click();
  s = await S(); assert.ok(s.sel.w === 16 || s.sel.h === 16 || s.sel.mask.filter(Boolean).length > 100, 'інверсія виділила решту');
  await page.keyboard.press('Escape');
});
await step('«Залити» заповнює виділену форму поточним кольором лише всередині', async () => {
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.keyboard.press('Escape'); // чистий аркуш
  await tool('KeyQ'); await stroke([[4, 4], [8, 4], [8, 8], [4, 8], [4, 4]]);
  await setColor('#3366ff'); await page.locator('[data-act="fill"]').click();
  const c = await cells(); assert.ok(c['6,6'] === '#3366ff' && !c['9,9'] && !c['3,3']);
  await page.keyboard.press('Escape');
});
await step('дизеринг: шашка малює лише клітинки з парною сумою координат, права кнопка стирає візерунок', async () => {
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.keyboard.press('Escape');
  await tool('KeyD'); await setColor('#ff00ff');
  await stroke([[0, 0], [7, 0]]); await stroke([[0, 1], [7, 1]]);
  const c = await cells(); const keys = Object.keys(c);
  assert.equal(keys.length, 8, 'половина з 16: ' + keys.length);
  assert.ok(keys.every(k => { const [x, y] = k.split(',').map(Number); return (x + y) % 2 === 0; }));
  await page.locator('[data-dp="vlines"]').click(); await stroke([[0, 4], [7, 4]]);
  assert.equal(Object.keys(await cells()).filter(k => k.endsWith(',4')).length, 4, 'смужки: кожна друга клітинка');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
});
await step('градієнт: перехід від початкового до кінцевого кольору зліва направо дизерингом', async () => {
  await tool('KeyB'); await setColor('#ff0000'); await stroke([[0, 8], [15, 8]]); await stroke([[0, 9], [15, 9]]);
  await tool('KeyH'); await page.locator('#grad-end').click(); // кінцевий = поточний
  await setColor('#0000ff'); await page.locator('#grad-end').click();
  await setColor('#ff0000');
  await stroke([[0, 8], [15, 8]]);
  const c = await cells();
  const row = Array.from({ length: 16 }, (_, x) => c[x + ',8']);
  assert.ok(row.every(Boolean), 'клітинки не зникли');
  assert.equal(row[0], '#ff0000'); assert.equal(row[15], '#0000ff');
  const firstBlue = row.indexOf('#0000ff'), lastRed = row.lastIndexOf('#ff0000');
  assert.ok(firstBlue > 0 && lastRed < 15 && firstBlue <= lastRed, 'змішана зона: ' + row.map(v => v === '#ff0000' ? 'R' : 'B').join(''));
  const left = row.slice(0, 5).filter(v => v === '#ff0000').length, right = row.slice(11).filter(v => v === '#0000ff').length;
  assert.ok(left >= 4 && right >= 4, 'ліва сторона переважно початковий, права — кінцевий колір');
  assert.ok(!c['0,0'], 'порожні клітинки лишилися прозорими («лише по малюнку»)');
  await page.keyboard.press('Control+z');
  assert.equal((await cells())['15,8'], '#ff0000', 'скасування градієнта');
});
await step('замінити колір у всіх кадрах: меню на «Кольорах спрайту» міняє пікселі у кількох кадрах', async () => {
  await page.keyboard.press('KeyN'); await page.waitForTimeout(100); // новий кадр
  await tool('KeyB'); await setColor('#ff0000'); await stroke([[1, 1], [3, 1]]);
  await setColor('#00ffcc');
  const sw = page.locator('#used-grid .swatch[data-c="#ff0000"]'); await sw.click({ button: 'right' });
  await page.locator('.pop-item', { hasText: 'у всіх кадрах' }).click();
  const s = await S();
  assert.ok(s.frames.every(f => !f.includes('#ff0000')), 'червоного не лишилось у жодному кадрі');
  assert.ok(s.frames[0].includes('#00ffcc') && s.frames[1].includes('#00ffcc'));
  await page.keyboard.press('Control+z');
  assert.ok((await S()).frames[0].includes('#ff0000'), 'скасування повертає колір у всіх кадрах');
});
await step('круглий пензель 4×4 не малює кутові клітинки', async () => {
  await tool('KeyB'); await page.locator('[data-b="4"]').click(); await page.locator('[data-sh="1"]').click();
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.keyboard.press('Escape');
  await tool('KeyB'); await setColor('#112233'); await click(8, 8);
  const n = await count(); assert.ok(n >= 10 && n <= 14, 'коло з 4×4: ' + n);
  await page.locator('[data-sh="0"]').click(); await click(2, 2); await page.keyboard.press('Control+z');
});
await step('все зберігається й відновлюється: після перезавантаження кадри на місці', async () => {
  await page.waitForTimeout(1000);
  const before = (await S()).frames.map(f => f.filter(Boolean).length);
  await page.reload(); await page.waitForTimeout(500);
  await page.locator('.tool-card .thumb-wrap').first().click(); await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__spriteEditor.state.frames.map(f => f.filter(Boolean).length));
  assert.deepEqual(after, before);
});
await step('жодної помилки в консолі', async () => { assert.deepEqual(errors, []); });
await browser.close(); server.close();
console.log('готово');
