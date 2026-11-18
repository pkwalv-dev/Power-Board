// Regenerates src/questions.js from apps-script/Questions.gs (the single source of the question generators).
// Run after editing Questions.gs:  npm run sync:questions
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SOURCE = fileURLToPath(new URL('../../apps-script/Questions.gs', import.meta.url));
export const TARGET = fileURLToPath(new URL('../src/questions.js', import.meta.url));
export const TRAILER = '\nexport { QGEN };\n';

// Questions.gs, byte for byte, plus an ES module export.
export function generate(source) {
  return Buffer.concat([source, Buffer.from(TRAILER, 'utf8')]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(TARGET, generate(readFileSync(SOURCE)));
  console.log('Wrote ' + TARGET);
}
