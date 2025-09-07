const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bibleAPI', {
  // 데이터
  getMeta: () => ipcRenderer.invoke('bible:getMeta'),
  // 디스플레이(저장된 기본값 포함)
  getDisplays: () => ipcRenderer.invoke('system:getDisplays'),
  // 결과창 열기
  openPassage: (payload) => ipcRenderer.invoke('bible:openPassage', payload),
  // 환경설정 저장(표시모니터 + 폰트)
  savePrefs: (prefs) => ipcRenderer.invoke('settings:setPrefs', prefs)
});
