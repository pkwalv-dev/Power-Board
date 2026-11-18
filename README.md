# Power-Board

The Power Standards Board: students take 10-question quizzes on each power
standard and fill in boxes on their board; the teacher sees everyone's progress.

**Since Nov 2026 it runs on Cloudflare**, because WCPSS blocked Apps Script for
students. One Cloudflare Worker serves the page and the server, and a Cloudflare
D1 database holds everything. No Google services are involved, so a Google
outage or block can't take it down. Free plan limits: 100,000 requests and
100,000 database writes a day, which is far more than a few classes use.

- `worker/public/index.html`: the page (student board, quizzes, teacher view, class board, Setup)
- `worker/src/`: the server (sign-in, grading, limits, teacher setup)
- `worker/src/questions.js`: generated from `apps-script/Questions.gs`, which stays
  the one place to edit questions (then run `npm run sync:questions`)
- `worker/migrations/`: the database tables
- `apps-script/`: the old Apps Script version, kept for reference only
- `specs/`: the design specs for the move

## What's different from the Apps Script version

- **PINs only.** Every student signs in with period → name → 4-digit PIN.
  There's no "Sign in with Google": outside Apps Script, district IT would have
  to approve it for students under 18.
- **The Sheet menu is now the Setup tab** in the teacher view: course, current
  quarter, roster (paste from a spreadsheet), new PINs, printable PIN cards,
  clear lockouts, import from the old Sheet, and download progress as CSV.
- **Nothing expires by accident.** Sign-ins, open quizzes and lockouts are kept
  in the database, not in Google's cache. Apps Script could forget them at any
  time ("Your sign-in expired", "This quiz expired").
- **No class-wide lock and no 30-at-once cap.** A whole class can submit at the
  same moment.
- **The page installs and opens offline.** The Chromebook keeps a copy of the
  page, so a shaky connection shows "Could not reach the server… Try again"
  instead of a blank tab. Quizzes still need the network (grading happens on the server).

## Set up (one time, about 15 minutes, on any computer with Node.js)

1. Create a free Cloudflare account at dash.cloudflare.com (you do this; it
   needs your email and password).
2. In a terminal:
   ```
   cd worker
   npm ci
   npx wrangler login
   npx wrangler d1 create power-board
   ```
   Copy the `database_id` it prints into `worker/wrangler.jsonc` (replace the zeros).
3. Create the tables, set your teacher passphrase (8+ characters), and publish:
   ```
   npm run db:init:remote
   npx wrangler secret put TEACHER_PIN
   npm run deploy
   ```
   It prints your address, like `https://power-board.<your-name>.workers.dev`.
4. **Test it on a student Chromebook first** (signed in as a student, on school
   Wi-Fi): open the address. If you see the sign-in page, you're set. If the
   district filter (Zscaler) blocks it, ask IT to allow that one address.
   Or add a custom domain in Cloudflare (Workers → your worker → Settings → Domains).
5. Open the address → **Teacher view** → your passphrase → **Setup**:
   - Pick the course and current quarter.
   - Paste your roster (copy Period, Name, PIN with the header row from the old
     Roster tab). Students without a PIN get one, and a blank PIN keeps a
     student's existing one.
   - **Move from Google Sheets:** in the old Sheet, open the Progress tab →
     File → Download → CSV, and choose that file. Do the same for the Flags tab.
     Importing again is safe.
   - **Print PIN cards** and hand them out.

**Math 8** gets its own address and database:
`npx wrangler d1 create power-board-m8`, paste that id into the `m8` section
of `wrangler.jsonc`, then
`npm run db:init:remote:m8`, `npx wrangler secret put TEACHER_PIN --env m8`,
`npm run deploy:m8`. In its Setup tab, choose Math 8.

To update after code changes: `cd worker && npm run deploy`. Tests: `npm test`.

---

The sections below describe the features as they were added to the Apps Script
version. They all carried over, except Google sign-in and the Sheet menu (see above).

## Leaving a quiz is flagged (Oct 2026)

During a quiz, the page notices when a student switches tabs, opens another
window or app, or clicks outside the page for more than a second. The student
gets a warning on the quiz ("You left this quiz 2 times…"), and the count is
sent to the server right away, so closing the tab doesn't hide it.

Each flagged quiz gets a row on a new **Flags** tab and shows up in the teacher
view under **Left the quiz**, with how many times, how long, and the score
("Not submitted" if they never finished). For each one you choose:

- **Dismiss**: nothing changes.
- **Take away 1–5 boxes** from that standard (asks "Yes, take" first). If that
  un-fills a finished board, the board counts as unfinished until the student
  earns the box back.

Nothing comes off a board until you choose. Decisions stay listed under
**Recent decisions** for 30 days, and on the Flags tab for good.

This catches students looking things up mid-quiz, but it can't stop them
(a phone or a second device isn't detectable), and a student who knows how
could block the page's reports. Clicks on the Google banner above the page
also count as leaving, so check the seconds before taking boxes.

## Security fix: wrong-guess limits (Oct 2026)

A student found she could make unlimited PIN guesses by changing the name on
the page and trying again. Wrong guesses were counted separately for each
student name and each Google account, with no overall cap, so when one name
locked she switched to another (or waited 5 minutes).

Wrong guesses are now counted on the server in several ways at once, so
switching names, accounts or reloading doesn't reset them:

| Limit | Wrong guesses | Lockout |
| --- | --- | --- |
| One student's PIN, from anyone | 5 | 5 min |
| One student's PIN, per day | 20 | until the teacher clears it |
| One person, across all names | 10 | 15 min |
| Whole class combined | 60 | 15 min |
| Teacher passphrase, per person | 10 | 10 min |
| Teacher passphrase, everyone combined | 20 | 60 min (the sheet owner's own account still gets in) |

In a simulated 24-hour attack, PIN guesses that reached a real check dropped
from 720 per student to 20.

The teacher passphrase also moved out of the code into a Script property, so
it's no longer in the source.

**Sheet menu → Power Standards → Clear sign-in lockouts** unlocks students
(per-person limits expire on their own within 15 minutes).

## Quarters and courses (Oct 2026)

One copy of the code runs either course. Two settings, both in the Sheet menu
**Power Standards**, control what students see:

- **Set current quarter**: students see that quarter's board and can review
  earlier quarters. Later quarters stay locked. A new sheet starts at Q1.
- **Set course (Math 1 or Math 8)**: a new sheet starts as Math 1.

| Course | Q1 | Q2 | Q3 | Q4 |
| --- | --- | --- | --- | --- |
| Math 1 | F-BF.1, F-BF.2, F-LE.1 | F-IF.2, F-IF.4, A-CED.3, G-GPE.5 | F-IF.7, F-IF.9, A-CED.3, A-REI.6 | A-APR.1, S-ID.2, S-ID.6, S-ID.8 |
| Math 8 | 8.EE.1, 8.EE.7, 8.EE.8 | 8.F.4, 8.EE.7, 8.EE.8 | 8.F.1, 8.F.2, 8.F.3, 8.F.4, 8.G.9, 8.SP.1 | 8.G.7, 8.G.8, 8.EE.1, 8.SP.2, 8.SP.3 |

Each quarter is its own board. A standard that comes back in a later quarter
(for example A-CED.3 in Q2 and Q3) gets a fresh row, and its boxes in the
earlier quarter stay where they were. Existing Q1 progress carries over
unchanged.

The teacher view and the class board have a quarter picker. Graph questions
use inline SVG and follow the page's light and dark colors.

## Class board keeps the device awake (Oct 2026)

While the class board is open, the page asks the browser to keep the screen on
(Screen Wake Lock), so the Chromebook or OPS feeding the panel doesn't go to
sleep and leave the panel on "No Signal". The footer says **Screen stays on**
when it's working and **Screen may sleep** when the browser refused.

This doesn't touch the panel's own standby timer: that only resets when
someone uses the panel, so it still needs the IT exception.

## Sign in with Google (Oct 2026)

Students whose row on the Roster tab has an **Email** (column D) sign in with
that school Google account: the page signs them in when it opens, and after
signing out it's one click on **Sign in with Google**. PIN sign-in is turned
off for those students, so nobody can guess their way into their board.
Students without an email still use their PIN, so you can switch a class over
a few students at a time.

Setup:

1. Paste the student emails into column D of the Roster tab (header `Email`).
   Capitals don't matter.
2. Run **Power Standards → Set up / check roster**. It flags bad or duplicate
   emails and students with neither an email nor a PIN.
3. **Deploy → Manage deployments → Edit**: keep **Execute as: Me**, set
   **Who has access: Anyone within** your school's domain, choose **New
   version**, then **Deploy**. Google only tells the app who's signed in with
   this setting. With "Anyone", the Google button doesn't appear and
   everyone uses PINs.

A student signed in to a Google account that isn't on the roster sees
"…isn't on the class roster. Ask your teacher to add it."

## Install: Math 1 (your current sheet)

1. In the Apps Script editor, replace everything in **Code**, **Questions**
   and **Index** with `apps-script/Code.gs`, `apps-script/Questions.gs` and
   `apps-script/Index.html`.
2. If you haven't already: **Project Settings → Script properties → Add**
   `TEACHER_PIN` with a new passphrase of 8+ characters.
3. **Deploy → Manage deployments → Edit → Version: New version → Deploy.**
4. In the Sheet, run **Power Standards → Set up / check roster** once. This
   adds the new columns to the Progress tab and keeps every existing score.
5. When Q2 starts: **Power Standards → Set current quarter** → `2`.

## Install: Math 8 (a new copy)

1. Open the Math 1 Sheet → **File → Make a copy**. The copy brings the code
   with it.
2. In the copy, delete the **Progress** tab (it holds Math 1 scores; a fresh
   one is created automatically) and replace the **Roster** tab with your
   Math 8 students. Then use **Power Standards → Fill in missing student PINs**.
3. **Power Standards → Set course** → `M8`.
4. **Extensions → Apps Script → Project Settings → Script properties**: add
   `TEACHER_PIN` (script properties don't copy over).
5. **Deploy → New deployment → Web app** (Execute as: Me; Who has access: the
   same as Math 1). Share the new link with Math 8 students.

Locked-out students: **Power Standards → Clear sign-in lockouts**.
