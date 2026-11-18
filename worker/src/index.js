// Power Board Worker: serves the page (static assets in ./public) and the JSON API at /api/<fn>.
// Transport rules are in specs/00-contract.md.
import { cleanup } from './db.js';
import * as student from './student.js';
import * as teacher from './teacher.js';
import { AppError } from './util.js';

// Every function the page may call, by name. Nothing else is reachable.
const FNS = {
  getConfig: student.getConfig, getRoster: student.getRoster, login: student.login, signOut: student.signOut,
  getMe: student.getMe, startQuiz: student.startQuiz, submitQuiz: student.submitQuiz, reportLeave: student.reportLeave,
  teacherLogin: teacher.teacherLogin, getAll: teacher.getAll, getBoard: teacher.getBoard, getFlags: teacher.getFlags,
  decideFlag: teacher.decideFlag, getSettings: teacher.getSettings, setQuarter: teacher.setQuarter,
  setCourse: teacher.setCourse, getRosterFull: teacher.getRosterFull, saveRoster: teacher.saveRoster,
  resetPin: teacher.resetPin, clearLocks: teacher.clearLocks, importProgress: teacher.importProgress,
  importFlags: teacher.importFlags, exportProgress: teacher.exportProgress
};
const MAX_BODY = 32 * 1024;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
  });
}
const failure = (err, status = 200, headers) => json({ ok: false, err }, status, headers);

// Reads the body as text, giving up as soon as it passes the limit (returns null if too big).
async function readBody(request) {
  if (+request.headers.get('Content-Length') > MAX_BODY) return null;
  if (!request.body) return '';
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}

// The per-browser id from X-PB-Device, or '' when missing or malformed.
function deviceOf(request) {
  const d = (request.headers.get('X-PB-Device') || '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(d) ? d : '';
}

async function handleApi(request, env, ctx, url) {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) return failure('BAD: Unknown request.');
  const fn = url.pathname.slice('/api/'.length);
  if (fn === 'ping') return json({ ok: true, data: 'pong' });
  if (!Object.hasOwn(FNS, fn)) return failure('BAD: Unknown request.');
  if (request.method !== 'POST') return failure('BAD: Use POST.', 405, { Allow: 'POST' });
  const text = await readBody(request);
  if (text === null) return failure('BAD: That request is too big.', 413);
  let args;
  try { args = JSON.parse(text).args; } catch (e) { args = null; }
  if (!Array.isArray(args)) return failure('BAD: Bad request.');
  const now = Date.now();
  if (Math.random() < 0.01) ctx.waitUntil(cleanup(env.DB, now).catch(e => console.error('cleanup', e)));
  try {
    const data = await FNS[fn]({ db: env.DB, env, viewer: deviceOf(request), now }, ...args);
    return json({ ok: true, data });
  } catch (e) {
    if (e instanceof AppError) return failure(e.message);
    console.error('/api/' + fn, e);
    return failure('SERVER: Something went wrong. Try again.');
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (e) {
        console.error(url.pathname, e);
        return failure('SERVER: Something went wrong. Try again.');
      }
    }
    return env.ASSETS.fetch(request);
  }
};
