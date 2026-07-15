// Game state (marks, undo history, timer, move counter, win detection).
// No DOM access here — keep this file runnable under plain `node`.

(function () {
const isNode = typeof module !== "undefined" && module.exports;
const CatdokuBoard = isNode ? require("./board.js") : window.CatdokuBoard;
const CatdokuSolver = isNode ? require("./solver.js") : window.CatdokuSolver;
const { MARK, cellIndex, rowColOf, createMarkState, actionFor, isValidSolution } = CatdokuBoard;

const MAX_MISTAKES = 3;

// puzzle: { N, regionOf, solution, maxTierUsed }
function createGameState(puzzle, difficultyKey, now = Date.now()) {
  return {
    N: puzzle.N,
    regionOf: puzzle.regionOf,
    solution: puzzle.solution,
    maxTierUsed: puzzle.maxTierUsed,
    difficultyKey,
    marks: createMarkState(puzzle.N),
    history: [],
    moveCount: 0,
    startTime: now,
    endTime: null,
    won: false,
    lost: false,
    mistakes: 0,
    maxMistakes: MAX_MISTAKES,
    hintsUsed: 0,
  };
}

function isOver(state) {
  return state.won || state.lost;
}

// The puzzle's solution is one {row, col} per row; a cat anywhere else is wrong.
function isSolutionCell(state, cell) {
  const { row, col } = rowColOf(state.N, cell);
  return state.solution.some((cat) => cat.row === row && cat.col === col);
}

// Restart the same puzzle: fresh marks/history/timer, same regionOf/solution.
function restartGameState(state, now = Date.now()) {
  return createGameState(
    { N: state.N, regionOf: state.regionOf, solution: state.solution, maxTierUsed: state.maxTierUsed },
    state.difficultyKey,
    now
  );
}

// Commits a batch of { cell, from, to } as ONE history entry / one move.
// A single tap is a one-element batch; a swipe is an N-element batch. Both
// undo in a single step, which is the whole point — a drag that painted six
// X's should not take six taps of Undo to reverse.
function applyChanges(state, changes, now = Date.now()) {
  if (isOver(state) || changes.length === 0) return state;

  for (const { cell, to } of changes) state.marks[cell] = to;
  state.history.push(changes);
  state.moveCount++;

  checkWin(state, now);
  return state;
}

// Toggles a single cell per board.actionFor (EMPTY<->X, or lifts a cat off).
function toggleCell(state, cell, now = Date.now()) {
  if (isOver(state)) return state;
  const action = actionFor(state.marks[cell]);
  if (!action) return state;
  return applyChanges(state, [{ cell, from: action.from, to: action.to }], now);
}

// Double-tap commit. This is the ONLY way a cat reaches the board, so every
// cat on screen is provably correct and `checkWin` can never see a wrong one.
// Returns a result object rather than throwing so the UI can decide how loud
// to be about it.
function placeCat(state, cell, now = Date.now()) {
  if (isOver(state)) return { ok: false, reason: "over" };
  if (state.marks[cell] === MARK.CAT) return { ok: false, reason: "already" };

  if (!isSolutionCell(state, cell)) {
    state.mistakes++;
    const gameOver = state.mistakes >= state.maxMistakes;
    if (gameOver) {
      state.lost = true;
      state.endTime = now;
    }
    return {
      ok: false,
      reason: "mistake",
      mistakes: state.mistakes,
      remaining: Math.max(0, state.maxMistakes - state.mistakes),
      gameOver,
    };
  }

  const from = state.marks[cell];
  applyChanges(state, [{ cell, from, to: MARK.CAT }], now);
  return { ok: true, reason: "placed" };
}

function undoLastMove(state, now = Date.now()) {
  if (isOver(state) || state.history.length === 0) return state;

  const changes = state.history.pop();
  for (const { cell, from } of changes) state.marks[cell] = from;
  return state;
}

// Rewinds the last commit as if it never happened — history entry gone AND
// the move counter rolled back. Used only by the double-tap handler, which
// optimistically paints an X on the first tap (so single taps stay instant)
// and takes it back when the second tap arrives. Returns the reverted
// changes so the caller knows which cells to repaint, or null if there was
// nothing to revert.
function revertLastCommit(state) {
  if (isOver(state) || state.history.length === 0) return null;

  const changes = state.history.pop();
  for (const { cell, from } of changes) state.marks[cell] = from;
  state.moveCount = Math.max(0, state.moveCount - 1);
  return changes;
}

// Wipes the board but deliberately keeps `mistakes` — Clear is a
// "let me rethink this" button, not a fresh run. Restart resets lives.
function clearAllMarks(state) {
  if (isOver(state)) return state;
  state.marks = createMarkState(state.N);
  return state;
}

function catCellsOf(state) {
  const cells = [];
  for (let i = 0; i < state.marks.length; i++) {
    if (state.marks[i] === MARK.CAT) cells.push(i);
  }
  return cells;
}

function checkWin(state, now = Date.now()) {
  if (isOver(state)) return state.won;

  const catCells = catCellsOf(state);
  if (catCells.length !== state.N) return false;

  const cats = catCells.map((cell) => rowColOf(state.N, cell));
  if (!isValidSolution(state.N, state.regionOf, cats)) return false;

  state.won = true;
  state.endTime = now;
  return true;
}

function getElapsedMs(state, now = Date.now()) {
  const end = isOver(state) ? state.endTime : now;
  return end - state.startTime;
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Wordle-style shareable result: each region gets a fixed emoji (cycling
// through REGION_EMOJI by regionOf % length), cat cells show as paw prints.
const REGION_EMOJI = ["\u{1F7E5}", "\u{1F7E7}", "\u{1F7E8}", "\u{1F7E9}", "\u{1F7E6}", "\u{1F7EA}", "\u{1F7EB}", "⬛", "⬜", "\u{1F536}"];

function buildShareText(state, difficultyName, now = Date.now()) {
  const lines = [];
  for (let row = 0; row < state.N; row++) {
    let line = "";
    for (let col = 0; col < state.N; col++) {
      const cell = cellIndex(state.N, row, col);
      line += state.marks[cell] === MARK.CAT ? "\u{1F43E}" : REGION_EMOJI[state.regionOf[cell] % REGION_EMOJI.length];
    }
    lines.push(line);
  }
  const elapsedMs = getElapsedMs(state, now);
  const header = `Catdoku — ${difficultyName} (${state.N}×${state.N})`;
  const statLine = `Solved in ${formatTime(elapsedMs)} · ${state.moveCount} move${state.moveCount === 1 ? "" : "s"}`;
  return [header, statLine, "", ...lines].join("\n");
}

// Delegates to the solver for the next logical deduction, given the
// player's current marks. Never mutates marks — only reveals where to look.
function requestHint(state) {
  if (state.won) return { type: "solved" };
  if (state.lost) return { type: "lost" };

  const hint = CatdokuSolver.getHint(state.N, state.regionOf, state.marks);
  if (hint.type === "place" || hint.type === "eliminate") {
    state.hintsUsed++;
  }
  return hint;
}

// Serializes an in-progress (unwon) game for localStorage. Stores elapsed
// time rather than the raw startTime, so a resumed game reads as "paused"
// across the gap instead of the clock having run the whole time app was closed.
function toSaveData(state, now = Date.now()) {
  return {
    version: 2,
    N: state.N,
    regionOf: state.regionOf,
    solution: state.solution,
    maxTierUsed: state.maxTierUsed,
    difficultyKey: state.difficultyKey,
    marks: state.marks,
    history: state.history,
    moveCount: state.moveCount,
    hintsUsed: state.hintsUsed,
    mistakes: state.mistakes,
    maxMistakes: state.maxMistakes,
    elapsedMsAtSave: getElapsedMs(state, now),
  };
}

function fromSaveData(saved, now = Date.now()) {
  return {
    N: saved.N,
    regionOf: saved.regionOf,
    solution: saved.solution,
    maxTierUsed: saved.maxTierUsed,
    difficultyKey: saved.difficultyKey,
    marks: saved.marks,
    history: saved.history,
    moveCount: saved.moveCount,
    hintsUsed: saved.hintsUsed || 0,
    // Mistakes ride along in the save, so closing the app mid-run and
    // resuming doesn't quietly hand back the lives you already spent.
    mistakes: saved.mistakes || 0,
    maxMistakes: saved.maxMistakes || MAX_MISTAKES,
    startTime: now - saved.elapsedMsAtSave,
    endTime: null,
    won: false,
    lost: false,
  };
}

const gameApi = {
  MAX_MISTAKES,
  createGameState,
  restartGameState,
  applyChanges,
  toggleCell,
  placeCat,
  isSolutionCell,
  isOver,
  undoLastMove,
  revertLastCommit,
  clearAllMarks,
  checkWin,
  getElapsedMs,
  formatTime,
  buildShareText,
  requestHint,
  catCellsOf,
  toSaveData,
  fromSaveData,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = gameApi;
} else if (typeof window !== "undefined") {
  window.CatdokuGame = gameApi;
}

})();
