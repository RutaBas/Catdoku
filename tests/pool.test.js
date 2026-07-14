const { mulberry32 } = require("../js/rng.js");
const { pickPuzzleFromPool } = require("../js/pool.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");

const fakePool = {
  lapCat: [
    { N: 5, regionOf: [0], solution: [], maxTierUsed: 1 },
    { N: 5, regionOf: [1], solution: [], maxTierUsed: 1 },
    { N: 5, regionOf: [2], solution: [], maxTierUsed: 1 },
  ],
};

console.log("pickPuzzleFromPool(): returns a puzzle from the requested tier");
{
  const rng = mulberry32(1);
  const { index, puzzle } = pickPuzzleFromPool(fakePool, "lapCat", rng);
  assertTrue(index >= 0 && index < 3, "index is within the pool's range");
  assertEqual(puzzle, fakePool.lapCat[index], "returned puzzle matches the pool entry at that index");
}

console.log("\npickPuzzleFromPool(): avoids recently-used indices until the pool is exhausted");
{
  const rng = mulberry32(2);
  const { index } = pickPuzzleFromPool(fakePool, "lapCat", rng, [0, 1]);
  assertEqual(index, 2, "only the one non-excluded index can be chosen");
}

console.log("\npickPuzzleFromPool(): falls back to the full pool once everything is excluded");
{
  const rng = mulberry32(3);
  const { index } = pickPuzzleFromPool(fakePool, "lapCat", rng, [0, 1, 2]);
  assertTrue(index >= 0 && index < 3, "resets to the full pool rather than throwing");
}

console.log("\npickPuzzleFromPool(): throws for an unknown difficulty key");
{
  const rng = mulberry32(4);
  let threw = false;
  try {
    pickPuzzleFromPool(fakePool, "nonexistent", rng);
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, "unknown difficulty key raises an error rather than silently returning undefined");
}

summary();
