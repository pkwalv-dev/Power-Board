// One full classroom flow, end to end, through the API only (answers read straight from D1).
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { ageQuiz, answers, clearGap, ok } from './helpers.js';

describe('happy path', () => {
  it('roster -> login -> 5 perfect quizzes -> box filled -> leave flag -> decide -> export/import round trip', async () => {
    const t = await ok('teacherLogin', 'test-teacher-pass');
    expect(await ok('saveRoster', t, 'Period,Name,PIN\n4,Maya Ruiz,0420\n4,Noah Kim,\n'))
      .toEqual({ students: 2, issues: [] });
    expect(await ok('getRoster', '4')).toEqual(['Maya Ruiz', 'Noah Kim']);

    const { token, rec } = await ok('login', '4', 'Maya Ruiz', '0420');
    expect(rec.std.BF1).toEqual({ best: 0, att: 0, mast: 0, wrong: 0 });

    for (let i = 0; i < 5; i++) {
      await clearGap();
      const q = await ok('startQuiz', token, 'BF1');
      await ageQuiz(q.qid);
      const r = await ok('submitQuiz', token, q.qid, await answers(q.qid), 0, 0);
      expect(r.score).toBe(10);
    }
    const board = await ok('getBoard', t, '4');
    expect(board[0].name).toBe('Maya Ruiz');
    expect(board[0].std.BF1).toEqual({ best: 10, att: 5, mast: 5, wrong: 0 });   // the BF1 box row is full

    // Leaving the page during a quiz makes a flag the teacher decides on.
    await clearGap();
    const q = await ok('startQuiz', token, 'BF1');
    expect(await ok('reportLeave', token, q.qid, 1, 8000)).toBe(true);
    let flags = await ok('getFlags', t);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ qid: q.qid, name: 'Maya Ruiz', cls: '4', std: 'BF1', n: 1, sec: 8, score: null, status: 'open' });
    expect(await ok('decideFlag', t, q.qid, 1)).toBe('took 1 box');
    flags = await ok('getFlags', t);
    expect(flags[0].status).toBe('took 1 box');
    const me = await ok('getMe', token);
    expect(me.std.BF1.mast).toBe(4);

    // Export, wipe, import: everything comes back the same.
    const before = await ok('getAll', t);
    const csv = await ok('exportProgress', t);
    await env.DB.prepare('DELETE FROM progress').run();
    expect(await ok('importProgress', t, csv)).toEqual({ imported: 2, skipped: 0 });
    expect(await ok('getAll', t)).toEqual(before);
    expect(await ok('exportProgress', t)).toBe(csv);
  });
});
