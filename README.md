# Power-Board

Server code for the Power Standards Board Google Apps Script web app
(bound to the Google Sheet that holds the Roster and Progress tabs).

- `apps-script/Code.gs`: server (sign-in, grading, saving to the Sheet, teacher views)
- `apps-script/Questions.gs`: question generators (unchanged)
- `Index.html`: the page. Unchanged, so it's not stored here.

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

## Install

1. In the Apps Script editor, replace everything in **Code** with
   `apps-script/Code.gs`. Leave **Questions** and **Index** as they are.
2. **Project Settings (gear) → Script properties → Add property**:
   name `TEACHER_PIN`, value a new passphrase of 8+ characters. Pick a new
   one, since the old one was typed into a chat.
3. **Deploy → Manage deployments → Edit → Version: New version → Deploy.**

Student progress lives in the Progress tab of the Sheet and is not touched.
