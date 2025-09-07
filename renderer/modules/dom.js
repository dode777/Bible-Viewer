// renderer/modules/dom.js
export const $ = (id) => document.getElementById(id);
export const on = (el, ev, fn) => el.addEventListener(ev, fn);
export const debounce = (fn, ms=160) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

export function showToast(msg='저장되었습니다') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 1400);
}
export function flashSaved() {
  const el = document.getElementById('savedCheck');
  if (!el) return;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 900);
}
