const { validateRegions, isValidSolution } = require("../js/board.js");
const { solve, countSolutions } = require("../js/solver.js");
const { mulberry32 } = require("../js/rng.js");
const {
  DIFFICULTY_LEVELS,
  generateCatPlacement,
  growRegions,
  generatePuzzle,
} = require("../js/generator.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");

console.log("generateCatPlacement(): produces a valid, non-adjacent permutation");
{
  const rng = mulberry32(42);
  for (let n = 5; n <= 10; n++) {
    const placement = generateCatPlacement(n, rng);
    assertTrue(placement !== null, `N=${n}: a placement was found`);
    const cols = placement.map((p) => p.col);
    assertEqual(new Set(cols).size, n, `N=${n}: all columns distinct`);
    let adjacencyOk = true;
    for (let i = 1; i < placement.length; i++) {
      if (Math.abs(placement[i].col - placement[i - 1].col) === 1) adjacencyOk = false;
    }
    assertTrue(adjacencyOk, `N=${n}: no diagonally-adjacent successive rows`);
  }
}

console.log("\ngrowRegions(): always produces a valid, fully-tiled region map");
{
  const rng = mulberry32(7);
  for (let n = 5; n <= 10; n++) {
    const placement = generateCatPlacement(n, rng);
    const regionOf = growRegions(n, placement, rng);
    assertTrue(validateRegions(n, regionOf), `N=${n}: grown regions form a valid tiling`);
    // The seed cat placement must still sit in its own region after growth.
    const seedsOk = placement.every(
      ({ row, col }, regionId) => regionOf[row * n + col] === regionId
    );
    assertTrue(seedsOk, `N=${n}: seed cats remain in their own region after growth`);
  }
}

console.log("\ngeneratePuzzle(): small per-tier sanity batch, each independently re-verified");
console.log("(the full 100-per-tier stress batch from the spec lives in scripts/check-generation.js — some");
console.log(" tiers, especially Rooftop Sniper, are rare enough that 100 puzzles can take a while to find)");
for (const level of DIFFICULTY_LEVELS) {
  let successes = 0;
  const batchSize = 2;
  for (let i = 0; i < batchSize; i++) {
    const puzzle = generatePuzzle({ N: level.N, targetTier: level.tier, seed: level.tier * 1000 + i, maxAttempts: 20000 });
    if (!puzzle) continue;
    successes++;

    assertTrue(
      validateRegions(puzzle.N, puzzle.regionOf),
      `${level.name} #${i}: regions form a valid tiling`
    );
    assertEqual(
      countSolutions(puzzle.N, puzzle.regionOf, 2),
      1,
      `${level.name} #${i}: independently confirmed unique solution`
    );
    assertTrue(
      isValidSolution(puzzle.N, puzzle.regionOf, puzzle.solution),
      `${level.name} #${i}: returned solution passes the full-solution validator`
    );

    const reSolved = solve(puzzle.N, puzzle.regionOf);
    assertTrue(reSolved.solved, `${level.name} #${i}: re-solving by deduction alone still succeeds (no backtracking needed)`);
    assertEqual(
      reSolved.maxTierUsed,
      level.tier,
      `${level.name} #${i}: requires exactly the target technique tier (${level.tier}), not easier or harder`
    );
  }
  assertEqual(successes, batchSize, `${level.name}: generated all ${batchSize} requested puzzles within the attempt cap`);
}

summary();
