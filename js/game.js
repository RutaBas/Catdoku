// Game state (marks, undo history, timer, move counter, win detection).
// No DOM access here — keep this file runnable under plain `node`.

(function () {
const isNode = typeof module !== "undefined" && module.exports;
const CatdokuBoard = isNode ? require("./board.js") : window.CatdokuBoard;
const CatdokuSolver = isNode ? require("./solver.js") : window.CatdokuSolver;
const { MARK, cellIndex, rowColOf, createMarkState, cycleMark, isValidSolution } = CatdokuBoard;

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
    hintsUsed: 0,
  };
}

// Restart the same puzzle: fresh marks/history/timer, same regionOf/solution.
function restartGameState(state, now = Date.now()) {
  return createGameState(
    { N: state.N, regionOf: state.regionOf, solution: state.solution, maxTierUsed: state.maxTierUsed },
    state.difficultyKey,
    now
  );
}

function tapCell(state, cell) {
  if (state.won) return state;

  const previousMark = state.marks[cell];
  state.marks[cell] = cycleMark(previousMark);
  state.history.push({ cell, previousMark });
  state.moveCount++;

  checkWin(state);
  return state;
}

function undoLastMove(state, now = Date.now()) {
  if (state.won || state.history.length === 0) return state;

  const { cell, previousMark } = state.history.pop();
  state.marks[cell] = previousMark;
  return state;
}

// Wipes all marks back to empty without touching history, move count, or timer.
function clearAllMarks(state) {
  if (state.won) return state;
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
  const catCells = catCellsOf(state);
  if (catCells.length !== state.N) return false;

  const cats = catCells.map((cell) => rowColOf(state.N, cell));
  if (!isValidSolution(state.N, state.regionOf, cats)) return false;

  state.won = true;
  state.endTime = now;
  return true;
}

function getElapsedMs(state, now = Date.now()) {
  const end = state.won ? state.endTime : now;
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
    version: 1,
    N: state.N,
    regionOf: state.regionOf,
    solution: state.solution,
    maxTierUsed: state.maxTierUsed,
    difficultyKey: state.difficultyKey,
    marks: state.marks,
    history: state.history,
    moveCount: state.moveCount,
    hintsUsed: state.hintsUsed,
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
    startTime: now - saved.elapsedMsAtSave,
    endTime: null,
    won: false,
  };
}

const gameApi = {
  createGameState,
  restartGameState,
  tapCell,
  undoLastMove,
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
