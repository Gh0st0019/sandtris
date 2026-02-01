"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
const nextCanvas = document.getElementById("next");
const traySlots = Array.from(document.querySelectorAll("[data-tray]"));
const trayCanvases = traySlots.map((slot) => slot.querySelector("canvas"));
const holdCanvas = document.getElementById("hold");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const leaderboardList = document.getElementById("leaderboard-list");
const rankValue = document.getElementById("rank-value");
const rankScore = document.getElementById("rank-score");
const menuBestEl = document.getElementById("menu-best");
const matchToastEl = document.getElementById("match-toast");

const scoreEl = document.getElementById("score");
const scoreTopEl = document.getElementById("score-top");
const scoreMobileEl = document.getElementById("score-mobile");
const bestTopEl = document.getElementById("best-top");
const linesMobileEl = document.getElementById("lines-mobile");
const linesEl = document.getElementById("lines");

const GRID_COLS = 10;
const GRID_ROWS = 20;
const BLOCK = 6;
const GRID_W = GRID_COLS * BLOCK;
const GRID_H = GRID_ROWS * BLOCK;
const H_STEP = BLOCK;

const BASE_DROP = 380;
const MIN_DROP = 60;
const CLEAR_THRESHOLD = 0.9;
const SAND_STEPS = window.innerWidth < 520 ? 2 : 3;
const SAND_SLIDE_CHANCE = 0.008;
const SAND_FALL2_CHANCE = 0.08;

const LANDING_TIME = 120;
const LONG_PRESS_MS = 380;
const DISSOLVE_RATE = 0.2;
const MATCH_MIN = BLOCK * BLOCK * 8;
const MATCH_FLASH_TIME = 1600;
const MATCH_FLASH_INTERVAL = 220;
const WIND_FACTOR = 0.2;

canvas.width = GRID_W;
canvas.height = GRID_H;
ctx.imageSmoothingEnabled = false;

const nextCtx = nextCanvas ? nextCanvas.getContext("2d") : null;
const trayCtxs = trayCanvases.map((canvas) => (canvas ? canvas.getContext("2d") : null));
const holdCtx = holdCanvas ? holdCanvas.getContext("2d") : null;
if (nextCtx) nextCtx.imageSmoothingEnabled = false;
trayCtxs.forEach((ctxRef) => {
  if (ctxRef) ctxRef.imageSmoothingEnabled = false;
});
if (holdCtx) holdCtx.imageSmoothingEnabled = false;

const grid = new Uint8Array(GRID_W * GRID_H);
const nextGrid = new Uint8Array(GRID_W * GRID_H);
const clearGrid = new Uint8Array(GRID_W * GRID_H);
const pieceMask = new Uint8Array(GRID_W * GRID_H);
const moved = new Uint8Array(GRID_W * GRID_H);
const grain = new Int8Array(GRID_W * GRID_H);
const grainTint = new Int8Array(GRID_W * GRID_H);
const rowShade = new Int8Array(GRID_H);
const dissolveMask = new Uint8Array(GRID_W * GRID_H);
const matchMask = new Uint8Array(GRID_W * GRID_H);
const matchVisited = new Uint8Array(GRID_W * GRID_H);

for (let i = 0; i < grain.length; i++) {
  grain[i] = (Math.random() * 18 - 9) | 0;
}

for (let i = 0; i < grainTint.length; i++) {
  grainTint[i] = (Math.random() * 16 - 8) | 0;
}

for (let y = 0; y < GRID_H; y++) {
  rowShade[y] = ((y / GRID_H) * 18 - 9) | 0;
}

const PALETTE = [
  [22, 30, 54],
  [240, 218, 104],
  [214, 174, 76],
  [96, 198, 130],
  [92, 156, 206],
  [228, 142, 90],
  [168, 128, 210],
  [238, 156, 100],
];


const PIECE_DEFS = {
  I: { color: 1, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { color: 2, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { color: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { color: 4, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { color: 5, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { color: 6, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { color: 7, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

const rotations = {};
for (const type of Object.keys(PIECE_DEFS)) {
  rotations[type] = [];
  for (let r = 0; r < 4; r++) {
    rotations[type][r] = PIECE_DEFS[type].cells.map((cell) => rotateCell(cell, r));
  }
}

function rotateCell(cell, rot) {
  const x = cell[0];
  const y = cell[1];
  if (rot === 0) return [x, y];
  if (rot === 1) return [3 - y, x];
  if (rot === 2) return [3 - x, 3 - y];
  return [y, 3 - x];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function rgb(color) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

const TRAY_SIZE = 3;
let bag = [];
let piece = null;
let trayPieces = new Array(TRAY_SIZE).fill(null);
let activeTraySlot = null;
let dragging = null;
const FAST_DROP = 0.05;
let holdType = null;
let holdUsed = false;
let pieceState = "idle";
let landingTimer = 0;
let dissolveQueue = [];
let dissolveIndex = 0;
let dissolveAccumulator = 0;
let dissolveColor = 1;
let matchActive = false;
let matchTimer = 0;

let score = 0;
let lines = 0;
let level = 1;

let running = false;
let paused = false;
let gameOver = false;

let dropInterval = BASE_DROP;
let dropTimer = 0;
let lastTime = 0;
let softDropping = false;
let touchDropping = false;
let windPhase = Math.random() * Math.PI * 2;
let wind = 0;
let frame = 0;

const imageData = ctx.createImageData(GRID_W, GRID_H);

const BEST_SCORE_KEY = "sandtris_best_v1";
const LEADERBOARD_KEY_PREFIX = "sandtris_weekly_v1";
const PLAYER_NAME = "YOU";
let bestScore = 0;

function loadBestScore() {
  const raw = localStorage.getItem(BEST_SCORE_KEY);
  const value = Number(raw);
  bestScore = Number.isFinite(value) ? value : 0;
  return bestScore;
}

function updateBestScore(value) {
  if (value > bestScore) {
    bestScore = value;
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  }
}

function renderBestScore() {
  if (menuBestEl) menuBestEl.textContent = `${bestScore}`;
  if (bestTopEl) bestTopEl.textContent = `${bestScore}`;
}

function getISOWeekKey(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}

function getLeaderboardKey() {
  return `${LEADERBOARD_KEY_PREFIX}_${getISOWeekKey(new Date())}`;
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(getLeaderboardKey());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(list) {
  localStorage.setItem(getLeaderboardKey(), JSON.stringify(list));
}

function addScoreToLeaderboard(name, value) {
  const list = loadLeaderboard();
  const upper = name.toUpperCase().slice(0, 14);
  const existing = list.findIndex((entry) => entry.name === upper);
  if (existing >= 0) {
    if (value > list[existing].score) {
      list[existing].score = value;
    }
  } else {
    list.push({ name: upper, score: value });
  }
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 10);
  saveLeaderboard(trimmed);
  return trimmed;
}

function renderLeaderboard(list) {
  leaderboardList.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "leaderboard-empty";
    empty.textContent = "Nessun punteggio";
    leaderboardList.appendChild(empty);
    rankValue.textContent = "-";
    rankScore.textContent = "-";
    return;
  }
  list.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `<span class="rank">${index + 1}.</span><span class="name">${entry.name}</span><span class="score">${entry.score}</span>`;
    leaderboardList.appendChild(row);
  });
  const rankIndex = list.findIndex((entry) => entry.name === PLAYER_NAME);
  if (rankIndex >= 0) {
    rankValue.textContent = `${rankIndex + 1}`;
    rankScore.textContent = `${list[rankIndex].score}`;
  } else {
    rankValue.textContent = "-";
    rankScore.textContent = "-";
  }
}

function triggerMatchScan() {
  const wasActive = matchActive;
  matchVisited.fill(0);
  if (!wasActive) {
    matchMask.fill(0);
  }
  let found = false;
  for (let seed = 0; seed < grid.length; seed++) {
    const color = grid[seed];
    if (!color || matchVisited[seed]) continue;
    const stack = [seed];
    const group = [];
    matchVisited[seed] = 1;
    while (stack.length) {
      const idx = stack.pop();
      group.push(idx);
      const x = idx % GRID_W;
      const y = (idx / GRID_W) | 0;
      if (x > 0) {
        const left = idx - 1;
        if (!matchVisited[left] && grid[left] === color) {
          matchVisited[left] = 1;
          stack.push(left);
        }
      }
      if (x < GRID_W - 1) {
        const right = idx + 1;
        if (!matchVisited[right] && grid[right] === color) {
          matchVisited[right] = 1;
          stack.push(right);
        }
      }
      if (y > 0) {
        const up = idx - GRID_W;
        if (!matchVisited[up] && grid[up] === color) {
          matchVisited[up] = 1;
          stack.push(up);
        }
        if (x > 0) {
          const upLeft = idx - GRID_W - 1;
          if (!matchVisited[upLeft] && grid[upLeft] === color) {
            matchVisited[upLeft] = 1;
            stack.push(upLeft);
          }
        }
        if (x < GRID_W - 1) {
          const upRight = idx - GRID_W + 1;
          if (!matchVisited[upRight] && grid[upRight] === color) {
            matchVisited[upRight] = 1;
            stack.push(upRight);
          }
        }
      }
      if (y < GRID_H - 1) {
        const down = idx + GRID_W;
        if (!matchVisited[down] && grid[down] === color) {
          matchVisited[down] = 1;
          stack.push(down);
        }
        if (x > 0) {
          const downLeft = idx + GRID_W - 1;
          if (!matchVisited[downLeft] && grid[downLeft] === color) {
            matchVisited[downLeft] = 1;
            stack.push(downLeft);
          }
        }
        if (x < GRID_W - 1) {
          const downRight = idx + GRID_W + 1;
          if (!matchVisited[downRight] && grid[downRight] === color) {
            matchVisited[downRight] = 1;
            stack.push(downRight);
          }
        }
      }
    }
    if (group.length >= MATCH_MIN) {
      found = true;
      for (const idx of group) {
        matchMask[idx] = 1;
      }
    }
  }
  if (!found) return false;
  if (!wasActive) {
    matchActive = true;
    matchTimer = 0;
  }
  return true;
}

function updateMenuStats() {
  loadBestScore();
  renderBestScore();
}

function showMatchToast(points, xPct, yPct) {
  if (!matchToastEl || points <= 0) return;
  matchToastEl.textContent = `+${points}`;
  if (Number.isFinite(xPct) && Number.isFinite(yPct)) {
    matchToastEl.style.left = `${clamp(xPct, 6, 94)}%`;
    matchToastEl.style.top = `${clamp(yPct, 6, 94)}%`;
  }
  matchToastEl.classList.remove("match-toast--show");
  void matchToastEl.offsetWidth;
  matchToastEl.classList.add("match-toast--show");
}

function refillBag() {
  bag = Object.keys(PIECE_DEFS);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function takeFromBag() {
  if (!bag.length) refillBag();
  return bag.pop();
}

function refillTraySlot(index) {
  trayPieces[index] = takeFromBag();
}

function initTray() {
  for (let i = 0; i < TRAY_SIZE; i++) {
    refillTraySlot(i);
  }
  renderTray();
}

function renderTray() {
  trayCtxs.forEach((ctxRef, index) => {
    drawPreview(ctxRef, trayPieces[index]);
  });
  drawPreview(nextCtx, trayPieces[0]);
}

function getBoardPositionFromClient(type, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const localX = ((clientX - rect.left) / rect.width) * GRID_W;
  const localY = ((clientY - rect.top) / rect.height) * GRID_H;
  const bounds = getPieceBounds(type, 0);
  let x = localX - bounds.width / 2 - bounds.minX * BLOCK;
  let y = localY - bounds.height / 2 - bounds.minY * BLOCK;
  x = Math.round(x / BLOCK) * BLOCK;
  y = Math.round(y / BLOCK) * BLOCK;
  const minX = -bounds.minX * BLOCK;
  const maxX = GRID_W - (bounds.maxX + 1) * BLOCK;
  const minY = -bounds.minY * BLOCK;
  const maxY = GRID_H - (bounds.maxY + 1) * BLOCK;
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

function spawnPiece(type) {
  return {
    type,
    rot: 0,
    x: Math.floor(GRID_W / 2 - 2 * BLOCK),
    y: -2 * BLOCK,
    color: PIECE_DEFS[type].color,
  };
}

function getPieceBounds(type, rot) {
  const cells = rotations[type][rot];
  let minX = 4;
  let minY = 4;
  let maxX = -1;
  let maxY = -1;
  for (const cell of cells) {
    minX = Math.min(minX, cell[0]);
    minY = Math.min(minY, cell[1]);
    maxX = Math.max(maxX, cell[0]);
    maxY = Math.max(maxY, cell[1]);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: (maxX - minX + 1) * BLOCK,
    height: (maxY - minY + 1) * BLOCK,
  };
}

function spawnPieceAt(type, x, y) {
  return {
    type,
    rot: 0,
    x,
    y,
    color: PIECE_DEFS[type].color,
  };
}

function updateDropInterval() {
  dropInterval = Math.max(MIN_DROP, BASE_DROP - (level - 1) * 45);
}

function updateHud() {
  scoreEl.textContent = score.toString();
  if (scoreTopEl) scoreTopEl.textContent = score.toString();
  if (scoreMobileEl) scoreMobileEl.textContent = score.toString();
  linesEl.textContent = lines.toString();
  if (linesMobileEl) linesMobileEl.textContent = lines.toString();
  updateBestScore(score);
  renderBestScore();
}


function showMenu() {
  overlay.dataset.state = "menu";
  overlay.classList.remove("hidden");
  document.body.classList.remove("is-playing");
  renderLeaderboard(loadLeaderboard());
  updateMenuStats();
}

function showAbout() {
  overlay.dataset.state = "about";
  overlay.classList.remove("hidden");
}

function showSettings() {
  overlay.dataset.state = "settings";
  overlay.classList.remove("hidden");
}

function showMessage(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.dataset.state = "message";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function startGame() {
  grid.fill(0);
  nextGrid.fill(0);
  clearGrid.fill(0);
  pieceMask.fill(0);
  dissolveMask.fill(0);
  matchMask.fill(0);
  score = 0;
  lines = 0;
  level = 1;
  updateDropInterval();
  bag = [];
  holdType = null;
  holdUsed = false;
  piece = null;
  pieceState = "idle";
  activeTraySlot = null;
  dragging = null;
  initTray();
  drawPreview(nextCtx, trayPieces[0]);
  drawPreview(holdCtx, holdType);
  landingTimer = 0;
  dissolveQueue = [];
  dissolveIndex = 0;
  dissolveAccumulator = 0;
  matchActive = false;
  matchTimer = 0;
  running = true;
  paused = false;
  gameOver = false;
  dropTimer = 0;
  document.body.classList.add("is-playing");
  hideOverlay();
  updateHud();
}

function endGame() {
  running = false;
  gameOver = true;
  dragging = null;
  activeTraySlot = null;
  if (score > 0) {
    const list = addScoreToLeaderboard(PLAYER_NAME, score);
    renderLeaderboard(list);
  }
  updateBestScore(score);
  renderBestScore();
  showMessage("GAME OVER", "Tocca START o tap per ricominciare");
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  if (paused) {
    showMessage("PAUSA", "Tocca per riprendere");
  } else {
    hideOverlay();
  }
}

function forEachPiecePixel(pieceRef, rot, ox, oy, fn) {
  const cells = rotations[pieceRef.type][rot];
  for (const cell of cells) {
    const baseX = ox + cell[0] * BLOCK;
    const baseY = oy + cell[1] * BLOCK;
    for (let y = 0; y < BLOCK; y++) {
      const gy = baseY + y;
      if (gy < 0 || gy >= GRID_H) continue;
      for (let x = 0; x < BLOCK; x++) {
        const gx = baseX + x;
        if (gx < 0 || gx >= GRID_W) continue;
        fn(gx, gy, x, y);
      }
    }
  }
}

function collides(pieceRef, dx, dy, rot) {
  const cells = rotations[pieceRef.type][rot];
  for (const cell of cells) {
    const baseX = pieceRef.x + dx + cell[0] * BLOCK;
    const baseY = pieceRef.y + dy + cell[1] * BLOCK;
    if (baseX < 0 || baseX + BLOCK > GRID_W) return true;
    if (baseY + BLOCK > GRID_H) return true;
    for (let y = 0; y < BLOCK; y++) {
      const gy = baseY + y;
      if (gy < 0) continue;
      for (let x = 0; x < BLOCK; x++) {
        const gx = baseX + x;
        if (grid[gy * GRID_W + gx] !== 0) return true;
      }
    }
  }
  return false;
}

function tryMove(dx, dy) {
  if (!piece || pieceState !== "active") return false;
  if (!collides(piece, dx, dy, piece.rot)) {
    piece.x += dx;
    piece.y += dy;
    return true;
  }
  return false;
}

function tryRotate(dir) {
  if (!piece || pieceState !== "active") return;
  const nextRot = (piece.rot + dir + 4) % 4;
  const kicks = [0, H_STEP, -H_STEP, H_STEP * 2, -H_STEP * 2];
  for (const offset of kicks) {
    if (!collides(piece, offset, 0, nextRot)) {
      piece.x += offset;
      piece.rot = nextRot;
      return;
    }
  }
  if (!collides(piece, 0, -BLOCK, nextRot)) {
    piece.y -= BLOCK;
    piece.rot = nextRot;
  }
}

function hardDrop() {
  if (!piece || pieceState !== "active") return;
  let movedSteps = 0;
  while (!collides(piece, 0, 1, piece.rot)) {
    piece.y += 1;
    movedSteps += 1;
  }
  score += movedSteps * 2;
  updateHud();
  startLanding();
}

function holdPiece() {
  return;
}

function startLanding() {
  pieceState = "landing";
  landingTimer = 0;
  startDissolve();
}

function startDissolve() {
  pieceState = "dissolving";
  dissolveQueue = [];
  dissolveIndex = 0;
  dissolveAccumulator = 0;
  dissolveColor = piece.color;
  dissolveMask.fill(0);
  forEachPiecePixel(piece, piece.rot, piece.x, piece.y, (gx, gy) => {
    const idx = gy * GRID_W + gx;
    dissolveQueue.push(idx);
    dissolveMask[idx] = 1;
  });
  for (let i = dissolveQueue.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [dissolveQueue[i], dissolveQueue[j]] = [dissolveQueue[j], dissolveQueue[i]];
  }
}

function finishDissolve() {
  pieceState = "idle";
  holdUsed = false;
  piece = null;
  dropTimer = 0;
  if (activeTraySlot !== null) {
    refillTraySlot(activeTraySlot);
    renderTray();
    drawPreview(nextCtx, trayPieces[0]);
    activeTraySlot = null;
  }
  updateHud();
  triggerMatchScan();
}

function clearRows() {
  clearGrid.fill(0);
  let cleared = 0;
  for (let y = GRID_H - 1; y >= 0; y--) {
    let filled = 0;
    const rowStart = y * GRID_W;
    for (let x = 0; x < GRID_W; x++) {
      if (grid[rowStart + x] !== 0) filled += 1;
    }
    if (filled / GRID_W >= CLEAR_THRESHOLD) {
      cleared += 1;
    } else {
      const targetRow = y + cleared;
      const targetStart = targetRow * GRID_W;
      clearGrid.set(grid.subarray(rowStart, rowStart + GRID_W), targetStart);
    }
  }
  if (cleared > 0) {
    grid.set(clearGrid);
  }
  return cleared;
}

function updatePieceMask() {
  pieceMask.fill(0);
  if (!piece) return;
  if (pieceState === "active" || pieceState === "landing") {
    forEachPiecePixel(piece, piece.rot, piece.x, piece.y, (gx, gy) => {
      pieceMask[gy * GRID_W + gx] = 1;
    });
  } else if (pieceState === "dissolving") {
    pieceMask.set(dissolveMask);
  }
}

function isEmpty(index) {
  return nextGrid[index] === 0 && pieceMask[index] === 0;
}

function stepSand() {
  nextGrid.set(grid);
  moved.fill(0);
  const bias = wind > 0.85 ? 1 : wind < -0.85 ? -1 : 0;
  for (let y = GRID_H - 1; y >= 0; y--) {
    const forward = bias === 0 ? Math.random() > 0.5 : bias > 0;
    if (forward) {
      for (let x = 0; x < GRID_W; x++) {
        moveSandCell(x, y, bias);
      }
    } else {
      for (let x = GRID_W - 1; x >= 0; x--) {
        moveSandCell(x, y, bias);
      }
    }
  }
  grid.set(nextGrid);
}

function moveSandCell(x, y, bias) {
  const idx = y * GRID_W + x;
  const value = nextGrid[idx];
  if (!value || moved[idx]) return;
  const belowY = y + 1;
  if (belowY < GRID_H) {
    const belowIdx = belowY * GRID_W + x;
    if (isEmpty(belowIdx)) {
      if (belowY + 1 < GRID_H) {
        const below2Idx = (belowY + 1) * GRID_W + x;
        if (isEmpty(below2Idx) && Math.random() < SAND_FALL2_CHANCE) {
          nextGrid[below2Idx] = value;
          nextGrid[idx] = 0;
          moved[below2Idx] = 1;
          return;
        }
      }
      nextGrid[belowIdx] = value;
      nextGrid[idx] = 0;
      moved[belowIdx] = 1;
      return;
    }
    const order = bias === 0
      ? (Math.random() > 0.5 ? [1, -1] : [-1, 1])
      : (bias > 0 ? [1, -1] : [-1, 1]);
    if (Math.random() < 0.35) {
      for (const dir of order) {
        const nx = x + dir;
        if (nx < 0 || nx >= GRID_W) continue;
        const diagIdx = belowY * GRID_W + nx;
        if (isEmpty(diagIdx)) {
          nextGrid[diagIdx] = value;
          nextGrid[idx] = 0;
          moved[diagIdx] = 1;
          return;
        }
      }
    }
  }
  if (Math.random() < SAND_SLIDE_CHANCE) {
    const sides = Math.random() > 0.5 ? [1, -1] : [-1, 1];
    for (const dir of sides) {
      const nx = x + dir;
      if (nx < 0 || nx >= GRID_W) continue;
      const sideIdx = y * GRID_W + nx;
      if (isEmpty(sideIdx)) {
        nextGrid[sideIdx] = value;
        nextGrid[idx] = 0;
        moved[sideIdx] = 1;
        return;
      }
    }
  }
  moved[idx] = 1;
}

function updateLanding(dt) {
  landingTimer += dt;
}

function updateDissolve(dt) {
  dissolveAccumulator += dt * DISSOLVE_RATE;
  let count = Math.floor(dissolveAccumulator);
  dissolveAccumulator -= count;
  while (count > 0 && dissolveIndex < dissolveQueue.length) {
    const idx = dissolveQueue[dissolveIndex];
    grid[idx] = dissolveColor;
    dissolveMask[idx] = 0;
    dissolveIndex += 1;
    count -= 1;
  }
  if (dissolveIndex >= dissolveQueue.length) {
    dissolveMask.fill(0);
    score += 10;
    finishDissolve();
    triggerMatchScan();
  }
}

function update(dt) {
  windPhase += dt * 0.0009;
  wind = Math.sin(windPhase) * WIND_FACTOR;

  if (piece) {
    if (pieceState === "active") {
      dropTimer += dt;
      const boosted = FAST_DROP;
      const interval = dropInterval * boosted;
      let safety = 0;
      while (dropTimer >= interval && safety < 120) {
        dropTimer -= interval;
        if (!tryMove(0, 1)) {
          break;
        }
        safety += 1;
      }
      if (collides(piece, 0, 1, piece.rot)) {
        startLanding();
      }
    } else if (pieceState === "landing") {
      updateLanding(dt);
    } else if (pieceState === "dissolving") {
      updateDissolve(dt);
    }
  }

  updatePieceMask();

  if (matchActive) {
    matchTimer += dt;
    if (matchTimer >= MATCH_FLASH_TIME) {
      let removed = 0;
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < grid.length; i++) {
        if (matchMask[i]) {
          grid[i] = 0;
          removed += 1;
          sumX += i % GRID_W;
          sumY += (i / GRID_W) | 0;
        }
      }
      matchMask.fill(0);
      matchActive = false;
      matchTimer = 0;
      if (removed > 0) {
        const points = Math.floor(removed / 3);
        score += points;
        updateHud();
        const cx = ((sumX / removed) + 0.5) / GRID_W * 100;
        const cy = ((sumY / removed) + 0.5) / GRID_H * 100;
        showMatchToast(points, cx, cy);
      }
    }
  }

  if (!matchActive) {
    for (let i = 0; i < SAND_STEPS; i++) {
      stepSand();
    }
  }
  triggerMatchScan();
}

function renderPiece(color, offsetY, flashing) {
  const flashOn = flashing && Math.floor(landingTimer / 120) % 2 === 0;
  const baseColor = flashOn ? [245, 245, 245] : color;
  forEachPiecePixel(piece, piece.rot, piece.x, piece.y + offsetY, (gx, gy, lx, ly) => {
    const idx = (gy * GRID_W + gx) * 4;
    const bevel = lx === 0 || ly === 0 ? 14 : lx === BLOCK - 1 || ly === BLOCK - 1 ? -10 : 0;
    const sparkle = ((frame + gx + gy) & 7) === 0 ? 4 : 0;
    const shade = flashOn ? 0 : bevel + sparkle;
    ctxData[idx] = clamp(baseColor[0] + shade, 0, 255);
    ctxData[idx + 1] = clamp(baseColor[1] + shade, 0, 255);
    ctxData[idx + 2] = clamp(baseColor[2] + shade, 0, 255);
    ctxData[idx + 3] = 255;
  });
}

let ctxData = imageData.data;

function render() {
  ctxData = imageData.data;
  let index = 0;
  for (let y = 0; y < GRID_H; y++) {
    const rowN = rowShade[y];
    for (let x = 0; x < GRID_W; x++) {
      let colorIndex = grid[index];
      if (colorIndex === 0 && pieceState === "dissolving" && dissolveMask[index]) {
        colorIndex = dissolveColor;
      }
      const matchedColor = matchActive && matchMask[index];
      const matchFlash = matchedColor && Math.floor(matchTimer / MATCH_FLASH_INTERVAL) % 2 === 0;
      const base = matchFlash ? [245, 245, 245] : PALETTE[colorIndex];
      const grainN = colorIndex === 0 ? (grain[index] >> 1) : grain[index];
      const grit = colorIndex ? (grain[index] > 5 ? -7 : grain[index] < -5 ? 7 : 0) : 0;
      const dither = (x + y + ((frame >> 2) & 1)) & 1 ? 2 : -2;
      const sparkle = ((frame + index) & 7) === 0 ? 2 : 0;
      const motion = moved[index] ? 10 : 0;
      const fallBoost = moved[index] ? (y < GRID_H * 0.35 ? 10 : 6) : 0;
      let surface = 0;
      if (!matchFlash && colorIndex) {
        const above = index >= GRID_W ? grid[index - GRID_W] : 0;
        const below = index < grid.length - GRID_W ? grid[index + GRID_W] : 0;
        const left = x > 0 ? grid[index - 1] : 0;
        const right = x < GRID_W - 1 ? grid[index + 1] : 0;
        if (!above) surface += 8;
        if (!left || !right) surface += 3;
        if (!below) surface -= 4;
      }
      const tint = matchFlash ? 0 : grainTint[index];
      const warm = colorIndex && colorIndex <= 2 ? 3 : 0;
      const shade = matchFlash ? 0 : grainN + grit + dither + sparkle + rowN + motion + fallBoost + surface;
      const offset = index * 4;
      ctxData[offset] = clamp(base[0] + shade + warm + tint, 0, 255);
      ctxData[offset + 1] = clamp(base[1] + shade + (warm >> 1) - (tint >> 2), 0, 255);
      ctxData[offset + 2] = clamp(base[2] + shade - warm - (tint >> 1), 0, 255);
      ctxData[offset + 3] = 255;
      index += 1;
    }
  }

  if (piece && (pieceState === "active" || pieceState === "landing")) {
    const color = PALETTE[piece.color];
    const offsetY = pieceState === "landing" && landingTimer < 220 ? 1 : 0;
    const flashing = pieceState === "landing";
    renderPiece(color, offsetY, flashing);
  }

  if (dragging && dragging.inside) {
    renderGhostPiece(dragging.type, dragging.x, dragging.y);
  }

  ctx.putImageData(imageData, 0, 0);
  frame = (frame + 1) & 1023;
}

function drawPreview(previewCtx, type) {
  if (!previewCtx) return;
  previewCtx.clearRect(0, 0, previewCtx.canvas.width, previewCtx.canvas.height);
  if (!type) return;
  const cells = rotations[type][0];
  let minX = 4;
  let minY = 4;
  let maxX = 0;
  let maxY = 0;
  for (const cell of cells) {
    minX = Math.min(minX, cell[0]);
    minY = Math.min(minY, cell[1]);
    maxX = Math.max(maxX, cell[0]);
    maxY = Math.max(maxY, cell[1]);
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const offsetX = Math.floor((4 - width) / 2) - minX;
  const offsetY = Math.floor((4 - height) / 2) - minY;
  const size = previewCtx.canvas.width / 4;
  const base = PALETTE[PIECE_DEFS[type].color];
  const highlight = "rgba(255, 255, 255, 0.22)";
  const shadow = "rgba(0, 0, 0, 0.28)";
  const border = "rgba(0, 0, 0, 0.35)";
  const pad = Math.max(1, Math.floor(size * 0.08));
  const highlightH = Math.max(1, Math.floor(size * 0.22));
  const shadowH = Math.max(1, Math.floor(size * 0.2));
  for (const cell of cells) {
    const x = (cell[0] + offsetX) * size;
    const y = (cell[1] + offsetY) * size;
    previewCtx.fillStyle = rgb(base);
    previewCtx.fillRect(x, y, size, size);
    previewCtx.fillStyle = highlight;
    previewCtx.fillRect(x + pad, y + pad, size - pad * 2, highlightH);
    previewCtx.fillStyle = shadow;
    previewCtx.fillRect(x + pad, y + size - shadowH - pad, size - pad * 2, shadowH);
    previewCtx.strokeStyle = border;
    previewCtx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }
}

function handleAction(action) {
  if (!running) {
    startGame();
    return;
  }
  if (paused && action !== "pause") return;
  switch (action) {
    case "left":
      tryMove(-H_STEP, 0);
      break;
    case "right":
      tryMove(H_STEP, 0);
      break;
    case "down":
      tryMove(0, 1);
      break;
    case "rotate":
      tryRotate(1);
      break;
    case "hard":
      hardDrop();
      break;
    case "hold":
      holdPiece();
      break;
    case "pause":
      togglePause();
      break;
    default:
      break;
  }
}

const repeatTimers = new Map();

function startRepeat(action) {
  if (repeatTimers.has(action)) return;
  if (action === "down") {
    softDropping = true;
  }
  handleAction(action);
  const interval = action === "down" ? 60 : 90;
  const timer = setInterval(() => handleAction(action), interval);
  repeatTimers.set(action, timer);
}

function stopRepeat(action) {
  const timer = repeatTimers.get(action);
  if (timer) {
    clearInterval(timer);
    repeatTimers.delete(action);
  }
  if (action === "down") {
    softDropping = false;
  }
}

document.querySelectorAll("[data-menu]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.menu;
    switch (action) {
      case "start":
        startGame();
        break;
      case "settings":
        showSettings();
        break;
      case "about":
        showAbout();
        break;
      case "back":
        showMenu();
        break;
      case "resume":
        if (paused) togglePause();
        break;
      case "menu":
        running = false;
        paused = false;
        gameOver = false;
        showMenu();
        break;
      default:
        break;
    }
  });
});

traySlots.forEach((slot, index) => {
  slot.addEventListener("pointerdown", (e) => {
    startTrayDrag(index, e);
  });
  slot.addEventListener("pointermove", (e) => {
    updateTrayDrag(e);
  });
  slot.addEventListener("pointerup", (e) => {
    endTrayDrag(e);
  });
  slot.addEventListener("pointercancel", (e) => {
    endTrayDrag(e);
  });
});

let touch = null;
let holdTimer = null;

function getCellSize() {
  return canvas.clientWidth / GRID_COLS;
}

function getBoardRect() {
  return canvas.getBoundingClientRect();
}

function isInsideBoard(clientX, clientY) {
  const rect = getBoardRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function renderGhostPiece(type, x, y) {
  const ghostColor = PALETTE[PIECE_DEFS[type].color];
  const blend = 0.55;
  forEachPiecePixel({ type }, 0, x, y, (gx, gy) => {
    const idx = (gy * GRID_W + gx) * 4;
    ctxData[idx] = clamp(ctxData[idx] * (1 - blend) + ghostColor[0] * blend, 0, 255);
    ctxData[idx + 1] = clamp(ctxData[idx + 1] * (1 - blend) + ghostColor[1] * blend, 0, 255);
    ctxData[idx + 2] = clamp(ctxData[idx + 2] * (1 - blend) + ghostColor[2] * blend, 0, 255);
    ctxData[idx + 3] = 255;
  });
}

function startTrayDrag(index, event) {
  if (!running || paused || gameOver || piece || dragging) return;
  const type = trayPieces[index];
  if (!type) return;
  dragging = {
    slot: index,
    type,
    pointerId: event.pointerId,
    x: 0,
    y: 0,
    inside: false,
  };
  trayPieces[index] = null;
  renderTray();
  updateTrayDrag(event);
  traySlots[index].setPointerCapture(event.pointerId);
}

function updateTrayDrag(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) return;
  dragging.inside = isInsideBoard(event.clientX, event.clientY);
  const pos = getBoardPositionFromClient(dragging.type, event.clientX, event.clientY);
  dragging.x = pos.x;
  dragging.y = pos.y;
}

function endTrayDrag(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) return;
  const releasedInside = dragging.inside && isInsideBoard(event.clientX, event.clientY);
  if (releasedInside) {
    const pos = getBoardPositionFromClient(dragging.type, event.clientX, event.clientY);
    const candidate = spawnPieceAt(dragging.type, pos.x, pos.y);
    const bounds = getPieceBounds(dragging.type, 0);
    const minY = -bounds.minY * BLOCK;
    let placed = candidate;
    let tries = 0;
    while (tries < 6 && collides(placed, 0, 0, placed.rot)) {
      placed.y -= BLOCK;
      if (placed.y < minY) break;
      tries += 1;
    }
    if (!collides(placed, 0, 0, placed.rot)) {
      piece = placed;
      pieceState = "active";
      activeTraySlot = dragging.slot;
      dropTimer = 0;
    } else {
      trayPieces[dragging.slot] = dragging.type;
      renderTray();
    }
  } else {
    trayPieces[dragging.slot] = dragging.type;
    renderTray();
  }
  dragging = null;
}

canvas.addEventListener("pointerdown", (e) => {
  if (dragging) return;
  if (!running || paused || gameOver || pieceState !== "active") return;
  touch = {
    id: e.pointerId,
    originX: e.clientX,
    originY: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    moved: false,
    axis: null,
    accumX: 0,
    accumY: 0,
    startTime: performance.now(),
    cell: getCellSize(),
    holdUsed: false,
  };
  holdTimer = setTimeout(() => {
    if (touch && !touch.moved) {
      holdPiece();
      touch.holdUsed = true;
    }
  }, LONG_PRESS_MS);
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging) return;
  if (!touch || e.pointerId !== touch.id) return;
  const totalDx = e.clientX - touch.originX;
  const totalDy = e.clientY - touch.originY;
  if (Math.abs(totalDx) > 8 || Math.abs(totalDy) > 8) {
    touch.moved = true;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  if (!touch.axis && Math.hypot(totalDx, totalDy) > 10) {
    touch.axis = Math.abs(totalDx) >= Math.abs(totalDy) ? "x" : "y";
  }

  const stepX = touch.cell * 0.6;
  const stepY = touch.cell * 0.5;
  const dxStep = e.clientX - touch.lastX;
  const dyStep = e.clientY - touch.lastY;
  touch.lastX = e.clientX;
  touch.lastY = e.clientY;

  if (touch.axis === "x") {
    touch.accumX += dxStep;
    while (Math.abs(touch.accumX) >= stepX) {
      const dir = touch.accumX > 0 ? 1 : -1;
      tryMove(dir * H_STEP, 0);
      touch.accumX -= dir * stepX;
    }
  } else if (touch.axis === "y") {
    if (dyStep > 0) {
      touch.accumY += dyStep;
      while (touch.accumY >= stepY) {
        tryMove(0, 1);
        touchDropping = true;
        touch.accumY -= stepY;
      }
    }
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (dragging) return;
  if (!touch || e.pointerId !== touch.id) return;
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  const totalDx = e.clientX - touch.originX;
  const totalDy = e.clientY - touch.originY;
  const duration = performance.now() - touch.startTime;

  if (!touch.moved && !touch.holdUsed) {
    tryRotate(1);
  } else if (totalDy > touch.cell * 1.6 && duration < 260 && Math.abs(totalDy) > Math.abs(totalDx)) {
    hardDrop();
  }

  touchDropping = false;
  touch = null;
});

canvas.addEventListener("pointercancel", () => {
  if (dragging) return;
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  touchDropping = false;
  touch = null;
});

overlay.addEventListener("click", (e) => {
  if (e.target.closest("[data-menu]")) return;
  if (overlay.dataset.state !== "message") return;
  if (!running || gameOver) {
    startGame();
  } else if (paused) {
    togglePause();
  }
});

window.addEventListener("blur", () => {
  if (running && !paused) {
    togglePause();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case "ArrowLeft":
    case "KeyA":
      startRepeat("left");
      break;
    case "ArrowRight":
    case "KeyD":
      startRepeat("right");
      break;
    case "ArrowDown":
    case "KeyS":
      startRepeat("down");
      break;
    case "ArrowUp":
    case "KeyX":
      handleAction("rotate");
      break;
    case "KeyZ":
      tryRotate(-1);
      break;
    case "Space":
      handleAction(running ? "hard" : "pause");
      break;
    case "KeyC":
      handleAction("hold");
      break;
    case "Escape":
    case "KeyP":
      handleAction("pause");
      break;
    case "Enter":
      if (!running || gameOver) startGame();
      break;
    default:
      break;
  }
});

window.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "ArrowLeft":
    case "KeyA":
      stopRepeat("left");
      break;
    case "ArrowRight":
    case "KeyD":
      stopRepeat("right");
      break;
    case "ArrowDown":
    case "KeyS":
      stopRepeat("down");
      break;
    default:
      break;
  }
});

function loop(time) {
  const dt = Math.min(60, time - lastTime);
  lastTime = time;
  if (running && !paused) {
    update(dt);
    render();
  }
  requestAnimationFrame(loop);
}

renderLeaderboard(loadLeaderboard());
showMenu();
updateHud();
requestAnimationFrame(loop);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
