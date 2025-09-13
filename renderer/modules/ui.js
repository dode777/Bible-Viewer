export const FOOTER_MSG = {
  scroll: [
    [
      { text: "스크린이 띄워진 상태에서 ", bold: false },
      { text: "구절 혹은 폰트사이즈", bold: true, color: "#e9e641" },
      { text: "를 변경하면 실시간으로 적용됩니다.", bold: false }
    ],
    [
      { text: "스크롤 모드에서는 ", bold: false },
      { text: "시작/끝 구절을 지정해 ", bold: true, color: "#e9e641" },
      { text: "연속 범위를 볼 수 있습니다.", bold: false }
    ]
  ],
  slide: [
    [
      { text: "현재 페이지에서 ← → 방향키로 페이지를 이동할 수 있습니다.", bold: false }
    ],
    [
      { text: "슬라이드 모드에서는 기준이 되는 구절 한 개만 선택합니다.", bold: false }
    ],
    [
      { text: "구절이 길면 ", bold: false},
      { text: "다음 페이지로 나뉘어집니다.", bold: true, color: "#e9e641" }
    ]
  ],
  "slide-scroll": [
    [
      { text: "현재 페이지에서 ← → 방향키로 페이지를 이동할 수 있습니다.", bold: false }
    ],
    [
      { text: "슬라이드+스크롤 모드에서는 기준이 되는 구절 한 개만 선택합니다.", bold: false },
    ],
    [
      { text: "구절이 길면 ", bold: false },
      { text: "아래로 스크롤이 가능합니다.", bold: true, color: "#e9e641" }
    ]
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