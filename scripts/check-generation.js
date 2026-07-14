// Dev-only stress check (not part of the fast test suite): generates a
// 100-puzzle batch per difficulty tier and confirms, per the spec, that
// 0 puzzles have more than one solution and 0 require backtracking/guessing.
// Some tiers (Rooftop Sniper especially) are rare under the current
// generator, so this can take a while — run it on demand, not on every commit.
//
// Usage: node scripts/check-generation.js [batchSize]

const { validateRegions, isValidSolution } = require("../js/board.js");
const { solve, countSolutions } = require("../js/solver.js");
const { DIFFICULTY_LEVELS, generatePuzzle } = require("../js/generator.js");

const batchSize = Number(process.argv[2]) || 100;

let totalFailures = 0;

for (const level of DIFFICULTY_LEVELS) {
  const start = Date.now();
  let generated = 0;
  let nonUnique = 0;
  let needsBacktracking = 0;
  let wrongTier = 0;
  let totalAttempts = 0;

  for (let i = 0; i < batchSize; i++) {
    const puzzle = generatePuzzle({
      N: level.N,
      targetTier: level.tier,
      seed: level.tier * 1_000_000 + i,
      maxAttempts: 50000,
    });

    if (!puzzle) {
      console.log(`  ${level.name} #${i}: FAILED to generate within attempt budget`);
      continue;
    }

    generated++;
    totalAttempts += puzzle.attempts;

    if (!validateRegions(puzzle.N, puzzle.regionOf)) {
      console.log(`  ${level.name} #${i}: INVALID region tiling`);
      totalFailures++;
      continue;
    }
    if (countSolutions(puzzle.N, puzzle.regionOf, 2) !== 1) {
      nonUnique++;
      totalFailures++;
    }
    const result = solve(puzzle.N, puzzle.regionOf);
    if (!result.solved) {
      needsBacktracking++;
      totalFailures++;
    } else if (!isValidSolution(puzzle.N, puzzle.regionOf, result.cats)) {
      console.log(`  ${level.name} #${i}: solver returned an INVALID solution`);
      totalFailures++;
    } else if (result.maxTierUsed !== level.tier) {
      wrongTier++;
      totalFailures++;
    }
  }

  const ms = Date.now() - start;
  console.log(
    `${level.name} (N=${level.N}, tier=${level.tier}): ` +
      `${generated}/${batchSize} generated, ` +
      `${nonUnique} non-unique, ${needsBacktracking} needed backtracking, ${wrongTier} wrong tier, ` +
      `avg attempts/puzzle=${generated ? Math.round(totalAttempts / generated) : "n/a"}, ${ms}ms`
  );
}

console.log(`\n${totalFailures === 0 ? "PASS" : "FAIL"} — ${totalFailures} total failures across all tiers`);
process.exitCode = totalFailures === 0 ? 0 : 1;
