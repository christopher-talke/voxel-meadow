import { $ } from '../../engine/core/util';
const hintEl = $('hint');
let hintGone = false;
export const hideHint = () => { if (!hintGone) { hintGone = true; hintEl.classList.add('gone'); } };
setTimeout(hideHint, 14000);
let hintTimer = 0;
export function showHint(text, ms) { hintEl.textContent = text; hintEl.classList.remove('gone'); hintGone = false; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintGone = false; hideHint(); }, ms); }
