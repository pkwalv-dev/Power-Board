# Frontend spec — the page

Read `specs/00-contract.md` first; it wins on any conflict. Start from
`apps-script/Index.html` (read all of it). Keep its look, behavior, copy, light/dark colors,
wake lock, leave-detection and accessibility. Change only what is listed here.

## You own
`worker/public/**` only. Do NOT touch `worker/src/**`, `worker/package.json`, `worker/test/**`,
`apps-script/**`, `specs/**`, `README.md` (another agent writes the backend in parallel).

## 1. Transport (replace `GS` / `call` around line 199–204)
- `call(fn,...args)` → `fetch('/api/'+fn,{method:'POST',headers:{'Content-Type':'application/json','X-PB-Device':DEV},body:JSON.stringify({args})})`.
  `{ok:true}` → resolve `data`; `{ok:false}` → reject `new Error(err)` (string already `CODE: msg`);
  network failure / non-JSON / non-2xx → reject so `errOf` yields `NET`.
- 20 s timeout via AbortController → `NET`.
- `DEV` = 32-hex random id from `crypto.getRandomValues`, created once, kept in localStorage
  through the existing `store` helper (works without storage: fall back to a per-load id).
- `callR` keeps its retry rules but drop the `!GS` checks.
- Delete everything Google: `googleLogin`, the Google button/state (`G`), NOGOOGLE text, any
  "Google banner" wording in leave-detection copy. Login is period → name → PIN only.
- Remove `<?!= ?>`/Apps Script templating if any; the page is a plain static file.
- `<title>` "Power Standards Board"; course name comes from `getConfig` and goes into
  `document.title` after load.

## 2. Teacher "Setup" panel (replaces the Sheet menu)
Add a **Setup** tab/section in the teacher view, using existing styles. Uses the new teacher fns
in the contract:
- Course + current quarter selectors (setCourse with the CONFIRM round-trip: show the server's
  message, ask "Erase and switch", resend with confirm=true).
- Roster: textarea "Paste from a spreadsheet (Period, Name, PIN)" + Save → show `students` count
  and each issue line. A table of the current roster (period, name, PIN hidden behind a
  "Show PINs" toggle) with a per-row "New PIN" button (resetPin, ask "Yes, new PIN" first).
- **Print PIN cards**: opens a print-friendly view (one card per student: name, period, PIN,
  and the page URL `location.origin`) and calls `window.print()`. Cards for one period or all.
- Clear sign-in lockouts button.
- Move from Google Sheets: two file inputs ("Progress tab as CSV", "Flags tab as CSV") →
  importProgress / importFlags, showing results. One line of help: in Sheets, File → Download →
  CSV with that tab open.
- Download progress (CSV): exportProgress → Blob download `power-board-progress-YYYY-MM-DD.csv`.
- getSettings drives counts and a warning banner if `pinsMissing>0` or `students===0`.

## 3. Installable + offline shell (durability)
- `manifest.webmanifest` (name, short_name "Power Board", start_url "/", display standalone,
  theme colors matching the page, `icon.svg` with `sizes:"any"`, purpose any maskable).
- `sw.js`: precache `/`, `/index.html`, manifest, icon with a versioned cache name; navigation
  requests network-first with 4 s timeout falling back to cache; NEVER cache or intercept
  `/api/*`; delete old caches on activate. Register it from the page only on https or localhost.
- If `/api/getConfig` fails with NET on load, show the existing offline/error state with a
  "Try again" button rather than a blank page.

## 4. Constraints
- Single `index.html` with inline CSS/JS as today (no build step, no CDN, no external fonts —
  the district filter may block them). Keep it under ~120 KB.
- No `innerHTML` of server strings except question `stem`/`opts`, which are generated HTML by
  design (as today). Roster names and import issues go through the existing escape helper.
- Must still work at 1366×768 Chromebook and on the class board panel.

## Done means
Open `worker/public/index.html` against a stub: write a throwaway mock server
(in your scratch dir, not in the repo) or a fetch shim that answers every contract fn, and
exercise: student login → quiz → submit → board; teacher login → Setup (each control) →
flags → class board. Use the built-in browser (`mcp__Claude_Browser__*`) to screenshot
student board, quiz, teacher Setup and the PIN-card print view; check console has no errors.
Report: what changed vs Index.html (bullets), screenshots taken, anything not verified.
Do not commit.
