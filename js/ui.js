// DOM rendering and interaction. Talks to game.js/pool.js/generator.js for
// all logic; owns no puzzle rules itself.

(function () {
  const CatdokuBoard = window.CatdokuBoard;
  const CatdokuGame = window.CatdokuGame;
  const CatdokuPool = window.CatdokuPool;
  const CatdokuPuzzlePool = window.CatdokuPuzzlePool;
  const CatdokuGenerator = window.CatdokuGenerator;
  const CatdokuStorage = window.CatdokuStorage;

  const el = {
    startScreen: document.getElementById("start-screen"),
    gameScreen: document.getElementById("game-screen"),
    continueRow: document.getElementById("continue-row"),
    continueBtn: document.getElementById("continue-btn"),
    difficultyList: document.getElementById("difficulty-list"),
    backBtn: document.getElementById("back-btn"),
    difficultyLabel: document.getElementById("difficulty-label"),
    timer: document.getElementById("timer"),
    moveCount: document.getElementById("move-count"),
    boardWrap: document.getElementById("board-wrap"),
    board: document.getElementById("board"),
    winBanner: document.getElementById("win-banner"),
    winMessage: document.getElementById("win-message"),
    winStats: document.getElementById("win-stats"),
    winNewGameBtn: document.getElementById("win-new-game-btn"),
    confettiLayer: document.getElementById("confetti-layer"),
    undoBtn: document.getElementById("undo-btn"),
    clearBtn: document.getElementById("clear-btn"),
    restartBtn: document.getElementById("restart-btn"),
    hintBtn: document.getElementById("hint-btn"),
    hintMessage: document.getElementById("hint-message"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsOverlay: document.getElementById("settings-overlay"),
    settingsCloseBtn: document.getElementById("settings-close-btn"),
    settingDarkMode: document.getElementById("setting-dark-mode"),
    settingSound: document.getElementById("setting-sound"),
    settingHaptics: document.getElementById("setting-haptics"),
    winShareBtn: document.getElementById("win-share-btn"),
    shareToast: document.getElementById("share-toast"),
  };

  let gameState = null;
  let cellEls = [];
  let timerHandle = null;
  let hintedCellIdx = null;
  let pendingContinueSave = null;
  let settings = CatdokuStorage.loadSettings();
  let audioCtx = null;
  const recentlyUsedByTier = {};

  function applyTheme(darkMode) {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }

  function applySettingsToUi() {
    applyTheme(settings.darkMode);
    el.settingDarkMode.checked = settings.darkMode;
    el.settingSound.checked = settings.sound;
    el.settingHaptics.checked = settings.haptics;
  }

  function updateSetting(key, value) {
    settings[key] = value;
    CatdokuStorage.saveSettings(settings);
    if (key === "darkMode") applyTheme(value);
  }

  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // Short synthesized tones — no audio assets to fetch/cache offline.
  function playTone(freq, durationMs, delayMs = 0, gain = 0.08) {
    if (!settings.sound) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const startAt = ctx.currentTime + delayMs / 1000;
    const stopAt = startAt + durationMs / 1000;
    gainNode.gain.setValueAtTime(gain, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(stopAt);
  }

  function playTapSound() {
    playTone(520, 60);
  }

  function playWinSound() {
    playTone(523.25, 120, 0);
    playTone(659.25, 120, 110);
    playTone(783.99, 220, 220);
  }

  function vibrate(pattern) {
    if (settings.haptics && "vibrate" in navigator) navigator.vibrate(pattern);
  }

  function showSettings() {
    el.settingsOverlay.hidden = false;
  }

  function hideSettings() {
    el.settingsOverlay.hidden = true;
  }

  function showShareToast() {
    el.shareToast.hidden = true;
    void el.shareToast.offsetWidth; // force reflow so the animation restarts on repeat taps
    el.shareToast.hidden = false;
    clearTimeout(showShareToast._t);
    showShareToast._t = setTimeout(() => {
      el.shareToast.hidden = true;
    }, 1800);
  }

  function refreshContinueAvailability() {
    pendingContinueSave = CatdokuStorage.loadGame();
    el.continueRow.hidden = !pendingContinueSave;
  }

  function showScreen(name) {
    el.startScreen.hidden = name !== "start";
    el.gameScreen.hidden = name !== "game";
  }

  function renderDifficultyScreen() {
    el.difficultyList.innerHTML = "";
    for (const level of CatdokuGenerator.DIFFICULTY_LEVELS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diff-btn";
      btn.innerHTML = `<span>${level.name}</span><span class="diff-grid-size">${level.N}×${level.N}</span>`;
      btn.addEventListener("click", () => startNewGame(level.key));
      el.difficultyList.appendChild(btn);
    }
  }

  function pickPuzzle(difficultyKey) {
    const used = recentlyUsedByTier[difficultyKey] || [];
    const { index, puzzle } = CatdokuPool.pickPuzzleFromPool(
      CatdokuPuzzlePool.PUZZLE_POOL,
      difficultyKey,
      Math.random,
      used
    );
    const pool = CatdokuPuzzlePool.PUZZLE_POOL[difficultyKey];
    const nextUsed = [...used, index].slice(-Math.max(1, pool.length - 1));
    recentlyUsedByTier[difficultyKey] = nextUsed;
    return puzzle;
  }

  function startNewGame(difficultyKey) {
    const puzzle = pickPuzzle(difficultyKey);
    gameState = CatdokuGame.createGameState(puzzle, difficultyKey);
    CatdokuStorage.recordGameStarted(difficultyKey);
    const level = CatdokuGenerator.DIFFICULTY_LEVELS.find((l) => l.key === difficultyKey);
    el.difficultyLabel.textContent = level.name;
    el.winBanner.hidden = true;
    hintedCellIdx = null;
    setHintMessage("");
    showScreen("game");
    buildBoardDom(gameState);
    startTimerLoop();
    persistCurrentGame();
    pendingContinueSave = null;
    el.continueRow.hidden = true;
  }

  function resumeSavedGame(saved) {
    gameState = CatdokuGame.fromSaveData(saved);
    const level = CatdokuGenerator.DIFFICULTY_LEVELS.find((l) => l.key === gameState.difficultyKey);
    el.difficultyLabel.textContent = level.name;
    el.winBanner.hidden = true;
    hintedCellIdx = null;
    setHintMessage("");
    showScreen("game");
    buildBoardDom(gameState);
    startTimerLoop();
  }

  function restartCurrentGame() {
    if (!gameState) return;
    gameState = CatdokuGame.restartGameState(gameState);
    el.winBanner.hidden = true;
    hintedCellIdx = null;
    setHintMessage("");
    buildBoardDom(gameState);
    startTimerLoop();
    persistCurrentGame();
  }

  function persistCurrentGame() {
    if (!gameState || gameState.won) return;
    CatdokuStorage.saveGame(CatdokuGame.toSaveData(gameState));
  }

  function borderStyleFor(N, regionOf, cellIdx) {
    const { row, col } = CatdokuBoard.rowColOf(N, cellIdx);
    const region = regionOf[cellIdx];
    const rightDiffers = col === N - 1 || regionOf[CatdokuBoard.cellIndex(N, row, col + 1)] !== region;
    const bottomDiffers = row === N - 1 || regionOf[CatdokuBoard.cellIndex(N, row + 1, col)] !== region;
    return {
      borderRight: rightDiffers ? "2px solid var(--cell-border-strong)" : "1px solid var(--cell-border-soft)",
      borderBottom: bottomDiffers ? "2px solid var(--cell-border-strong)" : "1px solid var(--cell-border-soft)",
    };
  }

  // Region colors stay inside a warm "territory" hue range (brick to
  // golden-amber) instead of cycling the full rainbow, so the board itself
  // — the single largest element on screen — reads as patches of one warm
  // territory rather than a generic rainbow palette generator's output.
  const REGION_HUES = [18, 32, 45, 8, 38, 55, 25, 42, 12, 48];

  function regionColor(regionId, N) {
    const hue = REGION_HUES[regionId % REGION_HUES.length];
    const lightness = 40 + ((regionId * 7) % 3) * 6;
    return `hsl(${hue}, 42%, ${lightness}%)`;
  }

  function sizeBoard(N) {
    const available = Math.min(el.boardWrap.clientWidth, el.boardWrap.clientHeight) - 8;
    const cellSize = Math.max(24, Math.floor(available / N));
    el.board.style.gridTemplateColumns = `repeat(${N}, ${cellSize}px)`;
    el.board.style.gridTemplateRows = `repeat(${N}, ${cellSize}px)`;
  }

  function buildBoardDom(state) {
    const { N, regionOf } = state;
    el.board.innerHTML = "";
    cellEls = new Array(N * N);

    for (let cell = 0; cell < N * N; cell++) {
      const div = document.createElement("div");
      div.className = "cell";
      div.setAttribute("role", "gridcell");
      div.style.backgroundColor = regionColor(regionOf[cell], N);
      const border = borderStyleFor(N, regionOf, cell);
      div.style.borderRight = border.borderRight;
      div.style.borderBottom = border.borderBottom;
      div.addEventListener("click", () => onCellTap(cell));
      el.board.appendChild(div);
      cellEls[cell] = div;
    }

    sizeBoard(N);
    renderAllCellContent(state);
    updateStats(state);
  }

  function renderCellContent(cellIdx, mark) {
    const div = cellEls[cellIdx];
    if (mark === CatdokuBoard.MARK.CAT) {
      div.innerHTML = '<img class="mark-cat" src="icons/cat-mark.png" alt="">';
      div.setAttribute("aria-label", "Cat");
    } else if (mark === CatdokuBoard.MARK.X) {
      div.innerHTML = '<span class="mark-x">✕</span>';
      div.setAttribute("aria-label", "Eliminated");
    } else {
      div.innerHTML = "";
      div.setAttribute("aria-label", "Empty");
    }
  }

  function renderAllCellContent(state) {
    for (let cell = 0; cell < state.marks.length; cell++) renderCellContent(cell, state.marks[cell]);
  }

  function onCellTap(cellIdx) {
    if (!gameState || gameState.won) return;
    clearHintHighlight();
    CatdokuGame.tapCell(gameState, cellIdx);
    renderCellContent(cellIdx, gameState.marks[cellIdx]);
    updateStats(gameState);
    playTapSound();
    vibrate(12);
    if (gameState.won) {
      handleWin();
    } else {
      persistCurrentGame();
    }
  }

  function clearHintHighlight() {
    if (hintedCellIdx !== null && cellEls[hintedCellIdx]) {
      cellEls[hintedCellIdx].classList.remove("hint-highlight");
    }
    hintedCellIdx = null;
  }

  function setHintMessage(text) {
    el.hintMessage.textContent = text;
    el.hintMessage.hidden = !text;
  }

  const HINT_TIER_NAMES = {
    1: "Lap Cat",
    2: "Windowsill Watcher",
    3: "Yard Patroller",
    4: "Alley Prowler",
    5: "Rooftop Sniper",
    6: "Apex Predator",
  };

  function onHintTap() {
    if (!gameState) return;
    clearHintHighlight();

    const hint = CatdokuGame.requestHint(gameState);
    if (hint.type === "place" || hint.type === "eliminate") {
      hintedCellIdx = hint.cell;
      cellEls[hint.cell].classList.add("hint-highlight");
      const action = hint.type === "place" ? "Place a cat here" : "This cell can be eliminated";
      setHintMessage(`${action} — ${HINT_TIER_NAMES[hint.tier]} logic.`);
    } else if (hint.type === "conflict") {
      setHintMessage("Your current marks conflict with any valid solution — check your recent X's and cats.");
    } else if (hint.type === "stuck") {
      setHintMessage("No further hint available from here.");
    } else if (hint.type === "solved") {
      setHintMessage("Already solved!");
    }
  }

  function handleWin() {
    stopTimerLoop();
    clearHintHighlight();
    setHintMessage("");
    CatdokuStorage.clearSave();

    const elapsedMs = CatdokuGame.getElapsedMs(gameState);
    const stats = CatdokuStorage.recordWin(gameState.difficultyKey, elapsedMs);
    const entry = stats.byDifficulty[gameState.difficultyKey];

    el.winMessage.textContent = `Solved in ${formatTime(elapsedMs)} and ${gameState.moveCount} moves!`;
    const isNewBest = entry.bestTimeMs === elapsedMs;
    el.winStats.textContent = isNewBest
      ? `New best time! (${entry.won} win${entry.won === 1 ? "" : "s"} at this difficulty)`
      : `Best: ${formatTime(entry.bestTimeMs)} · ${entry.won} win${entry.won === 1 ? "" : "s"} at this difficulty`;

    el.winBanner.hidden = false;
    spawnConfetti();
    playWinSound();
    vibrate([40, 30, 40, 30, 80]);
  }

  const CONFETTI_EMOJI = ["🐱", "🐾", "✨"];

  function spawnConfetti() {
    el.confettiLayer.innerHTML = "";
    const pieceCount = 14;
    for (let i = 0; i < pieceCount; i++) {
      const span = document.createElement("span");
      span.className = "confetti-piece";
      span.textContent = CONFETTI_EMOJI[i % CONFETTI_EMOJI.length];
      span.style.left = `${Math.random() * 100}%`;
      span.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
      span.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 60)}px`);
      el.confettiLayer.appendChild(span);
    }
    setTimeout(() => {
      el.confettiLayer.innerHTML = "";
    }, 1800);
  }

  const formatTime = CatdokuGame.formatTime;

  function updateStats(state) {
    el.timer.textContent = formatTime(CatdokuGame.getElapsedMs(state));
    el.moveCount.textContent = `${state.moveCount} move${state.moveCount === 1 ? "" : "s"}`;
  }

  function startTimerLoop() {
    stopTimerLoop();
    timerHandle = setInterval(() => {
      if (gameState) updateStats(gameState);
    }, 1000);
  }

  function stopTimerLoop() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }

  function wireControls() {
    el.backBtn.addEventListener("click", () => {
      stopTimerLoop();
      refreshContinueAvailability();
      showScreen("start");
    });
    el.continueBtn.addEventListener("click", () => {
      if (pendingContinueSave) resumeSavedGame(pendingContinueSave);
    });
    el.undoBtn.addEventListener("click", () => {
      if (!gameState) return;
      CatdokuGame.undoLastMove(gameState);
      renderAllCellContent(gameState);
      updateStats(gameState);
      persistCurrentGame();
    });
    el.clearBtn.addEventListener("click", () => {
      if (!gameState) return;
      CatdokuGame.clearAllMarks(gameState);
      renderAllCellContent(gameState);
      updateStats(gameState);
      persistCurrentGame();
    });
    el.restartBtn.addEventListener("click", restartCurrentGame);
    el.hintBtn.addEventListener("click", onHintTap);
    el.winNewGameBtn.addEventListener("click", () => {
      if (gameState) startNewGame(gameState.difficultyKey);
    });
    el.winShareBtn.addEventListener("click", onShareTap);
    window.addEventListener("resize", () => {
      if (gameState) sizeBoard(gameState.N);
    });

    el.settingsBtn.addEventListener("click", showSettings);
    el.settingsCloseBtn.addEventListener("click", hideSettings);
    el.settingsOverlay.addEventListener("click", (e) => {
      if (e.target === el.settingsOverlay) hideSettings();
    });
    el.settingDarkMode.addEventListener("change", () => updateSetting("darkMode", el.settingDarkMode.checked));
    el.settingSound.addEventListener("change", () => updateSetting("sound", el.settingSound.checked));
    el.settingHaptics.addEventListener("change", () => updateSetting("haptics", el.settingHaptics.checked));
  }

  function onShareTap() {
    if (!gameState) return;
    const level = CatdokuGenerator.DIFFICULTY_LEVELS.find((l) => l.key === gameState.difficultyKey);
    const text = CatdokuGame.buildShareText(gameState, level.name);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showShareToast, showShareToast);
    } else {
      showShareToast();
    }
  }

  function init() {
    applySettingsToUi();
    renderDifficultyScreen();
    wireControls();
    refreshContinueAvailability();
    showScreen("start");
  }

  window.CatdokuUi = { init, getState: () => gameState };
})();
