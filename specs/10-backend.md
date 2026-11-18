# Backend spec — Worker + D1

Read `specs/00-contract.md` first; it wins on any conflict. Reference implementation:
`apps-script/Code.gs` (read all of it) and `apps-script/Questions.gs`.

## You own
`worker/package.json`, `worker/wrangler.jsonc`, `worker/schema.sql`, `worker/src/**`,
`worker/test/**`, `worker/vitest.config.*`, `worker/.gitignore`. Do NOT touch `worker/public/**`
(another agent is writing it right now), `apps-script/**`, `specs/**`, `README.md`.
If `worker/public/index.html` doesn't exist yet when you test, create nothing there —
tests hit `/api/*` only.

## Setup
- `wrangler.jsonc`: name `power-board`, `main: src/index.js`, a current `compatibility_date`,
  `assets: { directory: "./public", binding: "ASSETS", run_worker_first: ["/api/*"] }`
  (or equivalent so `/api/*` reaches the Worker and everything else is static),
  one D1 binding `DB` (database_name `power-board`, placeholder database_id with a comment
  telling the teacher to paste the id from `wrangler d1 create power-board`), and
  `migrations_dir` if you use D1 migrations (preferred: `worker/migrations/0001_init.sql`
  instead of schema.sql — your call, but document the one command to apply it).
- Pin exact devDependency versions: `wrangler`, `vitest`, `@cloudflare/vitest-pool-workers`
  (pick a mutually compatible set; verify by installing). Scripts: `dev`, `deploy`, `test`,
  `db:init:local`, `db:init:remote`.
- `.dev.vars` (gitignored) with `TEACHER_PIN=test-teacher-pass` for local dev; tests set the
  binding via the vitest pool config instead.

## Questions
`src/questions.js` = `apps-script/Questions.gs` byte-for-byte plus a trailing
`export { QGEN };`. Add `scripts/sync-questions.mjs` (+ npm script `sync:questions`) that
regenerates it, and a test asserting the two stay in sync. If Questions.gs uses anything
missing in Workers (Utilities, etc.), stop and report rather than editing the generators.

## Schema (D1) — minimum; add indexes for every WHERE you use
- `settings(key TEXT PRIMARY KEY, value TEXT)`
- `roster(id TEXT PRIMARY KEY, cls TEXT, name TEXT, pin TEXT)`
- `progress(id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated TEXT)`
  — `data` is the JSON of `clean_()` output.
- `sessions(hash TEXT PRIMARY KEY, kind TEXT CHECK(kind IN('s','t')), sid TEXT, expires INTEGER)`
- `quizzes(qid TEXT PRIMARY KEY, sid TEXT, std TEXT, ans TEXT, n TEXT, exp TEXT, served INTEGER,
   done INTEGER DEFAULT 0, picks TEXT, away_n INTEGER DEFAULT 0, away_ms INTEGER DEFAULT 0, expires INTEGER)`
- `counters(key TEXT PRIMARY KEY, n INTEGER, expires INTEGER)` — wrong guesses and quiz rate limits.
  Expired rows count as 0. Increment with a single UPSERT that resets n when expired
  (`ON CONFLICT DO UPDATE SET n = CASE WHEN expires < ? THEN 1 ELSE n+1 END, ...`).
- `flags(qid TEXT PRIMARY KEY, served TEXT, sid TEXT, name TEXT, cls TEXT, std TEXT, code TEXT,
   n INTEGER, sec INTEGER, score INTEGER NULL, status TEXT, decided TEXT)`
- Cleanup: on ~1% of requests (or a Cron Trigger, daily), delete expired sessions/quizzes/counters.

## Behavior to port exactly
login limits (all four keys incl. per-day + viewer + class-wide), quiz gap 15 s / 60 per day
(day boundary in `America/New_York`), minAnswerMs wait response, awayMerge (totals only go up),
flag write on leave and on submit, decideFlag (take 0–5, un-complete board), apply_ idempotency
via hist ids, recordsFor_ (roster spelling wins, rosterless progress ignored), cleanName_,
normPin_, idOf_, clean_ clamps. The 60-second roster cache is unnecessary — read D1.

## Security checklist (each needs a test)
- Every arg type-checked as in Code.gs (strings only where strings, ints in range, arrays length 10).
- A student token can't call teacher fns and vice versa; another student's qid is rejected.
- Submitting the same quiz twice concurrently grades once (fire 2 `submitQuiz` in parallel; exactly one succeeds, progress `att` +1).
- Two different quizzes for the same student submitted in parallel → both counted (CAS retry works).
- PIN lockouts: 5 wrong → locked for that student even with a correct PIN; viewer limit across names; class-wide limit.
- teacherLogin wrong-guess limits (per device 10, all 20) and constant-time compare.
- Body > 32 KB, non-JSON body, wrong method, foreign Origin → `BAD` (or 405 for GET on a POST fn).
- No answers (`ans`/`exp`) in startQuiz output.
- CSV import: quotes, commas in names, CRLF, BOM, leading `=`/`+` formula chars stripped by cleanName_.

## Tests
Vitest with `@cloudflare/vitest-pool-workers` (real workerd + local D1, schema applied in setup).
Cover the checklist above plus one full happy path: teacher saveRoster → student login →
startQuiz → submitQuiz with correct answers (read `ans` straight from D1 in the test) ×5 → board
box filled → reportLeave creates flag → decideFlag take 1 → exportProgress round-trips through
importProgress unchanged. `npm test` must pass from a clean `npm ci`.

## Done means
`cd worker && npm ci && npm test` green; `npx wrangler deploy --dry-run` succeeds.
Report: file list, test count, every place you deviated from Code.gs and why, anything unverified.
Do not commit; do not run `wrangler login` or any real deploy.
