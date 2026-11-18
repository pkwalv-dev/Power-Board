// Calls the Worker the way the page does: POST /api/<fn> with {"args":[...]}.
import { env, exports } from 'cloudflare:workers';
import { expect } from 'vitest';

export const ORIGIN = 'https://power-board.example';
export const DEV_A = 'a'.repeat(32);
export const DEV_B = 'b'.repeat(32);
export const TEACHER_PASS = 'test-teacher-pass';

// opts: device (null = no header), origin, method, body (raw string)
export async function call(fn, args = [], opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const device = opts.device === undefined ? DEV_A : opts.device;
  if (device !== null) headers['X-PB-Device'] = device;
  if (opts.origin) headers.Origin = opts.origin;
  const method = opts.method || 'POST';
  const res = await exports.default.fetch(ORIGIN + '/api/' + fn, {
    method, headers, body: method === 'GET' ? undefined : (opts.body ?? JSON.stringify({ args }))
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}
// Expects success and returns data.
export async function ok(fn, ...args) {
  const r = await call(fn, args);
  if (!r.body.ok) throw new Error(fn + ' failed: ' + r.body.err);
  return r.body.data;
}
// Expects a failure and returns the "CODE: message" string.
export async function bad(fn, ...args) {
  const r = await call(fn, args);
  expect(r.body.ok, fn + ' should fail').toBe(false);
  return r.body.err;
}

export const teacher = () => ok('teacherLogin', TEACHER_PASS);

export const ROSTER = 'Period,Name,PIN\r\n1,Ann Lee,1234\r\n1,Ben Ortiz,2345\r\n2,Cara Diaz,3456\r\n2,Dev Shah,4567\r\n';
export async function setupClass(csv = ROSTER) {
  const t = await teacher();
  await ok('saveRoster', t, csv);
  return t;
}
export const loginAnn = async () => (await ok('login', '1', 'Ann Lee', '1234')).token;
export const ANN = 'p1_ann-lee';

// Lets a quiz be submitted right away (the server makes students wait 20 s).
export async function ageQuiz(qid) {
  await env.DB.prepare('UPDATE quizzes SET served = served - 30000 WHERE qid = ?').bind(qid).run();
}
// Clears the 15 s gap between quiz starts.
export async function clearGap() {
  await env.DB.prepare("DELETE FROM counters WHERE key LIKE 'qg:%'").run();
}
// The answer key, straight from D1 (it is never sent before submit).
export async function answers(qid) {
  return JSON.parse((await env.DB.prepare('SELECT ans FROM quizzes WHERE qid = ?').bind(qid).first()).ans);
}
export async function progressOf(id) {
  const row = await env.DB.prepare('SELECT data, version FROM progress WHERE id = ?').bind(id).first();
  return row && { ...JSON.parse(row.data), version: row.version };
}
// Starts a quiz that can be submitted immediately.
export async function startReady(token, std) {
  await clearGap();
  const q = await ok('startQuiz', token, std);
  await ageQuiz(q.qid);
  return q;
}
export async function counter(key) {
  const row = await env.DB.prepare('SELECT n, expires FROM counters WHERE key = ?').bind(key).first();
  return row && row.expires > Date.now() ? row.n : 0;
}
