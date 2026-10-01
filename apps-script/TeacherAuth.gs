/**
 * Server-side teacher password check with a guess limit.
 *
 * Why this exists: a password or "too many guesses" counter that lives in the
 * page's HTML/JavaScript can be read or edited by anyone with browser dev tools
 * (change the code, reload, unlimited guesses). Everything here runs on
 * Google's servers, where students can't see or change it.
 *
 * Setup (once, from the Apps Script editor):
 *   1. Open setTeacherPassword below, put your password in the call inside
 *      setupPassword(), select "setupPassword" and click Run.
 *   2. Delete the password from setupPassword() and save. Only a salted hash
 *      is kept, in Script Properties.
 *   3. Remove any password, hash, or guess counter from the HTML files.
 *   4. Deploy > Manage deployments > edit > New version.
 */

var MAX_TRIES_PER_USER = 5;      // wrong guesses allowed per visitor...
var MAX_TRIES_GLOBAL = 25;       // ...and across everyone, per window
var LOCK_SECONDS = 15 * 60;      // lockout length after hitting a limit
var SESSION_SECONDS = 6 * 60 * 60;

// ---------- one-time setup (run from the editor, never from the page) ----------

function setupPassword() {
  setTeacherPassword('PUT-YOUR-PASSWORD-HERE-THEN-DELETE-IT');
}

function setTeacherPassword(pw) {
  if (!pw || pw.length < 10) throw new Error('Use at least 10 characters.');
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    TEACHER_SALT: salt,
    TEACHER_HASH: hash_(salt, pw)
  });
  resetLockout();
}

/** Run from the editor if a student locks you out. */
function resetLockout() {
  var c = CacheService.getScriptCache();
  c.remove('tries_global');
  c.remove('lock_global');
  // Per-visitor counters can't be listed, so start a new generation of keys.
  var p = PropertiesService.getScriptProperties();
  p.setProperty('LOCK_GEN', String(Number(p.getProperty('LOCK_GEN') || 0) + 1));
}

// ---------- called from the page via google.script.run ----------

/**
 * Returns {ok:true, token} on success, or {ok:false, msg}.
 * The page never learns the password or the hash.
 */
function checkTeacherPassword(pw) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var gen = PropertiesService.getScriptProperties().getProperty('LOCK_GEN') || '0';
    var who = gen + '_' + (Session.getTemporaryActiveUserKey() || 'anon');
    var userKey = 'tries_' + who;

    if (cache.get('lock_global') || cache.get('lock_' + who)) {
      return { ok: false, msg: 'Too many attempts. Try again later.' };
    }

    var props = PropertiesService.getScriptProperties();
    var salt = props.getProperty('TEACHER_SALT');
    var stored = props.getProperty('TEACHER_HASH');
    if (!salt || !stored) return { ok: false, msg: 'Teacher password not set up.' };

    if (safeEqual_(hash_(salt, String(pw || '')), stored)) {
      cache.remove(userKey);
      var token = Utilities.getUuid();
      cache.put('session_' + token, '1', SESSION_SECONDS);
      return { ok: true, token: token };
    }

    var u = bump_(cache, userKey);
    var g = bump_(cache, 'tries_global');
    if (u >= MAX_TRIES_PER_USER) cache.put('lock_' + who, '1', LOCK_SECONDS);
    if (g >= MAX_TRIES_GLOBAL) cache.put('lock_global', '1', LOCK_SECONDS);
    Utilities.sleep(1000); // slow down scripted guessing
    return { ok: false, msg: 'Incorrect password.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Wrap every teacher-only server function with this. The page must pass the
 * token it got from checkTeacherPassword; hiding a button is not protection.
 *
 *   function getClassData(token) {
 *     requireTeacher_(token);
 *     return ...; // gradebook data
 *   }
 */
function requireTeacher_(token) {
  if (!token || !CacheService.getScriptCache().get('session_' + token)) {
    throw new Error('Not authorized.');
  }
}

function logoutTeacher(token) {
  if (token) CacheService.getScriptCache().remove('session_' + token);
}

// ---------- helpers ----------

function bump_(cache, key) {
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), LOCK_SECONDS);
  return n;
}

function hash_(salt, pw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw);
  for (var i = 0; i < 1000; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(bytes));
  }
  return Utilities.base64Encode(bytes);
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
