# Power-Board

## Teacher password (Google Apps Script version)

A student showed the old teacher login could be bypassed: the password check and
the "too many guesses" limit ran in the browser, so editing the page and
reloading gave unlimited guesses. Anything in the page's HTML/JavaScript is
visible and editable by the person using it.

`apps-script/TeacherAuth.gs` moves the check to Google's servers:

- The password is stored only as a salted hash in Script Properties.
- Wrong guesses are counted on the server: 5 per visitor and 25 total, then a 15-minute lockout,
  plus a 1-second delay per wrong guess. Reloading or editing the page does not reset it.
- A correct password returns a session token (6 hours). Every teacher-only
  server function must call `requireTeacher_(token)` before returning data.

### Install

1. Add `TeacherAuth.gs` to the Apps Script project.
2. Put your password in `setupPassword()`, run it once from the editor, then
   delete the password from the code.
3. Remove the old password and attempt counter from the HTML; use
   `teacher-login-snippet.html` as the login form.
4. Add `requireTeacher_(token);` as the first line of every teacher-only
   function (gradebook, reset, export…), and pass the token from the page.
5. Deploy a new version. Locked yourself out? Run `resetLockout()` from the editor.

The Claude artifact version of the Power Standards Board has no password: its
Teacher view is gated by the artifact service's owner check on its server.
