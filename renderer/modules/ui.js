// renderer/modules/ui.js
export const FOOTER_MSG = {
  scroll: [
    [
      { text: "- 스크린이 띄워진 상태에서 ", bold: false },
      { text: "구절 혹은 폰트사이즈", bold: true, color: "#e9e641" },
      { text: "를 변경하면 실시간으로 적용됩니다.", bold: false }
    ],
    [
      { text: "- 스크롤 모드에서는 ", bold: false },
      { text: "시작/끝 구절을 지정해 ", bold: true, color: "#e9e641" },
      { text: "연속 범위를 볼 수 있습니다.", bold: false }
    ]
  ],
  slide: [
    [
      { text: "- 현재 화면에서 ← → 방향키로 구절을, ↑ ↓ 방향키로 스크롤 이동할 수 있습니다.", bold: false }
    ],
    [
      { text: "- 슬라이드 모드에서는 기준이 되는 구절 한 개만 선택합니다.", bold: false }
    ],
    [
      { text: "- 구절이 길면 ", bold: false},
      { text: "다음 페이지로 나뉘어집니다.", bold: true, color: "#e9e641" }
    ]
  ],
  "slide-scroll": [
    [
      { text: "- 현재 화면에서 ← → 방향키로 구절을, ↑ ↓ 방향키로 스크롤 이동할 수 있습니다.", bold: false }
    ],
    [
      { text: "- 슬라이드+스크롤 모드에서는 기준이 되는 구절 한 개만 선택합니다.", bold: false },
    ],
    [
      { text: "- 구절이 길면 ", bold: false },
      { text: "아래로 스크롤이 가능합니다. (↓ 방향키 가능)", bold: true, color: "#e9e641" }
    ],
    [
      { text: "- 한 장에 표시되는 구절의 개수를 선택할 수 있습니다.", bold: false }
    ]
  ]
};

export function renderFooterMsg($container, mode) {
  const msgs = FOOTER_MSG[mode] || [];
  $container.innerHTML = '';
  msgs.forEach(line => {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'line';
    const dot = document.createElement('span');
    dot.className = 'dot';
    lineDiv.appendChild(dot);
    line.forEach(part => {
      const span = document.createElement('span');
      span.textContent = part.text;
      if (part.bold) span.style.fontWeight = 'bold';
      if (part.color) span.style.color = part.color;
      lineDiv.appendChild(span);
    });
    $container.appendChild(lineDiv);
  });
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

// toggleModeUI: mode 변경 시 UI 토글 (끝 행과 라벨까지 숨김/비활성 처리)
// $labelStart - DOM element for the leftmost start/label
// $rowEnd - container row for the "끝" inputs (can be null)
// $sameWrap - wrapper for same checkbox
// $chapCountEl - element for chapter/verse count control (slide-scroll specific) (can be null)
export function toggleModeUI(mode, $labelStart, $rowEnd, $sameWrap, $chapCountEl) {
  const isSlide = (mode === 'slide' || mode === 'slide-scroll');
  if ($labelStart) $labelStart.textContent = isSlide ? '기준 구절' : '시작';

  if ($rowEnd) {
    if (isSlide) {
      $rowEnd.classList.add('hide');
      $rowEnd.querySelectorAll('select, input, button').forEach(el => el.setAttribute('disabled','true'));
      $rowEnd.querySelectorAll('label').forEach(l => { l.style.display = 'none'; });
    } else {
      $rowEnd.classList.remove('hide');
      $rowEnd.querySelectorAll('select, input, button').forEach(el => el.removeAttribute('disabled'));
      $rowEnd.querySelectorAll('label').forEach(l => { l.style.display = ''; });
    }
  }

  if ($sameWrap) $sameWrap.classList.toggle('hide', isSlide);

  if ($chapCountEl) {
    const showChapCount = (mode === 'slide-scroll');
    $chapCountEl.classList.toggle('hide', !showChapCount);
    if (showChapCount) $chapCountEl.removeAttribute('disabled'); else $chapCountEl.setAttribute('disabled','true');
  }
}
