// D1 access: settings, roster, progress (with compare-and-swap), sessions and counters.
// Every time-limited row has an `expires` (ms since epoch); a row whose expires has passed counts as gone.
import { courseModel } from './config.js';
import { clean_ } from './records.js';
import { byClassThenName, isId_, newId_, sha256Hex } from './util.js';

// ===== Settings (course and current quarter; defaults M1 / Q1) =====
export async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const kv = Object.fromEntries(results.map(r => [r.key, r.value]));
  const q = Math.floor(+kv.quarter);
  const model = courseModel(kv.course);
  return { course: model.id, quarter: q >= 1 && q <= 4 ? q : 1, model };
}
export function setSetting(db, key, value) {
  return db.prepare('INSERT INTO settings(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(key, String(value));
}

// ===== Roster =====
export async function rosterAll(db) {
  const { results } = await db.prepare('SELECT id, cls, name, pin FROM roster').all();
  return results.sort(byClassThenName);
}
export async function rosterById(db, id) {
  return db.prepare('SELECT id, cls, name, pin FROM roster WHERE id = ?').bind(id).first();
}

// ===== Progress =====
// Records for roster students (rosterless rows are ignored everywhere); roster spelling wins.
export async function recordsFor(db, m, students) {
  let rows;
  if (students.length === 1) {
    rows = (await db.prepare('SELECT id, data FROM progress WHERE id = ?').bind(students[0].id).all()).results;
  } else {
    rows = (await db.prepare('SELECT id, data FROM progress').all()).results;
  }
  const byId = Object.fromEntries(rows.map(r => [r.id, r.data]));
  return students.map(s => {
    const r = byId[s.id] ? clean_(m, JSON.parse(byId[s.id])) : null;
    const out = r || clean_(m, { name: s.name, cls: s.cls });
    out.name = s.name; out.cls = s.cls;
    return out;
  });
}

// Read-modify-write of one student's record without a lock. `change(rec)` edits the record in place
// (or throws); the write only lands if nobody else wrote in between (version check), else it re-reads
// and tries again, up to 5 times. `fresh` ({name, cls} from the roster, or null) supplies the starting
// record for a student with no progress yet, and its spelling wins over the stored one.
export async function updateProgress(db, m, id, fresh, change, now) {
  for (let tries = 0; tries < 5; tries++) {
    const row = await db.prepare('SELECT data, version FROM progress WHERE id = ?').bind(id).first();
    const r = (row && clean_(m, JSON.parse(row.data))) || (fresh && clean_(m, { name: fresh.name, cls: fresh.cls }));
    if (r && fresh) { r.name = fresh.name; r.cls = fresh.cls; }
    await change(r);                       // must throw when r is null
    const data = JSON.stringify(r), at = new Date(now).toISOString();
    const res = row
      ? await db.prepare('UPDATE progress SET data = ?, version = version + 1, updated = ? WHERE id = ? AND version = ?')
        .bind(data, at, id, row.version).run()
      : await db.prepare('INSERT INTO progress(id, data, version, updated) VALUES(?, ?, 1, ?) ON CONFLICT(id) DO NOTHING')
        .bind(id, data, at).run();
    if (res.meta.changes === 1) return r;
  }
  throw new Error('progress write for ' + id + ' kept conflicting');
}

// Runs one INSERT for many rows, in chunks that stay under D1's 100 bound parameters per query.
export function insertMany(db, sqlHead, sqlTail, rows) {
  const per = Math.max(1, Math.floor(100 / rows[0].length)), out = [];
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const values = chunk.map(r => '(' + r.map(() => '?').join(', ') + ')').join(', ');
    out.push(db.prepare(sqlHead + ' VALUES ' + values + ' ' + sqlTail).bind(...chunk.flat()));
  }
  return out;
}

// ===== Sessions (D1 stores the SHA-256 of each token, never the token) =====
export async function newSession(db, kind, sid, ttlMin, now) {
  const token = newId_();
  await db.prepare('INSERT INTO sessions(hash, kind, sid, expires) VALUES(?, ?, ?, ?)')
    .bind(await sha256Hex(token), kind, sid, now + ttlMin * 60000).run();
  return token;
}
// Checks a token and slides its expiry. Returns the row (with the student's roster row for kind 's') or null.
export async function touchSession(db, token, kind, ttlMin, now) {
  if (!isId_(token)) return null;
  return db.prepare(
    'UPDATE sessions SET expires = ?1 WHERE hash = ?2 AND kind = ?3 AND expires > ?4 RETURNING sid'
  ).bind(now + ttlMin * 60000, await sha256Hex(token), kind, now).first();
}
export async function endSession(db, token) {
  if (isId_(token)) await db.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256Hex(token)).run();
}

// ===== Counters (wrong guesses and quiz rate limits) =====
// Takes one slot on each counter in a single transaction and returns the new counts, so parallel
// requests can't all slip past a limit. An expired counter starts again at 1 with a fresh expiry;
// a live one keeps its expiry (commitGuess slides it once the guess turns out wrong).
export async function reserve(db, keys, now) {
  const stmt = db.prepare(
    'INSERT INTO counters(key, n, expires) VALUES(?1, 1, ?3) ON CONFLICT(key) DO UPDATE SET ' +
    'n = CASE WHEN expires <= ?2 THEN 1 ELSE n + 1 END, ' +
    'expires = CASE WHEN expires <= ?2 THEN ?3 ELSE expires END RETURNING n, expires');
  const res = await db.batch(keys.map(([k, min]) => stmt.bind(k, now, now + min * 60000)));
  return res.map(r => r.results[0]);
}
// Gives back slots taken by reserve() (the attempt didn't count: it was locked out or correct).
export async function release(db, keys) {
  const stmt = db.prepare('UPDATE counters SET n = n - 1 WHERE key = ? AND n > 0');
  await db.batch(keys.map(([k]) => stmt.bind(k)));
}
// A wrong guess: keep the slots and restart each counter's timer, as Code.gs bump_ did.
export async function commitGuess(db, keys, now) {
  const stmt = db.prepare('UPDATE counters SET expires = ? WHERE key = ?');
  await db.batch(keys.map(([k, min]) => stmt.bind(now + min * 60000, k)));
}
export async function clearCounters(db, keys) {
  if (!keys.length) return;
  const stmt = db.prepare('DELETE FROM counters WHERE key = ?');
  await db.batch(keys.map(k => stmt.bind(k)));
}

// Deletes rows whose time is up (they already count as gone; this just keeps the tables small).
export async function cleanup(db, now) {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM quizzes WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM counters WHERE expires <= ?').bind(now)
  ]);
}

