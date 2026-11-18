import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '../src/config.js';
import { dayOf } from '../src/util.js';
import {
  ANN, DEV_A, DEV_B, ageQuiz, answers, bad, call, clearGap, counter, loginAnn, ok, progressOf, setupClass, startReady
} from './helpers.js';

const login = (cls, name, pin, device = DEV_A) => call('login', [cls, name, pin], { device });

describe('roster and sign-in', () => {
  beforeEach(() => setupClass());

  it('getRoster lists one period, sorted; anything else gives []', async () => {
    expect(await ok('getRoster', '1')).toEqual(['Ann Lee', 'Ben Ortiz']);
    expect(await ok('getRoster', 2)).toEqual(['Cara Diaz', 'Dev Shah']);
    for (const v of ['9', '0', '', null, [], {}, '1 ', true]) expect(await ok('getRoster', v)).toEqual([]);
  });

  it('login returns a token and the record; PINs never appear in student output', async () => {
    const r = await ok('login', '1', 'Ann Lee', '1234');
    expect(r.token).toMatch(/^[a-f0-9]{32}$/);
    expect(r.rec.name).toBe('Ann Lee');
    expect(r.rec.cls).toBe('1');
    expect(JSON.stringify(r)).not.toContain('1234');
    // D1 keeps only the token's hash.
    const row = await env.DB.prepare('SELECT hash FROM sessions').first();
    expect(row.hash).not.toBe(r.token);
    expect(row.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await ok('getMe', r.token)).toEqual(r.rec);
  });

  it('login type-checks its arguments', async () => {
    expect(await bad('login', '1', 'Nobody', '1234')).toBe('LOGIN: Pick your name from the list.');
    expect(await bad('login', ['1'], 'Ann Lee', '1234')).toBe('LOGIN: Pick your name from the list.');
    expect(await bad('login', '1', ['Ann Lee'], '1234')).toBe('LOGIN: Pick your name from the list.');
    expect(await bad('login', '1', 'Ann Lee', 1234)).toBe('LOGIN: Wrong PIN.');       // number, not a string
    expect(await bad('login', '1', 'Ann Lee', '12345')).toBe('LOGIN: Wrong PIN.');
    expect((await ok('login', 1, '  Ann   Lee ', ' 1234 ')).token).toBeTruthy();       // cleanName_ + trim, as Code.gs
  });

  it('5 wrong PINs lock that student even with the right PIN, from any device; teacher clearLocks unlocks', async () => {
    for (let i = 0; i < 5; i++) expect((await login('1', 'Ann Lee', '0000', i % 2 ? DEV_A : DEV_B)).body.err).toBe('LOGIN: Wrong PIN.');
    expect((await login('1', 'Ann Lee', '1234')).body.err).toBe('LOGIN: Too many wrong PINs. Wait 5 minutes or ask your teacher.');
    expect((await login('1', 'Ann Lee', '1234', null)).body.err).toMatch(/Too many wrong PINs/);
    expect(await counter('lf:' + ANN)).toBe(5);                    // locked attempts don't add to the count
    // Other students are not affected.
    expect((await login('1', 'Ben Ortiz', '2345')).body.ok).toBe(true);
    const t = await ok('teacherLogin', 'test-teacher-pass');
    expect(await ok('clearLocks', t)).toBe(true);
    expect((await login('1', 'Ann Lee', '1234')).body.ok).toBe(true);
  });

  it('a correct PIN clears the short lockout counter but not the daily one', async () => {
    for (let i = 0; i < 3; i++) await login('1', 'Ann Lee', '9999');
    expect((await login('1', 'Ann Lee', '1234')).body.ok).toBe(true);
    expect(await counter('lf:' + ANN)).toBe(0);
    expect(await counter('ld:' + ANN)).toBe(3);
    expect(await counter('lv:' + DEV_A)).toBe(3);
  });

  it('20 wrong PINs in a day lock the student until the teacher clears it', async () => {
    await env.DB.prepare('INSERT INTO counters(key, n, expires) VALUES(?, 20, ?)').bind('ld:' + ANN, Date.now() + 864e5).run();
    expect((await login('1', 'Ann Lee', '1234')).body.err).toBe('LOGIN: Too many wrong PINs today. Ask your teacher to unlock your sign-in.');
  });

  it('expired counters count as zero', async () => {
    await env.DB.prepare('INSERT INTO counters(key, n, expires) VALUES(?, 99, ?)').bind('lf:' + ANN, Date.now() - 1).run();
    expect((await login('1', 'Ann Lee', '1234')).body.ok).toBe(true);
    await env.DB.prepare('INSERT INTO counters(key, n, expires) VALUES(?, 99, ?)').bind('ld:p1_ben-ortiz', Date.now() - 1).run();
    expect((await login('1', 'Ben Ortiz', '0000')).body.err).toBe('LOGIN: Wrong PIN.');
    expect(await counter('ld:p1_ben-ortiz')).toBe(1);                // restarted at 1, not 100
  });

  it('one device is limited to 10 wrong PINs across all names', async () => {
    const names = [['1', 'Ann Lee'], ['1', 'Ben Ortiz'], ['2', 'Cara Diaz'], ['2', 'Dev Shah']];
    for (let i = 0; i < 10; i++) {
      const [c, n] = names[i % 4];
      expect((await login(c, n, '0000')).body.err).toBe('LOGIN: Wrong PIN.');
    }
    // Every student is under 5, but this device is done, even with a right PIN.
    expect((await login('2', 'Dev Shah', '4567')).body.err).toBe('LOGIN: Too many wrong PINs. Wait 15 minutes or ask your teacher.');
    // Another device still gets in; so does a request with no device id (only per-student + class limits).
    expect((await login('2', 'Dev Shah', '4567', DEV_B)).body.ok).toBe(true);
    expect((await login('2', 'Cara Diaz', '3456', null)).body.ok).toBe(true);
    expect((await login('2', 'Cara Diaz', '3456', 'not-hex')).body.ok).toBe(true);
  });

  it('class-wide: 120 wrong PINs from everyone pause all sign-in', async () => {
    await env.DB.prepare('INSERT INTO counters(key, n, expires) VALUES(?, ?, ?)').bind('lf:all', LIMITS.classFails - 1, Date.now() + 6e5).run();
    expect((await login('1', 'Ben Ortiz', '0000', null)).body.err).toBe('LOGIN: Wrong PIN.');
    expect((await login('1', 'Ann Lee', '1234', DEV_B)).body.err)
      .toBe('LOGIN: Sign-in is paused because of too many wrong PINs. Try again in a few minutes or ask your teacher.');
  });

  it('parallel wrong guesses can not get past the per-student limit', async () => {
    const pins = Array.from({ length: 30 }, (_, i) => String(5000 + i));
    const res = await Promise.all(pins.map(p => login('1', 'Ann Lee', p, null)));
    const wrong = res.filter(r => r.body.err === 'LOGIN: Wrong PIN.').length;
    expect(wrong).toBe(LIMITS.loginFails);                         // only 5 PINs were actually checked
    expect(res.every(r => !r.body.ok)).toBe(true);
    expect(await counter('lf:' + ANN)).toBe(5);
  });

  it('signOut ends the session; bad tokens are SESSION errors', async () => {
    const t = await loginAnn();
    expect(await ok('signOut', t)).toBe(true);
    expect(await bad('getMe', t)).toBe('SESSION: Your sign-in expired. Please sign in again.');
    expect(await ok('signOut', 'garbage')).toBe(true);
    for (const tok of ['', 'x', 123, null, ['a'.repeat(32)], 'A'.repeat(32)]) {
      expect(await bad('getMe', tok)).toBe('SESSION: Please sign in again.');
    }
    expect(await bad('getMe', 'f'.repeat(32))).toBe('SESSION: Your sign-in expired. Please sign in again.');
  });

  it('sessions slide: use extends expiry; an expired session is refused', async () => {
    const t = await loginAnn();
    await env.DB.prepare('UPDATE sessions SET expires = ?').bind(Date.now() + 1000).run();
    await ok('getMe', t);
    const { expires } = await env.DB.prepare("SELECT expires FROM sessions WHERE kind = 's'").first();
    expect(expires).toBeGreaterThan(Date.now() + 59 * 60000);
    await env.DB.prepare('UPDATE sessions SET expires = ?').bind(Date.now() - 1).run();
    expect(await bad('getMe', t)).toBe('SESSION: Your sign-in expired. Please sign in again.');
  });

  it('a student token can not call teacher functions', async () => {
    const t = await loginAnn();
    for (const fn of ['getAll', 'getFlags', 'getSettings', 'getRosterFull', 'clearLocks', 'exportProgress']) {
      expect(await bad(fn, t)).toBe('SESSION: Teacher sign-in expired.');
    }
    expect(await bad('getBoard', t, '1')).toBe('SESSION: Teacher sign-in expired.');
    expect(await bad('saveRoster', t, 'Period,Name\n1,X')).toBe('SESSION: Teacher sign-in expired.');
    expect(await bad('setCourse', t, 'M8', true)).toBe('SESSION: Teacher sign-in expired.');
    expect(await bad('decideFlag', t, 'a'.repeat(32), 1)).toBe('SESSION: Teacher sign-in expired.');
  });

  it('a student dropped from the roster is told so', async () => {
    const t = await loginAnn();
    await env.DB.prepare('DELETE FROM roster WHERE id = ?').bind(ANN).run();
    expect(await bad('getMe', t)).toBe('SESSION: You are no longer on the roster.');
  });
});

describe('quizzes', () => {
  let token;
  beforeEach(async () => { await setupClass(); token = await loginAnn(); });

  it('startQuiz sends 10 questions and no answers or explanations', async () => {
    const q = await ok('startQuiz', token, 'BF1');
    expect(q.qid).toMatch(/^[a-f0-9]{32}$/);
    expect(q.std).toBe('BF1');
    expect(q.qs.length).toBe(10);
    for (const x of q.qs) expect(Object.keys(x).sort()).toEqual(['opts', 'stem']);
    const json = JSON.stringify(q);
    expect(json).not.toMatch(/"ans"|"exp"/);
  });

  it('startQuiz checks the standard and the current quarter', async () => {
    for (const s of ['', 'XX', 1, null, ['BF1'], 'constructor', '__proto__']) {
      expect(await bad('startQuiz', token, s)).toBe('BAD: Unknown standard.');
    }
    expect(await bad('startQuiz', token, 'IF2')).toBe('BAD: That quarter has not started yet.');
    const t = await ok('teacherLogin', 'test-teacher-pass');
    await ok('setQuarter', t, 2);
    expect((await ok('startQuiz', token, 'IF2')).std).toBe('IF2');
  });

  it('enforces 15 s between starts', async () => {
    await ok('startQuiz', token, 'BF1');
    const err = await bad('startQuiz', token, 'BF2');
    expect(err).toMatch(/^WAIT: You can start another quiz in 1[0-5] seconds\.$/);
    await clearGap();
    await ok('startQuiz', token, 'BF2');
  });

  it('enforces 60 quizzes per day (New York day)', async () => {
    await env.DB.prepare('INSERT INTO counters(key, n, expires) VALUES(?, 60, ?)')
      .bind('qd:' + ANN + ':' + dayOf(Date.now()), Date.now() + 864e5).run();
    expect(await bad('startQuiz', token, 'BF1')).toBe('LIMIT: That’s the most quizzes for today. Come back tomorrow!');
    // A refused start doesn't open the 15 s gap.
    expect(await counter('qg:' + ANN)).toBe(0);
  });

  it('dayOf uses America/New_York', () => {
    expect(dayOf(Date.UTC(2026, 10, 18, 4, 59))).toBe('2026-11-17');   // 11:59 pm EST
    expect(dayOf(Date.UTC(2026, 10, 18, 5, 0))).toBe('2026-11-18');
    expect(dayOf(Date.UTC(2026, 6, 4, 3, 59))).toBe('2026-07-03');     // EDT
  });

  it('parallel starts can not get past the 15 s gap', async () => {
    const res = await Promise.all([1, 2, 3, 4, 5].map(() => call('startQuiz', [token, 'BF1'])));
    expect(res.filter(r => r.body.ok).length).toBe(1);
  });

  it('submitQuiz checks picks', async () => {
    const q = await startReady(token, 'BF1');
    const msg = 'BAD: Answer all 10 questions first.';
    for (const p of [[], Array(9).fill(0), Array(11).fill(0), Array(10).fill(4), Array(10).fill(-1), Array(10).fill(1.5),
      Array(10).fill('1'), Array(10).fill(null), 'x', null, { length: 10 }]) {
      expect(await bad('submitQuiz', token, q.qid, p, 0, 0)).toBe(msg);
    }
    expect(await bad('submitQuiz', token, 'nope', Array(10).fill(0), 0, 0)).toBe('QUIZ: That quiz is not available.');
    expect(await bad('submitQuiz', token, 'f'.repeat(32), Array(10).fill(0), 0, 0)).toBe('QUIZ: This quiz expired. Start a new one.');
  });

  it('a pick past a question\'s options is BAD', async () => {
    const q = await startReady(token, 'BF1');
    const k = q.qs.findIndex(x => x.opts.length < 4);
    if (k < 0) return;              // every question had 4 options this time
    const picks = Array(10).fill(0); picks[k] = 3;
    expect(await bad('submitQuiz', token, q.qid, picks, 0, 0)).toBe('BAD: Invalid answer.');
  });

  it('too fast: returns {wait} and the quiz stays open', async () => {
    const q = await ok('startQuiz', token, 'BF1');
    const r = await ok('submitQuiz', token, q.qid, Array(10).fill(0), 0, 0);
    expect(Object.keys(r)).toEqual(['wait']);
    expect(r.wait).toBeGreaterThan(15000);
    expect(r.wait).toBeLessThanOrEqual(20000);
    await ageQuiz(q.qid);
    expect((await ok('submitQuiz', token, q.qid, Array(10).fill(0), 0, 0)).score).toBeTypeOf('number');
  });

  it('grades on the server and returns ans, exp and left', async () => {
    const q = await startReady(token, 'BF1');
    const ans = await answers(q.qid);
    const picks = ans.slice(); picks[0] = (picks[0] + 1) % q.qs[0].opts.length;
    const r = await ok('submitQuiz', token, q.qid, picks, 0, 0);
    expect(r.score).toBe(9);
    expect(r.ans).toEqual(ans);
    expect(r.exp.length).toBe(10);
    expect(r.left).toBe(0);
    expect(r.rec.std.BF1).toEqual({ best: 9, att: 1, mast: 0, wrong: 1 });
    expect(r.rec.hist.length).toBe(1);
    expect(r.rec.hist[0][0]).toBe(q.qid.slice(0, 16));
    expect(await bad('submitQuiz', token, q.qid, picks, 0, 0)).toBe('QUIZ: That quiz was already submitted.');
  });

  it('another student\'s quiz is refused', async () => {
    const q = await startReady(token, 'BF1');
    const ben = (await ok('login', '1', 'Ben Ortiz', '2345')).token;
    expect(await bad('submitQuiz', ben, q.qid, Array(10).fill(0), 0, 0)).toBe('QUIZ: That quiz is not available.');
    expect(await ok('reportLeave', ben, q.qid, 3, 5000)).toBe(false);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM flags').first()).n).toBe(0);
  });

  it('submitting the same quiz twice in parallel grades it once', async () => {
    const q = await startReady(token, 'BF1');
    const ans = await answers(q.qid);
    const res = await Promise.all([1, 2, 3].map(() => call('submitQuiz', [token, q.qid, ans, 0, 0])));
    const wins = res.filter(r => r.body.ok);
    expect(wins.length).toBe(1);
    expect(res.filter(r => r.body.err === 'QUIZ: That quiz was already submitted.').length).toBe(2);
    const p = await progressOf(ANN);
    expect(p.std.BF1.att).toBe(1);
    expect(p.std.BF1.mast).toBe(1);
  });

  it('a submit whose grading fails reopens the quiz, and resubmitting grades it once', async () => {
    const q = await startReady(token, 'BF1');
    const ans = await answers(q.qid);
    const row = await env.DB.prepare('SELECT * FROM roster WHERE id = ?').bind(ANN).first();
    await env.DB.prepare('DELETE FROM roster WHERE id = ?').bind(ANN).run();          // grading will fail
    expect(await bad('submitQuiz', token, q.qid, ans, 0, 0)).toBe('SESSION: You are no longer on the roster.');
    expect((await env.DB.prepare('SELECT done FROM quizzes WHERE qid = ?').bind(q.qid).first()).done).toBe(0);
    await env.DB.prepare('INSERT INTO roster(id, cls, name, pin) VALUES(?, ?, ?, ?)').bind(row.id, row.cls, row.name, row.pin).run();
    expect((await ok('submitQuiz', token, q.qid, ans, 0, 0)).score).toBe(10);
    expect(await bad('submitQuiz', token, q.qid, ans, 0, 0)).toBe('QUIZ: That quiz was already submitted.');
    expect((await progressOf(ANN)).std.BF1.att).toBe(1);
  });

  it('two different quizzes submitted in parallel are both counted', async () => {
    const qs = [];
    for (const std of ['BF1', 'BF2', 'LE1', 'BF1']) qs.push(await startReady(token, std));
    const res = await Promise.all(qs.map(async q => call('submitQuiz', [token, q.qid, await answers(q.qid), 0, 0])));
    expect(res.every(r => r.body.ok)).toBe(true);
    const p = await progressOf(ANN);
    expect(p.std.BF1.att).toBe(2);
    expect(p.std.BF2.att).toBe(1);
    expect(p.std.LE1.att).toBe(1);
    expect(p.hist.length).toBe(4);
    expect(p.version).toBe(4);
  });

  it('reportLeave: totals only go up and a flag is written; submit adds the score', async () => {
    const q = await startReady(token, 'BF1');
    expect(await ok('reportLeave', token, q.qid, 2, 4000)).toBe(true);
    expect(await ok('reportLeave', token, q.qid, 1, 1000)).toBe(true);      // late / smaller report changes nothing
    let f = await env.DB.prepare('SELECT * FROM flags WHERE qid = ?').bind(q.qid).first();
    expect(f).toMatchObject({ sid: ANN, name: 'Ann Lee', cls: '1', std: 'BF1', code: 'NC.M1.F-BF.1', n: 2, sec: 4, score: null, status: 'open', decided: '' });
    expect(await bad('reportLeave', token, 'bad', 1, 1)).toBe('QUIZ: That quiz is not available.');
    expect(await ok('reportLeave', token, 'f'.repeat(32), 1, 1)).toBe(false);
    const r = await ok('submitQuiz', token, q.qid, await answers(q.qid), 1, 99999999);
    expect(r.left).toBe(2);
    f = await env.DB.prepare('SELECT * FROM flags WHERE qid = ?').bind(q.qid).first();
    expect(f).toMatchObject({ n: 2, sec: 7200, score: 10, status: 'open' });
    expect(await ok('reportLeave', token, q.qid, 5, 1)).toBe(false);       // already submitted
  });

  it('a leave reported only at submit time also makes a flag', async () => {
    const q = await startReady(token, 'BF1');
    const r = await ok('submitQuiz', token, q.qid, Array(10).fill(0), '3', 2500);
    expect(r.left).toBe(3);
    const f = await env.DB.prepare('SELECT n, sec, score FROM flags WHERE qid = ?').bind(q.qid).first();
    expect(f).toEqual({ n: 3, sec: 3, score: r.score });
  });

  it('no leaves, no flag', async () => {
    const q = await startReady(token, 'BF1');
    await ok('submitQuiz', token, q.qid, Array(10).fill(0), 0, 0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM flags').first()).n).toBe(0);
  });

  it('an expired quiz can not be submitted', async () => {
    const q = await startReady(token, 'BF1');
    await env.DB.prepare('UPDATE quizzes SET expires = ?').bind(Date.now() - 1).run();
    expect(await bad('submitQuiz', token, q.qid, Array(10).fill(0), 0, 0)).toBe('QUIZ: This quiz expired. Start a new one.');
    expect(await ok('reportLeave', token, q.qid, 1, 1)).toBe(false);
  });

  it('five perfect quizzes fill a standard; filling every standard completes the board', async () => {
    for (const std of ['BF1', 'BF2', 'LE1']) {
      for (let i = 0; i < 5; i++) {
        const q = await startReady(token, std);
        await ok('submitQuiz', token, q.qid, await answers(q.qid), 0, 0);
      }
    }
    const me = await ok('getMe', token);
    expect(me.std.BF1.mast).toBe(5);
    expect(me.done[1]).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(me.doneErr[1]).toBe(0);
    expect(me.done[2]).toBe('');
  });
});
