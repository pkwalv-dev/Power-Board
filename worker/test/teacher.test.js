import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { courseModel } from '../src/config.js';
import { parseCsv } from '../src/csv.js';
import { teacherLogin } from '../src/teacher.js';
import { safeEqual } from '../src/util.js';
import {
  ANN, DEV_A, DEV_B, TEACHER_PASS, answers, bad, call, counter, loginAnn, ok, progressOf, setupClass, startReady, teacher
} from './helpers.js';

const tLogin = (pass, device = DEV_A) => call('teacherLogin', [pass], { device });

describe('teacherLogin', () => {
  it('returns a 32-hex token for the right passphrase', async () => {
    expect(await teacher()).toMatch(/^[a-f0-9]{32}$/);
  });

  it('wrong, empty and non-string passphrases', async () => {
    expect((await tLogin('wrong-pass')).body.err).toBe('PIN: Wrong passphrase.');
    expect(await counter('tf:all')).toBe(1);
    expect((await tLogin('')).body.err).toBe('PIN: Wrong passphrase.');
    expect((await tLogin(12345678)).body.err).toBe('PIN: Wrong passphrase.');
    expect((await tLogin(null)).body.err).toBe('PIN: Wrong passphrase.');
    expect((await tLogin([TEACHER_PASS])).body.err).toBe('PIN: Wrong passphrase.');
    expect(await counter('tf:all')).toBe(1);                 // '' and non-strings are not counted
    expect((await tLogin(TEACHER_PASS + ' ')).body.err).toBe('PIN: Wrong passphrase.');
  });

  it('locks one device after 10 wrong passphrases', async () => {
    for (let i = 0; i < 10; i++) expect((await tLogin('nope-' + i)).body.err).toBe('PIN: Wrong passphrase.');
    expect((await tLogin(TEACHER_PASS)).body.err).toBe('LOCKED: Too many wrong passphrases. Try again later.');
    expect(await counter('tf:' + DEV_A)).toBe(10);
    expect((await tLogin(TEACHER_PASS, DEV_B)).body.ok).toBe(true);
  });

  it('locks everyone after 20 wrong passphrases in total', async () => {
    for (let i = 0; i < 20; i++) await tLogin('nope-' + i, i < 10 ? null : 'c'.repeat(32 - String(i).length) + i);
    expect((await tLogin(TEACHER_PASS, DEV_B)).body.err).toBe('LOCKED: Too many wrong passphrases. Try again later.');
    expect((await tLogin(TEACHER_PASS, null)).body.err).toBe('LOCKED: Too many wrong passphrases. Try again later.');
  });

  it('parallel guesses can not get past the limits', async () => {
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => tLogin('guess-' + i, null)));
    expect(res.filter(r => r.body.err === 'PIN: Wrong passphrase.').length).toBe(20);
    expect(res.filter(r => r.body.err && r.body.err.startsWith('LOCKED')).length).toBe(20);
  });

  it('SETUP when the TEACHER_PIN secret is missing or short', async () => {
    const ctx = env2 => ({ db: env.DB, env: env2, viewer: '', now: Date.now() });
    for (const e of [{}, { TEACHER_PIN: 'short' }, { TEACHER_PIN: '' }]) {
      await expect(teacherLogin(ctx(e), 'anything-long')).rejects.toThrow(
        'SETUP: Set the TEACHER_PIN secret (8+ characters) with wrangler, then try again.');
    }
    expect(await teacherLogin(ctx({ TEACHER_PIN: '12345678' }), '12345678')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('compares in constant time (timingSafeEqual on equal-length digests)', async () => {
    const spy = vi.spyOn(crypto.subtle, 'timingSafeEqual');
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('abc', 'abcdefghijkl')).toBe(false);
    expect(await safeEqual('', '')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(4);
    for (const [a, b] of spy.mock.calls) expect(a.byteLength).toBe(b.byteLength);
    spy.mockRestore();
  });

  it('teacher tokens can not be used as student tokens; tokens are checked', async () => {
    const t = await teacher();
    expect(await bad('getMe', t)).toBe('SESSION: Your sign-in expired. Please sign in again.');
    expect(await bad('startQuiz', t, 'BF1')).toBe('SESSION: Your sign-in expired. Please sign in again.');
    expect(await bad('getAll', 'x')).toBe('SESSION: Teacher sign-in required.');
    expect(await bad('getAll', 'f'.repeat(32))).toBe('SESSION: Teacher sign-in expired.');
    await env.DB.prepare("UPDATE sessions SET expires = ? WHERE kind = 't'").bind(Date.now() - 1).run();
    expect(await bad('getAll', t)).toBe('SESSION: Teacher sign-in expired.');
  });
});

describe('settings', () => {
  let t;
  beforeEach(async () => { t = await setupClass(); });

  it('getSettings reports course, quarter and roster counts', async () => {
    expect(await ok('getSettings', t)).toEqual({ course: 'M1', quarter: 1, students: 4, pinsMissing: 0 });
  });

  it('setQuarter accepts 1-4 only', async () => {
    expect(await ok('setQuarter', t, 3)).toEqual({ quarter: 3 });
    expect(await ok('setQuarter', t, ' 2 ')).toEqual({ quarter: 2 });
    for (const q of [0, 5, '1.5', 2.5, null, [], 'x']) expect(await bad('setQuarter', t, q)).toBe('BAD: Please enter 1, 2, 3, or 4.');
    expect((await ok('getConfig')).current).toBe(2);
  });

  it('setCourse asks for confirmation when scores exist, then erases them', async () => {
    const s = await loginAnn();
    const q = await startReady(s, 'BF1');
    await ok('reportLeave', s, q.qid, 1, 1000);
    await ok('submitQuiz', s, q.qid, await answers(q.qid), 1, 1000);
    expect(await bad('setCourse', t, 'm9', true)).toBe('BAD: Please enter M1 or M8.');
    expect(await bad('setCourse', t, 'constructor', true)).toBe('BAD: Please enter M1 or M8.');
    expect(await ok('setCourse', t, 'M1')).toEqual({ course: 'M1' });              // already M1: nothing erased
    expect(await bad('setCourse', t, 'M8')).toBe("CONFIRM: Switching courses erases 1 students' scores.");
    expect(await bad('setCourse', t, 'M8', 'true')).toBe("CONFIRM: Switching courses erases 1 students' scores.");
    expect(await ok('setCourse', t, ' m8 ', true)).toEqual({ course: 'M8' });
    for (const tbl of ['progress', 'flags', 'quizzes']) {
      expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM ' + tbl).first()).n).toBe(0);
    }
    const cfg = await ok('getConfig');
    expect(cfg.course).toBe('Math 8');
    expect(cfg.quarters[0].stds.map(x => x.id)).toEqual(['EE1', 'EE7', 'EE8']);
    expect(cfg.quarters[1].stds.map(x => x.id)).toEqual(['F4', 'EE7_Q2', 'EE8_Q2']);
    expect((await ok('getMe', s)).std.EE1).toEqual({ best: 0, att: 0, mast: 0, wrong: 0 });
  });

  it('setCourse with no scores switches without asking', async () => {
    expect(await ok('setCourse', t, 'M8')).toEqual({ course: 'M8' });
  });
});

describe('roster management', () => {
  let t;
  beforeEach(async () => { t = await teacher(); });

  it('parses CSV quirks: BOM, CRLF, quotes, commas in names, extra columns, case-insensitive headers', async () => {
    const csv = '﻿Email,PERIOD,name,Pin\r\n' +
      'a@x.org,1,"Lee, Ann",12\r\n' +
      'b@x.org,1,"Ben ""Benny"" Ortiz",2345\r\n' +
      ',2,=SUM(A1),3456\r\n' +
      ',2,"+@-Cara\nDiaz",\r\n' +
      '\r\n' +
      ',,,\r\n';
    const r = await ok('saveRoster', t, csv);
    expect(r.students).toBe(4);
    const roster = await ok('getRosterFull', t);
    expect(roster.map(s => [s.cls, s.name])).toEqual([['1', 'Ben "Benny" Ortiz'], ['1', 'Lee, Ann'], ['2', 'CaraDiaz'], ['2', 'SUM(A1)']]);
    expect(roster.find(s => s.name === 'Lee, Ann').pin).toBe('0012');
    expect(roster.find(s => s.name === 'CaraDiaz').pin).toMatch(/^\d{4}$/);
    expect(r.issues).toEqual(['Row 4: name will show as "SUM(A1)".', 'Row 5: name will show as "CaraDiaz".']);
    expect(await ok('getRoster', '1')).toEqual(['Ben "Benny" Ortiz', 'Lee, Ann']);
  });

  it('parses tab-separated pastes', async () => {
    const r = await ok('saveRoster', t, 'Period\tName\tPIN\n3\tZed Ames\t0042\n3\tAmy, Bo\t\n');
    expect(r).toEqual({ students: 2, issues: [] });
    expect((await ok('login', '3', 'Zed Ames', '0042')).token).toBeTruthy();
  });

  it('reports and skips unusable rows; refuses an empty result', async () => {
    const r = await ok('saveRoster', t, 'Period,Name,PIN\n9,Al Bo,1111\n1,,2222\n1,Cy Do,abc\n1,Cy Do,3333\n1,cy-do,4444\n2,Ed Fu,1\n');
    expect(r.students).toBe(2);
    expect(r.issues).toEqual([
      'Row 2: period must be 1–8.',
      'Row 3: missing name.',
      'Row 4: "abc" is not a PIN (up to 4 digits), so a new PIN was made.',
      'Row 5: same name as row 4 in that period. Add a letter to tell them apart.',
      'Row 6: same name as row 4 in that period. Add a letter to tell them apart.'
    ]);
    expect(await bad('saveRoster', t, 'Period,Name\n9,Al\n')).toMatch(/^BAD: /);
    expect(await bad('saveRoster', t, 'Name,PIN\nAl,1234\n')).toBe('BAD: The first row needs Period and Name headings.');
    expect(await bad('saveRoster', t, '')).toBe('BAD: The first row needs Period and Name headings.');
    expect(await bad('saveRoster', t, ['Period,Name'])).toBe('BAD: Paste the roster first.');
    expect((await ok('getSettings', t)).students).toBe(2);       // the refused saves changed nothing
  });

  it('a new paste replaces the roster, keeps existing PINs when the PIN cell is blank, and keeps progress', async () => {
    await ok('saveRoster', t, 'Period,Name,PIN\n1,Ann Lee,1234\n1,Ben Ortiz,2345\n');
    const s = await loginAnn();
    const q = await startReady(s, 'BF1');
    await ok('submitQuiz', s, q.qid, await answers(q.qid), 0, 0);
    await ok('saveRoster', t, 'Period,Name\n1,Ben Ortiz\n1,Cy Do\n');
    const roster = await ok('getRosterFull', t);
    expect(roster.map(x => x.name)).toEqual(['Ben Ortiz', 'Cy Do']);
    expect(roster[0].pin).toBe('2345');
    expect(await bad('login', '1', 'Ann Lee', '1234')).toBe('LOGIN: Pick your name from the list.');
    expect(await progressOf(ANN)).not.toBeNull();                 // orphaned, not deleted
    expect((await ok('getAll', t)).map(r => r.name)).toEqual(['Ben Ortiz', 'Cy Do']);
    await ok('saveRoster', t, 'Period,Name,PIN\n1,Ann Lee,1234\n');
    expect((await ok('getAll', t))[0].std.BF1.att).toBe(1);       // back on the roster, scores come back
  });

  it('resetPin gives a new PIN, clears that student\'s lockouts and ends their sessions', async () => {
    await setupClass();
    const s = await loginAnn();
    for (let i = 0; i < 5; i++) await call('login', ['1', 'Ann Lee', '0000'], { device: null });
    const { pin } = await ok('resetPin', t, '1', 'Ann Lee');
    expect(pin).toMatch(/^\d{4}$/);
    expect(pin).not.toBe('1234');
    expect(await bad('getMe', s)).toBe('SESSION: Your sign-in expired. Please sign in again.');
    expect(await counter('lf:' + ANN)).toBe(0);
    expect(await counter('ld:' + ANN)).toBe(0);
    expect(await bad('login', '1', 'Ann Lee', '1234')).toBe('LOGIN: Wrong PIN.');
    expect((await ok('login', '1', 'Ann Lee', pin)).token).toBeTruthy();
    expect(await bad('resetPin', t, '1', 'Nobody')).toBe('BAD: That student is not on the roster.');
    expect(await bad('resetPin', t, ['1'], 'Ann Lee')).toBe('BAD: That student is not on the roster.');
  });

  it('getBoard checks the period', async () => {
    await setupClass();
    expect((await ok('getBoard', t, '2')).map(r => r.name)).toEqual(['Cara Diaz', 'Dev Shah']);
    expect((await ok('getBoard', t, 1)).map(r => r.name)).toEqual(['Ann Lee', 'Ben Ortiz']);
    for (const c of ['9', '', null, ['1']]) expect(await bad('getBoard', t, c)).toBe('BAD: Pick a period.');
  });

  it('clearLocks clears student, device, class and teacher counters but not quiz limits', async () => {
    for (const k of ['lf:x', 'ld:x', 'lv:' + DEV_A, 'lf:all', 'tf:all', 'tf:' + DEV_B, 'qg:x', 'qd:x:2026-01-01']) {
      await env.DB.prepare('INSERT OR REPLACE INTO counters(key, n, expires) VALUES(?, 3, ?)').bind(k, Date.now() + 6e5).run();
    }
    expect(await ok('clearLocks', t)).toBe(true);
    const { results } = await env.DB.prepare('SELECT key FROM counters ORDER BY key').all();
    expect(results.map(r => r.key)).toEqual(['qd:x:2026-01-01', 'qg:x']);
  });
});

describe('flags', () => {
  let t, s;
  beforeEach(async () => { t = await setupClass(); s = await loginAnn(); });

  async function flaggedPerfect(std = 'BF1') {
    const q = await startReady(s, std);
    await ok('submitQuiz', s, q.qid, await answers(q.qid), 2, 3000);
    return q.qid;
  }

  it('getFlags lists open flags newest first, without student ids', async () => {
    const a = await flaggedPerfect(), b = await flaggedPerfect();
    await env.DB.prepare('UPDATE flags SET served = ? WHERE qid = ?').bind('2026-01-01T00:00:00.000Z', a).run();
    const flags = await ok('getFlags', t);
    expect(flags.map(f => f.qid)).toEqual([b, a]);
    expect(flags[0]).toEqual({ qid: b, when: expect.any(String), name: 'Ann Lee', cls: '1', std: 'BF1', code: 'NC.M1.F-BF.1', n: 2, sec: 3, score: 10, status: 'open', decided: '' });
    expect(flags[0]).not.toHaveProperty('sid');
    // Decided flags older than 30 days drop off.
    await ok('decideFlag', t, a, 0);
    expect((await ok('getFlags', t)).map(f => f.qid)).toEqual([b]);
  });

  it('decideFlag: take 0 dismisses; can only be decided once', async () => {
    const qid = await flaggedPerfect();
    expect(await ok('decideFlag', t, qid, 0)).toBe('dismissed');
    expect(await bad('decideFlag', t, qid, 1)).toBe('BAD: That flag was already decided. Refresh the page.');
    expect(await bad('decideFlag', t, 'f'.repeat(32), 1)).toBe('BAD: That flag is gone. Refresh the page.');
    expect(await bad('decideFlag', t, 'nope', 1)).toBe('BAD: Unknown flag.');
    expect((await progressOf(ANN)).std.BF1.mast).toBe(1);
  });

  it('decideFlag takes boxes (clamped to 0-5 and to what the student has) and un-completes the board', async () => {
    const qids = [];
    for (const std of ['BF1', 'BF2', 'LE1']) for (let i = 0; i < 5; i++) qids.push(await flaggedPerfect(std));
    expect((await progressOf(ANN)).done[1]).not.toBe('');
    expect(await ok('decideFlag', t, qids[0], 2)).toBe('took 2 boxes');
    let p = await progressOf(ANN);
    expect(p.std.BF1.mast).toBe(3);
    expect(p.done[1]).toBe('');
    expect(p.doneErr[1]).toBe(0);
    expect(await ok('decideFlag', t, qids[1], 99)).toBe('took 3 boxes');      // take clamps to 5; only 3 left
    expect(await ok('decideFlag', t, qids[2], 1)).toBe('took 0 boxes');
    expect(await ok('decideFlag', t, qids[3], '-4')).toBe('dismissed');
    expect(await ok('decideFlag', t, qids[5], 1)).toBe('took 1 box');
    p = await progressOf(ANN);
    expect(p.std.BF1.mast).toBe(0);
    expect(p.std.BF2.mast).toBe(4);
  });

  it('two decisions on one flag in parallel take boxes once', async () => {
    const qid = await flaggedPerfect();
    await flaggedPerfect();
    const res = await Promise.all([1, 2, 3].map(() => call('decideFlag', [t, qid, 1])));
    expect(res.filter(r => r.body.ok).length).toBe(1);
    expect((await progressOf(ANN)).std.BF1.mast).toBe(1);
  });

  it('a flag left half-decided by a dead request opens again after a minute', async () => {
    const qid = await flaggedPerfect();
    await env.DB.prepare("UPDATE flags SET status = 'deciding', decided = ? WHERE qid = ?").bind(new Date().toISOString(), qid).run();
    expect((await ok('getFlags', t))[0].status).toBe('open');
    expect(await bad('decideFlag', t, qid, 1)).toBe('BAD: That flag was already decided. Refresh the page.');
    await env.DB.prepare('UPDATE flags SET decided = ? WHERE qid = ?').bind(new Date(Date.now() - 120000).toISOString(), qid).run();
    expect(await ok('decideFlag', t, qid, 1)).toBe('took 1 box');
  });

  it('a failed decision leaves the flag open', async () => {
    const qid = await flaggedPerfect();
    await env.DB.prepare('DELETE FROM progress').run();
    expect(await bad('decideFlag', t, qid, 1)).toBe('BAD: That student has no boxes on that standard.');
    expect((await ok('getFlags', t))[0].status).toBe('open');
    expect(await ok('decideFlag', t, qid, 0)).toBe('dismissed');
  });
});

describe('moving from Google Sheets', () => {
  let t;
  beforeEach(async () => { t = await setupClass(); });
  const M1 = courseModel('M1');

  it('importProgress reads the Progress tab by column name, cleans every row and overwrites by id', async () => {
    const head = M1.HEAD;
    const row = Object.fromEntries(head.map(h => [h, '']));
    Object.assign(row, { id: ANN, name: 'Ann Lee', period: '1', 'BF1 best': '10', 'BF1 quizzes': '3', 'BF1 boxes': '2', 'BF1 missed': '5',
      'BF2 best': '99', 'BF2 quizzes': '-4', 'updated': '2025-10-01T12:00:00.000Z',
      history: JSON.stringify([['abc', 1700000000000, 0, 10], ['bad'], ['def', 1, 999, 50]]) });
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const csv = '﻿' + head.map(q).join(',') + '\r\n' + head.map(h => q(row[h])).join(',') + '\r\n' +
      // id doesn't match the name/period -> skipped; blank name -> skipped; rows of other students are fine
      head.map(h => q({ id: 'p1_someone-else', name: 'Ann Lee', period: '1' }[h] ?? '')).join(',') + '\r\n' +
      head.map(h => q({ id: 'p2_x', name: '', period: '2' }[h] ?? '')).join(',') + '\r\n' +
      head.map(h => q({ id: 'p3_old-kid', name: 'Old Kid', period: '3', 'LE1 boxes': '4' }[h] ?? '')).join(',') + '\r\n';
    expect(await ok('importProgress', t, csv)).toEqual({ imported: 2, skipped: 2 });
    const p = await progressOf(ANN);
    expect(p.std.BF1).toEqual({ best: 10, att: 3, mast: 2, wrong: 5 });
    expect(p.std.BF2).toEqual({ best: 10, att: 0, mast: 0, wrong: 0 });
    expect(p.hist).toEqual([['abc', 1700000000000, 0, 10], ['def', 1, M1.STDS.length - 1, 10]]);
    expect(p.updated).toBe('2025-10-01T12:00:00.000Z');
    expect((await progressOf('p3_old-kid')).std.LE1.mast).toBe(4);   // kept, though not on the roster
    expect(await bad('importProgress', t, 'name,period\nAnn,1\n')).toMatch(/^BAD: That doesn’t look like the Progress tab/);
    expect(await bad('importProgress', t, 5)).toBe('BAD: Choose a CSV file first.');
  });

  it('importFlags upserts the Flags tab by quiz id', async () => {
    const qid = 'c'.repeat(32);
    const csv = 'quiz,when,student id,name,period,std,standard,times left,seconds away,score,status,decided\r\n' +
      `${qid},2026-11-01T10:00:00.000Z,${ANN},Ann Lee,1,BF1,NC.M1.F-BF.1,2,30,9,open,\r\n` +
      'not-a-qid,2026-11-01T10:00:00.000Z,x,X,1,BF1,x,1,1,,open,\r\n';
    expect(await ok('importFlags', t, csv)).toEqual({ imported: 1 });
    const again = csv.replace(',9,open,', ',,took 1 box,2026-11-02T00:00:00.000Z');
    expect(await ok('importFlags', t, again)).toEqual({ imported: 1 });
    const f = await env.DB.prepare('SELECT * FROM flags').all();
    expect(f.results.length).toBe(1);
    expect(f.results[0]).toMatchObject({ qid, sid: ANN, n: 2, sec: 30, score: null, status: 'took 1 box', decided: '2026-11-02T00:00:00.000Z' });
    expect(await bad('importFlags', t, 'a,b\n1,2\n')).toMatch(/^BAD: /);
  });

  it('exportProgress is HEAD-ordered CSV, one row per roster student, roster spelling', async () => {
    const csv = await ok('exportProgress', t);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(M1.HEAD);
    expect(rows.slice(1).map(r => r[0])).toEqual(['p1_ann-lee', 'p1_ben-ortiz', 'p2_cara-diaz', 'p2_dev-shah']);
    expect(rows[1].length).toBe(M1.HEAD.length);
    expect(rows[1][M1.HEAD.indexOf('history')]).toBe('[]');
  });

  it('import refuses non-teachers', async () => {
    const s = await loginAnn();
    expect(await bad('importProgress', s, 'id\n')).toBe('SESSION: Teacher sign-in expired.');
    expect(await bad('importFlags', s, 'quiz\n')).toBe('SESSION: Teacher sign-in expired.');
  });
});
