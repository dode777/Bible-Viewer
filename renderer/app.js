// renderer/app.js
import { $, on, debounce, showToast, flashSaved } from './modules/dom.js';
import {
  buildBookSelect,
  firstAvailableAbbr,
  fillChSelect,
  fillVsSelect,
  getMaxVerse,
  BOOK_NAME_MAP,
  OT_ORDER,
  NT_ORDER,
  searchBooks
} from './modules/books.js';
import { enforceRules } from './modules/rules.js';
import { savePrefs } from './modules/settings.js';
import { toggleModeUI, setButtonOpenState, renderFooterMsg } from './modules/ui.js';
import { makeLiveUpdater, makeSelectionRefresher } from './modules/live.js';

const $book = $('book'), $sCh = $('sCh'), $sVs = $('sVs'), $eCh = $('eCh'), $eVs = $('eVs');
const $same = $('sameEnd'), $font = $('font'), $disp = $('display'), $mode = $('mode');
const $showRef = $('showRef');
const $btn = $('showBtn'), $saved = $('savedCheck');
const $rowStart = $('rowStart'), $rowEnd = $('rowEnd'), $labelStart = $('labelStart'), $sameWrap = $('sameWrap');
const $footerMsg = $('footerMsg');
const $chapCountWrap = $('chapCountWrap');
const $chapCount = $('chapCount');

// 검색 UI
const $bookSearch = $('bookSearch');
const $bookSearchResults = $('bookSearchResults');

let META = null, DISPINFO = null;
let resultOpened = false;
let prevDispId = null, prevMode = null;

let scrolling = false;

(async function init() {
  META = await window.bibleAPI.getMeta();
  DISPINFO = await window.bibleAPI.getDisplays();

  // 책 셀렉트
  buildBookSelect($book, META, { OT_ORDER, NT_ORDER, BOOK_NAME_MAP });

  // 디스플레이 목록
  const DISP = DISPINFO.displays || [];
  for (const d of DISP) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name} ${d.isPrimary ? '(주)' : ''} ${d.size} ${d.pos}`;
    $disp.appendChild(opt);
  }
  const defId = DISPINFO.defaultDisplayId;
  if (defId && DISP.some(d => d.id === defId)) $disp.value = String(defId);
  else { const pri = DISP.find(d => d.isPrimary); if (pri) $disp.value = String(pri.id); }

  // 기본값 로드
  if (typeof DISPINFO.defaultFontSize === 'number') $font.value = String(DISPINFO.defaultFontSize);
  if (typeof DISPINFO.defaultMode === 'string') $mode.value = DISPINFO.defaultMode;
  $showRef.checked = (DISPINFO.defaultShowRef !== false);

  // ✅ versesPerSlide 기본값 (없으면 1)
  if ($chapCount) {
    if (typeof DISPINFO.defaultVersesPerSlide === 'number') {
      $chapCount.value = String(Math.max(1, Math.min(5, DISPINFO.defaultVersesPerSlide)));
    } else {
      $chapCount.value = '1';
    }
  }

  prevDispId = Number($disp.value);
  prevMode = $mode.value;

  // ---- Live helpers ----
  const getOpen = () => resultOpened;
  const getPayload = () => {
    const isSlide = ($mode.value === 'slide' || $mode.value === 'slide-scroll');
    const payload = {
      mode: $mode.value,
      book: $book.value,
      sCh: +$sCh.value, sVs: +$sVs.value,
      eCh: isSlide ? +$sCh.value : +$eCh.value,
      eVs: isSlide ? +$sVs.value : +$eVs.value,
      fontSize: +$font.value || 100,
      showRef: !!$showRef.checked
    };
    if ($same.checked && !isSlide) { payload.eCh = payload.sCh; payload.eVs = payload.sVs; }

    // ✅ slide-scroll 전용: versesPerSlide(1~5절)
    if ($mode.value === 'slide-scroll' && $chapCount) {
      const vp = Math.max(1, Math.min(5, Number($chapCount.value || 1)));
      payload.versesPerSlide = vp;
    }
    return payload;
  };

  const liveUpdateOnly = makeLiveUpdater(getOpen, getPayload);         // 폰트/참조표시 변경
  const selectionUpdate = makeSelectionRefresher(getOpen, getPayload); // 책/장/절/동일 변경

  // ---- Events ----
  on($book, 'change', () => { onBook(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($sCh, 'change', () => { onStartChapter(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($sVs, 'change', () => { syncIfSame(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($eCh, 'change', () => { onEndChapter(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($eVs, 'change', () => { enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });

  on($same, 'change', () => { onSameToggle(); selectionUpdate(); });

  on($font, 'input', debounce(() => { autoSave(); liveUpdateOnly(); }, 120));
  on($showRef, 'change', () => { autoSave(); liveUpdateOnly(); });

  // ✅ versesPerSlide 변경 시 저장 + 실시간 반영
  if ($chapCount) {
    on($chapCount, 'change', () => { autoSave(); liveUpdateOnly(); });
  }

  on($mode, 'change', onModeChange);
  on($disp, 'change', onDisplayChange);
  on($btn, 'click', toggleScreen);

  window.addEventListener('keydown', async (e) => {
    if (!resultOpened) return;

    // 스크롤 가능한 모드에서만
    const m = $mode.value;
    if (m !== 'scroll' && m !== 'slide-scroll') return;

    // 입력창에서 화살표로 커서 이동하려는 경우는 통과 (예: font input, 검색창 등)
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      // 숫자 input에서 화살표로 커서 이동 허용
      if (document.activeElement?.id !== 'bookSearch') return;
    }

    let dir = 0, unit = null;
    if (e.key === 'ArrowDown') { dir = +1; unit = e.shiftKey ? 'page' : 'line'; }
    else if (e.key === 'ArrowUp') { dir = -1; unit = e.shiftKey ? 'page' : 'line'; }
    else return;

    // 이미 스크롤 중이면 무시 (키 반복 방지)
    if (scrolling) return;
    scrolling = true;

    e.preventDefault();
    try {
      await window.bibleAPI.startScroll({ dir, unit }); // 시작 신호
    } catch (err) {
      console.error('startScroll error', err);
      scrolling = false;
    }
  });

  window.addEventListener('keyup', async (e) => {
    if (!scrolling) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    try {
      await window.bibleAPI.stopScroll(); // 중단 신호
    } finally {
      scrolling = false;
    }
  });

  // 포커스가 바뀌거나 창이 비활성화될 때도 안전하게 중단
  window.addEventListener('blur', () => { if (scrolling) window.bibleAPI.stopScroll().finally(()=> scrolling=false); });
  
  window.bibleAPI.onDisplayState(({ opened }) => {
    resultOpened = opened;
    setButtonOpenState($btn, opened);
  });

  // 결과창(또는 main)의 슬라이드 이동 브로드캐스트 → 메인 셀렉트 동기화
  window.bibleAPI.onSlideCurrent(({ book, ch, vs }) => {
    try {
      if (!book || !ch) return;
      if ($book.value !== book) {
        $book.value = book;
        const chArr = META.chapters[book] || [];
        fillChSelect($sCh, chArr);
        fillChSelect($eCh, chArr);
      }
      $sCh.value = String(ch);
      const maxS = getMaxVerse(META, book, ch);
      fillVsSelect($sVs, maxS);
      $sVs.value = String(vs);

      if ($mode.value === 'scroll') {
        $eCh.value = String(ch);
        fillVsSelect($eVs, maxS);
        $eVs.value = String(vs);
      }
    } catch (err) {
      console.error('onSlideCurrent sync error', err);
    }
  });

  // 메인창에서 방향키로 슬라이드 이동
  window.addEventListener('keydown', async (e) => {
    if (!resultOpened) return;
    if ($mode.value !== 'slide' && $mode.value !== 'slide-scroll') return;

    let dir = 0;
    if (e.key === 'ArrowRight') dir = +1;
    else if (e.key === 'ArrowLeft') dir = -1;
    if (!dir) return;

    e.preventDefault();

    const book = $book.value;
    const ch = +$sCh.value || 1;
    const vs = +$sVs.value || 1;

    // ✅ slide-scroll 모드일 땐 versesPerSlide도 전달
    const payload = { book, ch, vs, dir };
    if ($mode.value === 'slide-scroll' && $chapCount) {
      payload.mode = 'slide-scroll';
      payload.versesPerSlide = Math.max(1, Math.min(5, Number($chapCount.value || 1)));
    }

    try {
      const res = await window.bibleAPI.slideMove(payload);
      if (res?.ok && res.current) {
        await window.bibleAPI.updateDisplay({
          current: res.current,
          fontSize: +$font.value || 100,
          showRef: !!$showRef.checked,
          book, sCh: res.ch, sVs: res.vs
        });
      }
    } catch (err) {
      console.error('slideMove error', err);
    }
  });

  // ---- Book search UI ----
  let searchActiveIndex = -1;
  let lastSearchList = [];

  function renderBookSearch(list) {
    if (!$bookSearch || !$bookSearchResults) return;
    lastSearchList = list || [];
    if (!list || list.length === 0) {
      $bookSearchResults.style.display = 'none';
      $bookSearchResults.innerHTML = '';
      searchActiveIndex = -1;
      return;
    }
    const html = [];
    let lastGroup = null;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.group !== lastGroup) {
        html.push(`<div class="group">${it.group}</div>`);
        lastGroup = it.group;
      }
      html.push(`<div class="item" data-idx="${i}" data-abbr="${it.abbr}">${it.name} <small style="color:#667; margin-left:8px;">(${it.abbr})</small></div>`);
    }
    $bookSearchResults.innerHTML = html.join('');
    $bookSearchResults.style.display = 'block';
    searchActiveIndex = -1;
  }

  function updateActiveInList() {
    if (!$bookSearchResults) return;
    const items = Array.from($bookSearchResults.querySelectorAll('.item'));
    items.forEach(it => it.classList.remove('active'));
    if (searchActiveIndex >= 0 && items[searchActiveIndex]) {
      items[searchActiveIndex].classList.add('active');
      items[searchActiveIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectBookByAbbr(abbr) {
    if (!abbr) return;
    $book.value = abbr;
    onBook();
    enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same });
    selectionUpdate();

    if ($bookSearch && $bookSearchResults) {
      renderBookSearch([]);
      $bookSearch.value = '';
      try { $bookSearch.blur(); } catch(e){/* ignore */ }
    }
  }

  if ($bookSearch && $bookSearchResults) {
    $bookSearch.addEventListener('input', debounce(() => {
      const q = String($bookSearch.value || '').trim();
      if (!q) { renderBookSearch([]); return; }
      const res = searchBooks(q, META, { OT_ORDER, NT_ORDER, BOOK_NAME_MAP });
      renderBookSearch(res);
    }, 120));

    $bookSearchResults.addEventListener('click', (ev) => {
      const item = ev.target.closest && ev.target.closest('.item');
      if (!item) return;
      const abbr = item.getAttribute('data-abbr');
      selectBookByAbbr(abbr);
    });

    $bookSearch.addEventListener('keydown', (ev) => {
      if ($bookSearchResults.style.display === 'none') return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (searchActiveIndex < lastSearchList.length - 1) searchActiveIndex++;
        updateActiveInList();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (searchActiveIndex > 0) searchActiveIndex--;
        updateActiveInList();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (searchActiveIndex >= 0 && lastSearchList[searchActiveIndex]) {
          selectBookByAbbr(lastSearchList[searchActiveIndex].abbr);
        } else if (lastSearchList.length === 1) {
          selectBookByAbbr(lastSearchList[0].abbr);
        }
      } else if (ev.key === 'Escape') {
        renderBookSearch([]);
      }
    });
  }

  // 초기 책/장/절
  const first = firstAvailableAbbr(META, { OT_ORDER, NT_ORDER });
  if (first) { $book.value = first; onBook(); }

  // 초기 UI 세팅
  toggleModeUI($mode.value, $labelStart, $rowEnd, $sameWrap, $chapCountWrap);
  renderFooterMsg($footerMsg, $mode.value);

  // --- inner helpers ---
  function onBook() {
    const b = $book.value;
    const chArr = META.chapters[b] || [];
    fillChSelect($sCh, chArr);
    fillChSelect($eCh, chArr);
    if (chArr.length) {
      $sCh.value = String(chArr[0].chapter);
      $eCh.value = String(chArr[0].chapter);
      onStartChapter(); onEndChapter(); syncIfSame();
    }
  }
  function onStartChapter() {
    const b = $book.value;
    const maxV = getMaxVerse(META, b, $sCh.value);
    fillVsSelect($sVs, maxV);
    if (+$sVs.value < 1) $sVs.value = '1';
    syncIfSame();
  }
  function onEndChapter() {
    const b = $book.value;
    const maxV = getMaxVerse(META, b, $eCh.value);
    fillVsSelect($eVs, maxV);
    if (+$eVs.value < 1) $eVs.value = String(maxV);
  }
  function onSameToggle() {
    const same = $same.checked;
    $eCh.disabled = same; $eVs.disabled = same;
    if (same) syncIfSame();
  }
  function syncIfSame() {
    if (!$same.checked) return;
    $eCh.value = $sCh.value;
    const maxEnd = getMaxVerse(META, $book.value, $eCh.value);
    const sVal = +$sVs.value;
    fillVsSelect($eVs, maxEnd);
    $eVs.value = String(Math.min(sVal, maxEnd));
  }

  async function onModeChange() {
    const newMode = $mode.value;
    toggleModeUI(newMode, $labelStart, $rowEnd, $sameWrap, $chapCountWrap);
    renderFooterMsg($footerMsg, newMode);

    if (resultOpened && newMode !== prevMode) {
      const ok = confirm('스크린을 다시 열어야 합니다. 설정을 변경하시겠습니까?');
      if (!ok) { $mode.value = prevMode; toggleModeUI(prevMode, $labelStart, $rowEnd, $sameWrap, $chapCount); return; }
      await window.bibleAPI.closeDisplay();
    }

    prevMode = newMode;
    await autoSave();
    enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same });
    selectionUpdate();
  }

  async function onDisplayChange() {
    const newId = Number($disp.value);
    if (resultOpened && newId !== prevDispId) {
      const ok = confirm('구절스크린을 다시 열어야 합니다. 설정을 변경하시겠습니까?');
      if (!ok) { $disp.value = String(prevDispId); return; }
      await window.bibleAPI.closeDisplay();
    }
    prevDispId = newId;
    await autoSave();
  }

  async function toggleScreen() {
    if (resultOpened) {
      await window.bibleAPI.closeDisplay();
    } else {
      const p = getPayload();
      await window.bibleAPI.openPassage({ ...p, displayId: +$disp.value });
    }
  }

  async function autoSave() {
    let fs = Number($font.value);
    if (!Number.isFinite(fs) || fs <= 0) fs = 100;
    await savePrefs({
      defaultDisplayId: Number($disp.value),
      defaultFontSize: fs,
      defaultMode: $mode.value,
      defaultShowRef: !!$showRef.checked,
      defaultVersesPerSlide: Number($chapCount?.value || 1) // ✅ 저장
    });
    flashSaved(); showToast('✅ 저장되었습니다');
  }
})();