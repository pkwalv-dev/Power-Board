// Power Standards Board: server (Google Apps Script, bound to a Google Sheet)
// Every function WITHOUT a trailing underscore can be called from a browser, so each one checks its inputs.

// ===== Settings =====
// Teacher passphrase lives in Project Settings > Script properties as TEACHER_PIN (8+ characters),
// so it is never in the code.
const TEACHER_PIN = PropertiesService.getScriptProperties().getProperty('TEACHER_PIN') || '';
const SHEET_NAME = 'Progress';
const ROSTER_NAME = 'Roster';
const STDS = ['BF1', 'BF2', 'LE1'];
const BOXES = 5;                        // boxes per standard; a full board is STDS.length * BOXES
const HIST_MAX = 40;                    // recent quizzes kept per student (for badges)
const LIMITS = {
  // Wrong-guess limits. Each one is counted on the server; switching names or Google accounts doesn't reset them.
  loginFails: 5, loginLockMin: 5,       // wrong PINs for one student (from anyone) before a short lockout
  loginDayFails: 20,                    // wrong PINs for one student in a day before the teacher must clear it
  viewerFails: 10, viewerLockMin: 15,   // wrong PINs from one person, across all names
  classFails: 60, classLockMin: 15,     // wrong PINs from everyone combined
  teacherFails: 10, teacherLockMin: 10, // wrong teacher passphrases per person
  teacherAllFails: 20, teacherAllLockMin: 60, // wrong teacher passphrases from everyone combined (owner still gets in)
  quizGapSec: 15,                       // minimum time between starting quizzes
  quizzesPerDay: 60,                    // per student
  minAnswerMs: 2000,                    // fastest allowed answer
  sessionMin: 60,                       // student sign-in lasts this long without activity
  teacherSessionMin: 360                // teacher / class board sign-in
};

const HEAD = ['id', 'name', 'period']
  .concat(STDS.reduce((a, s) => a.concat([s + ' best', s + ' quizzes', s + ' boxes', s + ' missed']), []))
  .concat(['board completed', 'misses at completion', 'updated', 'history']);
const TEXT_COLS = ['id', 'name', 'board completed', 'updated', 'history'].map(n => HEAD.indexOf(n) + 1);
const ROW_FORMATS = HEAD.map((_, i) => TEXT_COLS.indexOf(i + 1) >= 0 ? '@' : '0');

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Power Standards Board')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===== Sheet menu (teacher only) =====
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Power Standards')
    .addItem('Set up / check roster', 'menuCheckRoster')
    .addItem('Fill in missing student PINs', 'menuFillPins')
    .addItem('Clear sign-in lockouts', 'menuClearLocks')
    .addToUi();
}
function ownerOnly_() {
  const a = Session.getActiveUser().getEmail(), e = Session.getEffectiveUser().getEmail();
  if (!a || a !== e) throw new Error('Only the sheet owner can do that.');
}
function menuCheckRoster() {
  ownerOnly_();
  rosterSheet_(); sheet_();
  const issues = rosterIssues_(), n = roster_(true).length;
  SpreadsheetApp.getUi().alert(issues.length ? 'Roster problems:\n\n' + issues.join('\n') : 'Roster looks good: ' + n + ' students.');
}
function menuFillPins() {
  ownerOnly_();
  const sh = rosterSheet_(), n = sh.getLastRow();
  if (n < 2) { SpreadsheetApp.getUi().alert('Add students to the Roster tab first (Period, Name).'); return; }
  const vals = sh.getRange(2, 1, n - 1, 3).getValues();
  let filled = 0;
  const out = vals.map(r => {
    if (String(r[1]).trim() && !normPin_(r[2])) { filled++; return [randomPin_()]; }
    return [r[2] === '' ? '' : String(r[2])];
  });
  sh.getRange(2, 3, n - 1, 1).setNumberFormat('@').setValues(out);
  CacheService.getScriptCache().remove('roster');
  SpreadsheetApp.getUi().alert(filled ? 'Added ' + filled + ' PINs.' : 'Every student already has a PIN.');
}
function menuClearLocks() {
  ownerOnly_();
  const c = CacheService.getScriptCache();
  c.removeAll(['lf:all', 'tf:all']);
  const keys = roster_(true).reduce((a, s) => a.concat(['lf:' + s.id, 'ld:' + s.id]), []);
  for (let i = 0; i < keys.length; i += 500) c.removeAll(keys.slice(i, i + 500));
  SpreadsheetApp.getUi().alert('Lockouts cleared. (Anyone locked out can sign in again now.)');
}

// ===== Helpers =====
const cache_ = () => CacheService.getScriptCache();
// Only plain strings and numbers are ever accepted from a browser.
function str_(v) { return typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v)) ? String(v) : ''; }
function clamp_(v, a, b) { v = Math.round(+v) || 0; return Math.max(a, Math.min(b, v)); }
function cleanName_(s) {
  return (typeof s === 'string' ? s : str_(s)).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@\s]+/, '').slice(0, 40);
}
function normPin_(v) { const s = str_(v).trim(); return /^\d{1,4}$/.test(s) ? ('000' + s).slice(-4) : ''; }
function randomPin_() { return ('0000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 10000)).slice(-4); }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v == null ? '' : v).slice(0, 30); }
function newId_() { return Utilities.getUuid().replace(/-/g, ''); }
function isId_(t) { return typeof t === 'string' && /^[a-f0-9]{32}$/.test(t); }
function fail_(code, msg) { throw new Error(code + ': ' + msg); }
function who_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }
// Who is asking: their email when Google shares it, otherwise an anonymous per-person key.
function viewer_() { try { return who_() || Session.getTemporaryActiveUserKey() || ''; } catch (e) { return ''; } }
// Counts a wrong guess against every key; each key expires on its own timer.
function bump_(c, list) { list.forEach(k => c.put(k[0], String(+(c.get(k[0]) || 0) + 1), k[1] * 60)); }
function isOwner_() { const a = who_(); return !!a && a === Session.getEffectiveUser().getEmail(); }

// ===== Roster =====
function rosterSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ROSTER_NAME);
  if (!sh) {
    sh = ss.insertSheet(ROSTER_NAME);
    sh.getRange(1, 1, 1, 3).setValues([['Period', 'Name', 'PIN']]);
    sh.setFrozenRows(1);
    sh.getRange(1, 3, sh.getMaxRows(), 1).setNumberFormat('@');
  }
  return sh;
}
function idOf_(cls, name) {
  return 'p' + cls + '_' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x');
}
function roster_(fresh) {
  const c = cache_();
  if (!fresh) { const hit = c.get('roster'); if (hit) return JSON.parse(hit); }
  const sh = rosterSheet_(), n = sh.getLastRow(), seen = {}, out = [];
  if (n > 1) sh.getRange(2, 1, n - 1, 3).getValues().forEach(r => {
    const cls = String(r[0]).trim(), name = cleanName_(r[1]), pin = normPin_(r[2]);
    if (!/^[1-8]$/.test(cls) || !name || !pin) return;
    const id = idOf_(cls, name);
    if (seen[id]) return;
    seen[id] = 1; out.push({ cls: cls, name: name, id: id, pin: pin });
  });
  c.put('roster', JSON.stringify(out), 60);
  return out;
}
function rosterIssues_() {
  const sh = rosterSheet_(), n = sh.getLastRow(), seen = {}, issues = [];
  if (n < 2) return ['The Roster tab is empty. Add Period and Name for each student, then use "Fill in missing student PINs".'];
  sh.getRange(2, 1, n - 1, 3).getValues().forEach((r, i) => {
    const row = i + 2, cls = String(r[0]).trim(), raw = String(r[1]).trim(), name = cleanName_(r[1]);
    if (!raw && !String(r[0]).trim()) return;
    if (!/^[1-8]$/.test(cls)) issues.push('Row ' + row + ': period must be 1–8.');
    if (!name) issues.push('Row ' + row + ': missing name.');
    else if (name !== raw) issues.push('Row ' + row + ': name will show as "' + name + '".');
    if (!normPin_(r[2])) issues.push('Row ' + row + ': missing or invalid PIN (4 digits).');
    const id = idOf_(cls, name);
    if (name && seen[id]) issues.push('Row ' + row + ': same name as row ' + seen[id] + ' in that period. Add a letter to tell them apart.');
    seen[id] = seen[id] || row;
  });
  return issues;
}

// ===== Progress sheet =====
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
    sh.setFrozenRows(1);
    return sh;
  }
  const w = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, w).getValues()[0].map(String);
  if (head.join('|') !== HEAD.join('|')) migrate_(sh, head);
  return sh;
}
function migrate_(sh, oldHead) {
  const n = sh.getLastRow();
  const old = n > 1 ? sh.getRange(2, 1, n - 1, oldHead.length).getValues() : [];
  const rows = old.map(r => HEAD.map(name => { const i = oldHead.indexOf(name); const v = i < 0 ? '' : r[i]; return v instanceof Date ? v.toISOString() : v; }));
  sh.clear();
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
  sh.setFrozenRows(1);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, HEAD.length).setNumberFormats(rows.map(() => ROW_FORMATS)).setValues(rows);
  }
}
function findRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}
function writeRow_(sh, at, r) {
  const row = at || sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, HEAD.length).setNumberFormats([ROW_FORMATS]).setValues([toRow_(r)]);
}

// ===== Records =====
function clean_(o) {
  if (!o || typeof o !== 'object') return null;
  const name = cleanName_(o.name), cls = String(o.cls || '');
  if (!name || !/^[1-8]$/.test(cls)) return null;
  const std = {};
  STDS.forEach(s => {
    const x = (o.std && o.std[s]) || {};
    std[s] = { best: clamp_(x.best, 0, 10), att: clamp_(x.att, 0, 9999), mast: clamp_(x.mast, 0, 999), wrong: clamp_(x.wrong, 0, 99999) };
  });
  let hist = o.hist;
  if (typeof hist === 'string') { try { hist = JSON.parse(hist); } catch (e) { hist = []; } }
  hist = (Array.isArray(hist) ? hist : []).filter(e => Array.isArray(e) && e.length === 4)
    .map(e => [String(e[0]).slice(0, 16), +e[1] || 0, clamp_(e[2], 0, STDS.length - 1), clamp_(e[3], 0, 10)])
    .slice(-HIST_MAX);
  return { name: name, cls: cls, std: std, done: iso_(o.done), doneErr: clamp_(o.doneErr, 0, 99999), updated: iso_(o.updated), hist: hist };
}
function toRow_(r) {
  return [idOf_(r.cls, r.name), r.name, r.cls]
    .concat(STDS.reduce((a, s) => a.concat([r.std[s].best, r.std[s].att, r.std[s].mast, r.std[s].wrong]), []))
    .concat([r.done, r.doneErr, r.updated, JSON.stringify(r.hist)]);
}
function fromRow_(row) {
  const o = { name: row[1], cls: String(row[2]), std: {} };
  STDS.forEach((s, i) => { const b = 3 + i * 4; o.std[s] = { best: row[b], att: row[b + 1], mast: row[b + 2], wrong: row[b + 3] }; });
  const b = 3 + STDS.length * 4;
  o.done = row[b]; o.doneErr = row[b + 1]; o.updated = row[b + 2]; o.hist = row[b + 3];
  return clean_(o);
}
function boxes_(r) { return STDS.reduce((n, s) => n + Math.min(r.std[s].mast, BOXES), 0); }
function missed_(r) { return STDS.reduce((n, s) => n + r.std[s].wrong, 0); }
function apply_(r, ev, now) {
  if (r.hist.some(e => e[0] === ev.id)) return r;          // already recorded
  const st = r.std[ev.std], sc = ev.sc;
  st.att += 1; st.best = Math.max(st.best, sc); st.wrong += 10 - sc;
  if (sc === 10) st.mast += 1;
  if (!r.done && boxes_(r) >= STDS.length * BOXES) { r.done = new Date(now).toISOString(); r.doneErr = missed_(r); }
  r.hist.push([ev.id, now, STDS.indexOf(ev.std), sc]);
  r.hist = r.hist.slice(-HIST_MAX);
  r.updated = new Date(now).toISOString();
  return r;
}
// Records for roster students (rosterless rows are ignored everywhere).
function recordsFor_(students) {
  const sh = sheet_(), n = sh.getLastRow(), byId = {};
  if (n > 1) sh.getRange(2, 1, n - 1, HEAD.length).getValues().forEach(row => { byId[row[0]] = row; });
  return students.map(s => {
    const r = byId[s.id] ? fromRow_(byId[s.id]) : null;
    const out = r || clean_({ name: s.name, cls: s.cls });
    out.name = s.name; out.cls = s.cls;            // roster spelling wins
    return out;
  });
}

// ===== Student sessions =====
function session_(token) {
  if (!isId_(token)) fail_('SESSION', 'Please sign in again.');
  const c = cache_(), v = c.get('s:' + token);
  if (!v) fail_('SESSION', 'Your sign-in expired. Please sign in again.');
  c.put('s:' + token, v, LIMITS.sessionMin * 60);   // sliding expiry
  return JSON.parse(v);
}

// Names for the sign-in list.
function getRoster(cls) {
  cls = str_(cls);
  if (!/^[1-8]$/.test(cls)) return [];
  return roster_().filter(s => s.cls === cls).map(s => s.name).sort((a, b) => a.localeCompare(b));
}
function login(cls, name, pin) {
  cls = str_(cls); name = typeof name === 'string' ? cleanName_(name) : ''; pin = typeof pin === 'string' ? pin : '';
  const st = roster_().find(s => s.cls === cls && s.name === name);
  if (!st) fail_('LOGIN', 'Pick your name from the list.');
  const c = cache_(), v = viewer_(), L = LIMITS;
  const keys = [['lf:' + st.id, L.loginLockMin], ['ld:' + st.id, 24 * 60], ['lf:all', L.classLockMin]];
  if (v) keys.push(['lv:' + v, L.viewerLockMin]);
  const n = k => +(c.get(k) || 0);
  if (n('lf:all') >= L.classFails) fail_('LOGIN', 'Sign-in is paused because of too many wrong PINs. Try again in a few minutes or ask your teacher.');
  if (v && n('lv:' + v) >= L.viewerFails) fail_('LOGIN', 'Too many wrong PINs. Wait ' + L.viewerLockMin + ' minutes or ask your teacher.');
  if (n('ld:' + st.id) >= L.loginDayFails) fail_('LOGIN', 'Too many wrong PINs today. Ask your teacher to unlock your sign-in.');
  if (n('lf:' + st.id) >= L.loginFails) fail_('LOGIN', 'Too many wrong PINs. Wait ' + L.loginLockMin + ' minutes or ask your teacher.');
  if (!/^\d{4}$/.test(pin.trim()) || pin.trim() !== st.pin) {
    bump_(c, keys);
    fail_('LOGIN', 'Wrong PIN.');
  }
  c.remove('lf:' + st.id);
  const token = newId_();
  c.put('s:' + token, JSON.stringify({ id: st.id, cls: st.cls, name: st.name }), LIMITS.sessionMin * 60);
  return { token: token, rec: recordsFor_([st])[0] };
}
function signOut(token) { if (isId_(token)) cache_().remove('s:' + token); return true; }
function getMe(token) {
  const s = session_(token);
  const st = roster_().find(x => x.id === s.id);
  if (!st) fail_('SESSION', 'You are no longer on the roster.');
  return recordsFor_([st])[0];
}

// ===== Quizzes (graded on the server; answers never leave until you commit) =====
function startQuiz(token, std) {
  const s = session_(token);
  if (typeof std !== 'string' || STDS.indexOf(std) < 0) fail_('BAD', 'Unknown standard.');
  const c = cache_(), now = Date.now();
  const today = Utilities.formatDate(new Date(now), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const rate = JSON.parse(c.get('qs:' + s.id) || '{"last":0,"day":"","n":0}');
    if (rate.day !== today) { rate.day = today; rate.n = 0; }
    const wait = rate.last + LIMITS.quizGapSec * 1000 - now;
    if (wait > 0) fail_('WAIT', 'You can start another quiz in ' + Math.ceil(wait / 1000) + ' seconds.');
    if (rate.n >= LIMITS.quizzesPerDay) fail_('LIMIT', 'That’s the most quizzes for today. Come back tomorrow!');
    rate.last = now; rate.n += 1;
    c.put('qs:' + s.id, JSON.stringify(rate), 21600);
  } finally { lock.releaseLock(); }
  const qs = QGEN.makeQuiz(std), qid = newId_();
  c.put('q:' + qid, JSON.stringify({ sid: s.id, std: std, ans: qs.map(q => q.ans), n: qs.map(q => q.opts.length), exp: qs.map(q => q.exp), picks: [], served: now, done: false }), 7200);
  return { qid: qid, std: std, qs: qs.map(q => ({ stem: q.stem, opts: q.opts })) };
}
function answer(token, qid, i, pick) {
  const s = session_(token);
  if (!isId_(qid)) fail_('QUIZ', 'That quiz is not available.');
  if (typeof i !== 'number' || typeof pick !== 'number') fail_('BAD', 'Invalid answer.');
  if (!Number.isInteger(i) || i < 0 || i > 9 || !Number.isInteger(pick) || pick < 0 || pick > 3) fail_('BAD', 'Invalid answer.');
  const c = cache_(), lock = LockService.getScriptLock();
  let st;
  lock.waitLock(15000);
  try {
    const raw = c.get('q:' + qid);
    if (!raw) fail_('QUIZ', 'This quiz expired. Start a new one.');
    st = JSON.parse(raw);
    if (st.sid !== s.id) fail_('QUIZ', 'That quiz is not available.');
    if (i < st.picks.length) return { i: i, pick: st.picks[i], ans: st.ans[i], exp: st.exp[i], again: true };
    if (i > st.picks.length) fail_('BAD', 'Answer the questions in order.');
    if (pick >= st.n[i]) fail_('BAD', 'Invalid answer.');
    const wait = st.served + LIMITS.minAnswerMs - Date.now();
    if (wait > 0) return { i: i, wait: wait };
    st.picks.push(pick); st.served = Date.now();
    c.put('q:' + qid, JSON.stringify(st), 7200);
  } finally { lock.releaseLock(); }
  const out = { i: i, pick: pick, ans: st.ans[i], exp: st.exp[i] };
  if (st.picks.length === 10) out.final = finish_(s, qid, st);
  return out;
}
function finishQuiz(token, qid) {
  const s = session_(token);
  if (!isId_(qid)) fail_('QUIZ', 'That quiz is not available.');
  const raw = cache_().get('q:' + qid);
  if (!raw) fail_('QUIZ', 'This quiz expired. Start a new one.');
  const st = JSON.parse(raw);
  if (st.sid !== s.id || st.picks.length !== 10) fail_('QUIZ', 'That quiz is not finished.');
  return finish_(s, qid, st);
}
function finish_(s, qid, st) {
  const score = st.picks.filter((p, k) => p === st.ans[k]).length;
  const student = roster_().find(x => x.id === s.id);
  if (!student) fail_('SESSION', 'You are no longer on the roster.');
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_(), at = findRow_(sh, s.id);
    const r = at ? fromRow_(sh.getRange(at, 1, 1, HEAD.length).getValues()[0]) : clean_({ name: student.name, cls: student.cls });
    r.name = student.name; r.cls = student.cls;
    apply_(r, { id: qid.slice(0, 16), std: st.std, sc: score }, Date.now());
    writeRow_(sh, at, r);
    return { score: score, rec: r };
  } finally { lock.releaseLock(); }
}

// ===== Teacher =====
function teacherLogin(pin) {
  pin = typeof pin === 'string' ? pin : null;
  if (pin === null) fail_('PIN', 'Wrong passphrase.');
  if (String(TEACHER_PIN).length < 8) fail_('SETUP', 'Add a TEACHER_PIN script property (8+ characters) in Project Settings, then try again.');
  const c = cache_(), v = viewer_(), owner = isOwner_(), L = LIMITS;
  if (!owner) {
    const keys = [['tf:all', L.teacherAllLockMin]];
    if (v) keys.push(['tf:' + v, L.teacherLockMin]);
    if (+(c.get('tf:all') || 0) >= L.teacherAllFails || (v && +(c.get('tf:' + v) || 0) >= L.teacherFails)) fail_('LOCKED', 'Too many wrong passphrases. Try again later.');
    if (String(pin) !== String(TEACHER_PIN)) { bump_(c, keys); fail_('PIN', 'Wrong passphrase.'); }
  } else if (pin !== '' && String(pin) !== String(TEACHER_PIN)) {
    fail_('PIN', 'Wrong passphrase.');
  }
  const token = newId_();
  c.put('t:' + token, '1', LIMITS.teacherSessionMin * 60);
  return token;
}
function teacher_(token) {
  if (!isId_(token)) fail_('SESSION', 'Teacher sign-in required.');
  const c = cache_();
  if (!c.get('t:' + token)) fail_('SESSION', 'Teacher sign-in expired.');
  c.put('t:' + token, '1', LIMITS.teacherSessionMin * 60);
}
function getAll(token) { teacher_(token); return recordsFor_(roster_()); }
function getBoard(token, cls) {
  teacher_(token); cls = str_(cls);
  if (!/^[1-8]$/.test(cls)) fail_('BAD', 'Pick a period.');
  return recordsFor_(roster_().filter(s => s.cls === cls));
}
