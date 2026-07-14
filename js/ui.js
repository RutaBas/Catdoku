// DOM rendering and interaction. Talks to game.js/pool.js/generator.js for
// all logic; owns no puzzle rules itself.

(function () {
  const CatdokuBoard = window.CatdokuBoard;
  const CatdokuGame = window.CatdokuGame;
  const CatdokuPool = window.CatdokuPool;
  const CatdokuPuzzlePool = window.CatdokuPuzzlePool;
  const CatdokuGenerator = window.CatdokuGenerator;

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
    winNewGameBtn: document.getElementById("win-new-game-btn"),
    undoBtn: document.getElementById("undo-btn"),
    clearBtn: document.getElementById("clear-btn"),
    restartBtn: document.getElementById("restart-btn"),
  };

  let gameState = null;
  let cellEls = [];
  let timerHandle = null;
  const recentlyUsedByTier = {};

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
    const level = CatdokuGenerator.DIFFICULTY_LEVELS.find((l) => l.key === difficultyKey);
    el.difficultyLabel.textContent = level.name;
    el.winBanner.hidden = true;
    showScreen("game");
    buildBoardDom(gameState);
    startTimerLoop();
  }

  function restartCurrentGame() {
    if (!gameState) return;
    gameState = CatdokuGame.restartGameState(gameState);
    el.winBanner.hidden = true;
    buildBoardDom(gameState);
    startTimerLoop();
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

  function regionColor(regionId, N) {
    const hue = Math.round((regionId * 360) / N);
    return `hsl(${hue}, 62%, 58%)`;
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
      div.innerHTML = '<span class="mark-cat">\u{1F431}</span>';
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
    CatdokuGame.tapCell(gameState, cellIdx);
    renderCellContent(cellIdx, gameState.marks[cellIdx]);
    updateStats(gameState);
    if (gameState.won) handleWin();
  }

  function handleWin() {
    stopTimerLoop();
    const seconds = Math.round(CatdokuGame.getElapsedMs(gameState) / 1000);
    el.winMessage.textContent = `Solved in ${formatTime(seconds * 1000)} and ${gameState.moveCount} moves!`;
    el.winBanner.hidden = false;
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
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
      showScreen("start");
    });
    el.undoBtn.addEventListener("click", () => {
      if (!gameState) return;
      CatdokuGame.undoLastMove(gameState);
      renderAllCellContent(gameState);
      updateStats(gameState);
    });
    el.clearBtn.addEventListener("click", () => {
      if (!gameState) return;
      CatdokuGame.clearAllMarks(gameState);
      renderAllCellContent(gameState);
      updateStats(gameState);
    });
    el.restartBtn.addEventListener("click", restartCurrentGame);
    el.winNewGameBtn.addEventListener("click", () => {
      if (gameState) startNewGame(gameState.difficultyKey);
    });
    window.addEventListener("resize", () => {
      if (gameState) sizeBoard(gameState.N);
    });
  }

  function init() {
    renderDifficultyScreen();
    wireControls();
    showScreen("start");
  }

  window.CatdokuUi = { init, getState: () => gameState };
})();
