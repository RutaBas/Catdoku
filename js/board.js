// Grid/region data model and pure validators for Catdoku.
// No DOM access here — keep this file runnable under plain `node`.

(function () {
const MARK = Object.freeze({ EMPTY: 0, X: 1, CAT: 2 });

function cellIndex(N, row, col) {
  return row * N + col;
}

function rowColOf(N, index) {
  return { row: Math.floor(index / N), col: index % N };
}

// regionOf: length-N*N array mapping each cell index to a region id (0..N-1).
function validateRegions(N, regionOf) {
  if (regionOf.length !== N * N) return false;

  const seen = new Set(regionOf);
  if (seen.size !== N) return false;
  for (const id of seen) {
    if (!Number.isInteger(id) || id < 0 || id >= N) return false;
  }

  // Each region must be a single 4-connected component.
  for (let regionId = 0; regionId < N; regionId++) {
    const cells = [];
    for (let i = 0; i < regionOf.length; i++) {
      if (regionOf[i] === regionId) cells.push(i);
    }
    if (cells.length === 0) return false;
    if (!isConnected(N, cells)) return false;
  }

  return true;
}

function isConnected(N, cells) {
  const cellSet = new Set(cells);
  const start = cells[0];
  const visited = new Set([start]);
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop();
    const { row, col } = rowColOf(N, current);
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];
    for (const [r, c] of neighbors) {
      if (r < 0 || r >= N || c < 0 || c >= N) continue;
      const idx = cellIndex(N, r, c);
      if (cellSet.has(idx) && !visited.has(idx)) {
        visited.add(idx);
        stack.push(idx);
      }
    }
  }

  return visited.size === cells.length;
}

function createMarkState(N) {
  return new Array(N * N).fill(MARK.EMPTY);
}

// What a plain tap/drag does to a cell. Cats are deliberately NOT reachable
// here — they need a double-tap (see game.placeCat), because a cat placed in
// the wrong cell now costs a life, and the old EMPTY->X->CAT->EMPTY cycle
// meant erasing an X passed *through* CAT and would have burned that life
// for nothing. Tapping only ever toggles X (or lifts a cat back off).
// Returns { from, to }, or null for "do nothing" — the drag code relies on
// `from` to decide which cells a stroke is allowed to touch.
function actionFor(mark) {
  if (mark === MARK.EMPTY) return { from: MARK.EMPTY, to: MARK.X };
  if (mark === MARK.X) return { from: MARK.X, to: MARK.EMPTY };
  if (mark === MARK.CAT) return { from: MARK.CAT, to: MARK.EMPTY };
  return null;
}

function isDiagonallyAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) === 1 && Math.abs(c1 - c2) === 1;
}

// cats: array of {row, col} — expected exactly N entries.
function isValidSolution(N, regionOf, cats) {
  if (cats.length !== N) return false;

  const rows = new Set();
  const cols = new Set();
  const regions = new Set();

  for (const { row, col } of cats) {
    if (row < 0 || row >= N || col < 0 || col >= N) return false;
    rows.add(row);
    cols.add(col);
    regions.add(regionOf[cellIndex(N, row, col)]);
  }

  if (rows.size !== N || cols.size !== N || regions.size !== N) return false;

  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      if (isDiagonallyAdjacent(cats[i].row, cats[i].col, cats[j].row, cats[j].col)) {
        return false;
      }
    }
  }

  return true;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MARK,
    cellIndex,
    rowColOf,
    validateRegions,
    isConnected,
    createMarkState,
    actionFor,
    isDiagonallyAdjacent,
    isValidSolution,
  };
} else if (typeof window !== "undefined") {
  window.CatdokuBoard = {
    MARK,
    cellIndex,
    rowColOf,
    validateRegions,
    isConnected,
    createMarkState,
    actionFor,
    isDiagonallyAdjacent,
    isValidSolution,
  };
}

})();
