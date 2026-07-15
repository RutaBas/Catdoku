// Tests for the swipe-select drag algorithm.
//
// dragApply/dragTo/endDrag live in js/ui.js because they touch the DOM, which
// node can't load. They are reproduced here verbatim (minus the renderCell
// call) and driven against a real game state — so this file verifies the
// algorithm: axis locking, interpolation across sparse pointermove events,
// "the first cell decides", and one-drag-one-undo-entry.
//
// If you change dragApply/dragTo in ui.js, mirror the change here.
const { MARK } = require("../js/board.js");
const CatdokuBoard = require("../js/board.js");
const CatdokuGame = require("../js/game.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");

let gameState, drag;
const renderCellContent = () => {}; // DOM no-op for the harness

// ---- mirrored verbatim from js/ui.js ----
function dragApply(r, c) {
  const i = CatdokuBoard.cellIndex(gameState.N, r, c);
  if (drag.applied.has(i)) return;
  drag.applied.add(i);
  if (gameState.marks[i] !== drag.action.from) return;

  gameState.marks[i] = drag.action.to;
  drag.changes.push({ cell: i, from: drag.action.from, to: drag.action.to });
  renderCellContent(i, drag.action.to);
}

function dragTo(r, c) {
  if (drag.axis === null && (r !== drag.r0 || c !== drag.c0)) {
    drag.axis = Math.abs(c - drag.c0) >= Math.abs(r - drag.r0) ? "row" : "col";
  }
  if (drag.axis === "row") r = drag.r0;
  else if (drag.axis === "col") c = drag.c0;
  else return;

  if (drag.axis === "row") {
    const step = c >= drag.lastC ? 1 : -1;
    for (let x = drag.lastC; x !== c + step; x += step) dragApply(drag.r0, x);
    drag.lastC = c;
  } else {
    const step = r >= drag.lastR ? 1 : -1;
    for (let x = drag.lastR; x !== r + step; x += step) dragApply(x, drag.c0);
    drag.lastR = r;
  }
}

function endDrag() {
  if (!drag) return null;
  const finished = drag;
  drag = null;
  if (finished.changes.length === 0) return finished;
  for (const ch of finished.changes) gameState.marks[ch.cell] = ch.from;
  CatdokuGame.applyChanges(gameState, finished.changes);
  return finished;
}
// ---- end mirrored section ----

const puzzle = {
  N: 5,
  regionOf: [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 2, 2, 3, 3, 4, 4, 2, 3, 3, 4, 4, 2, 2, 3],
  solution: [
    { row: 0, col: 0 },
    { row: 1, col: 2 },
    { row: 2, col: 4 },
    { row: 3, col: 1 },
    { row: 4, col: 3 },
  ],
  maxTierUsed: 1,
};

function startDrag(r, c) {
  const cellIdx = CatdokuBoard.cellIndex(gameState.N, r, c);
  const action = CatdokuBoard.actionFor(gameState.marks[cellIdx]);
  drag = {
    pointerId: 1,
    action,
    r0: r,
    c0: c,
    lastR: r,
    lastC: c,
    axis: null,
    applied: new Set(),
    changes: [],
  };
  dragApply(r, c);
}

const reset = () => {
  gameState = CatdokuGame.createGameState(puzzle, "lapCat", 1000);
  drag = null;
};
const marksOfRow = (row) => [0, 1, 2, 3, 4].map((c) => gameState.marks[row * 5 + c]);

console.log("a horizontal swipe paints every cell it crosses");
{
  reset();
  startDrag(1, 0);
  dragTo(1, 4); // one big jump — pointermove fires sparsely on a fast flick
  endDrag();
  assertEqual(JSON.stringify(marksOfRow(1)), JSON.stringify([1, 1, 1, 1, 1]), "all 5 cells X'd from a single jump (interpolation)");
  assertEqual(gameState.history.length, 1, "the swipe is ONE undo entry");
  assertEqual(gameState.moveCount, 1, "the swipe is ONE move");
}

console.log("\nundo reverses a whole swipe in one step");
{
  CatdokuGame.undoLastMove(gameState);
  assertEqual(JSON.stringify(marksOfRow(1)), JSON.stringify([0, 0, 0, 0, 0]), "one undo cleared all 5");
}

console.log("\naxis lock: a sloppy diagonal drag stays on one line");
{
  reset();
  startDrag(2, 0);
  dragTo(2, 3); // mostly horizontal -> locks to row
  dragTo(4, 4); // finger wanders down, but the row lock holds
  endDrag();
  assertEqual(JSON.stringify(marksOfRow(2)), JSON.stringify([1, 1, 1, 1, 1]), "the stroke stayed in row 2");
  assertEqual(JSON.stringify(marksOfRow(4)), JSON.stringify([0, 0, 0, 0, 0]), "row 4 untouched despite the finger going there");
}

console.log("\naxis lock: a vertical drag locks to the column");
{
  reset();
  startDrag(0, 2);
  dragTo(4, 2);
  endDrag();
  assertEqual(
    JSON.stringify([0, 1, 2, 3, 4].map((r) => gameState.marks[r * 5 + 2])),
    JSON.stringify([1, 1, 1, 1, 1]),
    "the whole of column 2 got X'd"
  );
  assertEqual(gameState.marks[0], MARK.EMPTY, "column 0 untouched");
}

console.log("\nfirst cell decides: a stroke started on empty never erases what it crosses");
{
  reset();
  gameState.marks[1 * 5 + 2] = MARK.X; // a pre-existing X mid-row
  gameState.marks[1 * 5 + 3] = MARK.CAT; // and a cat
  startDrag(1, 0); // starts EMPTY -> action is EMPTY->X
  dragTo(1, 4);
  endDrag();
  assertEqual(gameState.marks[1 * 5 + 2], MARK.X, "the existing X was skipped, not toggled off");
  assertEqual(gameState.marks[1 * 5 + 3], MARK.CAT, "the cat was skipped, not removed");
  assertEqual(gameState.marks[1 * 5 + 4], MARK.X, "cells past them still got painted");
}

console.log("\nfirst cell decides: a stroke started on an X erases only X's");
{
  reset();
  for (const c of [0, 1, 2]) gameState.marks[3 * 5 + c] = MARK.X;
  gameState.marks[3 * 5 + 3] = MARK.CAT;
  startDrag(3, 0); // starts on X -> action is X->EMPTY
  dragTo(3, 4);
  endDrag();
  assertEqual(
    JSON.stringify(marksOfRow(3)),
    JSON.stringify([0, 0, 0, MARK.CAT, 0]),
    "X's cleared, the cat left alone, the empty cell untouched"
  );
}

console.log("\nbacktracking over the same cells does not double-apply");
{
  reset();
  startDrag(0, 0);
  dragTo(0, 3);
  dragTo(0, 1); // finger comes back
  dragTo(0, 3); // and goes out again
  const finished = endDrag();
  assertEqual(finished.changes.length, 4, "each cell recorded exactly once despite the jitter");
  const cells = finished.changes.map((c) => c.cell).sort((a, b) => a - b);
  assertEqual(JSON.stringify(cells), JSON.stringify([0, 1, 2, 3]), "no duplicate cells in the undo entry");
}

console.log("\na reversed drag (right-to-left) interpolates correctly");
{
  reset();
  startDrag(2, 4);
  dragTo(2, 0);
  endDrag();
  assertEqual(JSON.stringify(marksOfRow(2)), JSON.stringify([1, 1, 1, 1, 1]), "dragging leftwards fills the whole row");
}

console.log("\na zero-movement stroke is just a one-cell tap");
{
  reset();
  startDrag(2, 2);
  const finished = endDrag();
  assertEqual(finished.axis, null, "axis never locked -> the UI reads this as a tap and can pair it into a double-tap");
  assertEqual(finished.changes.length, 1, "exactly one cell changed");
  assertEqual(gameState.marks[2 * 5 + 2], MARK.X, "the tapped cell got an X");
}

console.log("\nno swipe can ever win the game");
{
  reset();
  // Swipes only paint X/EMPTY, never CAT, so a swipe can't complete a solve
  // — which is exactly why a sloppy drag can't burn a life either.
  startDrag(0, 0);
  dragTo(0, 4);
  endDrag();
  assertFalse(gameState.won, "an X swipe never triggers a win");
  assertEqual(gameState.mistakes, 0, "and never costs a mistake");
}

summary();
