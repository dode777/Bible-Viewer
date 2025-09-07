// main.js
const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let BIBLE = {};
let META = { _books: [] };

// ---------------- Settings ----------------
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf-8')); }
  catch { return {}; }
}
function saveSettings(obj) {
  try { fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(obj, null, 2)); }
  catch {}
}
// SETTINGS: { defaultDisplayId, defaultFontSize, defaultMode, defaultShowRef }
let SETTINGS = {};

// ---------------- Bible Data ----------------
function loadBible() {
  const p = path.join(__dirname, 'assets', 'bible.json');
  BIBLE = JSON.parse(fs.readFileSync(p, 'utf-8')); // e.g. "창1:1": "태초에 ..."
  buildMeta();
}
function buildMeta() {
  META = { _books: [] };
  for (const key of Object.keys(BIBLE)) {
    const m = key.match(/^([^\d]+)(\d+):(\d+)$/);
    if (!m) continue;
    const book = m[1]; const ch = +m[2]; const vs = +m[3];
    if (!META[book]) { META[book] = {}; META._books.push(book); }
    if (!META[book][ch]) META[book][ch] = { maxVerse: 0 };
    if (vs > META[book][ch].maxVerse) META[book][ch].maxVerse = vs;
  }
}
function getMaxVerse(book, ch) {
  return (META[book] && META[book][ch]) ? META[book][ch].maxVerse : 1;
}
function collectPassage({ book, sCh, sVs, eCh, eVs }) {
  const out = [];
  if (!META[book]) return out;
  if (eCh < sCh || (eCh === sCh && eVs < sVs)) {
    [sCh, eCh] = [eCh, sCh]; [sVs, eVs] = [eVs, sVs];
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
function nextVerse(book, ch, vs, dir) {
  if (!META[book]) return { ch, vs };
  if (dir > 0) {
    const mv = getMaxVerse(book, ch);
    if (vs < mv) return { ch, vs: vs + 1 };
    const chList = Object.keys(META[book]).map(n=>+n).sort((a,b)=>a-b);
    const idx = chList.indexOf(ch);
    if (idx >= 0 && idx < chList.length - 1) return { ch: chList[idx+1], vs: 1 };
    return { ch, vs };
  } else {
    if (vs > 1) return { ch, vs: vs - 1 };
    const chList = Object.keys(META[book]).map(n=>+n).sort((a,b)=>a-b);
    const idx = chList.indexOf(ch);
    if (idx > 0) { const prevCh = chList[idx-1]; return { ch: prevCh, vs: getMaxVerse(book, prevCh) }; }
    return { ch, vs };
  }
}

// ---------------- Windows ----------------
let MAIN_WIN = null;
let RESULT_WIN = null;

function createMain() {
  const win = new BrowserWindow({
    width: 900, height: 560, minWidth: 900, minHeight: 560, maxWidth: 900, maxHeight:560,
    backgroundColor: '#0b0b0b', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  MAIN_WIN = win;
}

function openResultWindow(payload) {
  const { mode, book, sCh, sVs, eCh, eVs, fontSize, displayId, showRef } = payload;
  const displays = screen.getAllDisplays();
  const target = displays.find(d => d.id === displayId) || screen.getPrimaryDisplay();

  RESULT_WIN = new BrowserWindow({
    x: target.bounds.x, y: target.bounds.y,
    width: target.workArea.width, height: target.workArea.height,
    backgroundColor: '#0b0b0b', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  RESULT_WIN.once('ready-to-show', () => {
    RESULT_WIN.show();
    RESULT_WIN.maximize();

    // 초기 메타
    RESULT_WIN.webContents.send('result:init', { mode, book, sCh, sVs, eCh, eVs, fontSize, showRef });

    // 최초 컨텐츠
    if (mode === 'scroll') {
      const verses = collectPassage({ book, sCh, sVs, eCh, eVs });
      RESULT_WIN.webContents.send('result:update', { verses, fontSize, showRef, book, sCh, sVs, eCh, eVs });
    } else {
      const key = `${book}${sCh}:${sVs}`;
      const current = { ref: key, text: BIBLE[key] || '' };
      RESULT_WIN.webContents.send('result:update', { current, fontSize, showRef, book, sCh, sVs });
    }

    MAIN_WIN?.webContents.send('display:state', { opened: true });
  });

  RESULT_WIN.on('closed', () => {
    RESULT_WIN = null;
    MAIN_WIN?.webContents.send('display:state', { opened: false });
  });

  RESULT_WIN.loadFile(path.join(__dirname, 'renderer', 'result.html'));
}

// ---------------- App lifecycle ----------------
app.whenReady().then(() => {
  SETTINGS = loadSettings();
  if (!SETTINGS.defaultMode) SETTINGS.defaultMode = 'scroll';
  if (!('defaultShowRef' in SETTINGS)) SETTINGS.defaultShowRef = true;
  if (!SETTINGS.defaultFontSize) SETTINGS.defaultFontSize = 100;

  loadBible();
  createMain();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); });

// ---------------- IPC: meta / displays / settings ----------------
ipcMain.handle('bible:getMeta', async () => {
  const books = META._books;
  const chapters = {};
  for (const b of books) {
    chapters[b] = Object.keys(META[b]).map(n => +n).sort((a,b)=>a-b)
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
  return {
    displays,
    ...SETTINGS,
    defaultMode: SETTINGS.defaultMode || 'scroll',
    defaultShowRef: SETTINGS.defaultShowRef !== false
  };
});

ipcMain.handle('settings:setPrefs', async (_evt, prefs) => {
  if (prefs && typeof prefs === 'object') {
    if (typeof prefs.defaultDisplayId === 'number') SETTINGS.defaultDisplayId = prefs.defaultDisplayId;
    if (typeof prefs.defaultFontSize === 'number') SETTINGS.defaultFontSize = prefs.defaultFontSize;
    if (typeof prefs.defaultMode === 'string') SETTINGS.defaultMode = prefs.defaultMode;
    if (typeof prefs.defaultShowRef === 'boolean') SETTINGS.defaultShowRef = prefs.defaultShowRef;
    saveSettings(SETTINGS);
  }
  return { ok: true };
});

// ---------------- IPC: result window control ----------------
ipcMain.handle('bible:openPassage', async (_evt, payload) => { openResultWindow(payload); return { ok: true }; });
ipcMain.handle('display:close', async () => { if (RESULT_WIN) RESULT_WIN.close(); return { ok: true }; });

// (A) 옵션 변경(폰트/참조표시) 등: 그대로 패치 전달
ipcMain.handle('display:update', async (_evt, payload) => {
  if (!RESULT_WIN) return { ok:false, reason:'no-window' };
  RESULT_WIN.webContents.send('result:update', payload);
  return { ok:true };
});

// (B) 선택 변경(책/장/절/동일체크) 등: 본문 재계산해서 전달
ipcMain.handle('display:refresh', async (_evt, payload) => {
  if (!RESULT_WIN) return { ok:false, reason:'no-window' };
  const { mode, book, sCh, sVs, eCh, eVs, fontSize, showRef } = payload;

  if (mode === 'scroll') {
    const verses = collectPassage({ book, sCh, sVs, eCh, eVs });
    RESULT_WIN.webContents.send('result:update', { verses, fontSize, showRef, book, sCh, sVs, eCh, eVs });
  } else {
    const key = `${book}${sCh}:${sVs}`;
    const current = { ref: key, text: BIBLE[key] || '' };
    RESULT_WIN.webContents.send('result:update', { current, fontSize, showRef, book, sCh, sVs });
  }
  return { ok:true };
});

// 슬라이드 이동
ipcMain.handle('slide:move', async (_evt, { book, ch, vs, dir }) => {
  const next = nextVerse(book, ch, vs, dir > 0 ? +1 : -1);
  const key = `${book}${next.ch}:${next.vs}`;
  const current = { ref: key, text: BIBLE[key] || '' };
  RESULT_WIN?.webContents.send('result:slide-current', { book, ch: next.ch, vs: next.vs, current });
  return { ok:true, ...next, current };
});
