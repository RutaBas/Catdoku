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
    lives: document.getElementById("lives"),
    boardWrap: document.getElementById("board-wrap"),
    board: document.getElementById("board"),
    resultOverlay: document.getElementById("result-overlay"),
    resultPanel: document.getElementById("result-panel"),
    resultImg: document.getElementById("result-img"),
    resultMessage: document.getElementById("result-message"),
    resultStats: document.getElementById("result-stats"),
    resultSecondaryBtn: document.getElementById("result-secondary-btn"),
    resultPrimaryBtn: document.getElementById("result-primary-btn"),
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
    toast: document.getElementById("toast"),
  };

  let gameState = null;
  let cellEls = [];
  let timerHandle = null;
  let hintedCellIdx = null;
  let pendingContinueSave = null;
  let settings = CatdokuStorage.loadSettings();
  let audioCtx = null;
  const recentlyUsedByTier = {};

  // --- pointer input state ---
  let cellPx = 0; // current pixel size of one cell; recomputed in sizeBoard()
  let drag = null; // see startDrag() for shape; null when idle
  let lastTap = null; // { cell, time, historyLen } — feeds double-tap detection
  const DOUBLE_TAP_MS = 280;
  const BOARD_BORDER_PX = 3; // must match #board's border-width in styles.css

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

  function playCatSound() {
    playTone(659.25, 90, 0);
    playTone(880, 110, 80);
  }

  // Descending minor second — reads as "wrong" without being harsh.
  function playErrorSound() {
    playTone(311.13, 110, 0, 0.07);
    playTone(233.08, 180, 100, 0.07);
  }

  function playWinSound() {
    playTone(523.25, 120, 0);
    playTone(659.25, 120, 110);
    playTone(783.99, 220, 220);
  }

  function playLoseSound() {
    playTone(392, 160, 0, 0.07);
    playTone(311.13, 160, 150, 0.07);
    playTone(233.08, 320, 300, 0.07);
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

  function showToast(text) {
    el.toast.textContent = text;
    el.toast.hidden = true;
    void el.toast.offsetWidth; // force reflow so the animation restarts on repeat taps
    el.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.hidden = true;
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
    resetBoardChrome();
    showScreen("game");
    buildBoardDom(gameState);
    startTimerLoop();
    persistCurrentGame();
    pendingContinueSave = null;
    el.continueRow.hidden = true;
  }

  // Clears anything left over from a previous run before a board is shown.
  function resetBoardChrome() {
    hideResult();
    el.toast.hidden = true;
    drag = null;
    lastTap = null;
    hintedCellIdx = null;
    setHintMessage("");
  }

  function resumeSavedGame(saved) {
    gameState = CatdokuGame.fromSaveData(saved);
    const level = CatdokuGenerator.DIFFICULTY_LEVELS.find((l) => l.key === gameState.difficultyKey);
    el.difficultyLabel.textContent = level.name;
    resetBoardChrome();
    showScreen("game");
    buildBoardDom(gameState);
    startTimerLoop();
  }

  function restartCurrentGame() {
    if (!gameState) return;
    gameState = CatdokuGame.restartGameState(gameState);
    resetBoardChrome();
    buildBoardDom(gameState);
    startTimerLoop();
    persistCurrentGame();
  }

  function persistCurrentGame() {
    if (!gameState || CatdokuGame.isOver(gameState)) return;
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
    cellPx = cellSize; // the drag math resolves cells from geometry, not DOM events
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
      el.board.appendChild(div);
      cellEls[cell] = div;
    }

    sizeBoard(N);
    renderAllCellContent(state);
    renderLives(state);
    updateStats(state);
  }

  function renderCellContent(cellIdx, mark) {
    const div = cellEls[cellIdx];
    if (mark === CatdokuBoard.MARK.CAT) {
      div.innerHTML = '<img class="mark-cat" src="icons/cat-mark.png" alt="">';
      div.setAttribute("aria-label", "Cat");
    } else if (mark === CatdokuBoard.MARK.X) {
      // Drawn, not typed: the ✕ glyph isn't in Nunito, so it fell back to a
      // per-platform symbol font whose ink height varies — fine at 16px, but
      // it made the mark's real size unpredictable once scaled up. This sizes
      // off the cell like .mark-cat does and renders identically everywhere.
      div.innerHTML =
        '<svg class="mark-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M4 4 L20 20 M20 4 L4 20" /></svg>';
      div.setAttribute("aria-label", "Eliminated");
    } else {
      div.innerHTML = "";
      div.setAttribute("aria-label", "Empty");
    }
  }

  function renderAllCellContent(state) {
    for (let cell = 0; cell < state.marks.length; cell++) renderCellContent(cell, state.marks[cell]);
  }

  // ===================== pointer input (tap / swipe / double-tap) =====================
  // Ported from the Nonogram swipe-select model: Pointer Events only, cells
  // resolved by geometry (touch fires no per-cell mouseover during a drag),
  // pointer capture so a finger sliding off the grid keeps painting, axis
  // lock, interpolation for sparse pointermove, and one drag = one undo entry.

  // Locate the cell under the pointer. clampInside distinguishes *starting* a
  // stroke (must be on the grid, else null) from *continuing* one (a finger
  // past the edge clamps to the last row/col rather than cancelling).
  function cellFromEvent(e, clampInside) {
    if (!gameState || !cellPx) return null;
    const rect = el.board.getBoundingClientRect();
    const N = gameState.N;
    let c = Math.floor((e.clientX - rect.left - BOARD_BORDER_PX) / cellPx);
    let r = Math.floor((e.clientY - rect.top - BOARD_BORDER_PX) / cellPx);
    if (clampInside) {
      c = Math.max(0, Math.min(N - 1, c));
      r = Math.max(0, Math.min(N - 1, r));
      return { r, c };
    }
    if (r < 0 || c < 0 || r >= N || c >= N) return null;
    return { r, c };
  }

  // Paint one cell into the in-progress stroke. The `!== action.from` guard is
  // what enforces "the first cell decides": a stroke that started by adding
  // X's to empty cells slides straight over cells that already have X's or
  // cats instead of toggling them back off.
  function dragApply(r, c) {
    const i = CatdokuBoard.cellIndex(gameState.N, r, c);
    if (drag.applied.has(i)) return; // already visited this stroke (jitter/backtrack)
    drag.applied.add(i);
    if (gameState.marks[i] !== drag.action.from) return;

    gameState.marks[i] = drag.action.to;
    drag.changes.push({ cell: i, from: drag.action.from, to: drag.action.to });
    renderCellContent(i, drag.action.to);
  }

  function dragTo(r, c) {
    // Lock to a row or column the first time the pointer leaves the start cell.
    if (drag.axis === null && (r !== drag.r0 || c !== drag.c0)) {
      drag.axis = Math.abs(c - drag.c0) >= Math.abs(r - drag.r0) ? "row" : "col";
    }
    if (drag.axis === "row") r = drag.r0;
    else if (drag.axis === "col") c = drag.c0;
    else return; // still on the start cell — nothing locked yet

    // pointermove is sparse; a fast flick skips cells. Fill the gap.
    if (drag.axis === "row") {
      const step = c >= drag.lastC ? 1 : -1;
      for (let x = drag.lastC; x !== c + step; x += step) dragApply(drag.r0, x);
      drag.lastC = c;
    } else {
      const step = r >= drag.lastR ? 1 : -1;
      for (let x = drag.lastR; x !== r + step; x += step) dragApply(x, drag.c0);
      drag.lastR = r;
    }
  }

  // The board was already mutated cell-by-cell for live feedback, so this only
  // records the accumulated changes as a single history entry.
  function endDrag() {
    if (!drag) return null;
    const finished = drag;
    drag = null;
    if (finished.changes.length === 0) return finished;

    // Re-apply through the game layer so history/moveCount/win-check run once
    // for the whole stroke. Marks are already at `to`, so rewind them first.
    for (const ch of finished.changes) gameState.marks[ch.cell] = ch.from;
    CatdokuGame.applyChanges(gameState, finished.changes);

    updateStats(gameState);
    if (gameState.won) handleWin();
    else persistCurrentGame();
    return finished;
  }

  // Second tap on the same cell inside the window: undo the X the first tap
  // optimistically painted, then try to commit a cat there.
  function onDoubleTap(cellIdx) {
    const reverted = CatdokuGame.revertLastCommit(gameState);
    if (reverted) {
      for (const ch of reverted) renderCellContent(ch.cell, gameState.marks[ch.cell]);
    }

    const result = CatdokuGame.placeCat(gameState, cellIdx);
    if (result.ok) {
      renderCellContent(cellIdx, gameState.marks[cellIdx]);
      updateStats(gameState);
      playCatSound();
      vibrate(18);
      if (gameState.won) handleWin();
      else persistCurrentGame();
    } else if (result.reason === "mistake") {
      onMistake(cellIdx, result);
    }
  }

  function onPointerDown(e) {
    if (!gameState || CatdokuGame.isOver(gameState) || drag) return;
    const pos = cellFromEvent(e, false);
    if (!pos) return;
    e.preventDefault();

    const cellIdx = CatdokuBoard.cellIndex(gameState.N, pos.r, pos.c);
    clearHintHighlight();

    // Double-tap wins over starting a new stroke. historyLen guards against the
    // player hitting Undo/Clear between the two taps, which would otherwise
    // make revertLastCommit eat an unrelated move.
    if (
      lastTap &&
      lastTap.cell === cellIdx &&
      e.timeStamp - lastTap.time <= DOUBLE_TAP_MS &&
      lastTap.historyLen === gameState.history.length
    ) {
      lastTap = null;
      onDoubleTap(cellIdx);
      return;
    }

    const action = CatdokuBoard.actionFor(gameState.marks[cellIdx]);
    if (!action) return;

    drag = {
      pointerId: e.pointerId,
      action,
      r0: pos.r,
      c0: pos.c,
      lastR: pos.r,
      lastC: pos.c,
      axis: null,
      applied: new Set(),
      changes: [],
    };
    try {
      el.board.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is a nicety, not a requirement */
    }
    dragApply(pos.r, pos.c);
    playTapSound();
    vibrate(12);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const pos = cellFromEvent(e, true);
    if (pos) dragTo(pos.r, pos.c);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const wasStationary = drag.axis === null;
    const startCell = CatdokuBoard.cellIndex(gameState.N, drag.r0, drag.c0);
    const finished = endDrag();

    // Only a stroke that never left its start cell counts as a tap that a
    // second tap can pair with. A swipe clears the pairing.
    lastTap =
      wasStationary && finished && finished.changes.length > 0
        ? { cell: startCell, time: e.timeStamp, historyLen: gameState.history.length }
        : null;
  }

  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    endDrag();
    lastTap = null;
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

  // A refused cat: the cell never changes, so the feedback has to carry the
  // whole message — shake where they aimed, say what happened, count it down.
  function onMistake(cellIdx, result) {
    const cell = cellEls[cellIdx];
    if (cell) {
      cell.classList.remove("cell-wrong");
      void cell.offsetWidth; // restart the animation on repeat mistakes
      cell.classList.add("cell-wrong");
      setTimeout(() => cell.classList.remove("cell-wrong"), 400);
    }

    renderLives(gameState);
    playErrorSound();
    vibrate([50, 40, 50]);

    if (result.gameOver) {
      handleLoss();
      return;
    }

    showToast(
      result.remaining === 1
        ? "No cat there — 1 mistake left!"
        : `No cat there — ${result.remaining} mistakes left.`
    );
    persistCurrentGame();
  }

  // One overlay serves both endings — the card art carries the "YOU WIN!" /
  // "MAYBE NEXT TIME..." message, so everything else here is just the stats
  // and the two ways out. Buttons are generic and get their label + handler
  // per result rather than keeping two near-identical banners in the DOM.
  function showResult({ image, alt, message, stats, secondary, primary }) {
    el.resultImg.src = image;
    el.resultImg.alt = alt;
    el.resultMessage.textContent = message;
    el.resultStats.textContent = stats;

    el.resultSecondaryBtn.textContent = secondary.label;
    el.resultSecondaryBtn.onclick = secondary.onClick;
    el.resultPrimaryBtn.textContent = primary.label;
    el.resultPrimaryBtn.onclick = primary.onClick;

    el.resultOverlay.hidden = false;
    el.resultPrimaryBtn.focus({ preventScroll: true });
  }

  function hideResult() {
    el.resultOverlay.hidden = true;
    el.confettiLayer.innerHTML = "";
  }

  // Ending a run drops you back at the difficulty list rather than silently
  // dealing another puzzle at the same tier — after a win you usually want to
  // move up, and after a loss you often want to move down.
  function goToDifficultySelect() {
    stopTimerLoop();
    resetBoardChrome();
    refreshContinueAvailability();
    showScreen("start");
  }

  function handleLoss() {
    stopTimerLoop();
    clearHintHighlight();
    setHintMessage("");
    CatdokuStorage.clearSave(); // a lost run isn't resumable

    showResult({
      image: "icons/you_lose.png",
      alt: "Maybe next time",
      message: "The cats got away!",
      stats: `${gameState.maxMistakes} mistakes in ${formatTime(CatdokuGame.getElapsedMs(gameState))}`,
      secondary: { label: "Try Again", onClick: restartCurrentGame },
      primary: { label: "Choose Level", onClick: goToDifficultySelect },
    });
    playLoseSound();
    vibrate([80, 50, 80, 50, 160]);
  }

  function handleWin() {
    stopTimerLoop();
    clearHintHighlight();
    setHintMessage("");
    CatdokuStorage.clearSave();

    const elapsedMs = CatdokuGame.getElapsedMs(gameState);
    const stats = CatdokuStorage.recordWin(gameState.difficultyKey, elapsedMs);
    const entry = stats.byDifficulty[gameState.difficultyKey];

    const flawless = gameState.mistakes === 0;
    const isNewBest = entry.bestTimeMs === elapsedMs;
    const mistakeNote = flawless ? "" : ` · ${gameState.mistakes} mistake${gameState.mistakes === 1 ? "" : "s"}`;

    showResult({
      image: "icons/you_win.png",
      alt: "You win",
      message: flawless
        ? `Flawless! ${formatTime(elapsedMs)} and ${gameState.moveCount} moves.`
        : `Solved in ${formatTime(elapsedMs)} and ${gameState.moveCount} moves!`,
      stats:
        (isNewBest
          ? `New best time! (${entry.won} win${entry.won === 1 ? "" : "s"} at this difficulty)`
          : `Best: ${formatTime(entry.bestTimeMs)} · ${entry.won} win${entry.won === 1 ? "" : "s"} at this difficulty`) +
        mistakeNote,
      secondary: { label: "Share", onClick: onShareTap },
      primary: { label: "New Game", onClick: goToDifficultySelect },
    });

    spawnConfetti();
    playWinSound();
    vibrate([40, 30, 40, 30, 80]);
  }

  // Paper confetti, not emoji: at this size a 🐾 glyph reads as a smudge, and
  // the card art is already carrying the cat. Colours are pulled from the
  // game's own warm palette plus a cool accent so the fall reads against both
  // the light and dark themes.
  const CONFETTI_COLORS = ["#e08a3e", "#c1652a", "#f3c05b", "#8fbcd4", "#f3e6d6", "#e5484d"];

  function spawnConfetti() {
    el.confettiLayer.innerHTML = "";
    const pieceCount = 70;
    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      // Rectangles of varying aspect tumble more convincingly than squares.
      piece.style.width = `${6 + Math.random() * 5}px`;
      piece.style.height = `${9 + Math.random() * 7}px`;
      piece.style.animationDelay = `${(Math.random() * 1.6).toFixed(2)}s`;
      piece.style.animationDuration = `${(2.4 + Math.random() * 1.6).toFixed(2)}s`;
      piece.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 220)}px`);
      piece.style.setProperty("--spin", `${Math.round(360 + Math.random() * 720)}deg`);
      el.confettiLayer.appendChild(piece);
    }
    // No cleanup timer: the layer is emptied by hideResult() when the overlay
    // closes, which is the only way out of this screen anyway.
  }

  const formatTime = CatdokuGame.formatTime;

  // Paw prints, one per life. Spent ones dim rather than disappear, so the
  // row never reflows and you can always see how many you started with.
  function renderLives(state) {
    const remaining = state.maxMistakes - state.mistakes;
    el.lives.innerHTML = "";
    for (let i = 0; i < state.maxMistakes; i++) {
      const span = document.createElement("span");
      span.className = i < remaining ? "life" : "life life-spent";
      span.textContent = "🐾";
      el.lives.appendChild(span);
    }
    el.lives.setAttribute("aria-label", `${remaining} of ${state.maxMistakes} mistakes remaining`);
  }

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
      lastTap = null; // an undo between two taps must not pair them up
      persistCurrentGame();
    });
    el.clearBtn.addEventListener("click", () => {
      if (!gameState) return;
      CatdokuGame.clearAllMarks(gameState);
      renderAllCellContent(gameState);
      updateStats(gameState);
      lastTap = null;
      persistCurrentGame();
    });
    el.restartBtn.addEventListener("click", restartCurrentGame);
    el.hintBtn.addEventListener("click", onHintTap);
    // The result overlay's two buttons are wired per-result in showResult().

    // Pointer input lives on #board (not per-cell): touch fires no per-cell
    // events mid-drag, and the cells are rebuilt on every new game anyway.
    el.board.addEventListener("pointerdown", onPointerDown);
    el.board.addEventListener("pointermove", onPointerMove);
    el.board.addEventListener("pointerup", onPointerUp);
    el.board.addEventListener("pointercancel", onPointerCancel);
    el.board.addEventListener("contextmenu", (e) => e.preventDefault());
    el.board.addEventListener("dragstart", (e) => e.preventDefault());

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
    const copied = () => showToast("Copied to clipboard!");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(copied, copied);
    } else {
      copied();
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
