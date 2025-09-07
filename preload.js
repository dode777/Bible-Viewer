// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bibleAPI', {
  // 메타/환경
  getMeta: () => ipcRenderer.invoke('bible:getMeta'),
  getDisplays: () => ipcRenderer.invoke('system:getDisplays'),
  savePrefs: (prefs) => ipcRenderer.invoke('settings:setPrefs', prefs),

  // 결과창 제어
  openPassage: (payload) => ipcRenderer.invoke('bible:openPassage', payload),
  closeDisplay: () => ipcRenderer.invoke('display:close'),

  // 실시간 반영
  updateDisplay: (payload) => ipcRenderer.invoke('display:update', payload),     // 옵션(폰트/참조표시)
  refreshDisplay: (payload) => ipcRenderer.invoke('display:refresh', payload),   // 선택(책/장/절/동일체크)

  // 상태/패치 수신
  onDisplayState: (cb) => ipcRenderer.on('display:state', (_e, s) => cb(s)),
  onResultInit: (cb) => ipcRenderer.on('result:init', (_e, data) => cb(data)),
  onResultUpdate: (cb) => ipcRenderer.on('result:update', (_e, patch) => cb(patch)),
  onSlideCurrent: (cb) => ipcRenderer.on('result:slide-current', (_e, data) => cb(data)),

  // 슬라이드 이동
  slideMove: (args) => ipcRenderer.invoke('slide:move', args)
});
