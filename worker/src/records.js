// Student records: clean_, apply_ and the Progress-tab row format, ported from apps-script/Code.gs.
// Every function takes the course model `m` (see config.js) where Code.gs used module-level constants.
import { BOXES, HIST_MAX, QS } from './config.js';
import { clamp_, cleanName_, iso_, idOf_ } from './util.js';

export function clean_(m, o) {
  if (!o || typeof o !== 'object') return null;
  const name = cleanName_(o.name), cls = String(o.cls || '');
  if (!name || !/^[1-8]$/.test(cls)) return null;
  const std = {};
  m.STDS.forEach(s => {
    const x = (o.std && o.std[s]) || {};
    std[s] = { best: clamp_(x.best, 0, 10), att: clamp_(x.att, 0, 9999), mast: clamp_(x.mast, 0, 999), wrong: clamp_(x.wrong, 0, 99999) };
  });
  let hist = o.hist;
  if (typeof hist === 'string') { try { hist = JSON.parse(hist); } catch (e) { hist = []; } }
  hist = (Array.isArray(hist) ? hist : []).filter(e => Array.isArray(e) && e.length === 4)
    .map(e => [String(e[0]).slice(0, 16), +e[1] || 0, clamp_(e[2], 0, m.STDS.length - 1), clamp_(e[3], 0, 10)])
    .slice(-HIST_MAX);
  const done = {}, doneErr = {};
  QS.forEach(q => { done[q] = iso_(o.done && o.done[q]); doneErr[q] = clamp_(o.doneErr && o.doneErr[q], 0, 99999); });
  return { name, cls, std, done, doneErr, updated: iso_(o.updated), hist };
}

// One Progress-tab row, in HEAD order.
export function toRow_(m, r) {
  return [idOf_(r.cls, r.name), r.name, r.cls]
    .concat(m.STDS.reduce((a, s) => a.concat([r.std[s].best, r.std[s].att, r.std[s].mast, r.std[s].wrong]), []))
    .concat(QS.reduce((a, q) => a.concat([r.done[q], r.doneErr[q]]), []))
    .concat([r.updated, JSON.stringify(r.hist)]);
}
// A Progress-tab row given as {column name: value} (columns may be in any order, like migrate_).
export function fromNamedRow_(m, get) {
  const o = { name: get('name'), cls: String(get('period')), std: {}, done: {}, doneErr: {} };
  m.STDS.forEach(s => { o.std[s] = { best: get(s + ' best'), att: get(s + ' quizzes'), mast: get(s + ' boxes'), wrong: get(s + ' missed') }; });
  QS.forEach(q => {
    o.done[q] = get((q === 1 ? '' : 'Q' + q + ' ') + 'board completed');
    o.doneErr[q] = get((q === 1 ? '' : 'Q' + q + ' ') + 'misses at completion');
  });
  o.updated = get('updated'); o.hist = get('history');
  return clean_(m, o);
}

export function boxes_(m, r, q) { return m.stdsIn(q).reduce((n, s) => n + Math.min(r.std[s.id].mast, BOXES), 0); }
export function missed_(m, r, q) { return m.stdsIn(q).reduce((n, s) => n + r.std[s.id].wrong, 0); }
export function boardFull_(m, r, q) { return boxes_(m, r, q) >= m.stdsIn(q).length * BOXES; }

// Records one graded quiz. Idempotent: a quiz already in hist is not counted twice.
export function apply_(m, r, ev, now) {
  if (r.hist.some(e => e[0] === ev.id)) return r;          // already recorded
  const st = r.std[ev.std], sc = ev.sc;
  st.att += 1; st.best = Math.max(st.best, sc); st.wrong += 10 - sc;
  if (sc === 10) st.mast += 1;
  const q = m.inst(ev.std).q;
  if (!r.done[q] && boardFull_(m, r, q)) { r.done[q] = new Date(now).toISOString(); r.doneErr[q] = missed_(m, r, q); }
  r.hist.push([ev.id, now, m.STDS.indexOf(ev.std), sc]);
  r.hist = r.hist.slice(-HIST_MAX);
  r.updated = new Date(now).toISOString();
  return r;
}
