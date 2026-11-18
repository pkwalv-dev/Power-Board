import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { cleanup } from '../src/db.js';
import { call, ORIGIN, ok } from './helpers.js';

describe('transport', () => {
  it('GET /api/ping answers pong with no-store JSON', async () => {
    const r = await call('ping', [], { method: 'GET' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, data: 'pong' });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Type')).toBe('application/json');
  });

  it('wraps results as {ok:true,data}', async () => {
    const r = await call('getConfig');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data.course).toBe('Math 1');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Type')).toBe('application/json');
  });

  it('unknown functions, including Object.prototype names, are BAD', async () => {
    for (const fn of ['nope', 'constructor', '__proto__', 'hasOwnProperty', 'googleLogin', 'menuSetCourse', 'getConfig/x']) {
      const r = await call(fn);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: false, err: 'BAD: Unknown request.' });
    }
  });

  it('GET on a POST function is 405', async () => {
    const r = await call('getConfig', [], { method: 'GET' });
    expect(r.status).toBe(405);
    expect(r.body.ok).toBe(false);
    expect(r.body.err).toMatch(/^BAD: /);
  });

  it('rejects bodies over 32 KB with 413', async () => {
    const big = JSON.stringify({ args: ['x'.repeat(33 * 1024)] });
    const r = await call('getRoster', [], { body: big });
    expect(r.status).toBe(413);
    expect(r.body.err).toMatch(/^BAD: /);
    // Without a Content-Length header (streamed body) it is still cut off.
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const res = await exports.default.fetch(ORIGIN + '/api/getRoster', { method: 'POST', body: stream, duplex: 'half' });
    expect(res.status).toBe(413);
    expect((await res.json()).ok).toBe(false);
  });

  it('accepts a body just under 32 KB', async () => {
    const r = await call('getRoster', [], { body: JSON.stringify({ args: ['1', 'x'.repeat(32 * 1024 - 100)] }) });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, data: [] });
  });

  it('non-JSON bodies and missing args are BAD', async () => {
    for (const body of ['not json', '', 'null', '{}', '{"args":"x"}', '[1,2]']) {
      const r = await call('getRoster', [], { body });
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(false);
      expect(r.body.err).toMatch(/^BAD: /);
    }
  });

  it('rejects a foreign Origin but allows its own', async () => {
    const r = await call('getConfig', [], { origin: 'https://evil.example' });
    expect(r.body).toEqual({ ok: false, err: 'BAD: Unknown request.' });
    expect((await call('getConfig', [], { origin: 'null' })).body.ok).toBe(false);
    expect((await call('getConfig', [], { origin: ORIGIN })).body.ok).toBe(true);
  });

  it('hides unexpected errors behind SERVER', async () => {
    await env.DB.prepare('ALTER TABLE settings RENAME TO settings_x').run();
    try {
      const r = await call('getConfig');
      expect(r.body).toEqual({ ok: false, err: 'SERVER: Something went wrong. Try again.' });
    } finally {
      await env.DB.prepare('ALTER TABLE settings_x RENAME TO settings').run();
    }
    expect(await ok('getConfig')).toBeTruthy();
  });

  it('cleanup deletes only expired sessions, quizzes and counters', async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sessions VALUES ('old', 's', 'x', ?), ('new', 's', 'x', ?)").bind(now - 1, now + 1e5),
      env.DB.prepare("INSERT INTO counters VALUES ('old', 1, ?), ('new', 1, ?)").bind(now - 1, now + 1e5),
      env.DB.prepare("INSERT INTO quizzes(qid, sid, std, ans, n, exp, served, expires) VALUES ('old', 'x', 'BF1', '[]', '[]', '[]', 0, ?), ('new', 'x', 'BF1', '[]', '[]', '[]', 0, ?)").bind(now - 1, now + 1e5)
    ]);
    await cleanup(env.DB, now);
    for (const [t, k] of [['sessions', 'hash'], ['counters', 'key'], ['quizzes', 'qid']]) {
      const { results } = await env.DB.prepare('SELECT ' + k + ' AS k FROM ' + t).all();
      expect(results.map(r => r.k)).toEqual(['new']);
    }
  });
});
