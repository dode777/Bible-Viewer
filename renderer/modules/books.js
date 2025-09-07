// 책/장/절 유틸과 select 채우기
export const BOOK_NAME_MAP = {
  "창":"창세기","출":"출애굽기","레":"레위기","민":"민수기","신":"신명기","수":"여호수아","삿":"사사기","룻":"룻기",
  "삼상":"사무엘상","삼하":"사무엘하","왕상":"열왕기상","왕하":"열왕기하","대상":"역대상","대하":"역대하","스":"에스라",
  "느":"느헤미야","에":"에스더","욥":"욥기","시":"시편","잠":"잠언","전":"전도서","아":"아가","사":"이사야","렘":"예레미야",
  "애":"예레미야애가","겔":"에스겔","단":"다니엘","호":"호세아","욜":"요엘","암":"아모스","옵":"오바댜","욘":"요나","미":"미가",
  "나":"나훔","합":"하박국","습":"스바냐","학":"학개","슥":"스가랴","말":"말라기",
  "마":"마태복음","막":"마가복음","눅":"누가복음","요":"요한복음","행":"사도행전","롬":"로마서","고전":"고린도전서",
  "고후":"고린도후서","갈":"갈라디아서","엡":"에베소서","빌":"빌립보서","골":"골로새서","살전":"데살로니가전서",
  "살후":"데살로니가후서","딤전":"디모데전서","딤후":"디모데후서","딛":"디도서","몬":"빌레몬서","히":"히브리서","약":"야고보서",
  "벧전":"베드로전서","벧후":"베드로후서","요일":"요한일서","요이":"요한이서","요삼":"요한삼서","유":"유다서","계":"요한계시록"
};
export const OT_ORDER = ["창","출","레","민","신","수","삿","룻","삼상","삼하","왕상","왕하","대상","대하","스","느","에","욥","시","잠","전","아","사","렘","애","겔","단","호","욜","암","옵","욘","미","나","합","습","학","슥","말"];
export const NT_ORDER = ["마","막","눅","요","행","롬","고전","고후","갈","엡","빌","골","살전","살후","딤전","딤후","딛","몬","히","약","벧전","벧후","요일","요이","요삼","유","계"];

// renderer/modules/books.js
export function buildBookSelect($book, META, { OT_ORDER, NT_ORDER, BOOK_NAME_MAP }) {
  $book.innerHTML = '';
  const groups = [{ label:'──── 구약 ────', list: OT_ORDER }, { label:'──── 신약 ────', list: NT_ORDER }];
  for (const g of groups) {
    const og = document.createElement('optgroup');
    og.label = g.label;
    for (const abbr of g.list) {
      if (!META.books.includes(abbr)) continue;
      const opt = document.createElement('option');
      opt.value = abbr;
      opt.textContent = BOOK_NAME_MAP[abbr] || abbr;
      og.appendChild(opt);
    }
    if (og.children.length) $book.appendChild(og);
  }
}

export function firstAvailableAbbr(META, { OT_ORDER, NT_ORDER }) {
  for (const a of [...OT_ORDER, ...NT_ORDER]) if (META.books.includes(a)) return a;
  return META.books?.[0] || null;
}

export function fillChSelect(sel, chArr) {
  sel.innerHTML = '';
  for (const { chapter } of chArr) {
    const opt = document.createElement('option');
    opt.value = chapter; opt.textContent = chapter; sel.appendChild(opt);
  }
}

export function fillVsSelect(sel, maxVerse) {
  sel.innerHTML = '';
  for (let i = 1; i <= maxVerse; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = i; sel.appendChild(opt);
  }
}

export function getMaxVerse(META, b, ch) {
  const found = (META.chapters[b] || []).find(x => x.chapter === Number(ch));
  return found ? found.maxVerse : 1;
}
