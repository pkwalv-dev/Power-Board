# Power Board on Cloudflare — shared contract (READ FIRST)

Apps Script is blocked for WCPSS students. Power Board moves to **one Cloudflare Worker**
(`worker/`) that serves the page (static assets) and a JSON API on the same origin, with
**D1** (SQLite) as the only store. No Google services anywhere: no Google sign-in, no Sheets,
no Apps Script fallback. `apps-script/` stays in the repo untouched as the reference
implementation — behavior must match it unless this spec says otherwise.

## Layout (owner in brackets — never edit a file you don't own)
```
worker/
  package.json, wrangler.jsonc, schema.sql, vitest config, test/   [backend]
  src/index.js, src/*.js                                           [backend]
  src/questions.js   (generated copy of apps-script/Questions.gs)  [backend]
  public/index.html, public/sw.js, public/manifest.webmanifest,
  public/icon.svg                                                  [frontend]
specs/                                                             [planner only]
```
Plain modern JavaScript (ES modules), no TypeScript, no frameworks, no bundler config
beyond what wrangler does by default. The teacher maintains this; keep it readable.

## Transport
- `POST /api/<fn>` with body `{"args":[...]}` (JSON, ≤ 32 KB; larger → 413 `BAD`).
- Success: `200 {"ok":true,"data":<value>}`.
- Failure: HTTP 200 `{"ok":false,"err":"CODE: message"}` — same `CODE: message` string the
  Apps Script version threw, so the page's existing `errOf()` keeps working.
  Unknown fn → `BAD: Unknown request.` Uncaught exceptions → `SERVER: Something went wrong. Try again.`
  (log the real error with console.error; never leak stack traces).
- Header `X-PB-Device: <32 hex>`: a random per-browser id the page creates once and keeps in
  localStorage. It replaces Apps Script's `getTemporaryActiveUserKey` as the "viewer" key for
  wrong-guess limits. Missing/invalid → treat viewer as unknown (only the per-student and
  class-wide limits apply). Never key limits on IP (whole school shares one NAT IP).
- `GET /api/ping` → `200 {"ok":true,"data":"pong"}` (reachability test from a Chromebook).
- All `/api/*` responses: `Cache-Control: no-store`, `Content-Type: application/json`.
- Reject requests whose `Origin` header is present and not the Worker's own origin (`BAD`).

## Functions (args are positional, exactly as the page sends them)
Student — unchanged semantics from `apps-script/Code.gs`:
| fn | args | returns |
|---|---|---|
| getConfig | — | `{course, current, quarters:[{q, stds:[{id,code,title,sub}]}]}` |
| getRoster | cls | sorted names in period `cls` (`[]` if cls not 1–8) |
| login | cls, name, pin | `{token, rec}` |
| signOut | token | `true` |
| getMe | token | rec |
| startQuiz | token, std | `{qid, std, qs:[{stem,opts}]}` |
| submitQuiz | token, qid, picks, n, ms | `{score, rec, ans, exp, left}` or `{wait}` |
| reportLeave | token, qid, n, ms | boolean |

Teacher — unchanged:
| teacherLogin | pass | token (string) |
| getAll | token | rec[] for whole roster |
| getBoard | token, cls | rec[] for one period |
| getFlags | token | flags (open + decided in last 30 days, newest first, ≤300, no sid) |
| decideFlag | token, qid, take | status string |

Teacher — NEW (replace the Sheet menu; all require a teacher token):
| fn | args | returns |
|---|---|---|
| getSettings | token | `{course:'M1'|'M8', quarter:1-4, students:<count>, pinsMissing:<count>}` |
| setQuarter | token, q | `{quarter}` |
| setCourse | token, course, confirm | `{course}`. If progress rows exist and `confirm!==true` → `CONFIRM: Switching courses erases N students' scores.`; with confirm, deletes progress, flags, quizzes. |
| getRosterFull | token | `[{cls,name,pin}]` sorted by cls then name (PINs visible to teacher only) |
| saveRoster | token, csvText | `{students, issues:[string]}`. Parses CSV/TSV with header row containing Period,Name and optional PIN (case-insensitive; extra columns like Email ignored). Same cleaning/validation as `rosterIssues_` minus email rules. Rows with issues that make them unusable are skipped and reported; valid rows replace the whole roster. Students missing a PIN get a random one. Progress for removed students is kept (orphaned, ignored like rosterless rows). Refuse if the result would be 0 students (`BAD`). |
| resetPin | token, cls, name | `{pin}` new random PIN; also clears that student's lockouts and ends their sessions |
| clearLocks | token | `true` (all wrong-guess counters) |
| importProgress | token, csvText | `{imported, skipped}`. Accepts the Apps Script **Progress** tab exported as CSV (header = `HEAD` from Code.gs). Matches by `id` column; runs every row through `clean_`; overwrites existing progress for that id. |
| importFlags | token, csvText | `{imported}`. Accepts the **Flags** tab CSV (`FLAG_HEAD`). Upsert by quiz id. |
| exportProgress | token | CSV string in exactly `HEAD` column order (one row per roster student, roster spelling of name), so it can be pasted back into a Sheet. |

`rec` shape is exactly `clean_()`'s output. Ids are `idOf_(cls,name)`. Constants (`LIMITS`,
`BOXES`, `HIST_MAX`, `COURSES`, quarter/standard ids) copy over verbatim.

## Things that change on purpose
1. **No Google sign-in.** `googleLogin` does not exist; Email column ignored; every student uses a PIN.
2. **Durable state.** Sessions, open quizzes, wrong-guess counters and rate limits live in D1
   with explicit `expires` timestamps — nothing can be silently evicted. Sliding expiry as before.
3. **No global lock.** Correctness comes from conditional writes: a quiz is submitted by
   `UPDATE ... SET done=1 WHERE qid=? AND done=0` and only the request that changed 1 row grades it;
   progress is updated with a `version` compare-and-swap retried up to 5 times.
4. **Teacher passphrase** = Worker secret `TEACHER_PIN` (≥ 8 chars), compared in constant time.
   Missing/short → `SETUP: Set the TEACHER_PIN secret (8+ characters) with wrangler, then try again.`
   There is no "sheet owner" bypass: `teacherLogin('')` → `PIN: Wrong passphrase.` without counting a guess.
5. Course and current quarter live in a D1 `settings` table (defaults M1 / 1), not script properties.
6. Tokens are 32 hex chars from `crypto.getRandomValues`; D1 stores their SHA-256, not the raw token.
