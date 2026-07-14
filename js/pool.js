// Runtime accessor for the pre-generated puzzle pool (js/puzzle-pool.js).
// The generator (js/generator.js) is too slow for some tiers to ever run
// live in the browser — see scripts/generate-pool.js. This module just picks
// a puzzle out of that pre-built pool, cycling through it before repeating
// any puzzle within a difficulty tier.

(function () {
function pickPuzzleFromPool(pool, difficultyKey, rng, recentlyUsedIndices = []) {
  const puzzles = pool[difficultyKey];
  if (!puzzles || puzzles.length === 0) {
    throw new Error(`No puzzles in pool for difficulty: ${difficultyKey}`);
  }

  const excluded = new Set(recentlyUsedIndices);
  let candidates = puzzles.map((_, i) => i).filter((i) => !excluded.has(i));
  if (candidates.length === 0) candidates = puzzles.map((_, i) => i); // pool exhausted — start over

  const index = candidates[Math.floor(rng() * candidates.length)];
  return { index, puzzle: puzzles[index] };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickPuzzleFromPool };
} else if (typeof window !== "undefined") {
  window.CatdokuPool = { pickPuzzleFromPool };
}

})();
