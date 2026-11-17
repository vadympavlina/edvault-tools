// Спрайт-редактор: доступність (клавіатура, фокус у модалках, ролі, живі області, контраст підписів).
//   node tests/sprite-a11y-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await newPage(ctx, errors);
  await page.addInitScript(t => localStorage.setItem('edvault-theme', t), theme);
  await page.goto(server.url + '/pixel-editor.html'); await page.waitForTimeout(400);
  await page.locator('#add-tile, #empty-new-btn').first().click(); await page.waitForTimeout(200);
  await page.locator('[data-ok]').click(); await page.waitForTimeout(500);
  await page.keyboard.press('KeyN'); await page.waitForTimeout(100);
  const focusIn = sel => page.evaluate(s => { const m = document.querySelector(s); return !!m && m.contains(document.activeElement); }, sel);

  await step(`${theme}: модалка має роль діалогу, назву, фокус усередині й повертає фокус після закриття`, async () => {
    await page.focus('#export-btn'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const d = await page.evaluate(() => { const m = document.querySelector('#modal .modal'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), name: document.getElementById(m.getAttribute('aria-labelledby')).textContent }; });
    assert.deepEqual([d.role, d.modal, d.name], ['dialog', 'true', 'Експорт']);
    assert.ok(await focusIn('#modal .modal'), 'фокус усередині модалки');
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    assert.ok(await focusIn('#modal .modal'), 'Tab не виходить із модалки');
    for (let i = 0; i < 25; i++) await page.keyboard.press('Shift+Tab');
    assert.ok(await focusIn('#modal .modal'), 'Shift+Tab не виходить із модалки');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'export-btn');
  });
  await step(`${theme}: кадри, шари й перегляд керуються з клавіатури`, async () => {
    const thumb = page.locator('.frame-thumb').first();
    assert.equal(await thumb.getAttribute('role'), 'button'); assert.match(await thumb.getAttribute('aria-label'), /Кадр 1 з 2/);
    await thumb.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__spriteEditor.state.cur), 0);
    assert.equal(await page.locator('.frame-thumb').first().getAttribute('aria-pressed'), 'true');
    await page.click('[data-tab=layers]'); await page.click('#layer-add'); await page.waitForTimeout(100);
    const row = page.locator('#layer-list .layer-row').nth(1); await row.focus();
    assert.match(await row.getAttribute('aria-label'), /Шар 1/);
    await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__spriteEditor.state.curLayer), 0);
    await page.keyboard.press('ContextMenu'); await page.waitForTimeout(100);
    assert.ok(await page.locator('.pop-item', { hasText: 'Підняти вище' }).count(), 'меню шару з клавіатури');
    await page.keyboard.press('Escape');
    const pv = page.locator('#preview-box'); await pv.focus(); const before = await pv.getAttribute('aria-pressed'); await page.keyboard.press('Enter');
    assert.notEqual(await pv.getAttribute('aria-pressed'), before);
  });
  await step(`${theme}: живі області й стан інструментів`, async () => {
    assert.equal(await page.getAttribute('#toast', 'role'), 'status'); assert.equal(await page.getAttribute('#save-status', 'aria-live'), 'polite');
    await page.keyboard.press('KeyL'); assert.equal(await page.locator('[data-tool=line]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-tool=pencil]').getAttribute('aria-pressed'), 'false');
  });
  await step(`${theme}: контраст підписів не нижчий за 4,5:1 на всіх вкладках`, async () => {
    for (const tab of ['color', 'layers', 'anim', 'canvas']) {
      await page.click(`[data-tab=${tab}]`); await page.waitForTimeout(80);
      const bad = await page.evaluate(() => {
        const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
        const parse = s => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; };
        const bgOf = el => { let e = el; while(e){ const c = parse(getComputedStyle(e).backgroundColor); if(c && (c[3] === undefined || c[3] > .5)) return c; e = e.parentElement; } return [255, 255, 255]; };
        const out = [];
        document.querySelectorAll('#view-editor *').forEach(el => {
          if(!el.offsetParent) return;
          const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim(); if(!txt) return;
          const cs = getComputedStyle(el), fg = parse(cs.color), bg = bgOf(el); if(!fg) return;
          const a = fg[3] ?? 1, f = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)), L1 = lum(f), L2 = lum(bg), r = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
          const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
          if(r < (large ? 3 : 4.5)) out.push(`${(el.id || el.className || el.tagName).toString().slice(0, 30)} "${txt.slice(0, 20)}" ${r.toFixed(2)}`);
        });
        return out;
      });
      assert.deepEqual(bad, [], `${tab}: ${bad.join('; ')}`);
    }
  });
  await ctx.close();
}
assert.deepEqual(errors, [], 'помилки консолі: ' + errors.join('; '));
await browser.close(); server.close();
console.log('готово');
