// Tiered deduction solver for Catdoku, mapped to the Territory/rank difficulty
// ladder. Pure logic — no DOM access — runnable under plain `node`.

const { cellIndex, rowColOf } = require("./board.js");

const TIER = Object.freeze({
  LAP_CAT: 1,
  WINDOWSILL_WATCHER: 2,
  YARD_PATROLLER: 3,
  ALLEY_PROWLER: 4,
  ROOFTOP_SNIPER: 5,
  APEX_PREDATOR: 6,
});

function createSolverState(N, regionOf) {
  const cellsInRow = Array.from({ length: N }, (_, r) =>
    Array.from({ length: N }, (_, c) => cellIndex(N, r, c))
  );
  const cellsInCol = Array.from({ length: N }, (_, c) =>
    Array.from({ length: N }, (_, r) => cellIndex(N, r, c))
  );
  const cellsInRegion = Array.from({ length: N }, () => []);
  for (let i = 0; i < regionOf.length; i++) cellsInRegion[regionOf[i]].push(i);

  return {
    N,
    regionOf,
    candidate: new Array(N * N).fill(true),
    catOfRow: new Array(N).fill(-1),
    colUsed: new Array(N).fill(false),
    regionUsed: new Array(N).fill(false),
    cellsInRow,
    cellsInCol,
    cellsInRegion,
  };
}

function cloneState(state) {
  return {
    ...state,
    candidate: state.candidate.slice(),
    catOfRow: state.catOfRow.slice(),
    colUsed: state.colUsed.slice(),
    regionUsed: state.regionUsed.slice(),
    // cellsInRow/cellsInCol/cellsInRegion/regionOf are static — safe to share.
  };
}

function candidatesIn(state, cells) {
  return cells.filter((cell) => state.candidate[cell]);
}

function placeCat(state, cell) {
  const { N, regionOf } = state;
  const { row, col } = rowColOf(N, cell);
  const regionId = regionOf[cell];

  state.catOfRow[row] = col;
  state.colUsed[col] = true;
  state.regionUsed[regionId] = true;

  for (const c of state.cellsInRow[row]) if (c !== cell) state.candidate[c] = false;
  for (const c of state.cellsInCol[col]) if (c !== cell) state.candidate[c] = false;
  for (const c of state.cellsInRegion[regionId]) if (c !== cell) state.candidate[c] = false;

  const diagonalOffsets = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diagonalOffsets) {
    const r2 = row + dr;
    const c2 = col + dc;
    if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) {
      state.candidate[cellIndex(N, r2, c2)] = false;
    }
  }
}

function isSolved(state) {
  return state.catOfRow.every((c) => c !== -1);
}

function hasContradiction(state) {
  const { N } = state;
  for (let r = 0; r < N; r++) {
    if (state.catOfRow[r] === -1 && candidatesIn(state, state.cellsInRow[r]).length === 0) return true;
  }
  for (let c = 0; c < N; c++) {
    if (!state.colUsed[c] && candidatesIn(state, state.cellsInCol[c]).length === 0) return true;
  }
  for (let g = 0; g < N; g++) {
    if (!state.regionUsed[g] && candidatesIn(state, state.cellsInRegion[g]).length === 0) return true;
  }
  return false;
}

// --- Tier 1 (Lap Cat): region / row / column forced singles ---
function tryTier1(state) {
  const { N } = state;
  for (let g = 0; g < N; g++) {
    if (state.regionUsed[g]) continue;
    const cands = candidatesIn(state, state.cellsInRegion[g]);
    if (cands.length === 1) {
      placeCat(state, cands[0]);
      return true;
    }
  }
  for (let r = 0; r < N; r++) {
    if (state.catOfRow[r] !== -1) continue;
    const cands = candidatesIn(state, state.cellsInRow[r]);
    if (cands.length === 1) {
      placeCat(state, cands[0]);
      return true;
    }
  }
  for (let c = 0; c < N; c++) {
    if (state.colUsed[c]) continue;
    const cands = candidatesIn(state, state.cellsInCol[c]);
    if (cands.length === 1) {
      placeCat(state, cands[0]);
      return true;
    }
  }
  return false;
}

// --- Group descriptors shared by tiers 2-5 ---
function regionGroups(state) {
  return state.cellsInRegion.map((cells, id) => ({ id, cells, isUsed: () => state.regionUsed[id] }));
}
function rowGroups(state) {
  return state.cellsInRow.map((cells, id) => ({ id, cells, isUsed: () => state.catOfRow[id] !== -1 }));
}
function colGroups(state) {
  return state.cellsInCol.map((cells, id) => ({ id, cells, isUsed: () => state.colUsed[id] }));
}
function regionIdOf(state, cell) {
  return state.regionOf[cell];
}
function rowIdOf(state, cell) {
  return rowColOf(state.N, cell).row;
}
function colIdOf(state, cell) {
  return rowColOf(state.N, cell).col;
}

function combinationsOf(items, k) {
  const results = [];
  function build(start, combo) {
    if (combo.length === k) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      build(i + 1, combo);
      combo.pop();
    }
  }
  build(0, []);
  return results;
}

// Generic confinement technique: if k groups of type A have their combined
// remaining candidates confined to exactly k groups of type B, no other
// type-A group may place its cat in those type-B groups — eliminate.
function tryConfinement(state, k, groupsA, idOfA, groupsB, idOfB) {
  const unusedA = groupsA.filter((g) => !g.isUsed());
  if (unusedA.length < k) return false;

  for (const combo of combinationsOf(unusedA, k)) {
    const unionCands = [];
    for (const g of combo) unionCands.push(...candidatesIn(state, g.cells));
    if (unionCands.length === 0) continue;

    const touchedB = new Set(unionCands.map((cell) => idOfB(state, cell)));
    if (touchedB.size !== k) continue;

    const comboIds = new Set(combo.map((g) => g.id));
    let progress = false;
    for (const bId of touchedB) {
      for (const cell of groupsB[bId].cells) {
        if (state.candidate[cell] && !comboIds.has(idOfA(state, cell))) {
          state.candidate[cell] = false;
          progress = true;
        }
      }
    }
    if (progress) return true;
  }
  return false;
}

// --- Tier 2 (Windowsill Watcher): a region confined to one row/column ---
function tryWindowsillWatcher(state) {
  return (
    tryConfinement(state, 1, regionGroups(state), regionIdOf, rowGroups(state), rowIdOf) ||
    tryConfinement(state, 1, regionGroups(state), regionIdOf, colGroups(state), colIdOf)
  );
}

// --- Tier 3 (Yard Patroller): a row/column confined to a single region ---
function tryYardPatroller(state) {
  return (
    tryConfinement(state, 1, rowGroups(state), rowIdOf, regionGroups(state), regionIdOf) ||
    tryConfinement(state, 1, colGroups(state), colIdOf, regionGroups(state), regionIdOf)
  );
}

// --- Tier 4 (Alley Prowler) / Tier 5 (Rooftop Sniper): k-way region/line subsets ---
function tryRegionLineSubset(state, k) {
  const regions = regionGroups(state);
  const rows = rowGroups(state);
  const cols = colGroups(state);
  return (
    tryConfinement(state, k, regions, regionIdOf, rows, rowIdOf) ||
    tryConfinement(state, k, regions, regionIdOf, cols, colIdOf) ||
    tryConfinement(state, k, rows, rowIdOf, regions, regionIdOf) ||
    tryConfinement(state, k, cols, colIdOf, regions, regionIdOf)
  );
}

// --- Tier 6 (Apex Predator): bounded trial-deduction ---
// Hypothesize a cat at a remaining candidate, propagate tiers 1-5 only (no
// nested trial-deduction), and permanently eliminate the candidate if the
// hypothesis leads to a contradiction. Still logic — never a guess that's kept.
function tryApexPredator(state) {
  const { N } = state;
  for (let cell = 0; cell < N * N; cell++) {
    if (!state.candidate[cell]) continue;
    const { row } = rowColOf(N, cell);
    if (state.catOfRow[row] !== -1) continue;

    const trial = cloneState(state);
    placeCat(trial, cell);
    const outcome = runToFixpoint(trial, { includeTrial: false });

    if (outcome.contradiction) {
      state.candidate[cell] = false;
      return true;
    }
  }
  return false;
}

function buildTierFns(state, { includeTrial }) {
  const tiers = [
    { tier: TIER.LAP_CAT, fn: () => tryTier1(state) },
    { tier: TIER.WINDOWSILL_WATCHER, fn: () => tryWindowsillWatcher(state) },
    { tier: TIER.YARD_PATROLLER, fn: () => tryYardPatroller(state) },
    { tier: TIER.ALLEY_PROWLER, fn: () => tryRegionLineSubset(state, 2) },
    { tier: TIER.ROOFTOP_SNIPER, fn: () => tryRegionLineSubset(state, 3) },
  ];
  if (includeTrial) {
    tiers.push({ tier: TIER.APEX_PREDATOR, fn: () => tryApexPredator(state) });
  }
  return tiers;
}

function runToFixpoint(state, { includeTrial }) {
  const tiers = buildTierFns(state, { includeTrial });
  let maxTierUsed = 0;

  while (true) {
    if (hasContradiction(state)) return { contradiction: true, maxTierUsed };
    if (isSolved(state)) return { contradiction: false, maxTierUsed };

    let progressed = false;
    for (const { tier, fn } of tiers) {
      if (fn()) {
        maxTierUsed = Math.max(maxTierUsed, tier);
        progressed = true;
        break;
      }
    }
    if (!progressed) return { contradiction: false, maxTierUsed, stuck: true };
  }
}

function solve(N, regionOf) {
  const state = createSolverState(N, regionOf);
  const outcome = runToFixpoint(state, { includeTrial: true });

  return {
    solved: isSolved(state) && !outcome.contradiction,
    contradiction: outcome.contradiction,
    maxTierUsed: outcome.maxTierUsed,
    cats: isSolved(state) ? state.catOfRow.map((col, row) => ({ row, col })) : null,
  };
}

// Independent brute-force search — never used to solve puzzles for players,
// only to cross-check the deduction solver during generation. Returns up to
// `cap` distinct solutions, each a row-ordered array of {row, col}.
function findSolutions(N, regionOf, cap = 2) {
  const colUsed = new Array(N).fill(false);
  const regionUsed = new Array(N).fill(false);
  const catCol = new Array(N).fill(-1);
  const solutions = [];

  function backtrack(row) {
    if (solutions.length >= cap) return;
    if (row === N) {
      solutions.push(catCol.map((col, r) => ({ row: r, col })));
      return;
    }
    for (let col = 0; col < N; col++) {
      if (colUsed[col]) continue;
      const regionId = regionOf[cellIndex(N, row, col)];
      if (regionUsed[regionId]) continue;
      if (row > 0 && catCol[row - 1] !== -1 && Math.abs(catCol[row - 1] - col) === 1) continue;

      catCol[row] = col;
      colUsed[col] = true;
      regionUsed[regionId] = true;

      backtrack(row + 1);

      colUsed[col] = false;
      regionUsed[regionId] = false;
      catCol[row] = -1;

      if (solutions.length >= cap) return;
    }
  }

  backtrack(0);
  return solutions;
}

function countSolutions(N, regionOf, cap = 2) {
  return findSolutions(N, regionOf, cap).length;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TIER,
    solve,
    countSolutions,
    findSolutions,
    _internal: {
      createSolverState,
      cloneState,
      placeCat,
      isSolved,
      hasContradiction,
      tryTier1,
      tryWindowsillWatcher,
      tryYardPatroller,
      tryAlleyProwler: (state) => tryRegionLineSubset(state, 2),
      tryRooftopSniper: (state) => tryRegionLineSubset(state, 3),
      tryApexPredator,
      runToFixpoint,
    },
  };
}
