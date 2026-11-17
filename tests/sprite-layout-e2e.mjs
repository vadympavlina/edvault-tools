// Спрайт-редактор: розкладка на настільних розмірах вікна (панелі не наїжджають одна на одну, модалки вміщаються).
//   node tests/sprite-layout-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const R = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if(!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const overlap = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

for (const [vw, vh] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080], [2560, 1440]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await newPage(ctx, errors);
  await page.goto(server.url + '/pixel-editor.html'); await page.waitForTimeout(300);
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(150);
  await page.fill('#ns-w', '32'); await page.fill('#ns-h', '32'); await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  await page.keyboard.press('KeyN'); await page.waitForTimeout(100);

  await step(`${vw}×${vh}: налаштування інструмента між верхніми острівцями на всіх інструментах`, async () => {
    for (const k of ['KeyB', 'KeyH', 'KeyW', 'KeyD', 'KeyQ', 'KeyM', 'KeyG']) {
      await page.keyboard.press(k); await page.waitForTimeout(120);
      const o = await R(page, '#optbar'), l = await R(page, '#view-editor .topbar-left'), r = await R(page, '#view-editor .topbar-actions');
      if (!o) continue;
      assert.ok(!overlap(o, l) && !overlap(o, r), `${k}: optbar ${JSON.stringify(o)} накладається на острівець`);
      assert.ok(o.l >= 0 && o.r <= vw, `${k}: optbar виходить за вікно`);
    }
  });
  await step(`${vw}×${vh}: права панель і кадри всередині вікна й не накладаються`, async () => {
    const p = await R(page, '.right-panel'), f = await R(page, '.frames-strip'), t = await R(page, '#toolbar'), z = await R(page, '.zoom-float');
    assert.ok(p.r <= vw && p.b <= vh && p.t >= 0, 'панель у межах вікна: ' + JSON.stringify(p));
    assert.ok(!overlap(p, f), 'панель і кадри не накладаються');
    assert.ok(t.b <= vh && t.t >= 0, 'інструменти у межах вікна: ' + JSON.stringify(t));
    assert.ok(!overlap(t, z), 'інструменти й масштаб не накладаються');
    assert.ok(!overlap(t, f), 'інструменти й кадри не накладаються');
  });
  await step(`${vw}×${vh}: полотно вміщується між панелями і не під ними`, async () => {
    const st = await page.evaluate(() => window.__spriteEditor.state), cv = await R(page, '#pixel-canvas');
    const p = await R(page, '.right-panel'), t = await R(page, '#toolbar');
    const w = st.W * st.view.zoom, x0 = cv.l + st.view.ox, x1 = x0 + w;
    assert.ok(x0 >= t.r - 2 && x1 <= p.l + 2, `спрайт ${Math.round(x0)}–${Math.round(x1)} має бути між ${Math.round(t.r)} і ${Math.round(p.l)}`);
  });
  await step(`${vw}×${vh}: кожна вкладка панелі показується без виходу за межі`, async () => {
    for (const tab of ['color', 'layers', 'anim', 'canvas']) {
      await page.click(`[data-tab=${tab}]`); await page.waitForTimeout(60);
      const p = await R(page, '.right-panel'), b = await page.evaluate(() => { const e = document.querySelector('.rp-body'); return { sh: e.scrollHeight, ch: e.clientHeight }; });
      assert.ok(p.b <= vh, tab + ': панель у вікні');
      if (tab !== 'canvas') assert.ok(b.sh <= b.ch + 2 || vh < 800, `${tab}: вкладка вміщається без прокрутки (${b.sh} > ${b.ch})`);
    }
  });
  await step(`${vw}×${vh}: експорт аркуша з тегами вміщається у вікно`, async () => {
    await page.click('[data-tab=anim]'); await page.click('#tag-list .mini-btn'); await page.waitForTimeout(100); await page.locator('[data-ok]').click(); await page.waitForTimeout(100);
    await page.click('#export-btn'); await page.waitForTimeout(200); await page.click('#ex-kind [data-k=sheet]'); await page.waitForTimeout(200);
    const m = await R(page, '#modal .modal');
    assert.ok(m.t >= 0 && m.b <= vh + 1, `модалка у вікні: ${JSON.stringify(m)}`);
    const ok = await R(page, '#modal [data-ok]'); assert.ok(ok && ok.b <= vh, 'кнопка «Завантажити» видима');
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    if(await page.locator('#modal:not(.hidden)').count()) await page.locator('#modal [data-x]').first().click();
  });
  await ctx.close();
}
assert.deepEqual(errors, [], 'помилки консолі: ' + errors.join('; '));
await browser.close(); server.close();
console.log('готово');
