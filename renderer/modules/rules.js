// renderer/modules/rules.js
function getLastRef(META, bookAbbr) {
  const list = (META.chapters[bookAbbr] || []).map(x => x.chapter).sort((a,b)=>a-b);
  const lastCh = list.length ? list[list.length - 1] : 1;
  const lastVs = getMaxVerse(META, bookAbbr, lastCh);
  return { lastCh, lastVs };
}
function getMaxVerse(META, b, ch) {
  const found = (META.chapters[b] || []).find(x => x.chapter === Number(ch));
  return found ? found.maxVerse : 1;
}
function cmpRef(aCh, aVs, bCh, bVs) {
  const ac = +aCh, av = +aVs, bc = +bCh, bv = +bVs;
  if (ac < bc) return -1; if (ac > bc) return 1;
  if (av < bv) return -1; if (av > bv) return 1;
  return 0;
}

// 스크롤 모드 전용 규칙
export function enforceRules(META, { $book, $sCh, $sVs, $eCh, $eVs, $same }) {
  // 슬라이드 계열은 규칙 불필요
  const b = $book.value;
  const sCh = +$sCh.value, sVs = +$sVs.value;
  const eCh = +$eCh.value, eVs = +$eVs.value;
  const { lastCh, lastVs } = getLastRef(META, b);

  if (sCh === lastCh && sVs === lastVs) {
    if (!$same.checked) {
      $same.checked = true;
      $eCh.disabled = true; $eVs.disabled = true;
      $eCh.value = String(sCh);
      const mv = getMaxVerse(META, b, sCh);
      $eVs.innerHTML = '';
      for (let i=1;i<=mv;i++){ const o=document.createElement('option'); o.value=i; o.textContent=i; $eVs.appendChild(o); }
      $eVs.value = String(sVs);
    }
    return;
  }

  if (cmpRef(eCh, eVs, sCh, sVs) < 0) {
    $eCh.value = String(sCh);
    const maxEnd = getMaxVerse(META, b, sCh);
    $eVs.innerHTML = '';
    for (let i=1;i<=maxEnd;i++){ const o=document.createElement('option'); o.value=i; o.textContent=i; $eVs.appendChild(o); }
    $eVs.value = String(sVs);
  }
  if ($same.checked) {
    $eCh.value = $sCh.value;
    const maxEnd = getMaxVerse(META, b, $eCh.value);
    const sVal = +$sVs.value;
    $eVs.innerHTML = '';
    for (let i=1;i<=maxEnd;i++){ const o=document.createElement('option'); o.value=i; o.textContent=i; $eVs.appendChild(o); }
    $eVs.value = String(Math.min(sVal, maxEnd));
  }
}
