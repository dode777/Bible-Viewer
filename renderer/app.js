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

  async function onShow() {
    const p = getPayload();
    await window.bibleAPI.openPassage({ ...p, displayId: +$disp.value });
  }

  async function toggleScreen() {
    if (resultOpened) {
      // 이미 켜져 있으면 끄기
      await window.bibleAPI.closeDisplay();
      // 라벨/상태 갱신은 onDisplayState 이벤트에서 처리됨
    } else {
      // 꺼져 있으면 켜기
      const p = getPayload();                 // 기존 base/payload 함수와 동일 (책/장/절/모드/폰트/참조/디스플레이 포함)
      await window.bibleAPI.openPassage({ ...p, displayId: +$disp.value });
      // 라벨/상태 갱신은 onDisplayState 이벤트에서 처리됨
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
