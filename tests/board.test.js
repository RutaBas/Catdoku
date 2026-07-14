const {
  MARK,
  validateRegions,
  createMarkState,
  cycleMark,
  isDiagonallyAdjacent,
  isValidSolution,
} = require("../js/board.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");

console.log("Adjacency validator");
assertTrue(
  isDiagonallyAdjacent(3, 3, 4, 4),
  "cat at (3,3) and cat at (4,4) are diagonally adjacent -> invalid touch detected"
);
assertFalse(
  isDiagonallyAdjacent(3, 3, 5, 5),
  "cat at (3,3) and cat at (5,5) are not adjacent -> valid"
);

console.log("\nFull-solution validator");
// A 4x4 grid where each region is one full row (trivially valid tiling),
// paired with a diagonal-safe permutation solution (rows 0-3, cols 1,3,0,2).
const N = 4;
const regionOf = [
  0, 0, 0, 0,
  1, 1, 1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3,
];
const validSolution = [
  { row: 0, col: 1 },
  { row: 1, col: 3 },
  { row: 2, col: 0 },
  { row: 3, col: 2 },
];
assertTrue(
  isValidSolution(N, regionOf, validSolution),
  "one cat per row/col/region with no adjacency violation -> true"
);

const rowCollisionSolution = [
  { row: 0, col: 1 },
  { row: 0, col: 3 }, // swapped into row 0, colliding with the first cat's row
  { row: 2, col: 0 },
  { row: 3, col: 2 },
];
assertFalse(
  isValidSolution(N, regionOf, rowCollisionSolution),
  "two cats swapped into the same row -> false"
);

console.log("\nRegion validator");
assertTrue(
  validateRegions(N, regionOf),
  "four contiguous row-regions exactly tiling a 4x4 grid -> valid"
);

const disconnectedRegionOf = [
  0, 1, 0, 1,
  1, 1, 1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3,
];
assertFalse(
  validateRegions(N, disconnectedRegionOf),
  "region 0 split into two disconnected cells -> invalid"
);

console.log("\nMark-state cycling");
const marks = createMarkState(2);
assertEqual(marks.length, 4, "createMarkState(2) allocates 2x2=4 cells");
assertEqual(marks[0], MARK.EMPTY, "cells start EMPTY");
assertEqual(cycleMark(MARK.EMPTY), MARK.X, "EMPTY cycles to X");
assertEqual(cycleMark(MARK.X), MARK.CAT, "X cycles to CAT");
assertEqual(cycleMark(MARK.CAT), MARK.EMPTY, "CAT cycles back to EMPTY");

summary();
