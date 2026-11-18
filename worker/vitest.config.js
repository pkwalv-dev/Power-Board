// Tests run inside the real Workers runtime (workerd) with a local D1, via @cloudflare/vitest-pool-workers.
import { readFileSync } from 'node:fs';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEACHER_PIN: 'test-teacher-pass',
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          // For the "questions.js matches Questions.gs" test (workerd can't read files itself).
          QUESTIONS_GS: readFileSync('../apps-script/Questions.gs', 'latin1'),
          QUESTIONS_JS: readFileSync('./src/questions.js', 'latin1')
        }
      }
    })
  ],
  test: {
    setupFiles: ['./test/setup.js']
  }
}));
