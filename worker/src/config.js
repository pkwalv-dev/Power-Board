// Constants copied verbatim from apps-script/Code.gs, plus the per-course layout built from them.

export const BOXES = 5;                        // boxes per standard; a quarter's board is (its standards) * BOXES
export const HIST_MAX = 40;                    // recent quizzes kept per student (for badges)
export const LIMITS = {
  // Wrong-guess limits. Each one is counted on the server; switching names or devices doesn't reset them.
  loginFails: 5, loginLockMin: 5,       // wrong PINs for one student (from anyone) before a short lockout
  loginDayFails: 20,                    // wrong PINs for one student in a day before the teacher must clear it
  viewerFails: 10, viewerLockMin: 15,   // wrong PINs from one person, across all names
  classFails: 60, classLockMin: 15,     // wrong PINs from everyone combined
  teacherFails: 10, teacherLockMin: 10, // wrong teacher passphrases per person
  teacherAllFails: 20, teacherAllLockMin: 60, // wrong teacher passphrases from everyone combined
  quizGapSec: 15,                       // minimum time between starting quizzes
  quizzesPerDay: 60,                    // per student
  minAnswerMs: 2000,                    // fastest allowed time per question (a quiz can't be submitted in under 10x this)
  sessionMin: 60,                       // student sign-in lasts this long without activity
  teacherSessionMin: 360                // teacher / class board sign-in
};
export const QUIZ_TTL_MS = 7200 * 1000;       // an open quiz lasts 2 hours (sliding), as in Code.gs
export const TIME_ZONE = 'America/New_York';  // where a "day" of quizzes begins and ends
export const QS = [1, 2, 3, 4];

// Each standard: [question set in Questions.gs, code, title, subtitle].
export const COURSES = {
  M1: { name: 'Math 1', quarters: [
    [['BF1', 'NC.M1.F-BF.1', 'Write a function from a situation', 'Rules from words, tables, and graphs'],
     ['BF2', 'NC.M1.F-BF.2', 'Arithmetic and geometric sequences', 'Recursive and explicit rules'],
     ['LE1', 'NC.M1.F-LE.1', 'Linear or exponential?', 'Tell the two apart']],
    [['IF2', 'NC.M1.F-IF.2', 'Function notation', 'Evaluate f(x) and explain what it means'],
     ['IF4', 'NC.M1.F-IF.4', 'Read key features of graphs', 'Intercepts, maximums, and intervals in context'],
     ['CED3', 'NC.M1.A-CED.3', 'Model with systems', 'Write systems of equations and inequalities'],
     ['GPE5', 'NC.M1.G-GPE.5', 'Parallel and perpendicular lines', 'Use slopes to compare and write lines']],
    [['IF7', 'NC.M1.F-IF.7', 'Key features from equations', 'Intercepts, vertex, range, and end behavior'],
     ['IF9', 'NC.M1.F-IF.9', 'Compare two functions', 'Different representations, side by side'],
     ['CED3', 'NC.M1.A-CED.3', 'Model with systems', 'Write systems of equations and inequalities'],
     ['REI6', 'NC.M1.A-REI.6', 'Solve systems', 'Graphs, tables, substitution, and elimination']],
    [['APR1', 'NC.M1.A-APR.1', 'Polynomial operations', 'Add, subtract, and multiply'],
     ['SID2', 'NC.M1.S-ID.2', 'Compare data sets', 'Center and spread'],
     ['SID6', 'NC.M1.S-ID.6', 'Scatter plots and models', 'Fit lines and read residuals'],
     ['SID8', 'NC.M1.S-ID.8', 'Correlation', 'What r tells you']]] },
  M8: { name: 'Math 8', quarters: [
    [['EE1', 'NC.8.EE.1', 'Exponent properties', 'Integer exponents and equivalent expressions'],
     ['EE7', 'NC.8.EE.7', 'Solve linear equations', 'One, none, or infinitely many solutions'],
     ['EE8', 'NC.8.EE.8', 'Systems of equations', 'Solve by graphing and reasoning']],
    [['F4', 'NC.8.F.4', 'Model with linear functions', 'Rate of change and initial value'],
     ['EE7', 'NC.8.EE.7', 'Solve linear equations', 'One, none, or infinitely many solutions'],
     ['EE8', 'NC.8.EE.8', 'Systems of equations', 'Solve by graphing and reasoning']],
    [['F1', 'NC.8.F.1', 'What is a function?', 'One output for every input'],
     ['F2', 'NC.8.F.2', 'Compare functions', 'Different representations'],
     ['F3', 'NC.8.F.3', 'Linear or nonlinear?', 'Recognize y = mx + b'],
     ['F4', 'NC.8.F.4', 'Model with linear functions', 'Rate of change and initial value'],
     ['G9', 'NC.8.G.9', 'Volume', 'Cones, cylinders, and spheres'],
     ['SP1', 'NC.8.SP.1', 'Scatter plots', 'Association, outliers, and patterns']],
    [['G7', 'NC.8.G.7', 'Pythagorean theorem', 'Missing sides in 2-D and 3-D'],
     ['G8', 'NC.8.G.8', 'Distance on the coordinate plane', 'Use the Pythagorean theorem'],
     ['EE1', 'NC.8.EE.1', 'Exponent properties', 'Integer exponents and equivalent expressions'],
     ['SP2', 'NC.8.SP.2', 'Lines of best fit', 'Fit a line and judge the fit'],
     ['SP3', 'NC.8.SP.3', 'Use linear models', 'Slope and intercept in context']]] }
};

// Flags tab columns (Code.gs FLAG_HEAD).
export const FLAG_HEAD = ['quiz', 'when', 'student id', 'name', 'period', 'std', 'standard', 'times left', 'seconds away', 'score', 'status', 'decided'];

const doneCol = q => (q === 1 ? '' : 'Q' + q + ' ') + 'board completed';
const errCol = q => (q === 1 ? '' : 'Q' + q + ' ') + 'misses at completion';

// Everything Code.gs derived from COURSE at load time (STD_LIST, STDS, HEAD...), built once per course.
const models = {};
export function courseModel(courseId) {
  const id = COURSES[courseId] ? courseId : 'M1';
  if (models[id]) return models[id];
  const course = COURSES[id];
  // One entry per standard per quarter. A standard that comes back in a later quarter gets a fresh row
  // (id like CED3_Q3), so each quarter's board starts empty.
  const seen = {}, list = [];
  course.quarters.forEach((stds, i) => stds.forEach(([gen, code, title, sub]) => {
    list.push({ id: seen[gen] ? gen + '_Q' + (i + 1) : gen, gen, code, title, sub, q: i + 1 });
    seen[gen] = 1;
  }));
  const ids = list.map(s => s.id);
  const head = ['id', 'name', 'period']
    .concat(ids.reduce((a, s) => a.concat([s + ' best', s + ' quizzes', s + ' boxes', s + ' missed']), []))
    .concat(QS.reduce((a, q) => a.concat([doneCol(q), errCol(q)]), []))
    .concat(['updated', 'history']);
  models[id] = {
    id, name: course.name,
    STD_LIST: list,
    STDS: ids,
    HEAD: head,
    stdsIn: q => list.filter(s => s.q === q),
    inst: std => (typeof std === 'string' ? list[ids.indexOf(std)] : undefined) || null
  };
  return models[id];
}
