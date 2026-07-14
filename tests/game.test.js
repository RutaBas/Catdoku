const { MARK } = require("../js/board.js");
const {
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
} = require("../js/game.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");

// 4x4 puzzle, four 2x2 block regions, with a known valid solution.
const puzzle = {
  N: 4,
  regionOf: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
  solution: [
    { row: 0, col: 1 },
    { row: 1, col: 3 },
    { row: 2, col: 0 },
    { row: 3, col: 2 },
  ],
  maxTierUsed: 1,
};

console.log("tapCell(): cycles EMPTY -> X -> CAT -> EMPTY");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertEqual(state.marks[5], MARK.EMPTY, "starts empty");
  tapCell(state, 5);
  assertEqual(state.marks[5], MARK.X, "first tap -> X");
  tapCell(state, 5);
  assertEqual(state.marks[5], MARK.CAT, "second tap -> CAT");
  tapCell(state, 5);
  assertEqual(state.marks[5], MARK.EMPTY, "third tap -> back to EMPTY");
  assertEqual(state.moveCount, 3, "each tap increments the move counter");
}

console.log("\nundoLastMove(): reverts the most recent tap");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  tapCell(state, 2); // EMPTY -> X
  tapCell(state, 2); // X -> CAT
  undoLastMove(state);
  assertEqual(state.marks[2], MARK.X, "undo reverts CAT back to X");
  undoLastMove(state);
  assertEqual(state.marks[2], MARK.EMPTY, "undo reverts X back to EMPTY");
  assertEqual(state.history.length, 0, "history is empty after undoing every move");
}

console.log("\nundoLastMove(): no-op on empty history");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  undoLastMove(state);
  assertEqual(state.moveCount, 0, "undoing with nothing to undo leaves state untouched");
}

console.log("\nclearAllMarks(): wipes marks without touching history or move count");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  tapCell(state, 0);
  tapCell(state, 1);
  clearAllMarks(state);
  assertTrue(state.marks.every((m) => m === MARK.EMPTY), "every cell reset to empty");
  assertEqual(state.moveCount, 2, "move count is untouched by clear");
  assertEqual(state.history.length, 2, "history is untouched by clear");
}

console.log("\ncheckWin(): true for the actual solution, false for an incomplete or wrong placement");
{
  const winState = createGameState(puzzle, "lapCat", 1000);
  for (const { row, col } of puzzle.solution) {
    tapCell(winState, row * 4 + col); // -> X
    tapCell(winState, row * 4 + col); // -> CAT
  }
  assertTrue(winState.won, "placing the exact solution triggers a win");

  const incompleteState = createGameState(puzzle, "lapCat", 1000);
  tapCell(incompleteState, 0);
  tapCell(incompleteState, 0); // one CAT placed, three short
  assertFalse(incompleteState.won, "an incomplete placement does not win");

  const wrongState = createGameState(puzzle, "lapCat", 1000);
  // Place 4 cats, but two in the same row (row 0): definitely invalid.
  for (const cell of [0, 1, 8, 12]) {
    tapCell(wrongState, cell);
    tapCell(wrongState, cell);
  }
  assertFalse(wrongState.won, "four cats that violate row/col/region rules do not win");
}

console.log("\ntapCell(): does nothing once the game is already won");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  for (const { row, col } of puzzle.solution) {
    tapCell(state, row * 4 + col);
    tapCell(state, row * 4 + col);
  }
  assertTrue(state.won, "sanity: game is won");
  const moveCountAtWin = state.moveCount;
  tapCell(state, 0);
  assertEqual(state.moveCount, moveCountAtWin, "tapping after a win is ignored");
}

console.log("\ngetElapsedMs(): freezes at the win time, keeps ticking otherwise");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertEqual(getElapsedMs(state, 4000), 3000, "elapsed time while playing uses the provided 'now'");

  for (const { row, col } of puzzle.solution) {
    tapCell(state, row * 4 + col);
    tapCell(state, row * 4 + col);
  }
  // Win happened using the real Date.now() inside tapCell/checkWin, so just
  // confirm elapsed time no longer grows once won, regardless of 'now'.
  const elapsedRightAfterWin = getElapsedMs(state, state.endTime);
  const elapsedMuchLater = getElapsedMs(state, state.endTime + 60000);
  assertEqual(elapsedRightAfterWin, elapsedMuchLater, "elapsed time is frozen once the game is won");
}

console.log("\nrestartGameState(): same puzzle, fresh marks/history/timer");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  tapCell(state, 0);
  tapCell(state, 1);
  const restarted = restartGameState(state, 5000);
  assertTrue(restarted.marks.every((m) => m === MARK.EMPTY), "restarted board is empty");
  assertEqual(restarted.history.length, 0, "restarted history is empty");
  assertEqual(restarted.moveCount, 0, "restarted move count is zero");
  assertEqual(restarted.startTime, 5000, "restarted timer starts at the new 'now'");
  assertEqual(restarted.regionOf, state.regionOf, "restarted state keeps the same puzzle regions");
}

console.log("\nrequestHint(): delegates to the solver and tracks hintsUsed");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  tapCell(state, 4); // (1,0) -> X, region0's other row-1 candidate
  tapCell(state, 5); // (1,1) -> X, region0 now confined to row0
  const hint = requestHint(state);
  assertEqual(hint.type, "eliminate", "solver finds an elimination from these marks");
  assertEqual(state.hintsUsed, 1, "an actionable hint increments hintsUsed");

  requestHint(state);
  assertEqual(state.hintsUsed, 2, "each actionable hint call increments hintsUsed again");
}

console.log("\nrequestHint(): returns 'solved' and does not touch hintsUsed once the game is won");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  for (const { row, col } of puzzle.solution) {
    tapCell(state, row * 4 + col);
    tapCell(state, row * 4 + col);
  }
  assertTrue(state.won, "sanity: game is won");
  const hint = requestHint(state);
  assertEqual(hint.type, "solved", "hint short-circuits once the game is already won");
  assertEqual(state.hintsUsed, 0, "hintsUsed is untouched when the game is already solved");
}

console.log("\nformatTime(): m:ss, floors to whole seconds, never goes negative");
{
  assertEqual(formatTime(0), "0:00", "zero ms");
  assertEqual(formatTime(59000), "0:59", "under a minute");
  assertEqual(formatTime(60000), "1:00", "exactly a minute rolls over");
  assertEqual(formatTime(3661000), "61:01", "no hour rollover, just accumulates minutes");
  assertEqual(formatTime(1999), "0:01", "floors to whole seconds rather than rounding up");
  assertEqual(formatTime(-500), "0:00", "never goes negative");
}

console.log("\nbuildShareText(): one emoji-grid line per row, one paw print per placed cat, header/stats present");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  for (const { row, col } of puzzle.solution) {
    tapCell(state, row * 4 + col);
    tapCell(state, row * 4 + col);
  }
  assertTrue(state.won, "sanity: game is won");

  const text = buildShareText(state, "Lap Cat", state.endTime);
  const lines = text.split("\n");
  assertTrue(lines[0].includes("Lap Cat") && lines[0].includes("4×4"), "header names the difficulty and grid size");
  assertTrue(lines[1].includes("move"), "second line reports the move count");
  const gridLines = lines.slice(3);
  assertEqual(gridLines.length, 4, "one grid line per board row");
  assertTrue(gridLines.every((line) => [...line].length === 4), "each grid line has one symbol per column");
  const pawCount = (text.match(/\u{1F43E}/gu) || []).length;
  assertEqual(pawCount, 4, "one paw print per placed cat, matching N");
}

summary();
