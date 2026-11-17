// TextCraft · Edvault — Експорт у HTML і довідка.
// Файли підключаються звичайними <script> по черзі й мають спільну глобальну область видимості.
'use strict';

/* ═══════════════════════════ ЕКСПОРТ ═══════════════════════════ */
function fileName() { return docLabel().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document'; }
function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Файл «' + name + '» збережено', 'ok');
}
function exportClone() {
  const c = editor.cloneNode(true);
  ['id', 'contenteditable', 'spellcheck', 'role', 'aria-multiline', 'aria-label'].forEach(a => c.removeAttribute(a));
  c.className = 'tc-content';
  $$('img', c).forEach(img => {
    const a = img.dataset.asset && Assets.get(img.dataset.asset);
    if (a) img.setAttribute('src', a.data);
    img.removeAttribute('data-asset');
    img.removeAttribute('draggable');
    img.setAttribute('loading', 'lazy');
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
  });
  $$('[data-empty]', c).forEach(el => el.removeAttribute('data-empty'));
  $$('figure.tc-files', c).forEach(b => { b.removeAttribute('contenteditable'); b.removeAttribute('class'); b.className = 'tc-files'; b.innerHTML = filesMarkup(b, 'export'); b.removeAttribute('data-files'); });
  $$('.tc-toggle', c).forEach(b => {
    const d = document.createElement('details');
    d.className = 'tc-block tc-toggle';
    const sum = document.createElement('summary');
    const title = b.firstElementChild;
    if (title) { while (title.firstChild) sum.appendChild(title.firstChild); title.remove(); }
    if (!sum.textContent.trim()) sum.textContent = 'Відповідь';
    d.appendChild(sum);
    while (b.firstChild) d.appendChild(b.firstChild);
    b.replaceWith(d);
  });
  $$('figcaption', c).forEach(f => { if (isEmptyBlock(f)) f.remove(); });
  while (c.firstElementChild && isSplittable(c.firstElementChild) && isEmptyBlock(c.firstElementChild)) c.firstElementChild.remove();
  while (c.lastElementChild && isSplittable(c.lastElementChild) && isEmptyBlock(c.lastElementChild)) c.lastElementChild.remove();
  $$('a[href]', c).forEach(setExternal);
  let n = 0;
  $$('h1,h2,h3', c).forEach(h => { h.id = 'sec-' + (++n); });
  const origBlocks = $$('.tc-prompt,pre.tc-code', editor);
  $$('.tc-prompt,pre.tc-code', c).forEach((b, i) => {
    b.setAttribute('data-copy', plainText(origBlocks[i] || b));
    const code = b.tagName === 'PRE' && b.querySelector('code');
    if (code && b.dataset.lang !== 'text') code.innerHTML = hlHtml(code.textContent, b.dataset.lang || '');
    if (b.tagName !== 'PRE') decoratePrompt(b, origBlocks[i] || b);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tc-copy';
    btn.textContent = 'Копіювати';
    b.insertBefore(btn, b.firstChild);
    if (b.tagName !== 'PRE') {
      const chat = document.createElement('button');
      chat.type = 'button';
      chat.className = 'tc-chat';
      chat.textContent = 'Відкрити в чаті';
      b.insertBefore(chat, b.firstChild);
    }
  });
  return c;
}
// Змінні [У ДУЖКАХ] у промпті стають чіпами; з’являється форма для їх заповнення й підвал зі статистикою
const PROMPT_VAR = /\[([^\[\]\n]{1,40})\]/g;
function decoratePrompt(block, orig) {
  const names = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(t => {
    const text = t.nodeValue;
    PROMPT_VAR.lastIndex = 0;
    if (!PROMPT_VAR.test(text)) return;
    PROMPT_VAR.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let at = 0, m;
    while ((m = PROMPT_VAR.exec(text))) {
      if (m.index > at) frag.appendChild(document.createTextNode(text.slice(at, m.index)));
      const name = m[1].trim();
      if (!names.includes(name)) names.push(name);
      const sp = document.createElement('span');
      sp.className = 'tc-var'; sp.setAttribute('data-var', name); sp.textContent = m[0];
      frag.appendChild(sp);
      at = m.index + m[0].length;
    }
    if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
    t.parentNode.replaceChild(frag, t);
  });
  if (names.length) {
    const form = document.createElement('div');
    form.className = 'tc-vars';
    names.forEach(nm => {
      const l = document.createElement('label');
      l.appendChild(document.createTextNode(nm));
      const i = document.createElement('input');
      i.type = 'text'; i.setAttribute('data-var', nm); i.placeholder = 'Заповніть: ' + nm.toLowerCase(); i.setAttribute('aria-label', nm);
      l.appendChild(i); form.appendChild(l);
    });
    const first = Array.from(block.children).find(x => x.tagName !== 'BUTTON');
    block.insertBefore(form, first || null);
  }
  const foot = document.createElement('div');
  foot.className = 'tc-promptfoot';
  const words = countWords(plainText(orig));
  foot.innerHTML = '<span>' + words + ' ' + pluralUk(words, 'слово', 'слова', 'слів') + '</span>' + (names.length ? '<span>' + names.length + ' ' + pluralUk(names.length, 'змінна', 'змінні', 'змінних') + ': заповніть перед копіюванням</span>' : '');
  block.appendChild(foot);
}
function pluralUk(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
const EXPORT_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Commissioner',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
.x-layout{display:flex;align-items:flex-start;min-height:100vh}
.x-toc{width:270px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--surface);border-right:1px solid var(--border);padding:20px 12px 28px}
.x-toc-title{font-size:14px;font-weight:700;color:var(--text);padding:0 10px 10px}
.x-toc input{width:100%;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);padding:0 10px;font:13px 'Commissioner',sans-serif;outline:none;margin-bottom:8px}
.x-toc input:focus{border-color:var(--accent-border)}
.x-toc a{display:block;padding:6px 10px;margin-bottom:1px;border-radius:7px;font-size:13px;line-height:1.4;color:var(--text2);text-decoration:none;border-left:2px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x-toc a:hover{background:var(--surface2);color:var(--text)}
.x-toc a.l1{font-weight:600;color:var(--text)}
.x-toc a.l2{padding-left:20px}
.x-toc a.l3{padding-left:32px;font-size:12.5px}
.x-toc a.active{color:var(--text);background:linear-gradient(transparent 30%,var(--marker-soft) 30%,var(--marker-soft) 90%,transparent 90%)}
.x-toc a.hidden{display:none}
.x-main{flex:1;min-width:0}
.x-wrap{max-width:var(--page-w,960px);margin:0 auto;padding:40px 24px 120px}
.x-page{--pad-x:72px;--pad-y:60px;background:var(--surface);border:1px solid var(--border);border-radius:2px;box-shadow:var(--shadow-md);padding:var(--pad-y) var(--pad-x)}
.x-page .doc-header{margin:calc(-1*var(--pad-y)) calc(-1*var(--pad-x)) 36px;border-radius:2px 2px 0 0}
.x-page .doc-header:has(+ .doc-student){margin-bottom:0}
.x-page .doc-student{margin:0 calc(-1*var(--pad-x)) 32px;padding:16px var(--pad-x) 14px;border-bottom:1px solid var(--border)}
.tc-content .tc-prompt,.tc-content pre.tc-code{position:relative}
.tc-copy{position:absolute;top:5px;right:8px;z-index:2;height:26px;padding:0 11px;border-radius:0;cursor:pointer;font:600 11.5px 'Commissioner',sans-serif;border:1px solid var(--accent-border);background:var(--surface);color:var(--accent);transition:background .12s,color .12s}
.tc-copy:hover{background:var(--accent);color:var(--on-accent)}
.tc-chat{position:absolute;top:5px;right:98px;z-index:2;height:26px;padding:0 11px;border-radius:0;cursor:pointer;font:600 11.5px 'Commissioner',sans-serif;border:1px solid var(--accent);background:var(--accent);color:var(--on-accent)}
.tc-chat:hover{background:var(--accent-hover)}
.tc-chatmenu{position:absolute;z-index:30;min-width:190px;padding:6px;border-radius:0;background:var(--surface);border:1px solid var(--border2);box-shadow:var(--shadow-lg);font-family:'Commissioner',sans-serif}
.tc-chatmenu a{display:block;padding:8px 12px;border-radius:0;font-size:13.5px;font-weight:600;color:var(--text);text-decoration:none}
.tc-chatmenu a:hover{background:var(--accent-light);color:var(--accent)}
.tc-chatmenu small{display:block;padding:4px 12px 2px;color:var(--muted);font-size:11.5px}
pre.tc-code .tc-copy{top:4px;border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:var(--code-text)}
pre.tc-code .tc-copy:hover{background:rgba(255,255,255,.18);color:#fff}
.tc-copy.done{background:var(--success)!important;border-color:var(--success)!important;color:#fff!important}
.tc-content figure.tc-figure img{cursor:zoom-in}
.x-lightbox{flex-direction:column;gap:10px}
.x-lightbox figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;max-width:94vw}
.x-lightbox img{cursor:default}
.x-lightbox .lb-cap{color:#e8ebf7;font:14px/1.5 'Commissioner',system-ui,sans-serif;text-align:center;max-width:70ch}
.x-lightbox .lb-cap:empty{display:none}
.x-lightbox .lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;font-size:24px;line-height:1}
.x-lightbox .lb-nav:hover{background:rgba(255,255,255,.26)}
.x-lightbox .lb-prev{left:18px}.x-lightbox .lb-next{right:18px}
.x-lightbox.single .lb-nav{display:none}
.x-lightbox .lb-bar{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center;align-items:center;gap:14px;color:#e8ebf7;font:600 13px 'Commissioner',sans-serif;pointer-events:none}
.x-lightbox .lb-dl{pointer-events:auto;height:32px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.x-lightbox .lb-dl:hover{background:rgba(255,255,255,.22)}
.tc-content figure.tc-files{margin:1.4em 0}
.tc-content figure.tc-files .tf-th img{cursor:default}
.x-progress{position:fixed;top:0;left:0;height:3px;width:0;background:var(--accent);z-index:50}
.x-top{position:fixed;right:24px;bottom:24px;width:42px;height:42px;border-radius:50%;border:1px solid var(--border2);background:var(--surface);color:var(--text2);box-shadow:var(--shadow-md);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;pointer-events:none;transform:translateY(8px);transition:opacity .15s,transform .15s}
.x-top.show{opacity:1;pointer-events:auto;transform:none}
.x-top svg{width:18px;height:18px}
.x-lightbox{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;background:rgba(10,12,18,.9);cursor:zoom-out}
.x-lightbox.open{display:flex}
.x-lightbox img{max-width:94vw;max-height:90vh;border-radius:8px}
.x-foot{text-align:center;font-size:12px;color:var(--muted);margin-top:18px}
@media(max-width:900px){.x-layout{display:block}.x-toc{position:static;width:auto;height:auto;max-height:280px;border-right:0;border-bottom:1px solid var(--border)}.x-page{--pad-x:36px;--pad-y:36px}}
@media(max-width:640px){.x-page{--pad-x:20px;--pad-y:26px}.x-wrap{padding:12px 8px 60px}}
@media print{.x-toc,.x-progress,.x-top,.tc-copy,.x-foot{display:none!important}body{background:#fff}.x-wrap{padding:0;max-width:none}.x-page{border:0;box-shadow:none;padding:0}.x-page .doc-header{margin:0 0 28px;border-radius:4px}.x-page .doc-header:has(+ .doc-student){margin-bottom:0}.x-page .doc-student{margin:0 0 24px;padding:18px 0 10px}.tc-content .tc-block,.tc-content pre.tc-code,.tc-content figure,.tc-content table{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
const EXPORT_JS = `
(function(){
  var root=document.documentElement,mq=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)');
  function th(){root.setAttribute('data-theme',mq&&mq.matches?'dark':'light')}th();
  if(mq&&mq.addEventListener)mq.addEventListener('change',th);
  function copy(text,done){
    function fb(){var t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}t.remove();done(ok)}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){done(true)},fb);else fb();
  }
  document.addEventListener('click',function(e){
    var v=e.target.closest&&e.target.closest('.tc-var');
    if(v){var vi=v.closest('.tc-prompt').querySelector('.tc-vars input[data-var="'+v.getAttribute('data-var').replace(/"/g,'')+'"]');if(vi){vi.focus();vi.scrollIntoView({block:'nearest'})}return}
    var cm=document.querySelector('.tc-chatmenu');if(cm&&!(e.target.closest&&e.target.closest('.tc-chatmenu'))&&!(e.target.closest&&e.target.closest('.tc-chat')))cm.remove();
    var ch=e.target.closest&&e.target.closest('.tc-chat');
    if(ch){var old=document.querySelector('.tc-chatmenu');if(old){old.remove();return}
      var pb=ch.parentNode,mn=document.createElement('div');mn.className='tc-chatmenu';
      mn.innerHTML='<small>Відкрити промпт у…</small><a href="#" data-chat="https://chatgpt.com/?q=">ChatGPT</a><a href="#" data-chat="https://claude.ai/new?q=">Claude</a><a href="#" data-chat="https://gemini.google.com/app" data-copy-first="1">Gemini (промпт скопіюється)</a>';
      mn.style.top=(ch.offsetTop+ch.offsetHeight+4)+'px';mn.style.right='8px';pb.appendChild(mn);return}
    var ca=e.target.closest&&e.target.closest('[data-chat]');
    if(ca){e.preventDefault();var pbl=ca.closest('.tc-prompt'),txt=promptText(pbl),base=ca.getAttribute('data-chat');
      if(ca.getAttribute('data-copy-first')||txt.length>1800){copy(txt,function(){window.open(base.split('?')[0],'_blank','noopener')})}else window.open(base+encodeURIComponent(txt),'_blank','noopener');
      ca.closest('.tc-chatmenu').remove();return}
    var b=e.target.closest&&e.target.closest('.tc-copy');
    if(b){var blk=b.parentNode;copy(promptText(blk),function(ok){b.classList.add('done');b.textContent=ok?'Скопійовано':'Виділіть і Ctrl+C';setTimeout(function(){b.classList.remove('done');b.textContent='Копіювати'},1600)});return}
    var tdl=e.target.closest&&e.target.closest('.tf-dl');
    if(tdl){var fb=blobOf(tdl.getAttribute('data-id'));if(fb)saveBlob(fb,fdata()[tdl.getAttribute('data-id')].n);return}
    var tall=e.target.closest&&e.target.closest('.tf-all');if(tall){sequential(tall.closest('figure.tc-files'));return}
    var tzip=e.target.closest&&e.target.closest('.tf-zip');if(tzip){zipAll(tzip.closest('figure.tc-files'));return}
    if(e.target.closest&&e.target.closest('.tf-stop')){seqStop=true;return}
    var lbEl=document.getElementById('xLightbox');
    if(e.target.closest&&e.target.closest('.lb-prev')){lbStep(-1);return}
    if(e.target.closest&&e.target.closest('.lb-next')){lbStep(1);return}
    if(e.target.closest&&e.target.closest('.lb-dl'))return;
    var img=e.target.closest&&e.target.closest('.tc-content figure.tc-figure img');
    if(img){lbList=[].slice.call(document.querySelectorAll('.tc-content figure.tc-figure img'));lbI=lbList.indexOf(img);lbShow();lbEl.classList.add('open');return}
    if(e.target.closest&&e.target.closest('#xLightbox')&&!(e.target.tagName==='IMG'||e.target.closest('.lb-cap')))lbEl.classList.remove('open');
  });
  var FILES=null;
  function fdata(){if(FILES)return FILES;var el=document.getElementById('xFiles');try{FILES=el?JSON.parse(el.textContent):{}}catch(x){FILES={}}return FILES}
  function toU8(b64){var bin=atob(b64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
  function blobOf(id){var f=fdata()[id];return f?new Blob([toU8(f.d)],{type:f.t||'application/octet-stream'}):null}
  function saveBlob(blob,name){var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},5000)}
  // мініатюри зображень зі списку файлів
  [].forEach.call(document.querySelectorAll('img[data-th]'),function(im){var f=fdata()[im.getAttribute('data-th')];if(f)im.src='data:'+(f.t||'image/png')+';base64,'+f.d});
  var crcT=null;
  function crc32(u){if(!crcT){crcT=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0}}var c2=0xFFFFFFFF;for(var i=0;i<u.length;i++)c2=crcT[(c2^u[i])&255]^(c2>>>8);return(c2^0xFFFFFFFF)>>>0}
  function zipStore(files){var enc=new TextEncoder(),parts=[],cd=[],off=0,d=new Date();
    var time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
    function u16(v){return[v&255,(v>>8)&255]}function u32(v){return[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255]}
    files.forEach(function(f){var nm=enc.encode(f.name),crc=crc32(f.u8),sz=f.u8.length;
      var lh=new Uint8Array([0x50,0x4b,3,4].concat(u16(20),u16(0x0800),u16(0),u16(time),u16(date),u32(crc),u32(sz),u32(sz),u16(nm.length),u16(0)));
      parts.push(lh,nm,f.u8);
      cd.push(new Uint8Array([0x50,0x4b,1,2].concat(u16(20),u16(20),u16(0x0800),u16(0),u16(time),u16(date),u32(crc),u32(sz),u32(sz),u16(nm.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off))),nm);
      off+=lh.length+nm.length+sz});
    var cdSize=0;cd.forEach(function(p){cdSize+=p.length});
    var end=new Uint8Array([0x50,0x4b,5,6].concat(u16(0),u16(0),u16(files.length),u16(files.length),u32(cdSize),u32(off),u16(0)));
    return new Blob(parts.concat(cd,[end]),{type:'application/zip'})}
  function blockItems(blk){return[].map.call(blk.querySelectorAll('.tf-item'),function(it){var id=it.getAttribute('data-id'),f=fdata()[id];return f?{id:id,name:f.n}:null}).filter(Boolean)}
  var seqStop=false;
  function sequential(blk){var items=blockItems(blk),pr=blk.querySelector('.tf-prog'),bar=pr.querySelector('i'),tx=pr.querySelector('.tf-ptxt'),i=0;
    if(!items.length)return;seqStop=false;pr.hidden=false;blk.querySelector('.tf-all').disabled=true;
    function done(msg){tx.textContent=msg;blk.querySelector('.tf-all').disabled=false;pr.querySelector('.tf-stop').hidden=true;setTimeout(function(){pr.hidden=true;pr.querySelector('.tf-stop').hidden=false},3500)}
    function next(){if(seqStop){done('Зупинено: завантажено '+i+' з '+items.length);return}
      if(i>=items.length){bar.style.width='100%';done('Готово: усі файли завантажено ('+items.length+')');return}
      var it=items[i],b=blobOf(it.id);tx.textContent='Завантажуємо '+(i+1)+' з '+items.length+': '+it.name;if(b)saveBlob(b,it.name);i++;bar.style.width=Math.round(i/items.length*100)+'%';setTimeout(next,900)}
    next()}
  function uniq(list){var seen={};return list.map(function(f){var n=f.name,k=0,dot=f.name.lastIndexOf('.'),base=dot>0?f.name.slice(0,dot):f.name,ext=dot>0?f.name.slice(dot):'';while(seen[n.toLowerCase()]){k++;n=base+' ('+(k+1)+')'+ext}seen[n.toLowerCase()]=1;return{name:n,u8:f.u8}})}
  function zipAll(blk){var items=blockItems(blk);if(!items.length)return;var list=uniq(items.map(function(it){return{name:it.name,u8:toU8(fdata()[it.id].d)}}));
    var t=blk.querySelector('.tf-title'),name=((t&&t.textContent.trim())||'файли').replace(/[/:*?"<>|]+/g,'_').split(String.fromCharCode(92)).join('_').slice(0,60);saveBlob(zipStore(list),name+'.zip')}
  var lbList=[],lbI=0;
  function lbShow(){var lb=document.getElementById('xLightbox'),im=lbList[lbI];if(!im)return;var fg=im.closest('figure'),cp=fg&&fg.querySelector('figcaption');
    lb.querySelector('img').src=im.src;lb.querySelector('img').alt=im.alt||'';lb.querySelector('.lb-cap').textContent=cp?cp.textContent.trim():'';
    lb.querySelector('.lb-count').textContent=lbList.length>1?(lbI+1)+' / '+lbList.length:'';lb.classList.toggle('single',lbList.length<2);
    var a=lb.querySelector('.lb-dl');a.href=im.src;a.setAttribute('download','зображення-'+(lbI+1)+(/^data:image\\/png/.test(im.src)?'.png':/^data:image\\/svg/.test(im.src)?'.svg':'.jpg'))}
  function lbStep(d){if(lbList.length<2)return;lbI=(lbI+d+lbList.length)%lbList.length;lbShow()}
  document.addEventListener('keydown',function(ev){var lb=document.getElementById('xLightbox');if(!lb.classList.contains('open'))return;
    if(ev.key==='ArrowLeft'){lbStep(-1);ev.preventDefault()}else if(ev.key==='ArrowRight'){lbStep(1);ev.preventDefault()}});
  function promptText(blk){var t=blk.getAttribute('data-copy')||'';[].forEach.call(blk.querySelectorAll('.tc-vars input'),function(i){var v=i.value.trim();if(v)t=t.split('['+i.getAttribute('data-var')+']').join(v)});return t}
  document.addEventListener('input',function(e){var i=e.target;if(!(i.matches&&i.matches('.tc-vars input')))return;var blk=i.closest('.tc-prompt'),nm=i.getAttribute('data-var'),val=i.value.trim();
    [].forEach.call(blk.querySelectorAll('.tc-var'),function(c){if(c.getAttribute('data-var')===nm){c.textContent=val||'['+nm+']';c.classList.toggle('filled',!!val)}})});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('xLightbox').classList.remove('open')});
  window.addEventListener('beforeprint',function(){[].forEach.call(document.querySelectorAll('details.tc-toggle'),function(d){d.open=true})});
  var links=[].slice.call(document.querySelectorAll('.x-toc a')),heads=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});
  var bar=document.getElementById('xProgress'),top=document.getElementById('xTop'),sch=false;
  function upd(){sch=false;var d=document.documentElement,max=d.scrollHeight-d.clientHeight;bar.style.width=(max>0?Math.min(100,d.scrollTop/max*100):0)+'%';top.classList.toggle('show',d.scrollTop>600);
    var cur=0;for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].getBoundingClientRect().top<=110)cur=i;else break}
    links.forEach(function(a,i){a.classList.toggle('active',i===cur)})}
  window.addEventListener('scroll',function(){if(!sch){sch=true;requestAnimationFrame(upd)}},{passive:true});upd();
  top.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});
  var f=document.getElementById('xTocFilter');if(f)f.addEventListener('input',function(){var q=f.value.trim().toLowerCase();links.forEach(function(a){a.classList.toggle('hidden',!!q&&a.textContent.toLowerCase().indexOf(q)<0)})});
})();
`;
// Текст CSS-файлу редактора, щоб вбудувати його в експортований HTML (файл має працювати сам по собі)
async function cssText(id) {
  const l = document.getElementById(id);
  try { const t = Array.from(l.sheet.cssRules).map(r => r.cssText).join('\n'); if (t) return t; } catch (e) { /* правила недоступні (file://) */ }
  try { return await (await fetch(l.href)).text(); } catch (e) { return ''; }
}
// файли з блоків → JSON для вбудовування в сторінку (base64 без префікса, щоб не дублювати)
function exportFilesJson(c) {
  const out = {};
  $$('figure.tc-files', editor).forEach(b => filesOf(b).forEach(it => {
    const f = Files.get(it.id);
    if (f) out[f.id] = { n: f.name, t: f.type, d: f.data.slice(f.data.indexOf(',') + 1) };
  }));
  return out;
}
async function exportHtml() {
  const title = docLabel();
  const [tokensCss, contentCss] = await Promise.all([cssText('tcTokens'), cssText('tcContentCss')]);
  const content = exportClone();
  const heads = $$('h1,h2,h3', content).filter(h => !h.closest('.tc-block,td,th,li,blockquote'));
  const hd = state.header || defaultHeader();
  if (hd.enabled) heads.unshift({ id: 'doc-title', tagName: 'H1', textContent: headerTitle(hd) });
  const toc = heads.length ? '<aside class="x-toc"><div class="x-toc-title">Зміст</div>' + (heads.length > 8 ? '<input type="text" id="xTocFilter" placeholder="Пошук у змісті…">' : '') +
    heads.map(h => '<a class="l' + h.tagName[1] + '" href="#' + h.id + '">' + esc(h.textContent.trim() || '(без назви)') + '</a>').join('') + '</aside>' : '';
  const h = state.header || defaultHeader();
  const width = { narrow: '780px', normal: '960px', wide: '1320px' }[viewPrefs().width || 'normal'];
  const html = '<!DOCTYPE html>\n<html lang="uk" data-theme="light" data-font="' + esc(viewPrefs().font || 'serif') + '">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="generator" content="TextCraft · Edvault">\n<title>' + esc(title) + '</title>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Commissioner:wght@400..800&family=JetBrains+Mono:wght@400;500;600&family=Literata:ital,opsz,wght@0,7..72,400..800;1,7..72,400..600&display=swap" rel="stylesheet">\n' +
    '<style>' + tokensCss + '</style>\n<style>' + contentCss + '</style>\n<style>:root{--page-w:' + width + '}' + EXPORT_CSS + '</style>\n</head>\n<body>\n' +
    '<div class="x-progress" id="xProgress"></div>\n<div class="x-layout">' + toc + '<main class="x-main"><div class="x-wrap"><article class="x-page">' +
    (h.enabled ? headerMarkup(h, headerTitle(h)) : '') + '\n' + content.outerHTML + '\n</article><div class="x-foot">Створено в TextCraft · Edvault</div></div></main></div>\n' +
    '<button class="x-top" id="xTop" aria-label="Догори"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg></button>\n' +
    (Object.keys(exportFilesJson()).length ? '<script type="application/json" id="xFiles">' + JSON.stringify(exportFilesJson()).replace(/</g, '\\u003c') + '<\/script>\n' : '') +
    '<div class="x-lightbox" id="xLightbox"><button class="lb-nav lb-prev" aria-label="Попереднє">‹</button><figure><img alt=""><figcaption class="lb-cap"></figcaption></figure><button class="lb-nav lb-next" aria-label="Наступне">›</button><div class="lb-bar"><span class="lb-count"></span><a class="lb-dl" download>Завантажити</a></div></div>\n<script>' + EXPORT_JS + '<\/script>\n</body>\n</html>\n';
  downloadFile(fileName() + '.html', html, 'text/html;charset=utf-8');
}

/* ═══════════════════════════ ДОВІДКА ═══════════════════════════ */
function renderHelp() {
  const k = s => s.split('+').map(x => '<span class="kbd">' + esc(IS_MAC ? x.replace('Ctrl', '⌘').replace('Alt', '⌥').replace('Shift', '⇧') : x) + '</span>').join('');
  const rows = [
    ['grp', 'Основне'],
    ['Скасувати / повторити', k('Ctrl+Z') + ' ' + k('Ctrl+Shift+Z')],
    ['Зберегти (автозбереження й так працює)', k('Ctrl+S')],
    ['Вставити блок (промпт, callout, таблицю…)', k('/') + ' на порожньому рядку'],
    ['Перетворити виділене на промпт / callout / код', 'виділіть текст → «Блок»'],
    ['grp', 'Текст'],
    ['Жирний / курсив / підкреслення', k('Ctrl+B') + ' ' + k('Ctrl+I') + ' ' + k('Ctrl+U')],
    ['Закреслення', k('Ctrl+Shift+S')],
    ['Код у рядку', k('Ctrl+E')],
    ['Посилання', k('Ctrl+K')],
    ['Очистити форматування', k('Ctrl+\\')],
    ['Заголовок 1 / 2 / 3 / звичайний текст', k('Ctrl+Alt+1') + ' … ' + k('Ctrl+Alt+0')],
    ['Списки: нумерований / маркований / чекліст', k('Ctrl+Shift+7') + ' ' + k('Ctrl+Shift+8') + ' ' + k('Ctrl+Shift+9')],
    ['Перемістити блок вище / нижче', k('Alt+Shift+↑') + ' ' + k('Alt+Shift+↓')],
    ['grp', 'Швидкий Markdown (на початку рядка + пробіл)'],
    ['Заголовки', k('#') + ' ' + k('##') + ' ' + k('###')],
    ['Списки та чекліст', k('-') + ' ' + k('1.') + ' ' + k('[]')],
    ['Цитата', k('>')],
    ['Блок коду / розділювач (+ Enter)', k('```') + ' ' + k('---')],
    ['grp', 'Блоки'],
    ['Вийти з блоку (callout, цитата)', 'Enter на порожньому рядку'],
    ['Вийти з блоку коду', 'Enter двічі в кінці або ' + k('Ctrl+Enter')],
    ['Прибрати оформлення блоку', k('Backspace') + ' на початку блоку'],
    ['Таблиця: наступна / попередня клітинка', k('Tab') + ' ' + k('Shift+Tab')],
    ['Зображення: вставити', k('Ctrl+V') + ' або перетягніть файл'],
  ];
  $('#helpGrid').innerHTML = rows.map(r => r[0] === 'grp' ? '<div class="grp">' + r[1] + '</div>' : '<span>' + esc(r[0]) + '</span><span>' + r[1] + '</span>').join('');
}
