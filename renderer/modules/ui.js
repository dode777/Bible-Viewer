// renderer/modules/ui.js
export const FOOTER_MSG = {
  scroll: [
    "스크린이 띄워진 상태에서 구절 혹은 폰트사이즈를 변경하면 실시간으로 적용됩니다.",
    "스크롤 모드에서는 시작/끝 구절을 지정해 연속 범위를 볼 수 있습니다."
  ],
  "slide": [
    "현재 페이지에서 ← → 방향키로 페이지를 이동할 수 있습니다.",
    "슬라이드 모드에서는 기준이 되는 구절 한 개만 선택합니다.",
    "구절이 길면 다음 페이지로 나뉘어집니다."
  ],
  "slide-scroll": [
    "현재 페이지에서 ← → 방향키로 페이지를 이동할 수 있습니다.",
    "슬라이드+스크롤 모드에서는 기준이 되는 구절 한 개만 선택합니다.",
    "구절이 길면 아래로 스크롤이 가능합니다."
  ]
};

export function toggleModeUI(mode, $labelStart, $rowEnd, $sameWrap) {
  const isSlide = (mode === 'slide' || mode === 'slide-scroll');
  $labelStart.textContent = isSlide ? '기준 구절' : '시작';
  $rowEnd.classList.toggle('hide', isSlide);
  $sameWrap.classList.toggle('hide', isSlide);
}

export function setButtonOpenState($btn, opened){
  if (opened) {
    $btn.textContent = '스크린 끄기';
    $btn.style.backgroundColor = "#99AFD7";
    $btn.style.color = "#000000";
  } else {
    $btn.textContent = '스크린 켜기';
    $btn.style.backgroundColor = "#000000";
    $btn.style.color = "white";
  }
}

/** ✅ 푸터 안내문구 렌더러 */
export function renderFooterMsg($container, mode) {
  const msgs = FOOTER_MSG[mode] || [];
  $container.innerHTML = msgs.map(m =>
    `<div class="line"><span class="dot"></span><span>${m}</span></div>`
  ).join('');
}
