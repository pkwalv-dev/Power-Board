// Small helpers, ported from the Helpers section of apps-script/Code.gs.
import { TIME_ZONE } from './config.js';

// A failure the page shows to the user. The API sends it as "CODE: message".
export class AppError extends Error {
  constructor(code, msg) { super(code + ': ' + msg); this.code = code; }
}
export function fail(code, msg) { throw new AppError(code, msg); }

// Only plain strings and numbers are ever accepted from a browser.
export function str_(v) { return typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v)) ? String(v) : ''; }
export function clamp_(v, a, b) { v = Math.round(+v) || 0; return Math.max(a, Math.min(b, v)); }
export function cleanName_(s) {
  return (typeof s === 'string' ? s : str_(s)).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@\s]+/, '').slice(0, 40);
}
export function normPin_(v) { const s = str_(v).trim(); return /^\d{1,4}$/.test(s) ? ('000' + s).slice(-4) : ''; }
export function iso_(v) { return v instanceof Date ? v.toISOString() : String(v == null ? '' : v).slice(0, 30); }
export function isId_(t) { return typeof t === 'string' && /^[a-f0-9]{32}$/.test(t); }
export function idOf_(cls, name) {
  return 'p' + cls + '_' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x');
}

// 32 hex characters from the platform's secure random source (tokens and quiz ids).
export function newId_() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
// A uniformly random 4-digit PIN (rejection sampling avoids modulo bias).
export function randomPin_() {
  const buf = new Uint16Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= 60000);
  return String(buf[0] % 10000).padStart(4, '0');
}

export async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
export async function sha256Hex(text) {
  return Array.from(await sha256(text), x => x.toString(16).padStart(2, '0')).join('');
}
// Constant-time string compare: hashing first makes both sides the same length.
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  return crypto.subtle.timingSafeEqual(x, y);
}

// "yyyy-MM-dd" in the school's time zone.
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayOf(ms) {
  const p = {};
  dayFmt.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}

// Sorts roster-like rows by period, then name (as the page lists them).
export function byClassThenName(a, b) { return (+a.cls - +b.cls) || a.name.localeCompare(b.name); }
