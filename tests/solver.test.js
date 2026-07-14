const { validateRegions, isValidSolution, MARK } = require("../js/board.js");
const { TIER, solve, countSolutions, getHint, _internal } = require("../js/solver.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");
const {
  createSolverState,
  tryTier1,
  tryWindowsillWatcher,
  tryYardPatroller,
  tryAlleyProwler,
  tryRooftopSniper,
  tryApexPredator,
  placeCat,
} = _internal;

console.log("Tier 1 (Lap Cat): region-forced single + full placeCat elimination");
{
  // Column-stripe regions on a 3x3 grid: region i = column i.
  const regionOf = [0, 1, 2, 0, 1, 2, 0, 1, 2];
  const state = createSolverState(3, regionOf);
  state.candidate[3] = false; // (1,0)
  state.candidate[6] = false; // (2,0)
  assertTrue(tryTier1(state), "region0 down to one candidate -> forced single fires");
  assertEqual(state.catOfRow[0], 0, "forced single placed the cat at (0,0)");
  assertFalse(state.candidate[4], "diagonal neighbor (1,1) eliminated by the placement");
}

console.log("\nTier 1: placeCat eliminates row, column, region, and all 4 diagonal neighbors");
{
  const regionOf = [0, 1, 2, 0, 1, 2, 0, 1, 2]; // region i = column i
  const state = createSolverState(3, regionOf);
  placeCat(state, 4); // (1,1), center cell
  const stillCandidate = state.candidate.map((v, i) => (v ? i : null)).filter((v) => v !== null);
  assertEqual(JSON.stringify(stillCandidate), JSON.stringify([4]), "only the placed cell remains a candidate");
}

console.log("\nTier 2 (Windowsill Watcher): region confined to a row eliminates other regions there");
{
  // Four 2x2 block regions on a 4x4 grid.
  const regionOf = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
  const state = createSolverState(4, regionOf);
  state.candidate[4] = false; // (1,0), region0
  state.candidate[5] = false; // (1,1), region0 -> region0 now confined to row0
  assertTrue(tryWindowsillWatcher(state), "region0 confined to row0 -> pointing elimination fires");
  assertFalse(state.candidate[2], "region1 cell (0,2) eliminated since row0 must come from region0");
  assertFalse(state.candidate[3], "region1 cell (0,3) eliminated since row0 must come from region0");
  assertTrue(state.candidate[0] && state.candidate[1], "region0's own row0 candidates remain");
}

console.log("\nTier 3 (Yard Patroller): row confined to a single region eliminates that region elsewhere");
{
  const regionOf = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
  const state = createSolverState(4, regionOf);
  state.candidate[2] = false; // (0,2), region1
  state.candidate[3] = false; // (0,3), region1 -> row0 now confined to region0
  assertTrue(tryYardPatroller(state), "row0 confined to region0 -> reverse pointing fires");
  assertFalse(state.candidate[4], "region0 cell (1,0) eliminated since row0 must supply region0's cat");
  assertFalse(state.candidate[5], "region0 cell (1,1) eliminated since row0 must supply region0's cat");
  assertTrue(state.candidate[0] && state.candidate[1], "row0's own candidates remain");
}

console.log("\nTier 4 (Alley Prowler): two regions confined to two rows eliminate other regions there");
{
  const regionOf = [
    0, 1, 2, 3, 4,
    0, 1, 2, 3, 4,
    2, 3, 4, 2, 3,
    4, 2, 3, 4, 2,
    3, 4, 2, 3, 4,
  ];
  const state = createSolverState(5, regionOf);
  assertTrue(tryAlleyProwler(state), "region0+region1 confined to rows0-1 -> pair confinement fires");
  assertFalse(state.candidate[2], "row0 region2 cell eliminated");
  assertFalse(state.candidate[3], "row0 region3 cell eliminated");
  assertFalse(state.candidate[4], "row0 region4 cell eliminated");
  assertFalse(state.candidate[7], "row1 region2 cell eliminated");
  assertFalse(state.candidate[8], "row1 region3 cell eliminated");
  assertFalse(state.candidate[9], "row1 region4 cell eliminated");
  assertTrue(
    state.candidate[0] && state.candidate[1] && state.candidate[5] && state.candidate[6],
    "region0/region1's own row0-1 candidates remain"
  );
}

console.log("\nTier 5 (Rooftop Sniper): three regions confined to three rows eliminate other regions there");
{
  const regionOf = [
    0, 1, 2, 3, 4,
    0, 1, 2, 3, 4,
    0, 1, 2, 3, 4,
    3, 4, 3, 4, 3,
    4, 3, 4, 3, 4,
  ];
  const state = createSolverState(5, regionOf);
  assertTrue(tryRooftopSniper(state), "region0+region1+region2 confined to rows0-2 -> triple confinement fires");
  assertFalse(state.candidate[3], "row0 region3 cell eliminated");
  assertFalse(state.candidate[4], "row0 region4 cell eliminated");
  assertFalse(state.candidate[8], "row1 region3 cell eliminated");
  assertFalse(state.candidate[9], "row1 region4 cell eliminated");
  assertFalse(state.candidate[13], "row2 region3 cell eliminated");
  assertFalse(state.candidate[14], "row2 region4 cell eliminated");
  assertTrue(
    [0, 1, 2, 5, 6, 7, 10, 11, 12].every((i) => state.candidate[i]),
    "region0/1/2's own row0-2 candidates remain"
  );
}

console.log("\nTier 6 (Apex Predator): hypothesis leading to a dead row is eliminated");
{
  // Column-stripe regions on a symmetric 3x3 grid: no tier1-5 progress exists
  // yet, but placing a cat at (0,0) cascades to a row with zero candidates.
  const regionOf = [0, 1, 2, 0, 1, 2, 0, 1, 2];
  const state = createSolverState(3, regionOf);
  assertTrue(tryApexPredator(state), "trial placement at (0,0) leads to contradiction -> eliminated");
  assertFalse(state.candidate[0], "candidate (0,0) permanently eliminated by trial-deduction");
  assertTrue(state.catOfRow.every((c) => c === -1), "no real cat was placed, only an elimination");
}

console.log("\nsolve(): solves a real uniquely-solvable puzzle end-to-end");
{
  // Hand-built 4x4 tiling, independently confirmed via countSolutions() to
  // have exactly one solution, reachable by deduction alone (tier 6 needed).
  const regionOf = [
    0, 0, 1, 1,
    2, 0, 1, 1,
    2, 2, 3, 1,
    2, 3, 3, 3,
  ];
  assertTrue(validateRegions(4, regionOf), "hand-built 4x4 regions form a valid tiling");
  assertEqual(countSolutions(4, regionOf, 3), 1, "independent backtracking search confirms a unique solution");

  const result = solve(4, regionOf);
  assertTrue(result.solved, "deduction solver reaches the unique solution");
  assertTrue(isValidSolution(4, regionOf, result.cats), "solver's solution passes the independent full-solution validator");
  assertEqual(result.maxTierUsed, TIER.APEX_PREDATOR, "this puzzle requires the hardest tier (Apex Predator) to crack");
}

console.log("\nsolve(): never claims a solution for an unsolvable puzzle");
{
  // Hand-built 4x4 tiling with no valid cat placement at all (independently confirmed below).
  const regionOf = [
    0, 0, 1, 1,
    2, 0, 1, 3,
    2, 0, 1, 3,
    2, 2, 3, 3,
  ];
  assertTrue(validateRegions(4, regionOf), "hand-built 4x4 regions form a valid tiling");
  assertEqual(countSolutions(4, regionOf, 3), 0, "independent backtracking search confirms no solution exists");

  const result = solve(4, regionOf);
  assertFalse(result.solved, "solver correctly refuses to claim a solution when none exists");
}

console.log("\ncountSolutions(): caps at the requested limit");
{
  // Every row its own region -> region/row constraints coincide, leaving only
  // "one cat per column, no diagonally-adjacent successive rows" to satisfy.
  // A 4x4 grid this loose has more than one such permutation.
  const regionOf = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
  const count = countSolutions(4, regionOf, 2);
  assertEqual(count, 2, "a loosely-constrained 4x4 grid has exactly 2 solutions, capped at 2");
}

console.log("\ngetHint(): reveals one elimination matching the Windowsill Watcher scenario");
{
  const regionOf = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
  const marks = new Array(16).fill(MARK.EMPTY);
  marks[4] = MARK.X; // (1,0), region0
  marks[5] = MARK.X; // (1,1), region0 -> region0 confined to row0
  const hint = getHint(4, regionOf, marks);
  assertEqual(hint.type, "eliminate", "region confined to a row -> an elimination hint");
  assertEqual(hint.cell, 2, "hint points at the specific cell the technique eliminates");
  assertEqual(hint.tier, TIER.WINDOWSILL_WATCHER, "hint reports the technique tier that found it");
}

console.log("\ngetHint(): reveals a forced placement when a region has one candidate left");
{
  const regionOf = [0, 1, 2, 0, 1, 2, 0, 1, 2]; // 3x3 column-stripe regions
  const marks = new Array(9).fill(MARK.EMPTY);
  marks[3] = MARK.X; // (1,0)
  marks[6] = MARK.X; // (2,0) -> region0 down to one candidate: (0,0)
  const hint = getHint(3, regionOf, marks);
  assertEqual(hint.type, "place", "region down to one candidate -> a placement hint");
  assertEqual(hint.cell, 0, "hint points at cell (0,0)");
  assertEqual(hint.tier, TIER.LAP_CAT, "single-candidate region is the cheapest tier");
}

console.log("\ngetHint(): reports a conflict when the player's marks can't lead to any solution");
{
  const regionOf = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
  const marks = new Array(16).fill(MARK.EMPTY);
  marks[0] = MARK.CAT; // (0,0) — placing here eliminates every region1 candidate in row0 (cells 2,3)
  marks[2] = MARK.CAT; // forcing a second cat into row0 as well: immediate contradiction
  const hint = getHint(4, regionOf, marks);
  assertEqual(hint.type, "conflict", "two cats already in the same row can never reach a solution");
}

console.log("\ngetHint(): reports solved once every row already has a cat");
{
  const regionOf = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
  const marks = new Array(16).fill(MARK.EMPTY);
  for (const cell of [1, 7, 8, 14]) marks[cell] = MARK.CAT; // a genuine valid solution for this grid
  const hint = getHint(4, regionOf, marks);
  assertEqual(hint.type, "solved", "a fully valid placement reports solved, not a further deduction");
}

summary();
