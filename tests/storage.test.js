const {
  saveGame,
  loadGame,
  clearSave,
  loadStats,
  recordGameStarted,
  recordWin,
  getStatsForDifficulty,
  loadSettings,
  saveSettings,
} = require("../js/storage.js");
const { createGameState, toggleCell, placeCat, toSaveData, fromSaveData } = require("../js/game.js");
const { assertTrue, assertFalse, assertEqual, summary } = require("./assert.js");

function fakeStore() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const puzzle = {
  N: 4,
  regionOf: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
  solution: [
    { row: 0, col: 1 },
    { row: 1, col: 3 },
    { row: 2, col: 0 },
    { row: 3, col: 2 },
  ],
  maxTierUsed: 1,
};

console.log("saveGame()/loadGame(): round-trips an in-progress game");
{
  const store = fakeStore();
  assertEqual(loadGame(store), null, "no save yet -> null");

  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, 0);
  toggleCell(state, 5);
  const saveData = toSaveData(state, 4000); // 3000ms elapsed
  saveGame(saveData, store);

  const loaded = loadGame(store);
  assertEqual(loaded.difficultyKey, "lapCat", "difficulty key round-trips");
  assertEqual(loaded.elapsedMsAtSave, 3000, "elapsed time at save round-trips");
  assertEqual(JSON.stringify(loaded.marks), JSON.stringify(state.marks), "marks round-trip");
}

console.log("\nfromSaveData(): resumes as if paused across the closed-app gap");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  toggleCell(state, 0);
  const saveData = toSaveData(state, 6000); // 5000ms elapsed at save time
  // Resume "an hour later" -> elapsed time should still read ~5000ms, not ~1hr+5000ms.
  const resumed = fromSaveData(saveData, 6000 + 3600000);
  assertEqual(6000 + 3600000 - resumed.startTime, 5000, "reconstructed startTime preserves elapsed time, not wall-clock gap");
  assertEqual(resumed.won, false, "resumed game is never in a won state");
  assertEqual(resumed.moveCount, 1, "move count carries over");
}

console.log("\ntoSaveData()/fromSaveData(): spent lives survive a close-and-resume");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  placeCat(state, 0); // (0,0) is not in this puzzle's solution -> a mistake
  assertEqual(state.mistakes, 1, "sanity: one life spent");

  const resumed = fromSaveData(toSaveData(state, 4000), 9000);
  assertEqual(resumed.mistakes, 1, "resuming does not quietly hand the life back");
  assertEqual(resumed.maxMistakes, 3, "the mistake allowance carries over");
  assertEqual(resumed.lost, false, "a resumable save is never a lost one");
}

console.log("\nfromSaveData(): tolerates a save with no mistake fields");
{
  const state = createGameState(puzzle, "lapCat", 1000);
  const saveData = toSaveData(state, 4000);
  delete saveData.mistakes;
  delete saveData.maxMistakes;
  const resumed = fromSaveData(saveData, 4000);
  assertEqual(resumed.mistakes, 0, "missing mistake count defaults to 0");
  assertEqual(resumed.maxMistakes, 3, "missing allowance defaults to 3");
}

console.log("\nclearSave(): removes the save");
{
  const store = fakeStore();
  saveGame(toSaveData(createGameState(puzzle, "lapCat", 1000)), store);
  assertTrue(loadGame(store) !== null, "sanity: save exists");
  clearSave(store);
  assertEqual(loadGame(store), null, "save is gone after clearSave");
}

console.log("\nloadGame(): tolerates corrupted JSON instead of throwing");
{
  const store = fakeStore();
  store.setItem("catdoku.save.v1", "{not valid json");
  assertEqual(loadGame(store), null, "corrupt save is treated as no save");
}

console.log("\nstats: started/won/winRate/bestTimeMs/avgTimeMs");
{
  const store = fakeStore();
  assertEqual(getStatsForDifficulty("lapCat", store).started, 0, "starts at zero with no history");

  recordGameStarted("lapCat", store);
  recordGameStarted("lapCat", store);
  recordWin("lapCat", 5000, store);

  let stats = getStatsForDifficulty("lapCat", store);
  assertEqual(stats.started, 2, "two games started");
  assertEqual(stats.won, 1, "one win recorded");
  assertEqual(stats.winRate, 0.5, "win rate is won/started");
  assertEqual(stats.bestTimeMs, 5000, "best time is the only win so far");
  assertEqual(stats.avgTimeMs, 5000, "avg time equals the only win so far");

  recordWin("lapCat", 3000, store);
  stats = getStatsForDifficulty("lapCat", store);
  assertEqual(stats.bestTimeMs, 3000, "best time updates to the faster win");
  assertEqual(stats.avgTimeMs, 4000, "avg time averages both wins");

  const otherDifficulty = getStatsForDifficulty("apexPredator", store);
  assertEqual(otherDifficulty.started, 0, "a different difficulty's stats are independent");
  assertEqual(otherDifficulty.winRate, null, "win rate is null with zero games started, not a divide-by-zero NaN");
}

console.log("\nloadStats(): tolerates corrupted JSON instead of throwing");
{
  const store = fakeStore();
  store.setItem("catdoku.stats.v1", "not json at all");
  const stats = loadStats(store);
  assertTrue(stats && typeof stats.byDifficulty === "object", "falls back to a valid empty stats structure");
}

console.log("\nsettings: defaults, round-trip, corrupt-JSON fallback, and partial-object backfill");
{
  const store = fakeStore();
  const defaults = loadSettings(store);
  assertEqual(defaults.darkMode, true, "dark mode defaults to on, matching the app's default dark theme");
  assertEqual(defaults.sound, true, "sound defaults to on");
  assertEqual(defaults.haptics, true, "haptics defaults to on");

  saveSettings({ version: 1, darkMode: false, sound: false, haptics: true }, store);
  const loaded = loadSettings(store);
  assertEqual(loaded.darkMode, false, "darkMode round-trips");
  assertEqual(loaded.sound, false, "sound round-trips");

  store.setItem("catdoku.settings.v1", "{not valid json");
  assertEqual(loadSettings(store).darkMode, true, "corrupt settings JSON falls back to defaults");

  store.setItem("catdoku.settings.v1", JSON.stringify({ version: 1, sound: false }));
  const partial = loadSettings(store);
  assertEqual(partial.sound, false, "a stored partial settings object keeps its own values");
  assertEqual(partial.haptics, true, "a stored partial settings object backfills missing keys from defaults");
}

summary();
