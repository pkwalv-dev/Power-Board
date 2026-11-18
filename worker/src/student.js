// Student functions (unchanged semantics from apps-script/Code.gs).
// Each takes ctx = { db, env, viewer, now } followed by the page's positional args.
import { LIMITS, QS, QUIZ_TTL_MS } from './config.js';
import { QGEN } from './questions.js';
import { apply_ } from './records.js';
import {
  commitGuess, clearCounters, endSession, getSettings, newSession, recordsFor, release, reserve,
  rosterById, touchSession, updateProgress
} from './db.js';
import { clamp_, cleanName_, dayOf, fail, isId_, newId_, str_ } from './util.js';

// ===== Sessions =====
// Returns { id, cls, name } for a signed-in student. cls/name are null if they left the roster.
async function session_(ctx, token) {
  if (!isId_(token)) fail('SESSION', 'Please sign in again.');
  const row = await touchSession(ctx.db, token, 's', LIMITS.sessionMin, ctx.now);
  if (!row) fail('SESSION', 'Your sign-in expired. Please sign in again.');
  const st = await rosterById(ctx.db, row.sid);
  return { id: row.sid, cls: st ? st.cls : null, name: st ? st.name : null, onRoster: !!st };
}
async function newSession_(ctx, st, m) {
  const token = await newSession(ctx.db, 's', st.id, LIMITS.sessionMin, ctx.now);
  return { token, rec: (await recordsFor(ctx.db, m, [st]))[0] };
}

// Course, quarters, and standards for the page.
export async function getConfig(ctx) {
  const { model: m, quarter } = await getSettings(ctx.db);
  return {
    course: m.name, current: quarter,
    quarters: QS.map(q => ({ q, stds: m.stdsIn(q).map(s => ({ id: s.id, code: s.code, title: s.title, sub: s.sub })) }))
  };
}

// Names for the sign-in list.
export async function getRoster(ctx, cls) {
  cls = str_(cls);
  if (!/^[1-8]$/.test(cls)) return [];
  const { results } = await ctx.db.prepare('SELECT name FROM roster WHERE cls = ?').bind(cls).all();
  return results.map(r => r.name).sort((a, b) => a.localeCompare(b));
}

export async function login(ctx, cls, name, pin) {
  cls = str_(cls); name = typeof name === 'string' ? cleanName_(name) : ''; pin = typeof pin === 'string' ? pin : '';
  const st = await ctx.db.prepare('SELECT id, cls, name, pin FROM roster WHERE cls = ? AND name = ?').bind(cls, name).first();
  if (!st) fail('LOGIN', 'Pick your name from the list.');
  const L = LIMITS, v = ctx.viewer;
  const keys = [['lf:' + st.id, L.loginLockMin], ['ld:' + st.id, 24 * 60], ['lf:all', L.classLockMin]];
  if (v) keys.push(['lv:' + v, L.viewerLockMin]);
  // Take this attempt's slot first, so parallel guesses can't all get past the limits.
  // A count above the limit means it was already at the limit before this attempt (Code.gs: n >= limit).
  const [mine, day, all, viewer] = await reserve(ctx.db, keys, ctx.now);
  const locked =
    all.n > L.classFails ? 'Sign-in is paused because of too many wrong PINs. Try again in a few minutes or ask your teacher.'
    : viewer && viewer.n > L.viewerFails ? 'Too many wrong PINs. Wait ' + L.viewerLockMin + ' minutes or ask your teacher.'
    : day.n > L.loginDayFails ? 'Too many wrong PINs today. Ask your teacher to unlock your sign-in.'
    : mine.n > L.loginFails ? 'Too many wrong PINs. Wait ' + L.loginLockMin + ' minutes or ask your teacher.'
    : '';
  if (locked) { await release(ctx.db, keys); fail('LOGIN', locked); }
  if (!/^\d{4}$/.test(pin.trim()) || pin.trim() !== st.pin) {
    await commitGuess(ctx.db, keys, ctx.now);
    fail('LOGIN', 'Wrong PIN.');
  }
  await release(ctx.db, keys.slice(1));          // a correct PIN isn't a wrong guess...
  await clearCounters(ctx.db, ['lf:' + st.id]);  // ...and it clears the short per-student lockout
  const { model } = await getSettings(ctx.db);
  return newSession_(ctx, st, model);
}

export async function signOut(ctx, token) { await endSession(ctx.db, token); return true; }

export async function getMe(ctx, token) {
  const s = await session_(ctx, token);
  if (!s.onRoster) fail('SESSION', 'You are no longer on the roster.');
  const { model } = await getSettings(ctx.db);
  return (await recordsFor(ctx.db, model, [s]))[0];
}

// ===== Quizzes (graded on the server; answers never leave until you commit) =====
export async function startQuiz(ctx, token, std) {
  const s = await session_(ctx, token);
  const { model: m, quarter } = await getSettings(ctx.db);
  const inst = m.inst(std);
  if (!inst) fail('BAD', 'Unknown standard.');
  if (inst.q > quarter) fail('BAD', 'That quarter has not started yet.');
  const now = ctx.now, db = ctx.db;
  // Minimum gap between starts: the first start opens a 15-second window; any start inside it waits.
  const gapKey = ['qg:' + s.id, LIMITS.quizGapSec / 60];
  const [gap] = await reserve(db, [gapKey], now);
  if (gap.n > 1) fail('WAIT', 'You can start another quiz in ' + Math.ceil((gap.expires - now) / 1000) + ' seconds.');
  const dayKey = ['qd:' + s.id + ':' + dayOf(now), 26 * 60];
  const [day] = await reserve(db, [dayKey], now);
  if (day.n > LIMITS.quizzesPerDay) {
    await release(db, [dayKey]);
    await db.prepare('DELETE FROM counters WHERE key = ?').bind(gapKey[0]).run();   // Code.gs didn't start the gap
    fail('LIMIT', 'That’s the most quizzes for today. Come back tomorrow!');
  }
  const qs = QGEN.makeQuiz(inst.gen), qid = newId_();
  await db.prepare('INSERT INTO quizzes(qid, sid, std, ans, n, exp, served, done, picks, away_n, away_ms, expires) VALUES(?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, 0, ?)')
    .bind(qid, s.id, inst.id, JSON.stringify(qs.map(q => q.ans)), JSON.stringify(qs.map(q => q.opts.length)),
      JSON.stringify(qs.map(q => q.exp)), now, now + QUIZ_TTL_MS).run();
  return { qid, std: inst.id, qs: qs.map(q => ({ stem: q.stem, opts: q.opts })) };
}

// The whole 10-question set is graded at once, so students can change answers before they submit.
// n and ms: how many times the student left the quiz page, and for how long in total.
export async function submitQuiz(ctx, token, qid, picks, n, ms) {
  const s = await session_(ctx, token);
  if (!isId_(qid)) fail('QUIZ', 'That quiz is not available.');
  if (!Array.isArray(picks) || picks.length !== 10 || !picks.every(p => Number.isInteger(p) && p >= 0 && p <= 3)) fail('BAD', 'Answer all 10 questions first.');
  const db = ctx.db, now = ctx.now;
  const q = await db.prepare('SELECT * FROM quizzes WHERE qid = ? AND expires > ?').bind(qid, now).first();
  if (!q) fail('QUIZ', 'This quiz expired. Start a new one.');
  if (q.sid !== s.id) fail('QUIZ', 'That quiz is not available.');
  if (q.done) fail('QUIZ', 'That quiz was already submitted.');
  const nOpts = JSON.parse(q.n);
  if (picks.some((p, k) => p >= nOpts[k])) fail('BAD', 'Invalid answer.');
  const wait = q.served + LIMITS.minAnswerMs * 10 - now;
  if (wait > 0) return { wait };
  // Only the request that flips done 0 -> 1 grades the quiz. Away totals only go up (awayMerge_).
  const away = awayArgs(n, ms);
  const done = await db.prepare(
    'UPDATE quizzes SET done = 1, picks = ?, away_n = MAX(away_n, ?), away_ms = MAX(away_ms, ?), expires = ? ' +
    'WHERE qid = ? AND sid = ? AND done = 0 AND expires > ? RETURNING away_n, away_ms'
  ).bind(JSON.stringify(picks), away.n, away.ms, now + QUIZ_TTL_MS, qid, s.id, now).first();
  if (!done) fail('QUIZ', 'That quiz was already submitted.');
  const ans = JSON.parse(q.ans);
  const quiz = { std: q.std, served: q.served, away: { n: done.away_n, ms: done.away_ms } };
  let out;
  try {
    out = await finish_(ctx, s, qid, quiz, picks.filter((p, k) => p === ans[k]).length);
  } catch (e) {
    // Grading didn't land: reopen the quiz so the student can submit again instead of losing it.
    // Safe to redo: apply_ skips a quiz id already in hist, and flag counts only go up.
    await db.prepare('UPDATE quizzes SET done = 0, picks = NULL WHERE qid = ? AND done = 1').bind(qid).run().catch(() => {});
    throw e;
  }
  out.ans = ans; out.exp = JSON.parse(q.exp); out.left = quiz.away.n;
  return out;
}
async function finish_(ctx, s, qid, quiz, score) {
  const student = await rosterById(ctx.db, s.id);
  if (!student) fail('SESSION', 'You are no longer on the roster.');
  const { model: m } = await getSettings(ctx.db);
  const rec = await updateProgress(ctx.db, m, student.id, student, r => {
    if (m.inst(quiz.std)) apply_(m, r, { id: qid.slice(0, 16), std: quiz.std, sc: score }, ctx.now);
  }, ctx.now);
  if (quiz.away.n) await flagWrite_(ctx, m, qid, student, quiz, score);  return { score, rec };
}

// ===== Leaving a quiz (tab switches, other windows) =====
// The page reports running totals as they happen, so closing the tab doesn't hide it.
// Nothing comes off the board until the teacher decides (decideFlag).
export async function reportLeave(ctx, token, qid, n, ms) {
  const s = await session_(ctx, token);
  if (!isId_(qid)) fail('QUIZ', 'That quiz is not available.');
  const db = ctx.db, now = ctx.now;
  const q = await db.prepare('SELECT sid, std, served, done, away_n, away_ms FROM quizzes WHERE qid = ? AND expires > ?').bind(qid, now).first();
  if (!q || q.sid !== s.id || q.done) return false;
  const away = awayArgs(n, ms);
  if (away.n <= q.away_n && away.ms <= q.away_ms) return true;    // nothing new (awayMerge_ returned false)
  const row = await db.prepare(
    'UPDATE quizzes SET away_n = MAX(away_n, ?), away_ms = MAX(away_ms, ?), expires = ? ' +
    'WHERE qid = ? AND sid = ? AND done = 0 AND expires > ? RETURNING away_n, away_ms'
  ).bind(away.n, away.ms, now + QUIZ_TTL_MS, qid, s.id, now).first();
  if (!row) return false;                                         // submitted in the meantime
  const { model: m } = await getSettings(db);
  await flagWrite_(ctx, m, qid, s, { std: q.std, served: q.served, away: { n: row.away_n, ms: row.away_ms } }, null);
  return true;
}
function awayArgs(n, ms) { return { n: clamp_(n, 0, 999), ms: clamp_(ms, 0, 7200000) }; }

// Updates the counts (and score, once submitted) but never the teacher's decision.
async function flagWrite_(ctx, m, qid, s, quiz, score) {
  const inst = m.inst(quiz.std), sec = Math.round(quiz.away.ms / 1000);
  await ctx.db.prepare(
    'INSERT INTO flags(qid, served, sid, name, cls, std, code, n, sec, score, status, decided) ' +
    "VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'open', '') " +
    'ON CONFLICT(qid) DO UPDATE SET n = MAX(n, excluded.n), sec = MAX(sec, excluded.sec), score = COALESCE(excluded.score, score)'
  ).bind(qid, new Date(quiz.served).toISOString(), s.id, s.name || '', s.cls || '', quiz.std,
    inst ? inst.code : quiz.std, quiz.away.n, sec, score).run();
}
