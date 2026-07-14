// Region generator for Catdoku. Builds a random valid cat placement, grows
// regions outward from it, then validates the result against the solver for
// uniqueness and exact difficulty-tier match before accepting it. Pure logic
// — no DOM access — runnable under plain `node`.

const { cellIndex, rowColOf, validateRegions, isConnected } = require("./board.js");
const { TIER, solve, countSolutions, findSolutions } = require("./solver.js");
const { shuffle, randomInt } = require("./rng.js");

const DIFFICULTY_LEVELS = [
  { key: "lapCat", name: "Lap Cat", tier: TIER.LAP_CAT, N: 5 },
  { key: "windowsillWatcher", name: "Windowsill Watcher", tier: TIER.WINDOWSILL_WATCHER, N: 6 },
  { key: "yardPatroller", name: "Yard Patroller", tier: TIER.YARD_PATROLLER, N: 7 },
  { key: "alleyProwler", name: "Alley Prowler", tier: TIER.ALLEY_PROWLER, N: 8 },
  { key: "rooftopSniper", name: "Rooftop Sniper", tier: TIER.ROOFTOP_SNIPER, N: 9 },
  { key: "apexPredator", name: "Apex Predator", tier: TIER.APEX_PREDATOR, N: 10 },
];

function neighborsOf(N, cell) {
  const { row, col } = rowColOf(N, cell);
  const result = [];
  if (row > 0) result.push(cellIndex(N, row - 1, col));
  if (row < N - 1) result.push(cellIndex(N, row + 1, col));
  if (col > 0) result.push(cellIndex(N, row, col - 1));
  if (col < N - 1) result.push(cellIndex(N, row, col + 1));
  return result;
}

// Backtracking search for a random valid cat placement: one per row/column,
// no diagonally-adjacent successive rows. Only consecutive rows can ever be
// diagonally adjacent, since each row/column is used exactly once.
function generateCatPlacement(N, rng) {
  const allCols = Array.from({ length: N }, (_, i) => i);
  const usedCol = new Array(N).fill(false);
  const placement = new Array(N).fill(-1);

  function backtrack(row) {
    if (row === N) return true;
    for (const col of shuffle(allCols, rng)) {
      if (usedCol[col]) continue;
      if (row > 0 && Math.abs(placement[row - 1] - col) === 1) continue;

      placement[row] = col;
      usedCol[col] = true;
      if (backtrack(row + 1)) return true;
      usedCol[col] = false;
      placement[row] = -1;
    }
    return false;
  }

  if (!backtrack(0)) return null;
  return placement.map((col, row) => ({ row, col }));
}

// Randomized region growth: start from the N seed cells (the cat placement)
// and repeatedly extend a random region into a random adjacent unclaimed
// cell until the grid is fully tiled. Regions stay connected by construction.
function growRegions(N, catPlacement, rng) {
  const regionOf = new Array(N * N).fill(-1);
  const frontier = Array.from({ length: N }, () => new Set());
  let unassigned = N * N;

  catPlacement.forEach(({ row, col }, regionId) => {
    const cell = cellIndex(N, row, col);
    regionOf[cell] = regionId;
    unassigned--;
    for (const n of neighborsOf(N, cell)) frontier[regionId].add(n);
  });

  while (unassigned > 0) {
    const growable = [];
    for (let r = 0; r < N; r++) {
      for (const c of Array.from(frontier[r])) {
        if (regionOf[c] !== -1) frontier[r].delete(c);
      }
      if (frontier[r].size > 0) growable.push(r);
    }

    if (growable.length === 0) {
      // No region can grow (shouldn't happen on a fully-connected grid, but
      // guard against pockets getting sealed off) — attach any leftover cell
      // to whichever already-assigned neighbor it touches.
      let attached = false;
      for (let cell = 0; cell < N * N && !attached; cell++) {
        if (regionOf[cell] !== -1) continue;
        for (const n of neighborsOf(N, cell)) {
          if (regionOf[n] !== -1) {
            regionOf[cell] = regionOf[n];
            unassigned--;
            for (const nn of neighborsOf(N, cell)) {
              if (regionOf[nn] === -1) frontier[regionOf[cell]].add(nn);
            }
            attached = true;
            break;
          }
        }
      }
      if (!attached) break; // fully disconnected leftover cell — should be unreachable
      continue;
    }

    const regionId = growable[randomInt(rng, growable.length)];
    const frontierCells = Array.from(frontier[regionId]);
    const cell = frontierCells[randomInt(rng, frontierCells.length)];

    regionOf[cell] = regionId;
    unassigned--;
    frontier[regionId].delete(cell);
    for (const n of neighborsOf(N, cell)) {
      if (regionOf[n] === -1) frontier[regionId].add(n);
    }
  }

  return regionOf;
}

// Random region growth alone essentially never yields a uniquely-solvable
// puzzle once N gets past ~6 (empirically ~0% even over thousands of
// attempts) — random blob shapes just don't interact tightly enough with the
// row/column constraints. So when a candidate has multiple solutions, find
// each region where an alternate solution disagrees with the seed, and erode
// one of that region's boundary cells (any cell adjacent to a different
// region, other than its own seed cell) into the neighbor. Each erosion
// strictly shrinks the region by one cell while keeping the seed solution
// valid, so repeating this — even when the erosion isn't the exact
// disagreeing cell — eventually reshapes the region enough to break every
// alternate solution.
function repairForUniqueness(N, regionOf, seedSolution, maxRepairs = 300) {
  const seedCells = new Set(seedSolution.map(({ row, col }) => cellIndex(N, row, col)));

  for (let attempt = 0; attempt < maxRepairs; attempt++) {
    const solutions = findSolutions(N, regionOf, 2);
    if (solutions.length <= 1) return regionOf;

    const alt = solutions.find((sol) => sol.some((cat, row) => cat.col !== seedSolution[row].col));
    if (!alt) return regionOf; // both "solutions" were actually the same placement

    const conflictRegions = new Set();
    for (let row = 0; row < N; row++) {
      if (alt[row].col !== seedSolution[row].col) {
        conflictRegions.add(regionOf[cellIndex(N, row, alt[row].col)]);
      }
    }

    let repaired = false;
    for (const fromRegion of conflictRegions) {
      const regionCells = [];
      for (let i = 0; i < regionOf.length; i++) if (regionOf[i] === fromRegion) regionCells.push(i);

      for (const cell of regionCells) {
        if (seedCells.has(cell)) continue; // never strip a region's own seed cell

        const neighborRegions = Array.from(
          new Set(neighborsOf(N, cell).map((n) => regionOf[n]).filter((g) => g !== fromRegion))
        );
        if (neighborRegions.length === 0) continue; // interior cell, not on a boundary

        for (const toRegion of neighborRegions) {
          regionOf[cell] = toRegion;
          const remainingCells = regionCells.filter((c) => c !== cell);
          if (isConnected(N, remainingCells)) {
            repaired = true;
            break;
          }
          regionOf[cell] = fromRegion; // revert and try the next neighboring region
        }
        if (repaired) break;
      }
      if (repaired) break;
    }

    if (!repaired) return null; // no safe erosion exists anywhere — give up on this candidate
  }

  return findSolutions(N, regionOf, 2).length === 1 ? regionOf : null;
}

// Generate → repair → validate → retry loop. Rejects any candidate that
// isn't reachable by deduction alone, or doesn't require exactly the target
// technique tier (never graded by region shape/count).
function generatePuzzle({ N, targetTier, seed, maxAttempts = 3000, rng: providedRng }) {
  const { mulberry32 } = require("./rng.js");
  const rng = providedRng || mulberry32(seed);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const catPlacement = generateCatPlacement(N, rng);
    if (!catPlacement) continue;

    let regionOf = growRegions(N, catPlacement, rng);
    if (!validateRegions(N, regionOf)) continue;

    regionOf = repairForUniqueness(N, regionOf, catPlacement);
    if (!regionOf) continue;
    if (countSolutions(N, regionOf, 2) !== 1) continue; // final independent safety net

    const result = solve(N, regionOf);
    if (!result.solved) continue;
    if (result.maxTierUsed !== targetTier) continue;

    return {
      N,
      regionOf,
      solution: result.cats,
      maxTierUsed: result.maxTierUsed,
      attempts: attempt + 1,
    };
  }

  return null;
}

function generatePuzzleForDifficulty(difficultyKey, seed, maxAttempts) {
  const level = DIFFICULTY_LEVELS.find((l) => l.key === difficultyKey);
  if (!level) throw new Error(`Unknown difficulty key: ${difficultyKey}`);
  return generatePuzzle({ N: level.N, targetTier: level.tier, seed, maxAttempts });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DIFFICULTY_LEVELS,
    generateCatPlacement,
    growRegions,
    repairForUniqueness,
    generatePuzzle,
    generatePuzzleForDifficulty,
  };
}
