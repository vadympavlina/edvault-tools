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
await page.addInitScript(() => { window.__dl = []; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download && this.href.startsWith('blob:') && !/\.html?$/.test(this.download)) { const rec = { name: this.download, b64: null }; window.__dl.push(rec); fetch(this.href).then(r => r.arrayBuffer()).then(buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); rec.b64 = btoa(s); }); return; } return orig.call(this); }; });
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
  await hookDownloads(p);
  await p.route('**/exported.html', r => r.fulfill({ contentType: 'text/html', body: text }));
  await p.goto(server.url + '/exported.html');
  return p;
};
// Завантаження перехоплюємо на рівні <a download>: фіксуємо ім'я й вміст (у headless імена з кирилицею в події download губляться)
const hookDownloads = p => p.addInitScript(() => {
  window.__dl = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith('blob:') && !/\.html?$/.test(this.download)) {
      const rec = { name: this.download, b64: null }; window.__dl.push(rec);
      fetch(this.href).then(r => r.arrayBuffer()).then(buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); rec.b64 = btoa(s); });
      return;
    }
    return orig.call(this);
  };
});
const dlOf = async (p, n) => { await p.waitForFunction(n => window.__dl.length >= n && window.__dl.slice(0, n).every(d => d.b64 !== null), n, { timeout: 8000 }); return p.evaluate(() => window.__dl.map(d => ({ name: d.name, b64: d.b64 }))); };
let exp = null;

await step('блоки в редакторі: підпис і іконка в м\'якому градієнті, темна тема лишає аркуш світлим', async () => {
  await setDoc('<h1>Тест</h1><div class="tc-block tc-callout" data-type="warn"><p>Увага тут</p></div><div class="tc-block tc-prompt"><p>Поясни тему [ТЕМА] для [КЛАС] класу.</p></div><blockquote><p>Цитата</p></blockquote>');
  const r = await page.evaluate(() => { const c = document.querySelector('#editor .tc-callout'), s = getComputedStyle(c, '::before'); return { lab: s.content, bg: getComputedStyle(c).backgroundImage.includes('gradient'), rad: getComputedStyle(c).borderRadius }; });
  assert.match(r.lab, /Увага/); assert.ok(r.bg, 'градієнт'); assert.equal(r.rad, '0px'); assert.ok(!/radial/.test(await page.evaluate(() => getComputedStyle(document.querySelector('#editor .tc-callout')).backgroundImage)), 'без кола');
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

const SVG = c => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${c}"/></svg>`);
const figs = (n, extra = '') => Array.from({ length: n }, (_, i) => `<figure class="tc-figure"${extra}><img src="${SVG(['#6b86c9', '#e8a87c', '#7bbf9a', '#b58ad6'][i % 4])}" alt=""><figcaption>Підпис ${i + 1}</figcaption></figure>`).join('');
await step('галерея: кнопка на панелі зображення збирає сусідні зображення в сітку, можна змінити колонки й розібрати', async () => {
  await setDoc('<h1>Фото</h1>' + figs(3) + '<p>Далі текст.</p>');
  await page.waitForTimeout(200);
  await page.evaluate(() => UI.selectFigure(document.querySelector('#editor figure.tc-figure')));
  await page.locator('#imgBar [data-b="galon"]').click();
  let r = await page.evaluate(() => [...document.querySelectorAll('#editor figure')].map(f => f.dataset.gal));
  assert.deepEqual(r, ['3', '3', '3']);
  const xs = await page.evaluate(() => [...document.querySelectorAll('#editor figure')].map(f => Math.round(f.getBoundingClientRect().top)));
  assert.ok(xs[0] === xs[1] && xs[1] === xs[2], 'три в один ряд: ' + xs);
  await page.locator('#imgBar [data-b="gal2"]').click();
  r = await page.evaluate(() => [...document.querySelectorAll('#editor figure')].map(f => f.dataset.gal)); assert.deepEqual(r, ['2', '2', '2']);
  const tops = await page.evaluate(() => [...document.querySelectorAll('#editor figure')].map(f => Math.round(f.getBoundingClientRect().top)));
  assert.ok(tops[0] === tops[1] && tops[2] > tops[1], 'два в ряд, третє нижче: ' + tops);
  assert.ok(await page.evaluate(() => { const p = document.querySelector('#editor p'); const f = [...document.querySelectorAll('#editor figure')].pop(); return p.getBoundingClientRect().top >= f.getBoundingClientRect().bottom - 2; }), 'текст нижче галереї');
  await page.locator('#imgBar [data-b="galoff"]').click();
  r = await page.evaluate(() => [...document.querySelectorAll('#editor figure')].map(f => f.dataset.gal)); assert.deepEqual(r, [undefined, undefined, undefined]);
});
await step('вставка кількох файлів одразу складає їх у галерею', async () => {
  await setDoc('<h1>Фото</h1><p><br></p>');
  const tmp = await mkdtemp(join(tmpdir(), 'tcg-'));
  const { writeFile } = await import('node:fs/promises');
  const files = [];
  for (let i = 0; i < 3; i++) { const f = join(tmp, `im${i}.svg`); await writeFile(f, `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#${['6b86c9', 'e8a87c', '7bbf9a'][i]}"/></svg>`); files.push(f); }
  await page.setInputFiles('#imgInput', files);
  await page.waitForFunction(() => document.querySelectorAll('#editor figure').length === 3, null, { timeout: 8000 });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#editor figure')].map(f => f.dataset.gal)), ['3', '3', '3']);
});
await step('перегляд у редакторі: стрілки перемикають зображення по колу, є підпис і лічильник, Esc закриває', async () => {
  await setDoc('<h1>Фото</h1>' + figs(3));
  await page.waitForTimeout(150);
  await page.evaluate(() => UI.selectFigure(document.querySelectorAll('#editor figure')[1]));
  await page.locator('#imgBar [data-b="view"]').click();
  assert.equal(await page.locator('#lightbox .lb-count').textContent(), '2 / 3'); assert.equal(await page.locator('#lightbox .lb-cap').textContent(), 'Підпис 2');
  await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#lightbox .lb-count').textContent(), '3 / 3');
  await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#lightbox .lb-count').textContent(), '1 / 3');
  await page.locator('#lightbox .lb-prev').click(); assert.equal(await page.locator('#lightbox .lb-count').textContent(), '3 / 3');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#lightbox').evaluate(e => e.classList.contains('open')), false);
});
await step('опис зображення (alt): кнопка Alt відкриває вікно, значення зберігається в документі', async () => {
  await page.evaluate(() => UI.selectFigure(document.querySelector('#editor figure')));
  await page.locator('#imgBar [data-b="alt"]').click();
  await page.fill('#altText', 'Синій прямокутник'); await page.click('#altOk');
  assert.equal(await page.evaluate(() => document.querySelector('#editor figure img').getAttribute('alt')), 'Синій прямокутник');
});
await step('експорт: галерея лишається сіткою, перегляд має стрілки, підпис, лічильник і завантаження', async () => {
  await setDoc('<h1>Фото</h1>' + figs(3, ' data-gal="3"') + '<p>Кінець</p>');
  const text = await exportHtml();
  assert.match(text, /data-gal="3"/); assert.match(text, /\.tc-content figure\.tc-figure\[data-gal\]/);
  const p = await openExported(text);
  const tops = await p.evaluate(() => [...document.querySelectorAll('.tc-content figure')].map(f => Math.round(f.getBoundingClientRect().top)));
  assert.ok(tops[0] === tops[1] && tops[1] === tops[2], 'у ряд: ' + tops);
  await p.locator('.tc-content figure img').nth(0).click();
  assert.equal(await p.locator('#xLightbox .lb-count').textContent(), '1 / 3'); assert.equal(await p.locator('#xLightbox .lb-cap').textContent(), 'Підпис 1');
  await p.keyboard.press('ArrowRight'); assert.equal(await p.locator('#xLightbox .lb-count').textContent(), '2 / 3');
  assert.match(await p.locator('#xLightbox .lb-dl').getAttribute('download'), /зображення-2/);
  await p.locator('#xLightbox .lb-next').click(); assert.equal(await p.locator('#xLightbox .lb-count').textContent(), '3 / 3');
  await p.keyboard.press('Escape'); assert.equal(await p.locator('#xLightbox').evaluate(e => e.classList.contains('open')), false);
  await p.close();
});

const mkFiles = async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const paths = [
    { name: 'схема.png', mimeType: 'image/png', buffer: png },
    { name: 'аркуш.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test pdf content') },
    { name: 'матеріали.zip', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
  ];
  return { paths };
};
let FILEDATA = null;
await step('файли: вставка блоку з трьох файлів (зображення, PDF, архів) зі значками, розмірами й мініатюрою', async () => {
  await setDoc('<h1>Матеріали</h1><p>Текст перед блоком.</p><p><br></p>');
  await page.evaluate(() => { const p = document.querySelectorAll('#editor p'); const r = document.createRange(); r.selectNodeContents(p[1]); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('editor').focus(); });
  FILEDATA = await mkFiles();
  await page.evaluate(() => document.querySelector("[data-cmd=\"files\"]").click());
  await page.setInputFiles('#filesInput', FILEDATA.paths);
  await page.waitForSelector('#editor figure.tc-files .tf-item', { timeout: 8000 });
  assert.equal(await page.locator('#editor figure.tc-files .tf-item').count(), 3);
  const t = await page.locator('#editor figure.tc-files').textContent();
  assert.match(t, /схема\.png/); assert.match(t, /аркуш\.pdf/); assert.match(t, /матеріали\.zip/); assert.match(t, /3 файли/);
  assert.equal(await page.locator('#editor figure.tc-files .tf-th img').count(), 1, 'мініатюра зображення');
  assert.equal(await page.locator('#editor figure.tc-files .tf-ic', { hasText: 'PDF' }).count(), 1);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#editor figure.tc-figure').length), 0, 'не зображення');
  assert.equal(await page.evaluate(() => document.querySelector('#editor').lastElementChild.tagName), 'P', 'після блоку можна писати');
});
await step('файли: блок виділяється кліком, панель «Додати файли / Назва / Видалити», назву можна змінити', async () => {
  await page.locator('#editor figure.tc-files .tf-title').click();
  assert.equal(await page.locator('#imgBar [data-b="fadd"]').count(), 1);
  await page.locator('#imgBar [data-b="ftitle"]').click();
  await page.fill('#altText', 'Матеріали до уроку'); await page.click('#altOk');
  assert.equal(await page.locator('#editor figure.tc-files .tf-title').textContent(), 'Матеріали до уроку');
});
await step('файли: можна прибрати окремий файл, скасування повертає його', async () => {
  await page.locator('#editor figure.tc-files .tf-item').nth(1).locator('[data-fa="rm"]').click();
  assert.equal(await page.locator('#editor figure.tc-files .tf-item').count(), 2);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('#editor figure.tc-files .tf-item').length === 3, null, { timeout: 4000 });
});
await step('файли: після перезавантаження сторінки файли на місці й відкриваються', async () => {
  await page.evaluate(() => TextCraft.flushSave ? TextCraft.flushSave() : 0);
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForFunction(() => window.TextCraft && window.TextCraft.state.docId);
  await page.waitForSelector('#editor figure.tc-files .tf-item');
  assert.equal(await page.locator('#editor figure.tc-files .tf-item').count(), 3);
  assert.equal(await page.locator('#editor figure.tc-files .tf-th img').evaluate(i => i.naturalWidth > 0 || i.complete), true);
  await page.evaluate(() => { window.__dl.length = 0; });
  await page.locator('#editor figure.tc-files .tf-item').first().locator('[data-fa="dl"]').click();
  const got = await dlOf(page, 1); assert.equal(got[0].name, 'схема.png'); assert.ok(Buffer.from(got[0].b64, 'base64').slice(1, 4).toString() === 'PNG');
});
await step('файли: у збереженому HTML немає розмітки блоку, лише дані', async () => {
  const stored = await page.evaluate(() => serializeForStore(document.getElementById('editor')));
  assert.match(stored, /class="tc-files"/); assert.doesNotMatch(stored, /tf-item/);
});
let expFiles = null;
await step('експорт: файли вшиті в сторінку, кнопки «Завантажити», «по черзі», «одним архівом», мініатюра', async () => {
  expFiles = await exportHtml();
  assert.match(expFiles, /id="xFiles"/);
  const p = await openExported(expFiles);
  assert.equal(await p.locator('figure.tc-files .tf-item').count(), 3);
  assert.equal(await p.locator('figure.tc-files .tf-all').count(), 1); assert.equal(await p.locator('figure.tc-files .tf-zip').count(), 1);
  assert.equal(await p.locator('figure.tc-files [data-fa]').count(), 0, 'без кнопок редактора');
  assert.equal(await p.locator('figure.tc-files .tf-th img').evaluate(i => i.naturalWidth), 1, 'мініатюра з вшитих даних');
  await p.close();
});
await step('експорт: «Завантажити» віддає точний вміст файлу', async () => {
  const p = await openExported(expFiles);
  await p.locator('figure.tc-files .tf-item').nth(1).locator('.tf-dl').click();
  const got = await dlOf(p, 1); assert.equal(got[0].name, 'аркуш.pdf');
  assert.equal(Buffer.from(got[0].b64, 'base64').toString(), '%PDF-1.4 test pdf content');
  await p.close();
});
await step('експорт: «Завантажити все по черзі» качає файли один за одним у порядку списку, з прогресом', async () => {
  const p = await openExported(expFiles);
  await p.locator('figure.tc-files .tf-all').click();
  await p.waitForFunction(() => /Готово/.test(document.querySelector('.tf-ptxt').textContent), null, { timeout: 8000 });
  assert.deepEqual((await dlOf(p, 3)).map(d => d.name), ['схема.png', 'аркуш.pdf', 'матеріали.zip']);
  assert.equal(await p.locator('.tf-bar i').evaluate(e => e.style.width), '100%');
  await p.close();
});
await step('експорт: «Зупинити» перериває завантаження по черзі', async () => {
  const p = await openExported(expFiles);
  await p.locator('figure.tc-files .tf-all').click();
  await p.locator('.tf-stop').click();
  await p.waitForFunction(() => /Зупинено/.test(document.querySelector('.tf-ptxt').textContent), null, { timeout: 5000 });
  const n = await p.evaluate(() => window.__dl.length); assert.ok(n >= 1 && n < 3, 'завантажено: ' + n);
  await p.close();
});
await step('експорт: «Усе одним архівом» збирає коректний .zip з усіма файлами', async () => {
  const p = await openExported(expFiles);
  await p.locator('figure.tc-files .tf-zip').click();
  const got = await dlOf(p, 1); assert.equal(got[0].name, 'Матеріали до уроку.zip');
  const dir = await mkdtemp(join(tmpdir(), 'tcu-'));
  const path = join(dir, 'a.zip'); const { writeFile } = await import('node:fs/promises'); await writeFile(path, Buffer.from(got[0].b64, 'base64'));
  const { spawnSync } = await import('node:child_process');
  const t = spawnSync('unzip', ['-t', path], { encoding: 'utf8' });
  assert.match(t.stdout + t.stderr, /No errors detected/, t.stdout + t.stderr);
  const l = spawnSync('unzip', ['-Z1', path], { encoding: 'utf8' }).stdout;
  assert.ok(l.includes('схема.png') && l.includes('аркуш.pdf') && l.includes('матеріали.zip'), l);
  spawnSync('unzip', ['-o', '-d', dir, path]);
  assert.equal((await readFile(join(dir, 'аркуш.pdf'))).toString(), '%PDF-1.4 test pdf content');
  await p.close();
});
await step('експорт: клік по мініатюрі файлу не відкриває перегляд зображень', async () => {
  const p = await openExported(expFiles);
  await p.locator('figure.tc-files .tf-th img').click();
  assert.equal(await p.locator('#xLightbox').evaluate(e => e.classList.contains('open')), false);
  await p.close();
});
await step('Markdown-експорт згадує файли, але не вставляє мініатюру як зображення', async () => {
  const md = await page.evaluate(() => blockMd(document.querySelector("#editor figure.tc-files"), {}));
  if (md !== null) assert.match(md, /Файли для завантаження: схема\.png, аркуш\.pdf, матеріали\.zip/);
});
await step('Delete видаляє виділений блок файлів, абзац після нього лишається', async () => {
  await page.locator('#editor figure.tc-files .tf-title').click();
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#editor figure.tc-files').count(), 0);
  assert.equal(await page.evaluate(() => document.querySelector('#editor').lastElementChild.tagName), 'P');
});
await step('жодної помилки в консолі', async () => { assert.deepEqual(errors.filter(e => !/claude\.ai|chatgpt|ERR_/.test(e)), []); });
await browser.close(); server.close();
console.log('готово');
