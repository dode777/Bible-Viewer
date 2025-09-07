// renderer/app.js
import { $, on, debounce, showToast, flashSaved } from './modules/dom.js';
import { buildBookSelect, firstAvailableAbbr, fillChSelect, fillVsSelect, getMaxVerse, BOOK_NAME_MAP, OT_ORDER, NT_ORDER } from './modules/books.js';
import { enforceRules } from './modules/rules.js';
import { savePrefs } from './modules/settings.js';
import { toggleModeUI, setButtonOpenState, renderFooterMsg } from './modules/ui.js';
import { makeLiveUpdater, makeSelectionRefresher } from './modules/live.js';

const $book = $('book'), $sCh = $('sCh'), $sVs = $('sVs'), $eCh = $('eCh'), $eVs = $('eVs');
const $same = $('sameEnd'), $font = $('font'), $disp = $('display'), $mode = $('mode');
const $showRef = $('showRef');
const $btn = $('showBtn'), $toast = $('toast'), $saved = $('savedCheck');
const $rowStart = $('rowStart'), $rowEnd = $('rowEnd'), $labelStart = $('labelStart'), $sameWrap = $('sameWrap');
const $footerMsg = $('footerMsg');

let META = null, DISPINFO = null;
let resultOpened = false;
let prevDispId = null, prevMode = null;

(async function init() {
  META = await window.bibleAPI.getMeta();
  DISPINFO = await window.bibleAPI.getDisplays();

  // 책 셀렉트
  buildBookSelect($book, META, { OT_ORDER, NT_ORDER, BOOK_NAME_MAP });

  // 디스플레이
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

  if (typeof DISPINFO.defaultFontSize === 'number') $font.value = String(DISPINFO.defaultFontSize);
  if (typeof DISPINFO.defaultMode === 'string') $mode.value = DISPINFO.defaultMode;
  $showRef.checked = (DISPINFO.defaultShowRef !== false);

  prevDispId = Number($disp.value);
  prevMode = $mode.value;

  // ---- Live helpers (모듈) ----
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
    return payload;
  };

  const liveUpdateOnly = makeLiveUpdater(getOpen, getPayload);        // 옵션 변경(폰트/참조표시)
  const selectionUpdate = makeSelectionRefresher(getOpen, getPayload); // 선택 변경(책/장/절/동일)

  // ---- Events ----
  on($book, 'change', () => { onBook(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($sCh, 'change', () => { onStartChapter(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($sVs, 'change', () => { syncIfSame(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($eCh, 'change', () => { onEndChapter(); enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });
  on($eVs, 'change', () => { enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same }); selectionUpdate(); });

  on($same, 'change', () => { onSameToggle(); selectionUpdate(); });

  on($font, 'input', debounce(() => { autoSave(); liveUpdateOnly(); }, 120));
  on($showRef, 'change', () => { autoSave(); liveUpdateOnly(); });

  on($mode, 'change', onModeChange);
  on($disp, 'change', onDisplayChange);
  on($btn, 'click', toggleScreen);  

  window.bibleAPI.onDisplayState(({ opened }) => {
    resultOpened = opened;
    setButtonOpenState($btn, opened);
  });

  // ✅ 결과창이 현재 구절을 바꿨을 때(슬라이드 이동 결과) 메인 셀렉트 동기화
  window.bibleAPI.onSlideCurrent(({ book, ch, vs /*, current*/ }) => {
    // 책이 바뀌었다면 옵션 재구성
    if ($book.value !== book) {
      $book.value = book;
      const chArr = META.chapters[book] || [];
      fillChSelect($sCh, chArr);
      fillChSelect($eCh, chArr);
    }

    // 시작 장/절 갱신
    $sCh.value = String(ch);
    const maxS = getMaxVerse(META, book, ch);
    fillVsSelect($sVs, maxS);
    $sVs.value = String(vs);

    // 스크롤 모드였다면 끝도 동일 절로 맞춰 한 절만 보이도록(정책 맞게 조정 가능)
    if ($mode.value === 'scroll') {
      $eCh.value = String(ch);
      fillVsSelect($eVs, maxS);
      $eVs.value = String(vs);
    }
  });

  // ✅ 메인창에서 방향키로 슬라이드 이동 (폼 포커스 여부 무시하고 동작)
  window.addEventListener('keydown', async (e) => {
    if (!resultOpened) return;
    if ($mode.value !== 'slide' && $mode.value !== 'slide-scroll') return;

    let dir = 0;
    if (e.key === 'ArrowRight') dir = +1;
    else if (e.key === 'ArrowLeft') dir = -1;
    if (!dir) return;

    // 폼 컨트롤 포커스여도 강제로 슬라이드 이동
    e.preventDefault();

    const book = $book.value;
    const ch = +$sCh.value || 1;
    const vs = +$sVs.value || 1;

    await window.bibleAPI.slideMove({ book, ch, vs, dir });
  });

  // 초기 책/장/절
  const first = firstAvailableAbbr(META, { OT_ORDER, NT_ORDER });
  if (first) { $book.value = first; onBook(); }

  toggleModeUI($mode.value, $labelStart, $rowEnd, $sameWrap);
  renderFooterMsg($footerMsg, $mode.value);

  // --- inner helpers that need closures ---
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
    if (+$sVs.value < 1) $sVs.value = "1";
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
    toggleModeUI(newMode, $labelStart, $rowEnd, $sameWrap);
    renderFooterMsg($footerMsg, newMode);

    if (resultOpened && newMode !== prevMode) {
      const ok = confirm('스크린을 다시 열어야 합니다. 설정을 변경하시겠습니까?');
      if (!ok) { $mode.value = prevMode; toggleModeUI(prevMode, $labelStart, $rowEnd, $sameWrap); return; }
      await window.bibleAPI.closeDisplay();
    }

    prevMode = newMode;
    await autoSave();
    enforceRules(META, { $book,$sCh,$sVs,$eCh,$eVs,$same });
    selectionUpdate(); // 모드 바뀌면 콘텐츠 기준도 바뀜
  }

  async function onDisplayChange() {
    const newId = Number($disp.value);
    if (resultOpened && newId !== prevDispId) {
      const ok = confirm('스크린을 다시 열어야 합니다. 설정을 변경하시겠습니까?');
      if (!ok) { $disp.value = String(prevDispId); return; }
      await window.bibleAPI.closeDisplay();
    }
    prevDispId = newId;
    await autoSave();
  }

  // async function onShow() {
  //   const p = getPayload();
  //   await window.bibleAPI.openPassage({ ...p, displayId: +$disp.value });
  // }

  async function toggleScreen() {
    if (resultOpened) {
      await window.bibleAPI.closeDisplay();
    } else {
      const p = getPayload();
      await window.bibleAPI.openPassage({ ...p, displayId: +$disp.value });
    }
  }

  async function autoSave(){
    let fs = Number($font.value);
    if (!Number.isFinite(fs) || fs <= 0) fs = 100;
    await savePrefs({
      defaultDisplayId: Number($disp.value),
      defaultFontSize: fs,
      defaultMode: $mode.value,
      defaultShowRef: !!$showRef.checked
    });
    flashSaved(); showToast('✅ 저장되었습니다');
  }
  
})();
