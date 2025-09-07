const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let BIBLE = {};
let META = { _books: [] };

// ===== Settings (표시 모니터 & 폰트 기본값 저장) =====
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf-8')); }
  catch { return {}; }
}
function saveSettings(obj) {
  try { fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(obj, null, 2)); } catch {}
}
let SETTINGS = {}; // { defaultDisplayId?: number, defaultFontSize?: number }

function loadBible() {
  const p = path.join(__dirname, 'assets', 'bible.json');
  BIBLE = JSON.parse(fs.readFileSync(p, 'utf-8')); // "창1:1": "..."
  buildMeta();
}

function buildMeta() {
  META = { _books: [] };
  for (const key of Object.keys(BIBLE)) {
    const m = key.match(/^([^\d]+)(\d+):(\d+)$/);
    if (!m) continue;
    const book = m[1];
    const ch = parseInt(m[2], 10);
    const vs = parseInt(m[3], 10);

    if (!META[book]) { META[book] = {}; META._books.push(book); }
    if (!META[book][ch]) META[book][ch] = { maxVerse: 0 };
    if (vs > META[book][ch].maxVerse) META[book][ch].maxVerse = vs;
  }
}

function createMain() {
  const win = new BrowserWindow({
    width: 800,
    height: 560,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0b0b0b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });

  // 전역 메뉴 제거
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  SETTINGS = loadSettings();
  loadBible();
  createMain();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); });

// ===== Passage 수집 & 결과창 =====
function collectPassage({ book, sCh, sVs, eCh, eVs }) {
  const out = [];
  if (!META[book]) return out;

  if (eCh < sCh || (eCh === sCh && eVs < sVs)) {
    [sCh, eCh] = [eCh, sCh];
    [sVs, eVs] = [eVs, sVs];
  }

  for (let ch = sCh; ch <= eCh; ch++) {
    const chMeta = META[book][ch];
    if (!chMeta) continue;
    const fromV = ch === sCh ? sVs : 1;
    const toV = ch === eCh ? eVs : chMeta.maxVerse;
    for (let v = fromV; v <= toV; v++) {
      const key = `${book}${ch}:${v}`;
      if (BIBLE[key]) out.push({ ref: key, text: BIBLE[key] });
    }
  }
  return out;
}

function openResultWindow({ title, verses, fontSize, displayId }) {
  const displays = screen.getAllDisplays();
  const target = displays.find(d => d.id === displayId) || screen.getPrimaryDisplay();

  const html = `
  <!doctype html><html><head><meta charset="utf-8">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin:0; height:100%; background:#0b0b0b; color:#f2f2f2;
      font-family: system-ui, AppleSDGothicNeo, "Segoe UI", Roboto, Arial; }
    header { padding: 14px 18px; font-weight:700; border-bottom:1px solid #222; }
    .wrap { padding: 18px 20px 28px; line-height:1.8; }
    .item { margin-bottom: 10px; font-size: ${fontSize || 100}px; }
    .ref { color:#9ad; font-weight:600; margin-right:8px; }
    .text { white-space: pre-wrap; word-break: keep-all; }
  </style></head>
  <body>
    <header>${title}</header>
    <div class="wrap">
      ${verses.length ? verses.map(v => `<div class="item"><span class="ref">${v.ref}</span><span class="text">${v.text}</span></div>`).join('') : `<div>구절을 찾을 수 없습니다.</div>`}
    </div>
  </body></html>`;

  const win = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.workArea.width,
    height: target.workArea.height,
    backgroundColor: '#0b0b0b',
    show: false
  });

  win.once('ready-to-show', () => {
    win.show();
    win.maximize(); // 최대화 상태로
  });

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

// ===== IPC =====
ipcMain.handle('bible:getMeta', async () => {
  const books = META._books;
  const chapters = {};
  for (const b of books) {
    chapters[b] = Object.keys(META[b]).map(n => parseInt(n, 10)).sort((a,b)=>a-b)
      .map(n => ({ chapter: n, maxVerse: META[b][n].maxVerse }));
  }
  return { books, chapters };
});

ipcMain.handle('system:getDisplays', async () => {
  const displays = screen.getAllDisplays().map((d, idx) => ({
    id: d.id,
    name: `Screen ${idx+1}`,
    size: `${d.bounds.width}x${d.bounds.height}`,
    pos: `@${d.bounds.x},${d.bounds.y}`,
    isPrimary: d.id === screen.getPrimaryDisplay().id
  }));
  // 저장된 기본값도 함께 반환
  return { displays, defaultDisplayId: SETTINGS.defaultDisplayId, defaultFontSize: SETTINGS.defaultFontSize };
});

// 설정 저장(표시모니터 + 폰트)
ipcMain.handle('settings:setPrefs', async (_evt, prefs) => {
  if (prefs && typeof prefs === 'object') {
    if (typeof prefs.defaultDisplayId === 'number') SETTINGS.defaultDisplayId = prefs.defaultDisplayId;
    if (typeof prefs.defaultFontSize === 'number') SETTINGS.defaultFontSize = prefs.defaultFontSize;
    saveSettings(SETTINGS);
  }
  return { ok: true };
});

ipcMain.handle('bible:openPassage', async (_evt, payload) => {
  const { book, sCh, sVs, eCh, eVs, fontSize, displayId } = payload;
  const verses = collectPassage({ book, sCh, sVs, eCh, eVs });
  openResultWindow({
    title: `${book}${sCh}:${sVs} – ${book}${eCh}:${eVs}`,
    verses, fontSize, displayId
  });
  return { ok: true, count: verses.length };
});
