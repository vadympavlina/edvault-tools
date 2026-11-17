// TextCraft · Edvault — Файли для завантаження: блок «Файли» вбудовується в сторінку, файли зберігаються разом з документом
// й вшиваються в експортований HTML. Файли підключаються звичайними <script> по черзі й мають спільну глобальну область видимості.
'use strict';

/* ═══════════════════════════ СХОВИЩЕ ФАЙЛІВ ═══════════════════════════ */
const FILE_MAX = 100 * 1024 * 1024;       // один файл
const FILES_WARN = 40 * 1024 * 1024;      // загальний розмір, після якого попереджаємо про важку сторінку
const Files = {
  map: new Map(), // id → { id, name, size, type, data (data URL), url (blob) }
  add(rec) {
    const id = rec.id || uid('f');
    const f = { id, name: rec.name, size: rec.size, type: rec.type || 'application/octet-stream', data: rec.data };
    try { f.url = URL.createObjectURL(dataUrlToBlob(f.data)); } catch (e) { f.url = f.data; }
    this.map.set(id, f);
    return f;
  },
  get(id) { return this.map.get(id) || null; },
  clear() { this.map.forEach(f => { if (f.url && f.url.startsWith('blob:')) URL.revokeObjectURL(f.url); }); this.map.clear(); },
  // файли, які реально лежать у блоках документа
  collect(root) {
    const out = {};
    $$('figure.tc-files', root).forEach(b => filesOf(b).forEach(it => { const f = this.map.get(it.id); if (f) out[f.id] = { name: f.name, size: f.size, type: f.type, data: f.data }; }));
    return out;
  },
  restore(obj) { Object.keys(obj || {}).forEach(id => this.add(Object.assign({ id }, obj[id]))); },
};
function filesOf(block) { try { const a = JSON.parse(block.getAttribute('data-files') || '[]'); return Array.isArray(a) ? a.filter(x => x && x.id) : []; } catch (e) { return []; } }
function setFilesOf(block, list) { block.setAttribute('data-files', JSON.stringify(list.map(x => ({ id: x.id, n: x.n, s: x.s, t: x.t })))); }
function fmtSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' КБ';
  return (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' МБ';
}
// тип файлу: підпис, колір значка й слово для опису
function fileKind(name, type) {
  const ext = (String(name).match(/\.([a-z0-9]{1,6})$/i) || [, ''])[1].toLowerCase();
  const T = (lab, col, word) => ({ lab, col, word, ext });
  if (/^image\//.test(type) || /^(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/.test(ext)) return Object.assign(T(ext ? ext.toUpperCase().slice(0, 4) : 'IMG', '#3d7dca', 'Зображення'), { img: /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif)$/.test(type) });
  if (ext === 'pdf' || type === 'application/pdf') return T('PDF', '#d94b4b', 'PDF');
  if (/^(zip|rar|7z|tar|gz|tgz)$/.test(ext) || /zip|compressed|x-tar|x-7z|rar/.test(type)) return T(ext ? ext.toUpperCase().slice(0, 3) : 'ZIP', '#d98a00', 'Архів');
  if (/^(docx?|odt|rtf)$/.test(ext)) return T('DOC', '#2f6fd0', 'Документ');
  if (/^(xlsx?|ods|csv)$/.test(ext)) return T(ext === 'csv' ? 'CSV' : 'XLS', '#1f8a5b', 'Таблиця');
  if (/^(pptx?|odp|key)$/.test(ext)) return T('PPT', '#e06b2c', 'Презентація');
  if (/^(mp4|mov|webm|avi|mkv)$/.test(ext) || /^video\//.test(type)) return T('VID', '#7a4fc0', 'Відео');
  if (/^(mp3|wav|ogg|m4a|flac)$/.test(ext) || /^audio\//.test(type)) return T('AUD', '#7a4fc0', 'Аудіо');
  if (/^(txt|md|log)$/.test(ext) || /^text\/plain/.test(type)) return T('TXT', '#5d6478', 'Текст');
  if (/^(js|ts|py|html?|css|json|xml|java|cs|cpp|php|sql|sh)$/.test(ext)) return T(ext.toUpperCase().slice(0, 4), '#3a8f8f', 'Код');
  return T(ext ? ext.toUpperCase().slice(0, 4) : 'ФАЙЛ', '#5d6478', 'Файл');
}
function totalFilesSize(list) { return list.reduce((a, x) => a + (x.s || 0), 0); }
function filesWord(n) { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? 'файл' : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 'файли' : 'файлів'); }

/* ═══════════════════════════ ВІДОБРАЖЕННЯ БЛОКУ ═══════════════════════════ */
// Один і той самий код малює блок у редакторі (mode 'edit') й у вихідному документі для експорту (mode 'export').
function filesMarkup(block, mode) {
  const list = filesOf(block), edit = mode === 'edit';
  const title = block.getAttribute('data-title') || 'Файли для завантаження';
  const total = totalFilesSize(list);
  const head = '<div class="tf-head"><b class="tf-title">' + esc(title) + '</b><small>' + (list.length ? filesWord(list.length) + ' · ' + fmtSize(total) : 'порожньо') + '</small><span class="tf-sp"></span>' +
    (edit ? '<button type="button" class="tf-btn" data-fa="add">+ Додати файли</button>'
      : (list.length > 1 ? '<button type="button" class="tf-btn tf-all">Завантажити все по черзі</button><button type="button" class="tf-btn tf-btn-main tf-zip">Усе одним архівом</button>' : '')) + '</div>';
  const items = list.map(it => {
    const k = fileKind(it.n, it.t), f = Files.get(it.id);
    const ic = k.img && f ? '<span class="tf-ic tf-th"><img src="' + esc(edit ? f.url : '') + '" alt="" data-th="' + esc(it.id) + '"></span>' : '<span class="tf-ic" style="background:' + k.col + '">' + esc(k.lab) + '</span>';
    return '<div class="tf-item" data-id="' + esc(it.id) + '">' + ic + '<span class="tf-n"><b>' + esc(it.n) + '</b><span>' + esc(k.word) + ' · ' + fmtSize(it.s || 0) + '</span></span>' +
      (edit ? '<button type="button" class="tf-btn tf-x" data-fa="rm" data-id="' + esc(it.id) + '" aria-label="Прибрати файл" data-tip="Прибрати файл">×</button>' : '') +
      '<button type="button" class="tf-btn tf-dl" data-id="' + esc(it.id) + '"' + (edit ? ' data-fa="dl"' : '') + '>Завантажити</button></div>';
  }).join('');
  const empty = '<div class="tf-empty">Перетягніть файли сюди або натисніть «Додати файли». Можна прикріпити й архів .zip.</div>';
  return head + '<div class="tf-list">' + (list.length ? items : (edit ? empty : '')) + '</div>' + (edit ? '' : '<div class="tf-prog" hidden><div class="tf-bar"><i></i></div><span class="tf-ptxt"></span><button type="button" class="tf-btn tf-stop">Зупинити</button></div>');
}
function renderFilesBlock(block) {
  const sig = (block.getAttribute('data-files') || '') + '|' + (block.getAttribute('data-title') || '') + '|e';
  if (block.__sig === sig && block.firstChild) return;
  block.__sig = sig;
  block.setAttribute('contenteditable', 'false');
  block.innerHTML = filesMarkup(block, 'edit');
}
function renderAllFiles(root) { $$('figure.tc-files', root || editor).forEach(renderFilesBlock); }

/* ═══════════════════════════ ДОДАВАННЯ ФАЙЛІВ ═══════════════════════════ */
function readFileAsDataUrl(file) {
  return new Promise(res => { const r = new FileReader(); r.onerror = () => res(null); r.onload = e => res(e.target.result); r.readAsDataURL(file); });
}
async function ingestFiles(files) {
  const out = [];
  for (const f of Array.from(files || [])) {
    if (!f) continue;
    if (f.size > FILE_MAX) { toast('«' + f.name + '» завелике: ліміт ' + fmtSize(FILE_MAX), 'err'); continue; }
    const data = await readFileAsDataUrl(f);
    if (!data) { toast('Не вдалося прочитати «' + f.name + '»', 'err'); continue; }
    const rec = Files.add({ name: f.name, size: f.size, type: f.type || 'application/octet-stream', data });
    out.push({ id: rec.id, n: rec.name, s: rec.size, t: rec.type });
  }
  return out;
}
function newFilesBlock(list) {
  const fig = document.createElement('figure');
  fig.className = 'tc-files';
  fig.setAttribute('contenteditable', 'false');
  setFilesOf(fig, list || []);
  fig.setAttribute('data-title', 'Файли для завантаження');
  renderFilesBlock(fig);
  return fig;
}
function warnHeavy() {
  const total = Array.from(Files.map.values()).reduce((a, f) => a + (f.size || 0), 0);
  if (total > FILES_WARN) toast('У документі вже ' + fmtSize(total) + ' файлів: експортована сторінка стане важкою й повільно відкриватиметься', 'warn', { duration: 6500 });
}
// додати файли в блок (новий або вибраний)
async function addFilesTo(block, files) {
  const added = await ingestFiles(files);
  if (!added.length) return;
  mutate(() => {
    const cur = filesOf(block).map(x => ({ id: x.id, n: x.n, s: x.s, t: x.t }));
    setFilesOf(block, cur.concat(added));
    block.__sig = '';
    renderFilesBlock(block);
  });
  UI.selectedFigure = null; UI.selectFigure(block);
  warnHeavy();
  toast(added.length === 1 ? 'Файл додано' : 'Додано файлів: ' + added.length, 'ok');
}
async function insertFilesBlock(files) {
  const added = await ingestFiles(files);
  if (!added.length) return;
  const fig = newFilesBlock(added);
  mutate(() => { insertBlocks([fig]); caretAfterBlock(fig); });
  UI.selectedFigure = null; UI.selectFigure(fig);
  warnHeavy();
}
function pickFiles(target) {
  const input = $('#filesInput');
  input.onchange = async e => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    if (target && target.isConnected) await addFilesTo(target, files); else await insertFilesBlock(files);
  };
  input.click();
}
function doInsertFilesBlock() { pickFiles(null); }

/* ═══════════════════════════ ДІЇ НА БЛОЦІ ═══════════════════════════ */
function filesBarHtml(block) {
  return bar([
    { b: 'fadd', icon: 'upload', label: 'Додати файли', tip: 'Прикріпити ще файли чи архів' },
    { b: 'ftitle', icon: 'text', label: 'Назва', tip: 'Змінити назву блоку' }, '|',
    { b: 'delete', icon: 'trash', tip: 'Видалити блок разом із файлами', cls: 'danger' },
  ]);
}
function filesBarAction(block, v) {
  if (v === 'fadd') { pickFiles(block); return true; }
  if (v === 'ftitle') {
    openTextModal({ title: 'Назва блоку', label: 'Заголовок над списком файлів', value: block.getAttribute('data-title') || '', placeholder: 'Наприклад: Матеріали до уроку', hint: 'Цей заголовок побачать читачі сторінки.', onOk: val => {
      mutate(() => { block.setAttribute('data-title', val || 'Файли для завантаження'); block.__sig = ''; renderFilesBlock(block); });
      UI.selectedFigure = null; UI.selectFigure(block);
    } });
    return true;
  }
  if (v === 'delete') { UI.deleteSelectedFigure(); return true; }
  return false;
}
// клацання по кнопках усередині блоку в редакторі
editor.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('figure.tc-files [data-fa]');
  if (!b) return;
  e.preventDefault();
  const block = b.closest('figure.tc-files'), act = b.dataset.fa, id = b.dataset.id;
  if (act === 'add') { pickFiles(block); return; }
  if (act === 'rm') {
    mutate(() => { setFilesOf(block, filesOf(block).filter(x => x.id !== id)); block.__sig = ''; renderFilesBlock(block); });
    UI.selectedFigure = null; UI.selectFigure(block);
    return;
  }
  if (act === 'dl') { const f = Files.get(id); if (f) downloadFile(f.name, dataUrlToBlob(f.data), f.type); }
});
// перетягування файлів на блок
editor.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('figure.tc-files') && hasFiles(e)) { e.preventDefault(); e.stopPropagation(); e.target.closest('figure.tc-files').classList.add('drag'); } });
editor.addEventListener('dragleave', e => { const b = e.target.closest && e.target.closest('figure.tc-files'); if (b) b.classList.remove('drag'); });
editor.addEventListener('drop', e => {
  const b = e.target.closest && e.target.closest('figure.tc-files');
  if (!b || !hasFiles(e)) return;
  e.preventDefault(); e.stopPropagation(); b.classList.remove('drag');
  addFilesTo(b, e.dataTransfer.files);
}, true);

/* ═══════════════════════════ ЗАГАЛЬНЕ ВІКНО «ТЕКСТ» ═══════════════════════════ */
let textModalCtx = null;
function openTextModal(o) {
  textModalCtx = o;
  $('#altModalTitle').textContent = o.title;
  $('#altLabel').textContent = o.label;
  const inp = $('#altText'); inp.value = o.value || ''; inp.placeholder = o.placeholder || '';
  $('#altHint').textContent = o.hint || '';
  Modal.open('altModal');
  setTimeout(() => { inp.focus(); inp.select(); }, 40);
}
function confirmTextModal() {
  const c = textModalCtx; textModalCtx = null;
  Modal.close('altModal');
  if (c && c.onOk) c.onOk($('#altText').value.trim());
}
$('#altOk').addEventListener('click', confirmTextModal);
$('#altText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmTextModal(); } });
