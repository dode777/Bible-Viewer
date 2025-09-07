const wrap = document.getElementById('list');

let mode = 'scroll';
let fontSize = 100;
let showRef = true;

let current = { book:'', ch:1, vs:1 };
let pages = [];
let pageIdx = 0;
let preferLastOnNext = false;

// ✅ 캐시
let currentText = '';
let scrollVersesCache = [];

function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setFs(px){
  fontSize = px;
  document.documentElement.style.setProperty('--fs', px + 'px');
  if (mode === 'slide' && currentText) resetPagesAndRender(currentText);
}
function setShowRef(flag){ showRef = !!flag; wrap.classList.toggle('hide-ref', !showRef); }
function refLabel(){ return showRef ? `<span class="ref">${esc(`${current.book}${current.vs ? current.ch+':'+current.vs : current.ch}`)}</span>` : ''; }

function renderScroll(verses){
  scrollVersesCache = Array.isArray(verses) ? verses : [];
  wrap.style.overflow = 'auto';
  wrap.classList.toggle('hide-ref', !showRef);
  wrap.innerHTML = verses?.length
    ? verses.map(v => {
        const ref = showRef ? `<span class="ref">${esc(v.ref)}</span>` : '';
        return `<div class="item">${ref}<span class="text">${esc(v.text)}</span></div>`;
      }).join('')
    : '';
}

// ---- slide ----
function testOverflow(s){
  wrap.innerHTML = `<div class="item">${refLabel()}<span class="text">${esc(s)}</span></div>`;
  return wrap.scrollHeight > wrap.clientHeight;
}
function paginateByMeasure(text){
  const words = String(text).split(/\s+/);
  const chunks=[]; let cur="";
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
    } else cur = tryStr;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text];
}
function renderSlidePage(){
  const text = pages[pageIdx] || "";
  wrap.style.overflow = 'hidden';
  wrap.classList.toggle('hide-ref', !showRef);
  wrap.innerHTML = `<div class="item">${refLabel()}<span class="text">${esc(text)}</span></div>`;
}
function resetPagesAndRender(refText){
  pages = paginateByMeasure(refText);
  pageIdx = preferLastOnNext ? (pages.length - 1) : 0;
  preferLastOnNext = false;
  renderSlidePage();
}

// ---- slide-scroll ----
function renderSlideScroll(text){
  wrap.style.overflow = 'auto';
  wrap.classList.toggle('hide-ref', !showRef);
  wrap.innerHTML = `<div class="item">${refLabel()}<span class="text">${esc(text)}</span></div>`;
}

// ---- init ----
window.bibleAPI.onResultInit((data)=>{
  mode = data.mode || 'scroll';
  setFs(data.fontSize || 100);
  setShowRef(data.showRef !== false);

  if (mode === 'scroll') {
    wrap.innerHTML = '';
    scrollVersesCache = [];
  } else if (mode === 'slide') {
    current = { book: data.book, ch: data.sCh, vs: data.sVs };
    currentText = '';
    pages = ['']; pageIdx = 0; renderSlidePage();
  } else if (mode === 'slide-scroll') {
    current = { book: data.book, ch: data.sCh, vs: data.sVs };
    currentText = '';
    wrap.innerHTML = '';
  }
});

// ---- patch ----
window.bibleAPI.onResultUpdate((patch)=>{
  if (patch.fontSize) setFs(patch.fontSize);
  if ('showRef' in patch) setShowRef(patch.showRef);

  if (mode === 'scroll') {
    if (Array.isArray(patch.verses)) {
      renderScroll(patch.verses);
    } else if ('showRef' in patch) {
      renderScroll(scrollVersesCache); // 참조 토글만 바뀐 경우 캐시로 재렌더
    }
    return;
  }

  // 슬라이드 계열
  if (patch.current) {
    const ref = patch.current.ref; // "창1:1"
    const mch = ref.match(/^([^\d]+)(\d+):(\d+)$/);
    if (mch) current = { book: mch[1], ch: +mch[2], vs: +mch[3] };
    currentText = patch.current.text || '';

    if (mode === 'slide') resetPagesAndRender(currentText);
    else renderSlideScroll(currentText);

  } else if (patch.book && patch.sCh && patch.sVs) {
    // 좌표만 왔을 때는 내용 유지 + 옵션만 반영
    current = { book: patch.book, ch: patch.sCh, vs: patch.sVs };
    if (mode === 'slide') renderSlidePage();
    else renderSlideScroll(currentText || '');
  }
});

// ---- keys for slide modes ----
window.addEventListener('keydown', async (e)=>{
  if (mode !== 'slide' && mode !== 'slide-scroll') return;

  if (e.key === 'ArrowRight') {
    if (mode === 'slide' && pageIdx < pages.length - 1) { pageIdx++; renderSlidePage(); }
    else {
      const res = await window.bibleAPI.slideMove({ book: current.book, ch: current.ch, vs: current.vs, dir: +1 });
      if (res?.ok) {
        current = { book: current.book, ch: res.ch, vs: res.vs };
        currentText = res.current.text || '';
        if (mode === 'slide') resetPagesAndRender(currentText);
        else renderSlideScroll(currentText);
      }
    }
  } else if (e.key === 'ArrowLeft') {
    if (mode === 'slide' && pageIdx > 0) { pageIdx--; renderSlidePage(); }
    else {
      if (mode === 'slide') { preferLastOnNext = true; }
      const res = await window.bibleAPI.slideMove({ book: current.book, ch: current.ch, vs: current.vs, dir: -1 });
      if (res?.ok) {
        current = { book: current.book, ch: res.ch, vs: res.vs };
        currentText = res.current.text || '';
        if (mode === 'slide') resetPagesAndRender(currentText);
        else renderSlideScroll(currentText);
      }
    }
  }
});
