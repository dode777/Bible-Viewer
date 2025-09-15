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
  catch (e) { console.error('saveSettings error', e); }
}
let SETTINGS = {};

// ---------------- Bible Data ----------------
function loadBible() {
  const p = path.join(__dirname, 'assets', 'bible.json');
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    BIBLE = JSON.parse(raw);
    buildMeta();
  } catch (e) {
    console.error('Failed to load bible.json', e);
    BIBLE = {};
    META = { _books: [] };
  }
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
function hasChapter(book, ch) {
  return !!(META[book] && META[book][ch]);
}

function collectPassage({ book, sCh, sVs, eCh, eVs }) {
  const out = [];
  if (!META[book]) return out;
  sCh = Number(sCh) || 1; sVs = Number(sVs) || 1;
  eCh = Number(eCh) || sCh; eVs = Number(eVs) || sVs;
  function cmp(aCh,aVs,bCh,bVs){
    if (aCh < bCh) return -1; if (aCh > bCh) return 1;
    if (aVs < bVs) return -1; if (aVs > bVs) return 1;
    return 0;
  }
  if (cmp(eCh,eVs,sCh,sVs) < 0) {
    [sCh, eCh] = [eCh, sCh]; [sVs, eVs] = [eVs, sVs];
  }
  for (let ch = sCh; ch <= eCh; ch++) {
    const chMeta = META[book][ch];
    if (!chMeta) continue;
    const fromV = (ch === sCh) ? sVs : 1;
    const toV = (ch === eCh) ? eVs : chMeta.maxVerse;
    for (let v = fromV; v <= toV; v++) {
      const key = `${book}${ch}:${v}`;
      if (BIBLE[key]) out.push({ ref: key, text: BIBLE[key] });
    }
  }
  return out;
}

// advance by N verses across chapter boundaries
function advanceVerse(book, ch, vs, delta) {
  let curCh = Number(ch) || 1, curVs = Number(vs) || 1;
  let remaining = Math.abs(Number(delta));
  const forward = delta >= 0;
  if (!META[book]) return { ch: curCh, vs: curVs };
  const chList = Object.keys(META[book]).map(n=>+n).sort((a,b)=>a-b);
  while (remaining > 0) {
    const maxV = getMaxVerse(book, curCh);
    if (forward) {
      if (curVs < maxV) {
        curVs++;
        remaining--;
      } else {
        const idx = chList.indexOf(curCh);
        if (idx >= 0 && idx < chList.length - 1) {
          curCh = chList[idx+1];
          curVs = 1;
          remaining--;
        } else { break; }
      }
    } else {
      if (curVs > 1) {
        curVs--;
        remaining--;
      } else {
        const idx = chList.indexOf(curCh);
        if (idx > 0) {
          const prevCh = chList[idx-1];
          curCh = prevCh;
          curVs = getMaxVerse(book, prevCh);
          remaining--;
        } else { break; }
      }
    }
  }
  return { ch: curCh, vs: curVs };
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
    width: 700, height: 560, minWidth: 700, minHeight: 560,
    backgroundColor: '#0b0b0b', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });
  try { Menu.setApplicationMenu(null); } catch(e){/*ignore*/ }
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  MAIN_WIN = win;
}

function buildHtmlFromVerseRange(book, sChRaw, sVsRaw, count) {
  const sCh = Number(sChRaw) || 1;
  const sVs = Number(sVsRaw) || 1;
  let curCh = sCh, curVs = sVs;
  let remaining = Math.max(1, Number(count) || 1);
  let html = '';
  const chList = (META[book] ? Object.keys(META[book]).map(n=>+n).sort((a,b)=>a-b) : []);
  let openedChapter = -1;
  while (remaining > 0) {
    if (!hasChapter(book, curCh)) break;
    const maxV = getMaxVerse(book, curCh);
    if (openedChapter !== curCh) {
      if (openedChapter !== -1) html += `</section>`;
      // html += `<section class="chapter" data-chapter="${curCh}"><h3>${book} ${curCh}장</h3>`;
      openedChapter = curCh;
    }
    const key = `${book}${curCh}:${curVs}`;
    const txt = BIBLE[key] || '';
    html += `<p class="verse"><span class="ref">${curCh}:${curVs}</span> <span class="text">${escapeHtml(txt)}</span></p>`;
    remaining--;
    if (curVs < maxV) curVs++;
    else {
      const idx = chList.indexOf(curCh);
      if (idx >= 0 && idx < chList.length - 1) { curCh = chList[idx+1]; curVs = 1; }
      else break;
    }
  }
  if (openedChapter !== -1) html += `</section>`;
  return { html, startCh: sCh, startVs: sVs };
}

function openResultWindow(payload) {
  const { mode = 'scroll', book, sCh, sVs, eCh, eVs, fontSize, displayId, showRef, versesPerSlide } = payload || {};
  const displays = screen.getAllDisplays();
  const target = displays.find(d => d.id === displayId) || screen.getPrimaryDisplay();

  RESULT_WIN = new BrowserWindow({
    x: target.bounds.x, 
    y: target.bounds.y,
    width: target.workArea.width, 
    height: target.workArea.height,
    backgroundColor: '#0b0b0b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  RESULT_WIN.once('ready-to-show', () => {
    RESULT_WIN.show();
    RESULT_WIN.maximize();
    RESULT_WIN.focus();
    RESULT_WIN.webContents.focus();

    const vps = Math.max(1, Math.min(5, Number(versesPerSlide || SETTINGS.defaultVersesPerSlide || 1)));

    RESULT_WIN.webContents.send('result:init', {
      mode, book, sCh, sVs, eCh, eVs, fontSize, showRef,
      versesPerSlide: vps
    });

    if (mode === 'scroll') {
      const verses = collectPassage({ book, sCh, sVs, eCh, eVs });
      RESULT_WIN.webContents.send('result:update', { verses, fontSize, showRef, book, sCh, sVs, eCh, eVs });
    } else if (mode === 'slide') {
      const key = `${book}${sCh}:${sVs}`;
      const current = { ref: key, text: BIBLE[key] || '' };
      RESULT_WIN.webContents.send('result:update', { current, fontSize, showRef, book, sCh, sVs });
    } else if (mode === 'slide-scroll') {
      const { html, startCh, startVs } = buildHtmlFromVerseRange(book, sCh, sVs, vps);
      const current = { ref: `${book}${startCh}:${startVs}`, html, chapter: startCh };
      RESULT_WIN.webContents.send('result:update', { current, fontSize, showRef, book, sCh: startCh, sVs: startVs, versesPerSlide: vps });
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
  SETTINGS = loadSettings() || {};
  if (!SETTINGS.defaultMode) SETTINGS.defaultMode = 'scroll';
  if (!('defaultShowRef' in SETTINGS)) SETTINGS.defaultShowRef = true;
  if (!SETTINGS.defaultFontSize) SETTINGS.defaultFontSize = 100;
  if (!SETTINGS.defaultVersesPerSlide) SETTINGS.defaultVersesPerSlide = 1;

  loadBible();
  createMain();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); });

// ---------------- IPC: meta / displays / settings ----------------
ipcMain.handle('bible:getMeta', async () => {
  const books = META._books.slice();
  const chapters = {};
  for (const b of books) {
    const list = Object.keys(META[b] || {}).map(n => +n).sort((a,b)=>a-b);
    chapters[b] = list.map(n => ({ chapter: n, maxVerse: META[b][n].maxVerse }));
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
    defaultShowRef: SETTINGS.defaultShowRef !== false,
    defaultVersesPerSlide: SETTINGS.defaultVersesPerSlide || 1
  };
});

ipcMain.handle('settings:setPrefs', async (_evt, prefs) => {
  if (prefs && typeof prefs === 'object') {
    if (typeof prefs.defaultDisplayId === 'number') SETTINGS.defaultDisplayId = prefs.defaultDisplayId;
    if (typeof prefs.defaultFontSize === 'number') SETTINGS.defaultFontSize = prefs.defaultFontSize;
    if (typeof prefs.defaultMode === 'string') SETTINGS.defaultMode = prefs.defaultMode;
    if (typeof prefs.defaultShowRef === 'boolean') SETTINGS.defaultShowRef = prefs.defaultShowRef;
    if (typeof prefs.defaultVersesPerSlide === 'number') SETTINGS.defaultVersesPerSlide = Math.max(1, Math.min(5, prefs.defaultVersesPerSlide));
    saveSettings(SETTINGS);
  }
  return { ok: true };
});

// ---------------- IPC: result window control ----------------
ipcMain.handle('bible:openPassage', async (_evt, payload) => {
  try { openResultWindow(payload); return { ok: true }; }
  catch (e) { console.error('openPassage error', e); return { ok:false, error: String(e) }; }
});
ipcMain.handle('display:close', async () => { if (RESULT_WIN) RESULT_WIN.close(); return { ok: true }; });

ipcMain.handle('display:update', async (_evt, payload) => {
  if (!RESULT_WIN) return { ok:false, reason:'no-window' };
  RESULT_WIN.webContents.send('result:update', payload);
  return { ok:true };
});

ipcMain.handle('display:refresh', async (_evt, payload) => {
  if (!RESULT_WIN) return { ok:false, reason:'no-window' };
  const { mode, book, sCh, sVs, eCh, eVs, fontSize, showRef, versesPerSlide } = payload;
  if (mode === 'scroll') {
    const verses = collectPassage({ book, sCh, sVs, eCh, eVs });
    RESULT_WIN.webContents.send('result:update', { verses, fontSize, showRef, book, sCh, sVs, eCh, eVs });
  } else if (mode === 'slide') {
    const key = `${book}${sCh}:${sVs}`;
    const current = { ref: key, text: BIBLE[key] || '' };
    RESULT_WIN.webContents.send('result:update', { current, fontSize, showRef, book, sCh, sVs });
  } else if (mode === 'slide-scroll') {
    const vps = Math.max(1, Math.min(5, Number(versesPerSlide || SETTINGS.defaultVersesPerSlide || 1)));
    const { html, startCh, startVs } = buildHtmlFromVerseRange(book, sCh, sVs, vps);
    const current = { ref: `${book}${startCh}:${startVs}`, html, chapter: startCh };
    RESULT_WIN.webContents.send('result:update', { current, fontSize, showRef, book, sCh: startCh, sVs: startVs, versesPerSlide: vps });
  }
  return { ok:true };
});

ipcMain.handle('slide:move', async (_evt, { book, ch, vs, dir = 1, versesPerSlide = 1, mode = 'slide' }) => {
  try {
    dir = Number(dir) >= 0 ? 1 : -1;
    versesPerSlide = Math.max(1, Math.min(5, Number(versesPerSlide || 1)));

    if (mode === 'slide-scroll') {
      const nextStart = advanceVerse(book, Number(ch), Number(vs), dir * versesPerSlide);
      const startCh = nextStart.ch, startVs = nextStart.vs;
      const { html } = buildHtmlFromVerseRange(book, startCh, startVs, versesPerSlide);
      const current = { ref: `${book}${startCh}:${startVs}`, html, chapter: startCh };
      RESULT_WIN?.webContents.send('result:slide-current', { book, ch: startCh, vs: startVs, current });
      MAIN_WIN?.webContents.send('result:slide-current',   { book, ch: startCh, vs: startVs, current });
      RESULT_WIN?.webContents.send('result:update', { current });
      return { ok: true, mode: 'slide-scroll', ch: startCh, vs: startVs, current };
    }

    const next = nextVerse(book, Number(ch), Number(vs), dir > 0 ? 1 : -1);
    const key = `${book}${next.ch}:${next.vs}`;
    const current = { ref: key, text: BIBLE[key] || '' };
    RESULT_WIN?.webContents.send('result:slide-current', { book, ch: next.ch, vs: next.vs, current });
    MAIN_WIN?.webContents.send('result:slide-current',   { book, ch: next.ch, vs: next.vs, current });
    RESULT_WIN?.webContents.send('result:update', { current });
    return { ok: true, ...next, current };
  } catch (err) {
    console.error('slide:move error', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('result:start-scroll', async (_evt, payload) => {
  if (RESULT_WIN) {
    RESULT_WIN.webContents.send('result:start-scroll', payload);
    return { ok: true };
  }
  return { ok: false, reason: 'no-window' };
});

ipcMain.handle('result:stop-scroll', async () => {
  if (RESULT_WIN) {
    RESULT_WIN.webContents.send('result:stop-scroll');
    return { ok: true };
  }
  return { ok: false, reason: 'no-window' };
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
