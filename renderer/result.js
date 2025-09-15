// renderer/result.js
const wrap = document.getElementById('list');

let mode = 'scroll';
let fontSize = 100;
let showRef = true;

let current = { book:'', ch:1, vs:1 };
let pages = [];
let pageIdx = 0;
let preferLastOnNext = false;

// caches
let currentText = '';
let scrollVersesCache = [];

// HTML-based cache (for slide-scroll)
let currentHtml = '';
let currentHtmlFromChapter = 0;
let versesPerSlide = 1;

let scrollRAF = 0;
let scrollActive = false;
let scrollDir = 1;     // +1 / -1
let scrollUnit = 'line';
let scrollSpeed = 0;   // px/frame
let scrollBoost = 0;   // 가속 누적

function ensureRendererFocus() {
  // #list가 있으면 여기에, 없으면 body에 포커스
  const list = document.getElementById('list');
  if (list) {
    list.focus();
  } else {
    document.body.focus();
  }
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function applyFontToRoot(px){
  document.documentElement.style.setProperty('--fs', px + 'px');
}

function setFs(px){
  fontSize = Number(px) || 100;
  applyFontToRoot(fontSize);
  wrap.style.fontSize = fontSize + 'px';
  if (mode === 'slide') {
    if (currentText) resetPagesAndRender(currentText);
    else renderSlidePage();
  } else if (mode === 'slide-scroll') {
    if (currentHtml && currentHtmlFromChapter === current.ch) {
      renderSlideScrollFromHtml(currentHtml, true);
    } else if (currentText) {
      renderSlideScroll(currentText);
    }
  } else {
    if (scrollVersesCache && scrollVersesCache.length) renderScroll(scrollVersesCache);
  }
}

function setShowRef(flag){
  showRef = !!flag;
  wrap.classList.toggle('hide-ref', !showRef);
  if (mode === 'slide-scroll' && currentHtml) { renderSlideScrollFromHtml(currentHtml, true); return; }
  if (mode === 'slide') { renderSlidePage(); return; }
  if (mode === 'scroll') { renderScroll(scrollVersesCache); return; }
}

function refLabel(){
  if (!showRef) return '';
  if (current && current.vs) return `<span class="ref">${esc(`${current.book}${current.ch}:${current.vs}`)}</span>`;
  return `<span class="ref">${esc(`${current.book}${current.ch}`)}</span>`;
}

function renderScroll(verses){
  scrollVersesCache = Array.isArray(verses) ? verses : [];
  wrap.style.overflow = 'auto';
  wrap.classList.toggle('hide-ref', !showRef);
  wrap.style.fontSize = fontSize + 'px';
  if (!scrollVersesCache.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = scrollVersesCache.map(v => {
    const refHtml = showRef ? `<span class="ref">${esc(v.ref)}</span>` : '';
    return `<div class="item">${refHtml}<span class="text">${esc(v.text)}</span></div>`;
  }).join('');
}

function testOverflow(s){
  wrap.style.fontSize = fontSize + 'px';
  wrap.innerHTML = `<div class="item">${refLabel()}<span class="text">${esc(s)}</span></div>`;
  return wrap.scrollHeight > wrap.clientHeight;
}

function paginateByMeasure(text){
  const words = String(text).split(/\s+/);
  const chunks = []; let cur = "";
  const needNewPage = (candidate) => testOverflow(candidate);
  for (const w of words) {
    const tryStr = cur ? (cur + " " + w) : w;
    if (needNewPage(tryStr)) {
      if (cur) chunks.push(cur);
      if (needNewPage(w)) {
        let rest = w, piece = "";
        while (rest.length) {
          const step = Math.max(1, Math.ceil(rest.length / 3));
          const nextPiece = (piece ? piece : "") + rest.slice(0, step);
          if (needNewPage(nextPiece)) {
            if (piece) chunks.push(piece);
            piece = "";
          } else {
            piece = nextPiece;
            rest = rest.slice(step);
          }
        }
        if (piece) chunks.push(piece);
        cur = "";
      } else {
        cur = w;
      }
    } else {
      cur = tryStr;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text];
}

function renderSlidePage(){
  const text = pages[pageIdx] || "";
  wrap.style.overflow = 'hidden';
  wrap.classList.toggle('hide-ref', !showRef);
  wrap.style.fontSize = fontSize + 'px';
  wrap.innerHTML = `<div class="item">${refLabel()}<span class="text">${esc(text)}</span></div>`;
}

function resetPagesAndRender(refText){
  pages = paginateByMeasure(refText || '');
  pageIdx = preferLastOnNext ? (pages.length - 1) : 0;
  preferLastOnNext = false;
  renderSlidePage();
}

function renderSlideScroll(text){
  wrap.style.overflow = 'auto';
  wrap.classList.toggle('hide-ref', !showRef);
  wrap.style.fontSize = fontSize + 'px';
  wrap.innerHTML = `<div class="item">${refLabel()}<span class="text">${esc(text)}</span></div>`;
}

function renderSlideScrollFromHtml(html, setChapterFlag=false){
  currentHtml = String(html || '');
  if (setChapterFlag && current && current.ch) currentHtmlFromChapter = current.ch;
  wrap.style.overflow = 'auto';
  wrap.style.fontSize = fontSize + 'px';
  wrap.innerHTML = currentHtml;
  if (!showRef) {
    const refs = wrap.querySelectorAll('.ref');
    refs.forEach(r => { r.style.display = 'none'; });
  } else {
    const refs = wrap.querySelectorAll('.ref');
    refs.forEach(r => { r.style.display = ''; });
  }
}

function computeStepPx(unit) {
  const fs = Number(fontSize) || 100;
  const linePx = Math.max(40, Math.round(fs * 1.2));
  const pagePx = Math.round(wrap.clientHeight * 0.9);
  return unit === 'page' ? pagePx : linePx;
}

function scrollLoop() {
  if (!scrollActive) return;
  // 가속: 누르고 있는 시간에 따라 점점 빨라지게 (상한선 포함)
  // 초반엔 1x, 이후 최대 4x까지
  const base = computeStepPx(scrollUnit);
  scrollBoost = Math.min(scrollBoost + 0.02, 3); // 0 → 3 (추가배수)
  const step = (base * (1 + scrollBoost)) / 15;  // 60fps 가정, 프레임 보정

  wrap.scrollBy(0, step * scrollDir);
  scrollRAF = requestAnimationFrame(scrollLoop);
}

// 시작/중단 수신
window.bibleAPI.onResultStartScroll(({ dir = 1, unit = 'line' } = {}) => {
  if (mode !== 'scroll' && mode !== 'slide-scroll') return;
  scrollActive = true;
  scrollDir = dir >= 0 ? 1 : -1;
  scrollUnit = unit === 'page' ? 'page' : 'line';
  scrollSpeed = 0;
  scrollBoost = 0;
  if (!scrollRAF) scrollRAF = requestAnimationFrame(scrollLoop);
});

window.bibleAPI.onResultStopScroll(() => {
  scrollActive = false;
  if (scrollRAF) cancelAnimationFrame(scrollRAF);
  scrollRAF = 0;
  scrollBoost = 0;
});


window.bibleAPI.onResultInit((data) => {
  mode = data.mode || 'scroll';
  setFs(data.fontSize || 100);
  setShowRef(data.showRef !== false);
  versesPerSlide = Math.max(1, Math.min(5, Number(data.versesPerSlide || 1)));

  current = { book: data.book || '', ch: Number(data.sCh) || 1, vs: Number(data.sVs) || 1 };
  currentText = '';
  pages = [];
  pageIdx = 0;
  preferLastOnNext = false;
  currentHtml = '';
  currentHtmlFromChapter = 0;
  scrollVersesCache = [];

  ensureRendererFocus();

  if (mode === 'scroll') { wrap.innerHTML = ''; }
  else if (mode === 'slide') { pages = ['']; pageIdx = 0; renderSlidePage(); }
  else if (mode === 'slide-scroll') { wrap.innerHTML = ''; }
});

window.bibleAPI.onResultUpdate((patch) => {
  if (patch.fontSize) setFs(patch.fontSize);
  if ('showRef' in patch) setShowRef(patch.showRef);
  if (patch.versesPerSlide) versesPerSlide = Math.max(1, Math.min(5, Number(patch.versesPerSlide)));

  if (mode === 'scroll') {
    if (Array.isArray(patch.verses)) { renderScroll(patch.verses); }
    else if ('showRef' in patch) { renderScroll(scrollVersesCache); }
    return;
  }

  if (patch.current) {
    if (patch.current.html) {
      if (patch.current.book || patch.current.chapter || patch.current.vs) {
        current.book = patch.current.book || current.book;
        current.ch = patch.current.chapter || current.ch;
        current.vs = patch.current.vs || current.vs || 1;
      } else if (patch.current.ref) {
        const mch = String(patch.current.ref).match(/^([^\d]+)(\d+):(\d+)$/);
        if (mch) current = { book: mch[1], ch: +mch[2], vs: +mch[3] };
      }
      renderSlideScrollFromHtml(patch.current.html, !!patch.current.chapter);
      currentText = '';
      return;
    }

    if (patch.current.ref) {
      const mch = String(patch.current.ref).match(/^([^\d]+)(\d+):(\d+)$/);
      if (mch) current = { book: mch[1], ch: +mch[2], vs: +mch[3] };
    }
    currentText = patch.current.text || '';
    if (mode === 'slide') resetPagesAndRender(currentText);
    else renderSlideScroll(currentText);
    return;
  }

  if (patch.book && patch.sCh && patch.sVs) {
    current = { book: patch.book, ch: Number(patch.sCh), vs: Number(patch.sVs) };
    if (mode === 'slide') { renderSlidePage(); }
    else {
      if (currentHtml && currentHtmlFromChapter === current.ch) { renderSlideScrollFromHtml(currentHtml, true); }
      else { renderSlideScroll(currentText || ''); }
    }
    return;
  }
});

window.addEventListener('keydown', async (e) => {
  if (mode !== 'slide' && mode !== 'slide-scroll') return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  const dir = (e.key === 'ArrowRight') ? +1 : -1;

  if (mode === 'slide') {
    if (dir > 0 && pageIdx < pages.length - 1) { pageIdx++; renderSlidePage(); return; }
    if (dir < 0 && pageIdx > 0) { pageIdx--; renderSlidePage(); return; }
  }

  try {
    const res = await window.bibleAPI.slideMove({
      book: current.book,
      ch: current.ch,
      vs: current.vs,
      dir,
      mode: mode,
      versesPerSlide: versesPerSlide
    });
    if (!res || !res.ok) return;
    if (res.ch) current.ch = res.ch;
    if (res.vs) current.vs = res.vs;
    if (res.current) {
      if (res.current.html) {
        currentHtml = res.current.html;
        currentHtmlFromChapter = res.ch || currentHtmlFromChapter || current.ch || 0;
        renderSlideScrollFromHtml(currentHtml, true);
        currentText = '';
      } else if (res.current.text) {
        currentText = res.current.text;
        currentHtml = '';
        if (mode === 'slide') resetPagesAndRender(currentText);
        else renderSlideScroll(currentText);
      } else if (res.current.ref) {
        const mch = String(res.current.ref).match(/^([^\d]+)(\d+):(\d+)$/);
        if (mch) current = { book: mch[1], ch: +mch[2], vs: +mch[3] };
        if (mode === 'slide') renderSlidePage(); else renderSlideScroll(currentText || '');
      }
    }
  } catch (err) {
    console.error('result: slideMove/keydown error', err);
  }
});

window.addEventListener('DOMContentLoaded', ensureRendererFocus);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') ensureRendererFocus();
});