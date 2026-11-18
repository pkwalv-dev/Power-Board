// Runs before each test file: create the schema, then start every test from empty tables.
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await env.DB.batch(['settings', 'roster', 'progress', 'sessions', 'quizzes', 'counters', 'flags']
    .map(t => env.DB.prepare('DELETE FROM ' + t)));
});
