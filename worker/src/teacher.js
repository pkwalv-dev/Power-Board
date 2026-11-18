// Teacher functions: the Code.gs ones (unchanged semantics) plus the Setup panel that replaces the Sheet menu.
// Each takes ctx = { db, env, viewer, now } followed by the page's positional args.
import { BOXES, COURSES, FLAG_HEAD, LIMITS } from './config.js';
import { columns, isBlankRow, parseCsv, toCsv } from './csv.js';
import {
  commitGuess, getSettings as readSettings, insertMany, newSession, recordsFor, release, reserve,
  rosterAll, setSetting, touchSession, updateProgress
} from './db.js';
import { boardFull_, fromNamedRow_, toRow_ } from './records.js';
import {
  clamp_, cleanName_, fail, idOf_, isId_, iso_, normPin_, randomPin_, safeEqual, str_
} from './util.js';

// ===== Sign-in =====
export async function teacherLogin(ctx, pin) {
  pin = typeof pin === 'string' ? pin : null;
  if (pin === null) fail('PIN', 'Wrong passphrase.');
  const secret = ctx.env.TEACHER_PIN;
  if (typeof secret !== 'string' || secret.length < 8) fail('SETUP', 'Set the TEACHER_PIN secret (8+ characters) with wrangler, then try again.');
  if (pin === '') fail('PIN', 'Wrong passphrase.');          // never counted as a guess
  const L = LIMITS, v = ctx.viewer;
  const keys = [['tf:all', L.teacherAllLockMin]];
  if (v) keys.push(['tf:' + v, L.teacherLockMin]);
  // Take this attempt's slot first so parallel guesses can't all get past the limits (see login).
  const [all, mine] = await reserve(ctx.db, keys, ctx.now);
  if (all.n > L.teacherAllFails || (mine && mine.n > L.teacherFails)) {
    await release(ctx.db, keys);
    fail('LOCKED', 'Too many wrong passphrases. Try again later.');
  }
  if (!(await safeEqual(pin, secret))) { await commitGuess(ctx.db, keys, ctx.now); fail('PIN', 'Wrong passphrase.'); }
  await release(ctx.db, keys);
  return newSession(ctx.db, 't', null, L.teacherSessionMin, ctx.now);
}
async function teacher_(ctx, token) {
  if (!isId_(token)) fail('SESSION', 'Teacher sign-in required.');
  if (!(await touchSession(ctx.db, token, 't', LIMITS.teacherSessionMin, ctx.now))) fail('SESSION', 'Teacher sign-in expired.');
  return readSettings(ctx.db);
}

// ===== Boards =====
export async function getAll(ctx, token) {
  const { model } = await teacher_(ctx, token);
  return recordsFor(ctx.db, model, await rosterAll(ctx.db));
}
export async function getBoard(ctx, token, cls) {
  const { model } = await teacher_(ctx, token);
  cls = str_(cls);
  if (!/^[1-8]$/.test(cls)) fail('BAD', 'Pick a period.');
  return recordsFor(ctx.db, model, (await rosterAll(ctx.db)).filter(s => s.cls === cls));
}

// ===== Flags =====
// A flag being decided right now has status 'deciding'; one left that way for a minute
// (the request died midway) counts as open again.
const STUCK_MS = 60000;
function fromFlag_(r) {
  return { qid: String(r.qid), when: iso_(r.served), sid: String(r.sid), name: String(r.name), cls: String(r.cls), std: String(r.std), code: String(r.code),
    n: clamp_(r.n, 0, 999), sec: clamp_(r.sec, 0, 7200), score: r.score === null || r.score === '' ? null : clamp_(r.score, 0, 10),
    status: r.status === 'deciding' ? 'open' : String(r.status), decided: r.status === 'deciding' ? '' : iso_(r.decided) };
}
// Open flags plus the last 30 days of decisions, newest first.
export async function getFlags(ctx, token) {
  await teacher_(ctx, token);
  const since = new Date(ctx.now - 30 * 864e5).toISOString();
  const { results } = await ctx.db.prepare(
    "SELECT * FROM flags WHERE status IN ('open', 'deciding') OR served >= ? ORDER BY served DESC, rowid DESC LIMIT 300"
  ).bind(since).all();
  return results.map(fromFlag_).filter(f => isId_(f.qid)).map(f => { delete f.sid; return f; });
}
// The teacher's call on one flag: take = 0 dismisses it, 1-5 takes that many boxes off the quiz's standard.
// Taking a box from a completed board un-completes it until the student fills it again.
export async function decideFlag(ctx, token, qid, take) {
  const { model: m } = await teacher_(ctx, token);
  if (!isId_(qid)) fail('BAD', 'Unknown flag.');
  take = clamp_(take, 0, BOXES);
  const db = ctx.db, nowIso = new Date(ctx.now).toISOString();
  const f = await db.prepare('SELECT * FROM flags WHERE qid = ?').bind(qid).first();
  if (!f) fail('BAD', 'That flag is gone. Refresh the page.');
  const open = f.status === 'open' || (f.status === 'deciding' && f.decided < new Date(ctx.now - STUCK_MS).toISOString());
  if (!open) fail('BAD', 'That flag was already decided. Refresh the page.');
  // Claim the flag, so a double click (or two teachers) can't take boxes twice.
  const claim = await db.prepare("UPDATE flags SET status = 'deciding', decided = ? WHERE qid = ? AND status = ? AND decided IS ?")
    .bind(nowIso, qid, f.status, f.decided).run();
  if (claim.meta.changes !== 1) fail('BAD', 'That flag was already decided. Refresh the page.');
  let status = 'dismissed';
  try {
    if (take > 0) {
      const inst = m.inst(f.std);
      const has = inst && await db.prepare('SELECT 1 FROM progress WHERE id = ?').bind(f.sid).first();
      if (!has) fail('BAD', 'That student has no boxes on that standard.');
      const student = await db.prepare('SELECT cls, name FROM roster WHERE id = ?').bind(f.sid).first();
      let lost = 0;
      await updateProgress(db, m, f.sid, student, r => {
        if (!r) fail('BAD', 'That student has no boxes on that standard.');
        const st = r.std[f.std], had = Math.min(st.mast, BOXES);
        lost = Math.min(take, had);
        st.mast = had - lost;
        if (r.done[inst.q] && !boardFull_(m, r, inst.q)) { r.done[inst.q] = ''; r.doneErr[inst.q] = 0; }
      }, ctx.now);
      status = 'took ' + lost + (lost === 1 ? ' box' : ' boxes');
    }
  } catch (e) {
    await db.prepare("UPDATE flags SET status = ?, decided = ? WHERE qid = ? AND status = 'deciding'").bind(f.status, f.decided, qid).run();
    throw e;
  }
  await db.prepare("UPDATE flags SET status = ?, decided = ? WHERE qid = ? AND status = 'deciding'").bind(status, nowIso, qid).run();
  return status;
}

// ===== Setup panel (replaces the Sheet menu) =====
export async function getSettings(ctx, token) {
  const { course, quarter } = await teacher_(ctx, token);
  const row = await ctx.db.prepare(
    "SELECT COUNT(*) AS students, SUM(CASE WHEN pin GLOB '[0-9][0-9][0-9][0-9]' THEN 0 ELSE 1 END) AS missing FROM roster"
  ).first();
  return { course, quarter, students: row.students, pinsMissing: row.missing || 0 };
}

export async function setQuarter(ctx, token, q) {
  await teacher_(ctx, token);
  q = str_(q).trim();
  if (!/^[1-4]$/.test(q)) fail('BAD', 'Please enter 1, 2, 3, or 4.');
  await setSetting(ctx.db, 'quarter', q).run();
  return { quarter: +q };
}

export async function setCourse(ctx, token, course, confirm) {
  const s = await teacher_(ctx, token);
  const c = str_(course).trim().toUpperCase();
  if (!Object.hasOwn(COURSES, c)) fail('BAD', 'Please enter M1 or M8.');
  if (c === s.course) return { course: c };
  const db = ctx.db, n = (await db.prepare('SELECT COUNT(*) AS n FROM progress').first()).n;
  if (n > 0 && confirm !== true) fail('CONFIRM', 'Switching courses erases ' + n + ' students\' scores.');
  // One transaction: the scores, flags and open quizzes all belong to the old course's standards.
  await db.batch([
    db.prepare('DELETE FROM progress'),
    db.prepare('DELETE FROM flags'),
    db.prepare('DELETE FROM quizzes'),
    setSetting(db, 'course', c)
  ]);
  return { course: c };
}

// PINs are visible to the teacher only.
export async function getRosterFull(ctx, token) {
  await teacher_(ctx, token);
  return (await rosterAll(ctx.db)).map(s => ({ cls: s.cls, name: s.name, pin: s.pin }));
}

// Replaces the roster with a pasted sheet (header row with Period, Name and optional PIN).
// Checks each row like Code.gs rosterIssues_ (minus the email rules); unusable rows are skipped and reported.
export async function saveRoster(ctx, token, csvText) {
  await teacher_(ctx, token);
  if (typeof csvText !== 'string') fail('BAD', 'Paste the roster first.');
  const rows = parseCsv(csvText), h = rows.findIndex(r => !isBlankRow(r));
  const cols = columns(h < 0 ? [] : rows[h]);
  if (!cols.has('period') || !cols.has('name')) fail('BAD', 'The first row needs Period and Name headings.');
  const db = ctx.db, oldPins = new Map((await rosterAll(db)).map(s => [s.id, s.pin]));
  const seen = new Map(), issues = [], out = [];
  rows.forEach((r, i) => {
    if (i <= h) return;
    const row = i + 1, get = name => cols.get(r, name);
    const cls = String(get('period')).trim(), raw = String(get('name')).trim(), name = cleanName_(get('name'));
    if (!raw && !cls) return;
    let ok = true;
    if (!/^[1-8]$/.test(cls)) { issues.push('Row ' + row + ': period must be 1–8.'); ok = false; }
    if (!name) { issues.push('Row ' + row + ': missing name.'); ok = false; }
    else if (name !== raw) issues.push('Row ' + row + ': name will show as "' + name + '".');
    if (!ok) return;
    const id = idOf_(cls, name);
    if (seen.has(id)) { issues.push('Row ' + row + ': same name as row ' + seen.get(id) + ' in that period. Add a letter to tell them apart.'); return; }
    seen.set(id, row);
    const rawPin = String(get('pin')).trim();
    let pin = normPin_(rawPin);
    if (rawPin && !pin) issues.push('Row ' + row + ': "' + rawPin.slice(0, 20) + '" is not a PIN (up to 4 digits), so a new PIN was made.');
    if (!pin) pin = (!rawPin && oldPins.get(id)) || randomPin_();   // a blank PIN keeps the student's current one
    out.push([id, cls, name, pin]);
  });
  if (!out.length) fail('BAD', 'No students to save. Each row needs a period (1–8) and a name.');
  // One transaction, so a failure can't leave half a roster.
  await db.batch([db.prepare('DELETE FROM roster'), ...insertMany(db, 'INSERT INTO roster(id, cls, name, pin)', '', out)]);
  return { students: out.length, issues };
}

// A new random PIN for one student; also clears their lockouts and ends their sessions.
export async function resetPin(ctx, token, cls, name) {
  await teacher_(ctx, token);
  cls = str_(cls); name = typeof name === 'string' ? cleanName_(name) : '';
  const db = ctx.db, st = await db.prepare('SELECT id, pin FROM roster WHERE cls = ? AND name = ?').bind(cls, name).first();
  if (!st) fail('BAD', 'That student is not on the roster.');
  let pin;
  do pin = randomPin_(); while (pin === st.pin);
  await db.batch([
    db.prepare('UPDATE roster SET pin = ? WHERE id = ?').bind(pin, st.id),
    db.prepare('DELETE FROM counters WHERE key IN (?, ?)').bind('lf:' + st.id, 'ld:' + st.id),
    db.prepare("DELETE FROM sessions WHERE kind = 's' AND sid = ?").bind(st.id)
  ]);
  return { pin };
}

// Clears every wrong-guess counter: per student, per day, per device, class-wide and teacher.
export async function clearLocks(ctx, token) {
  await teacher_(ctx, token);
  await ctx.db.prepare("DELETE FROM counters WHERE substr(key, 1, 3) IN ('lf:', 'ld:', 'lv:', 'tf:')").run();
  return true;
}

// ===== Moving from Google Sheets =====
function sheetRows(csvText, need, what) {
  if (typeof csvText !== 'string') fail('BAD', 'Choose a CSV file first.');
  const rows = parseCsv(csvText).filter(r => !isBlankRow(r));
  const cols = columns(rows[0] || []);
  if (!cols.has(need)) fail('BAD', 'That doesn’t look like the ' + what + ' tab. In Sheets, open that tab, then File → Download → CSV.');
  return { cols, rows: rows.slice(1) };
}

// The Progress tab (HEAD columns). Every row goes through clean_ and overwrites that id's progress.
export async function importProgress(ctx, token, csvText) {
  const { model: m } = await teacher_(ctx, token);
  const { cols, rows } = sheetRows(csvText, 'id', 'Progress');
  const recs = new Map();
  let skipped = 0;
  rows.forEach(r => {
    const id = String(cols.get(r, 'id')).trim(), rec = fromNamedRow_(m, name => cols.get(r, name));
    if (!rec || id !== idOf_(rec.cls, rec.name)) { skipped++; return; }
    recs.set(id, rec);
  });
  if (recs.size) {
    const at = new Date(ctx.now).toISOString(), db = ctx.db;
    // version + 1 makes any quiz being graded at this moment re-read the imported record.
    await db.batch(insertMany(db, 'INSERT INTO progress(id, data, version, updated)',
      'ON CONFLICT(id) DO UPDATE SET data = excluded.data, version = progress.version + 1, updated = excluded.updated',
      [...recs].map(([id, rec]) => [id, JSON.stringify(rec), 1, at])));
  }
  return { imported: recs.size, skipped };
}

// The Flags tab (FLAG_HEAD columns). Upserts by quiz id.
export async function importFlags(ctx, token, csvText) {
  await teacher_(ctx, token);
  const { cols, rows } = sheetRows(csvText, FLAG_HEAD[0], 'Flags');
  const flags = new Map();
  rows.forEach(r => {
    const get = name => cols.get(r, name), qid = String(get('quiz')).trim();
    if (!isId_(qid)) return;
    const score = String(get('score')).trim();
    flags.set(qid, [qid, iso_(get('when')), String(get('student id')).trim().slice(0, 60), cleanName_(get('name')),
      String(get('period')).trim().slice(0, 2), String(get('std')).trim().slice(0, 20), String(get('standard')).trim().slice(0, 40),
      clamp_(get('times left'), 0, 999), clamp_(get('seconds away'), 0, 7200), score === '' ? null : clamp_(score, 0, 10),
      String(get('status')).trim().slice(0, 40) || 'open', iso_(get('decided'))]);
  });
  if (flags.size) {
    const db = ctx.db;
    await db.batch(insertMany(db, 'INSERT INTO flags(qid, served, sid, name, cls, std, code, n, sec, score, status, decided)',
      'ON CONFLICT(qid) DO UPDATE SET served = excluded.served, sid = excluded.sid, name = excluded.name, cls = excluded.cls, ' +
      'std = excluded.std, code = excluded.code, n = excluded.n, sec = excluded.sec, score = excluded.score, ' +
      'status = excluded.status, decided = excluded.decided',
      [...flags.values()]));
  }
  return { imported: flags.size };
}

// The Progress tab as CSV, in HEAD order: one row per roster student, roster spelling of the name.
export async function exportProgress(ctx, token) {
  const { model: m } = await teacher_(ctx, token);
  const recs = await recordsFor(ctx.db, m, await rosterAll(ctx.db));
  return toCsv([m.HEAD].concat(recs.map(r => toRow_(m, r))));
}
