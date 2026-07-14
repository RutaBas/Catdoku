// Game state (marks, undo history, timer, move counter, win detection).
// No DOM access here — keep this file runnable under plain `node`.

(function () {
const isNode = typeof module !== "undefined" && module.exports;
const CatdokuBoard = isNode ? require("./board.js") : window.CatdokuBoard;
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createGameState,
    restartGameState,
    tapCell,
    undoLastMove,
    clearAllMarks,
    checkWin,
    getElapsedMs,
    catCellsOf,
  };
} else if (typeof window !== "undefined") {
  window.CatdokuGame = {
    createGameState,
    restartGameState,
    tapCell,
    undoLastMove,
    clearAllMarks,
    checkWin,
    getElapsedMs,
    catCellsOf,
  };
}

})();
