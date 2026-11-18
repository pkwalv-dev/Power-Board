import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { COURSES, courseModel } from '../src/config.js';
import { QGEN } from '../src/questions.js';

describe('questions.js', () => {
  it('is Questions.gs byte for byte plus the export (run npm run sync:questions if this fails)', () => {
    expect(env.QUESTIONS_GS.length).toBeGreaterThan(10000);
    // Line endings depend on how git checked the files out, so compare with them normalized.
    const lf = s => s.replace(/\r\n/g, '\n');
    expect(lf(env.QUESTIONS_JS) === lf(env.QUESTIONS_GS) + '\nexport { QGEN };\n').toBe(true);
  });

  it('makes 10 well-formed questions for every standard of both courses', () => {
    for (const c of Object.keys(COURSES)) {
      for (const s of courseModel(c).STD_LIST) {
        for (let i = 0; i < 20; i++) {
          const qs = QGEN.makeQuiz(s.gen);
          expect(qs.length).toBe(10);
          for (const q of qs) {
            expect(typeof q.stem).toBe('string');
            expect(q.opts.length).toBeGreaterThanOrEqual(2);
            expect(q.opts.length).toBeLessThanOrEqual(4);
            expect(Number.isInteger(q.ans) && q.ans >= 0 && q.ans < q.opts.length).toBe(true);
          }
        }
      }
    }
  });
});
