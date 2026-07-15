// localStorage persistence: auto-save (catdoku.save.v1), per-difficulty
// stats (catdoku.stats.v1), and settings (catdoku.settings.v1). Pure I/O —
// the store is injectable so this file stays testable under plain `node`
// (no real localStorage there).

(function () {
  // v2: history entries became arrays of changes (one entry per tap OR per
  // swipe) and saves carry a mistake count. Bumping the key rather than
  // migrating means any v1 save in the wild is simply ignored — cheaper than
  // a migration path for a half-finished puzzle.
  const SAVE_KEY = "catdoku.save.v2";
  const STATS_KEY = "catdoku.stats.v1";
  const SETTINGS_KEY = "catdoku.settings.v1";

  function defaultStore() {
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  function saveGame(saveData, store = defaultStore()) {
    if (!store) return;
    store.setItem(SAVE_KEY, JSON.stringify(saveData));
  }

  function loadGame(store = defaultStore()) {
    if (!store) return null;
    try {
      const raw = store.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSave(store = defaultStore()) {
    if (!store) return;
    store.removeItem(SAVE_KEY);
  }

  function defaultStats() {
    return { version: 1, byDifficulty: {} };
  }

  function loadStats(store = defaultStore()) {
    if (!store) return defaultStats();
    try {
      const raw = store.getItem(STATS_KEY);
      if (!raw) return defaultStats();
      const parsed = JSON.parse(raw);
      return parsed && parsed.byDifficulty ? parsed : defaultStats();
    } catch (e) {
      return defaultStats();
    }
  }

  function saveStats(stats, store = defaultStore()) {
    if (!store) return;
    store.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function entryFor(stats, difficultyKey) {
    if (!stats.byDifficulty[difficultyKey]) {
      stats.byDifficulty[difficultyKey] = { started: 0, won: 0, bestTimeMs: null, totalTimeMsForWins: 0 };
    }
    return stats.byDifficulty[difficultyKey];
  }

  function recordGameStarted(difficultyKey, store = defaultStore()) {
    const stats = loadStats(store);
    entryFor(stats, difficultyKey).started++;
    saveStats(stats, store);
    return stats;
  }

  function recordWin(difficultyKey, elapsedMs, store = defaultStore()) {
    const stats = loadStats(store);
    const entry = entryFor(stats, difficultyKey);
    entry.won++;
    entry.totalTimeMsForWins += elapsedMs;
    entry.bestTimeMs = entry.bestTimeMs === null ? elapsedMs : Math.min(entry.bestTimeMs, elapsedMs);
    saveStats(stats, store);
    return stats;
  }

  function getStatsForDifficulty(difficultyKey, store = defaultStore()) {
    const stats = loadStats(store);
    const entry = stats.byDifficulty[difficultyKey] || { started: 0, won: 0, bestTimeMs: null, totalTimeMsForWins: 0 };
    return {
      started: entry.started,
      won: entry.won,
      winRate: entry.started > 0 ? entry.won / entry.started : null,
      bestTimeMs: entry.bestTimeMs,
      avgTimeMs: entry.won > 0 ? entry.totalTimeMsForWins / entry.won : null,
    };
  }

  function defaultSettings() {
    return { version: 1, darkMode: true, sound: true, haptics: true };
  }

  function loadSettings(store = defaultStore()) {
    if (!store) return defaultSettings();
    try {
      const raw = store.getItem(SETTINGS_KEY);
      if (!raw) return defaultSettings();
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? { ...defaultSettings(), ...parsed } : defaultSettings();
    } catch (e) {
      return defaultSettings();
    }
  }

  function saveSettings(settings, store = defaultStore()) {
    if (!store) return;
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  const api = {
    saveGame,
    loadGame,
    clearSave,
    loadStats,
    saveStats,
    recordGameStarted,
    recordWin,
    getStatsForDifficulty,
    loadSettings,
    saveSettings,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.CatdokuStorage = api;
  }
})();
