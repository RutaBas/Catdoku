const { MARK } = require("../js/board.js");
const {
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

const SOLUTION_CELLS = puzzle.solution.map(({ row, col }) => row * 4 + col); // [1, 7, 8, 14]
// Every cell not in the solution — placing a cat on any of these must be refused.
const WRONG_CELLS = [0, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 15];

const solveFully = (state) => {
  for (const cell of SOLUTION_CELLS) placeCat(state, cell);
  return state;
};

console.log("toggleCell(): toggles X on and off, never reaching CAT");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertEqual(state.marks[5], MARK.EMPTY, "starts empty");
  toggleCell(state, 5);
  assertEqual(state.marks[5], MARK.X, "first tap -> X");
  toggleCell(state, 5);
  assertEqual(state.marks[5], MARK.EMPTY, "second tap -> back to EMPTY, not CAT");
  assertEqual(state.moveCount, 2, "each tap increments the move counter");
  assertEqual(state.mistakes, 0, "toggling X costs no lives");
}

console.log("\ntoggleCell(): lifts a placed cat back off");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  placeCat(state, SOLUTION_CELLS[0]);
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.CAT, "sanity: cat is placed");
  toggleCell(state, SOLUTION_CELLS[0]);
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.EMPTY, "tapping a cat removes it");
}

console.log("\nisSolutionCell(): identifies exactly the solution cells");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertTrue(SOLUTION_CELLS.every((c) => isSolutionCell(state, c)), "every solution cell is recognised");
  assertTrue(WRONG_CELLS.every((c) => !isSolutionCell(state, c)), "no other cell is");
}

console.log("\nplaceCat(): accepts correct cells, refuses wrong ones and counts them");
{
  const state = createGameState(puzzle, "lapCat", 1000);

  const good = placeCat(state, SOLUTION_CELLS[0]);
  assertTrue(good.ok, "a cat on a solution cell is accepted");
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.CAT, "the cat lands on the board");
  assertEqual(state.mistakes, 0, "a correct cat costs nothing");

  const bad = placeCat(state, WRONG_CELLS[0]);
  assertFalse(bad.ok, "a cat off the solution is refused");
  assertEqual(bad.reason, "mistake", "the refusal is reported as a mistake");
  assertEqual(state.marks[WRONG_CELLS[0]], MARK.EMPTY, "the wrong cell is left untouched");
  assertEqual(state.mistakes, 1, "the mistake is counted");
  assertEqual(bad.remaining, 2, "the result reports remaining lives");
  assertFalse(bad.gameOver, "one mistake is not game over");
}

console.log("\nplaceCat(): a refused cat never enters history or the move count");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  placeCat(state, WRONG_CELLS[0]);
  assertEqual(state.history.length, 0, "no history entry for a refused cat");
  assertEqual(state.moveCount, 0, "no move counted for a refused cat");
  undoLastMove(state);
  assertEqual(state.mistakes, 1, "undo cannot refund a spent life");
}

console.log("\nplaceCat(): a wrong cat on an X-ed cell leaves the X alone");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, WRONG_CELLS[0]);
  assertEqual(state.marks[WRONG_CELLS[0]], MARK.X, "sanity: cell is X-ed");
  placeCat(state, WRONG_CELLS[0]);
  assertEqual(state.marks[WRONG_CELLS[0]], MARK.X, "the X survives the refused cat");
}

console.log("\nplaceCat(): a correct cat replaces an existing X");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, SOLUTION_CELLS[0]);
  const res = placeCat(state, SOLUTION_CELLS[0]);
  assertTrue(res.ok, "an X-ed solution cell still accepts a cat");
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.CAT, "X is overwritten by the cat");
  undoLastMove(state);
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.X, "undo restores the X underneath");
}

console.log("\nplaceCat(): re-placing an existing cat is a no-op, not a mistake");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  placeCat(state, SOLUTION_CELLS[0]);
  const again = placeCat(state, SOLUTION_CELLS[0]);
  assertFalse(again.ok, "placing on an existing cat reports not-ok");
  assertEqual(again.reason, "already", "reason is 'already', not 'mistake'");
  assertEqual(state.mistakes, 0, "it costs no life");
}

console.log("\nplaceCat(): three mistakes ends the game");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertEqual(state.maxMistakes, 3, "a level allows 3 mistakes");
  assertEqual(MAX_MISTAKES, 3, "MAX_MISTAKES is exported as 3");

  const first = placeCat(state, WRONG_CELLS[0]);
  assertEqual(first.remaining, 2, "2 left after the first");
  const second = placeCat(state, WRONG_CELLS[1]);
  assertEqual(second.remaining, 1, "1 left after the second");
  assertFalse(state.lost, "still alive at two mistakes");

  const third = placeCat(state, WRONG_CELLS[2]);
  assertTrue(third.gameOver, "the third mistake reports game over");
  assertEqual(third.remaining, 0, "no lives left");
  assertTrue(state.lost, "state is marked lost");
  assertTrue(isOver(state), "isOver() is true once lost");
}

console.log("\nafter a loss: the board is frozen");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  for (let i = 0; i < 3; i++) placeCat(state, WRONG_CELLS[i]);
  assertTrue(state.lost, "sanity: game is lost");

  toggleCell(state, 0);
  assertEqual(state.marks[0], MARK.EMPTY, "tapping after a loss does nothing");
  placeCat(state, SOLUTION_CELLS[0]);
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.EMPTY, "even a correct cat is refused after a loss");
  clearAllMarks(state);
  undoLastMove(state);
  assertTrue(state.lost, "a lost game stays lost");
}

console.log("\na lost game cannot be won");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  placeCat(state, SOLUTION_CELLS[0]);
  placeCat(state, SOLUTION_CELLS[1]);
  for (let i = 0; i < 3; i++) placeCat(state, WRONG_CELLS[i]);
  assertTrue(state.lost, "sanity: lost with two cats already placed");
  placeCat(state, SOLUTION_CELLS[2]);
  placeCat(state, SOLUTION_CELLS[3]);
  assertFalse(state.won, "completing the solution after a loss does not win");
}

console.log("\napplyChanges(): a whole swipe is one history entry and one move");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  const stroke = [0, 1, 2, 3].map((cell) => ({ cell, from: MARK.EMPTY, to: MARK.X }));
  applyChanges(state, stroke);

  assertTrue([0, 1, 2, 3].every((c) => state.marks[c] === MARK.X), "every cell in the stroke is painted");
  assertEqual(state.history.length, 1, "a 4-cell swipe pushes ONE history entry");
  assertEqual(state.moveCount, 1, "a 4-cell swipe counts as ONE move");

  undoLastMove(state);
  assertTrue([0, 1, 2, 3].every((c) => state.marks[c] === MARK.EMPTY), "one undo reverses the whole swipe");
  assertEqual(state.history.length, 0, "history is empty again");
}

console.log("\napplyChanges(): an empty stroke is ignored");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  applyChanges(state, []);
  assertEqual(state.history.length, 0, "no history entry for a stroke that changed nothing");
  assertEqual(state.moveCount, 0, "no move counted either");
}

console.log("\nundoLastMove(): reverts one commit at a time");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, 2); // EMPTY -> X
  placeCat(state, SOLUTION_CELLS[0]);
  undoLastMove(state);
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.EMPTY, "undo lifts the cat");
  undoLastMove(state);
  assertEqual(state.marks[2], MARK.EMPTY, "undo reverts the X");
  assertEqual(state.history.length, 0, "history is empty after undoing every move");
}

console.log("\nundoLastMove(): no-op on empty history");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  undoLastMove(state);
  assertEqual(state.moveCount, 0, "undoing with nothing to undo leaves state untouched");
}

console.log("\nrevertLastCommit(): rewinds the optimistic X behind a double-tap");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  // The first tap of a double-tap optimistically paints an X...
  toggleCell(state, SOLUTION_CELLS[0]);
  assertEqual(state.moveCount, 1, "sanity: the first tap counted a move");

  // ...and the second tap takes it back before committing the cat.
  const reverted = revertLastCommit(state);
  assertEqual(reverted.length, 1, "the reverted changes are returned for repainting");
  assertEqual(reverted[0].cell, SOLUTION_CELLS[0], "the right cell is reported");
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.EMPTY, "the X is gone");
  assertEqual(state.moveCount, 0, "the move counter is rolled back too — unlike undo");
  assertEqual(state.history.length, 0, "the history entry is gone");

  placeCat(state, SOLUTION_CELLS[0]);
  assertEqual(state.marks[SOLUTION_CELLS[0]], MARK.CAT, "the cat lands after the revert");
  assertEqual(state.moveCount, 1, "the double-tap nets out as a single move");
}

console.log("\nrevertLastCommit(): returns null with nothing to revert");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertEqual(revertLastCommit(state), null, "null on empty history");
}

console.log("\nclearAllMarks(): wipes marks but keeps history, moves, and mistakes");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, 0);
  toggleCell(state, 1);
  placeCat(state, WRONG_CELLS[0]); // burn a life
  clearAllMarks(state);
  assertTrue(state.marks.every((m) => m === MARK.EMPTY), "every cell reset to empty");
  assertEqual(state.moveCount, 2, "move count is untouched by clear");
  assertEqual(state.history.length, 2, "history is untouched by clear");
  assertEqual(state.mistakes, 1, "Clear does not refund lives — only Restart does");
}

console.log("\ncheckWin(): true for the actual solution, false when incomplete");
{
  const winState = solveFully(createGameState(puzzle, "lapCat", 1000));
  assertTrue(winState.won, "placing the exact solution triggers a win");
  assertEqual(winState.mistakes, 0, "a clean solve records no mistakes");

  const incompleteState = createGameState(puzzle, "lapCat", 1000);
  placeCat(incompleteState, SOLUTION_CELLS[0]);
  assertFalse(incompleteState.won, "an incomplete placement does not win");
}

console.log("\ncheckWin(): an invalid arrangement can no longer be built at all");
{
  // The old failure mode — four cats sharing a row — is now unreachable:
  // placeCat refuses every non-solution cell, so the board cannot hold an
  // invalid arrangement. Three attempts to build one just ends the run.
  const state = createGameState(puzzle, "lapCat", 1000);
  for (const cell of [0, 2, 3]) placeCat(state, cell); // all in row 0, all wrong
  assertTrue(state.marks.every((m) => m !== MARK.CAT), "not one wrong cat reached the board");
  assertFalse(state.won, "no win");
  assertTrue(state.lost, "three wrong cats end the run instead");
}

console.log("\ntoggleCell(): does nothing once the game is already won");
{
  const state = solveFully(createGameState(puzzle, "lapCat", 1000));
  assertTrue(state.won, "sanity: game is won");
  const moveCountAtWin = state.moveCount;
  toggleCell(state, 0);
  assertEqual(state.moveCount, moveCountAtWin, "tapping after a win is ignored");
}

console.log("\ngetElapsedMs(): freezes at the win time, keeps ticking otherwise");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  assertEqual(getElapsedMs(state, 4000), 3000, "elapsed time while playing uses the provided 'now'");

  solveFully(state);
  const elapsedRightAfterWin = getElapsedMs(state, state.endTime);
  const elapsedMuchLater = getElapsedMs(state, state.endTime + 60000);
  assertEqual(elapsedRightAfterWin, elapsedMuchLater, "elapsed time is frozen once the game is won");
}

console.log("\ngetElapsedMs(): freezes on a loss too");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  for (let i = 0; i < 2; i++) placeCat(state, WRONG_CELLS[i]);
  placeCat(state, WRONG_CELLS[2], 9000); // the losing move, at a known 'now'
  assertEqual(state.endTime, 9000, "the loss stamps endTime");
  assertEqual(getElapsedMs(state, 999999), 8000, "the clock stops at the loss, not at 'now'");
}

console.log("\nrestartGameState(): same puzzle, fresh marks/history/timer/lives");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, 0);
  placeCat(state, WRONG_CELLS[0]); // burn a life
  const restarted = restartGameState(state, 5000);
  assertTrue(restarted.marks.every((m) => m === MARK.EMPTY), "restarted board is empty");
  assertEqual(restarted.history.length, 0, "restarted history is empty");
  assertEqual(restarted.moveCount, 0, "restarted move count is zero");
  assertEqual(restarted.mistakes, 0, "Restart gives the lives back");
  assertFalse(restarted.lost, "restart clears a loss");
  assertEqual(restarted.startTime, 5000, "restarted timer starts at the new 'now'");
  assertEqual(restarted.regionOf, state.regionOf, "restarted state keeps the same puzzle regions");
}

console.log("\nrestartGameState(): revives a lost game");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  for (let i = 0; i < 3; i++) placeCat(state, WRONG_CELLS[i]);
  assertTrue(state.lost, "sanity: lost");
  const restarted = restartGameState(state, 5000);
  assertFalse(isOver(restarted), "the restarted game is playable again");
  toggleCell(restarted, 0);
  assertEqual(restarted.marks[0], MARK.X, "and it accepts input");
}

console.log("\nrequestHint(): delegates to the solver and tracks hintsUsed");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, 4); // (1,0) -> X, region0's other row-1 candidate
  toggleCell(state, 5); // (1,1) -> X, region0 now confined to row0
  const hint = requestHint(state);
  assertEqual(hint.type, "eliminate", "solver finds an elimination from these marks");
  assertEqual(state.hintsUsed, 1, "an actionable hint increments hintsUsed");

  requestHint(state);
  assertEqual(state.hintsUsed, 2, "each actionable hint call increments hintsUsed again");
}

console.log("\nrequestHint(): short-circuits on a finished game");
{
  const wonState = solveFully(createGameState(puzzle, "lapCat", 1000));
  assertEqual(requestHint(wonState).type, "solved", "hint short-circuits once the game is won");
  assertEqual(wonState.hintsUsed, 0, "hintsUsed is untouched when the game is already solved");

  const lostState = createGameState(puzzle, "lapCat", 1000);
  for (let i = 0; i < 3; i++) placeCat(lostState, WRONG_CELLS[i]);
  assertEqual(requestHint(lostState).type, "lost", "hint short-circuits once the game is lost");
  assertEqual(lostState.hintsUsed, 0, "hintsUsed is untouched on a lost game");
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

console.log("\nbuildShareText(): one emoji-grid line per row, one paw print per placed cat");
{
  const state = solveFully(createGameState(puzzle, "lapCat", 1000));
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
