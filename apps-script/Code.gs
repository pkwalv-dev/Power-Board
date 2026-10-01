/**
 * Power Standards Board — Apps Script server.
 *
 * The browser only ever receives question text and answer choices. The answer
 * key stays here until the quiz is submitted, grading happens here, and scores
 * are stored here. Editing the page can change what a student sees, but not
 * what gets recorded.
 *
 * Load: one server call to start a quiz, one to submit it.
 */

const STD_IDS = ['BF1', 'BF2', 'LE1'];
const PASS = 9;
const QUIZ_SECONDS = 2 * 60 * 60; // an unsubmitted quiz expires after 2 hours

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Power Standards Board')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- student calls ----------

/** Creates a quiz. Returns questions without answers or explanations. */
function startQuiz(stdId) {
  if (STD_IDS.indexOf(stdId) < 0) throw new Error('Unknown standard.');
  const qs = makeQuiz(stdId);
  const quizId = Utilities.getUuid();
  CacheService.getScriptCache().put('quiz_' + quizId, JSON.stringify({ std: stdId, qs: qs }), QUIZ_SECONDS);
  return { quizId: quizId, qs: qs.map(q => ({ stem: q.stem, opts: q.opts })) };
}

/**
 * Grades a quiz once and saves the result. A quiz can be submitted only once,
 * so seeing the answers afterward doesn't help on the next (different) quiz.
 */
function submitQuiz(quizId, name, cls, picks) {
  const who = checkStudent_(name, cls);
  if (!Array.isArray(picks) || picks.length !== 10) throw new Error('Answer all 10 questions.');

  const cache = CacheService.getScriptCache();
  const key = 'quiz_' + String(quizId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const raw = cache.get(key);
    if (!raw) throw new Error('This quiz expired or was already submitted. Start a new one.');
    cache.remove(key);
    const quiz = JSON.parse(raw);

    const p = picks.map(x => Number.isInteger(x) && x >= 0 && x < 4 ? x : -1);
    const score = quiz.qs.filter((q, i) => p[i] === q.ans).length;
    const pass = score >= PASS;

    const rec = loadRecord_(who.name, who.cls);
    const st = rec.std[quiz.std];
    st.att++;
    st.best = Math.max(st.best, score);
    if (pass) st.mast = Math.min(99, st.mast + 1);
    rec.updated = new Date().toISOString();
    saveRecord_(rec);

    return {
      score: score, pass: pass, rec: rec,
      review: quiz.qs.map((q, i) => ({ stem: q.stem, opts: q.opts, ans: q.ans, exp: q.exp, pick: p[i] }))
    };
  } finally {
    lock.releaseLock();
  }
}

/** Returns a student's board. */
function getRecord(name, cls) {
  const who = checkStudent_(name, cls);
  return loadRecord_(who.name, who.cls);
}

// ---------- teacher calls (password-protected, see TeacherAuth.gs) ----------

function getClassData(token) {
  requireTeacher_(token);
  const all = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all).filter(k => k.indexOf('rec_') === 0).map(k => JSON.parse(all[k]));
}

/** Clears one student's record (e.g. a joke name). */
function deleteStudent(token, name, cls) {
  requireTeacher_(token);
  const who = checkStudent_(name, cls);
  PropertiesService.getScriptProperties().deleteProperty(recKey_(who.name, who.cls));
}

// ---------- storage ----------

function checkStudent_(name, cls) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const c = String(cls || '');
  if (n.length < 2 || !/^[1-8]$/.test(c)) throw new Error('Enter your name and class period.');
  return { name: n, cls: c };
}

function recKey_(name, cls) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
  return 'rec_' + cls + '_' + slug;
}

function loadRecord_(name, cls) {
  const raw = PropertiesService.getScriptProperties().getProperty(recKey_(name, cls));
  const rec = raw ? JSON.parse(raw) : { std: {} };
  rec.name = name;
  rec.cls = cls;
  STD_IDS.forEach(id => { if (!rec.std[id]) rec.std[id] = { best: 0, att: 0, mast: 0 }; });
  rec.updated = rec.updated || '';
  return rec;
}

function saveRecord_(rec) {
  PropertiesService.getScriptProperties().setProperty(recKey_(rec.name, rec.cls), JSON.stringify(rec));
}
