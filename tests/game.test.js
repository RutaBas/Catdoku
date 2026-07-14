const { MARK } = require("../js/board.js");
const {
  createGameState,
  restartGameState,
  tapCell,
  undoLastMove,
  clearAllMarks,
  checkWin,
  getElapsedMs,
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

summary();
