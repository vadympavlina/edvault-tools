// Аніматор на настільних розмірах вікна й доступність: розкладка, діалоги, меню, шари з клавіатури, контраст.
//   node tests/animator-desktop-e2e.mjs      (потрібні Playwright і Chromium)
import assert from 'node:assert/strict';
import { startServer, launch, newPage, step } from './_harness.mjs';

const server = await startServer();
const browser = await launch();
const errors = [];
const R = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
const overlap = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
const open = async (vw, vh, theme = 'dark') => {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const p = await newPage(ctx, errors);
  await p.addInitScript(t => localStorage.setItem('edvault-theme', t), theme);
  await p.goto(server.url + '/animator'); await p.waitForFunction(() => window.Animator && window.Animator.P);
  return { ctx, p };
};

for (const [vw, vh] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
  const { ctx, p } = await open(vw, vh);
  await p.click('[data-go]'); await p.waitForTimeout(300);
  await step(`${vw}×${vh}: налаштування й інструменти вміщаються, острівці не накладаються`, async () => {
    for (const k of ['KeyB', 'KeyE', 'KeyG', 'KeyL', 'KeyR', 'KeyM']) {
      await p.keyboard.press(k); await p.waitForTimeout(60);
      const o = await p.evaluate(() => { const e = document.getElementById('prop'); return { over: e.scrollWidth - e.clientWidth, rail: document.getElementById('rail').scrollHeight - document.getElementById('rail').clientHeight }; });
      assert.ok(o.over <= 2, `${k}: налаштування не вміщаються на ${o.over}px`); assert.ok(o.rail <= 1, `${k}: інструменти не вміщаються`);
    }
    const prop = await R(p, '#prop'), rail = await R(p, '#rail'), side = await R(p, '#side'), tr = await R(p, '#transport'), top = await R(p, '.top-l'), topr = await R(p, '.top-r');
    assert.ok(!overlap(prop, top) && !overlap(prop, topr), 'налаштування не під верхніми острівцями');
    assert.ok(!overlap(rail, tr) && !overlap(side, tr), 'панелі не заходять на програвач');
    assert.ok(!overlap(prop, rail) && !overlap(prop, side), 'налаштування не накладаються на панелі');
    assert.ok(prop.r <= vw && rail.b <= vh, 'у межах вікна');
  });
  await ctx.close();
}

{
  const { ctx, p } = await open(1280, 720);
  await p.click('[data-go]'); await p.waitForTimeout(300);
  await step('діалоги: фокус усередині, Tab не виходить, після Esc фокус повертається', async () => {
    for (const act of ['export', 'help', 'lessons']) {
      await p.focus(`[data-act=${act}]`); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      const inside = () => p.evaluate(() => { const w = document.querySelector('.md-wrap'); return !!w && w.contains(document.activeElement); });
      assert.ok(await inside(), act + ': фокус усередині');
      for (let i = 0; i < 30; i++) await p.keyboard.press('Tab');
      assert.ok(await inside(), act + ': Tab не виходить');
      for (let i = 0; i < 30; i++) await p.keyboard.press('Shift+Tab');
      assert.ok(await inside(), act + ': Shift+Tab не виходить');
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => document.activeElement.dataset.act), act, act + ': фокус повернувся');
    }
  });
  await step('меню «Файл»: стрілки ходять по пунктах, Esc закриває й повертає фокус', async () => {
    await p.focus('[data-act=fileMenu]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    const cur = () => p.evaluate(() => document.activeElement.dataset.v);
    const first = await cur(); await p.keyboard.press('ArrowDown'); const second = await cur(); assert.notEqual(first, second);
    await p.keyboard.press('ArrowUp'); assert.equal(await cur(), first);
    await p.keyboard.press('End'); assert.notEqual(await cur(), first);
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    assert.equal(await p.evaluate(() => document.activeElement.dataset.act), 'fileMenu');
  });
  await step('шари з клавіатури: Enter вибирає, стрілки ходять, назви читаються', async () => {
    await p.click('[data-act=layerAdd]'); await p.waitForTimeout(150);
    const rows = p.locator('#side .lr'); assert.equal(await rows.count(), 3);
    assert.match(await rows.first().getAttribute('aria-label'), /^Шар/);
    await rows.nth(2).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => window.Animator.S.li), 0);
    await p.keyboard.press('ArrowUp'); assert.equal(await p.evaluate(() => document.activeElement.dataset.layer), '1');
    assert.equal(await p.locator('#side .lr[data-layer="0"]').getAttribute('aria-pressed'), 'true');
  });
  await step('перемикачі налаштувань мають доступні назви й стан', async () => {
    await p.keyboard.press('KeyB'); await p.waitForTimeout(100);
    const t = await p.evaluate(() => [...document.querySelectorAll('#prop .tg')].map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]));
    assert.ok(t.length >= 3 && t.every(([n]) => n && n.length > 2), JSON.stringify(t));
    assert.ok(t.some(([, s]) => s === 'false' || s === 'true'));
  });
  await ctx.close();
}

for (const theme of ['dark', 'light']) {
  const { ctx, p } = await open(1440, 900, theme);
  const scan = () => p.evaluate(() => {
    const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
    const parse = s => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; };
    const bgOf = el => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && (c[3] === undefined || c[3] > .5)) return c; e = e.parentElement; } return [255, 255, 255]; };
    const out = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim(); if (!txt) return;
      const cs = getComputedStyle(el), fg = parse(cs.color), bg = bgOf(el); if (!fg) return;
      const a = fg[3] ?? 1, f = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)), L1 = lum(f), L2 = lum(bg), r = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
      const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
      if (r < (large ? 3 : 4.5)) out.push(`${(el.id || el.className || el.tagName).toString().slice(0, 28)} "${txt.slice(0, 20)}" ${r.toFixed(2)}`);
    });
    return [...new Set(out)];
  });
  await step(`${theme}: контраст підписів у діалозі старту, редакторі й експорті`, async () => {
    assert.deepEqual(await scan(), [], 'старт');
    await p.click('[data-go]'); await p.waitForTimeout(300);
    assert.deepEqual(await scan(), [], 'редактор');
    await p.click('[data-act=export]'); await p.waitForTimeout(300);
    assert.deepEqual(await scan(), [], 'експорт');
  });
  await ctx.close();
}
assert.deepEqual(errors, [], 'помилки консолі: ' + errors.join('; '));
await browser.close(); server.close();
console.log('готово');
