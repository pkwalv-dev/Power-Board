# Power-Board

Apps Script version of the Power Standards Board, hardened after a student
security test.

## What was wrong

The page ran everything in the student's browser, so anything could be read
or changed with dev tools:

1. **Teacher password**: the password and its check lived in the page.
2. **Guess limit**: the "too many guesses" counter lived in the page; editing it
   and reloading gave unlimited guesses.
3. **Scores and answers**: the answer key was generated in the page, and
   scores were calculated there before saving, so a student could find answers
   or report a fake 10/10.

## What changed

The page (`Index.html`) now only displays what the server sends. It holds no
password, guess counter, answer key, or scores.

| File | Runs on | Does |
| --- | --- | --- |
| `Code.gs` | Google's server | Serves the page, grades quizzes, stores scores, serves the teacher dashboard |
| `Quiz.gs` | Google's server | Builds the questions; answers stay on the server until a quiz is submitted |
| `TeacherAuth.gs` | Google's server | Teacher password (salted hash), guess limit, 6-hour login token |
| `Index.html` | Browser | The student and teacher screens |

- **Password:** stored only as a salted hash in Script Properties.
- **Guess limit:** 5 wrong guesses per visitor or 25 total, then a 15-minute
  lockout, plus a 1-second delay per miss. Reloading the page doesn't reset it.
- **Grading:** the page gets questions without answers. A quiz is graded once
  on submit, and then the results and explanations come back. Each quiz can
  be submitted once.
- **Server load:** two calls per quiz (start, submit) plus one when a student
  signs in. Well inside Apps Script limits for a school.
- **Change in how quizzes work:** answers are no longer shown one question at
  a time. Students answer all 10 questions (and can go back), then see their
  score and a review of what they missed.

## Install

1. In the Apps Script project, replace the existing files with `Code.gs`,
   `Quiz.gs`, `TeacherAuth.gs` and `Index.html` (the HTML file must be named
   `Index`).
2. Open `TeacherAuth.gs`, put your password in `setupPassword()`, select
   `setupPassword` and click **Run**. Then delete the password from the code
   and save.
3. **Deploy > Manage deployments > Edit > New version > Deploy.**
   Execute as: **Me**. Who has access: whoever needs it (e.g. anyone in your school).

Locked out? Run `resetLockout()` from the editor.

## Known limit

Students type their own name, so one student could take quizzes under
another's name. They still have to earn the score. Requiring a school Google
sign-in would close this.
