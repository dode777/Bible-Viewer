// renderer/modules/live.js
import { debounce } from './dom.js';

export function makeLiveUpdater(getOpenState, getPayload) {
  return debounce(async () => {
    if (!getOpenState()) return;
    const p = getPayload();
    await window.bibleAPI.updateDisplay(p);
  }, 120);
}

export function makeSelectionRefresher(getOpenState, getPayload) {
  return debounce(async () => {
    if (!getOpenState()) return;
    const p = getPayload();
    await window.bibleAPI.refreshDisplay(p);
  }, 140);
}
