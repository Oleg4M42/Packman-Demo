// ─── Constants ───────────────────────────────────────────────────────────────
const CELL = 20;       // px per cell
const COLS = 21;
const ROWS = 23;

// Tile types
const EMPTY  = 0;
const WALL   = 1;
const DOT    = 2;
const PELLET = 3;  // power pellet

// Ghost states
const CHASE     = 'chase';
const FRIGHTENED = 'frightened';
const EATEN     = 'eaten';

// Directions
const DIR = { UP: {x:0,y:-1}, DOWN: {x:0,y:1}, LEFT: {x:-1,y:0}, RIGHT: {x:1,y:0} };

// ─── Level Map (21×23) ────────────────────────────────────────────────────────
// 1=wall, 2=dot, 3=power pellet, 0=empty (ghost house / open paths)
const MAP_TEMPLATE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,3,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,3,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,0,1,0,0,1,1,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,1,1,0,0,0,1,1,0,1,2,1,1,1,1],
  [0,0,0,0,2,0,0,1,0,0,0,0,0,1,0,0,2,0,0,0,0],
  [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function deepCopyMap(template) {
  return template.map(row => [...row]);
}

function tileCenter(col, row) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function pixelToTile(px, py) {
  return { col: Math.floor(px / CELL), row: Math.floor(py / CELL) };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── Game State ───────────────────────────────────────────────────────────────
let canvas, ctx, map, animFrame;
let score, lives, totalDots;
let pacman, ghosts;
let frightenedTimer = 0;
let gameState = 'start'; // start | playing | dead | win | gameover
let deathTimer = 0;

// ─── Pac-Man ──────────────────────────────────────────────────────────────────
function makePacman() {
  return {
    x: 10 * CELL + CELL / 2,
    y: 16 * CELL + CELL / 2,
    speed: 2,
    dir: { ...DIR.LEFT },
    nextDir: { ...DIR.LEFT },
    mouthAngle: 0.25,
    mouthDir: 1,
    radius: CELL / 2 - 2,
  };
}

// ─── Ghosts ───────────────────────────────────────────────────────────────────
const GHOST_COLORS   = ['#FF0000', '#FFB8FF', '#FFB852', '#00FFFF'];
const GHOST_NAMES    = ['Blinky', 'Pinky', 'Inky', 'Clyde'];
const GHOST_STARTS   = [
  { col: 10, row: 9 },
  { col: 9,  row: 9 },
  { col: 10, row: 10 },
  { col: 11, row: 9 },
];

function makeGhost(index) {
  const c = tileCenter(GHOST_STARTS[index].col, GHOST_STARTS[index].row);
  return {
    x: c.x, y: c.y,
    speed: 1.5,
    dir: { ...DIR.UP },
    state: CHASE,
    color: GHOST_COLORS[index],
    name: GHOST_NAMES[index],
    index,
    releaseTimer: index * 120, // stagger release
  };
}

// ─── Collision / movement helpers ────────────────────────────────────────────
function canMove(px, py, dx, dy, radius) {
  const step = radius * 0.9;
  const corners = [
    { x: px + dx * step + dy * step, y: py + dy * step + dx * step },
    { x: px + dx * step - dy * step, y: py + dy * step - dx * step },
  ];
  for (const c of corners) {
    const nx = px + dx * step;
    const ny = py + dy * step;
    const t = pixelToTile(nx + (dy !== 0 ? dy * step : 0), ny + (dx !== 0 ? dx * step : 0));
    const t2 = pixelToTile(nx + (dy !== 0 ? -dy * step : 0), ny + (dx !== 0 ? -dx * step : 0));
    if (isWall(t.col, t.row) || isWall(t2.col, t2.row)) return false;
  }
  return true;
}

function isWall(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
  return map[row][col] === WALL;
}

function isWallAt(px, py) {
  const t = pixelToTile(px, py);
  return isWall(t.col, t.row);
}

// Check if a pixel position (center) can move in direction without entering wall
function canMoveDir(px, py, dir, radius) {
  const margin = radius - 2;
  const nx = px + dir.x * margin;
  const ny = py + dir.y * margin;

  // perpendicular offsets
  const perp = { x: dir.y, y: dir.x };
  const p1 = pixelToTile(nx + perp.x * margin, ny + perp.y * margin);
  const p2 = pixelToTile(nx - perp.x * margin, ny - perp.y * margin);
  return !isWall(p1.col, p1.row) && !isWall(p2.col, p2.row);
}

// ─── Initialise ───────────────────────────────────────────────────────────────
function init() {
  canvas = document.getElementById('gameCanvas');
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
  ctx = canvas.getContext('2d');

  document.addEventListener('keydown', handleKey);
  resetGame();
  animFrame = requestAnimationFrame(loop);
}

function resetGame() {
  map = deepCopyMap(MAP_TEMPLATE);
  score = 0;
  lives = 3;
  totalDots = countDots();
  updateHUD();
  spawnEntities();
  frightenedTimer = 0;
  gameState = 'start';
  showMessage('PAC-MAN', 'Press any arrow key to start');
}

function spawnEntities() {
  pacman = makePacman();
  ghosts = GHOST_NAMES.map((_, i) => makeGhost(i));
}

function countDots() {
  let n = 0;
  for (const row of MAP_TEMPLATE) for (const cell of row) if (cell === DOT || cell === PELLET) n++;
  return n;
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score').textContent = score;
  document.getElementById('lives').textContent = lives;
}

function showMessage(text, sub = '') {
  const el = document.getElementById('message');
  document.getElementById('message-text').textContent = text;
  document.getElementById('message-sub').textContent = sub;
  el.classList.remove('hidden');
}

function hideMessage() {
  document.getElementById('message').classList.add('hidden');
}

// ─── Input ────────────────────────────────────────────────────────────────────
const KEY_MAP = {
  ArrowUp: DIR.UP, ArrowDown: DIR.DOWN, ArrowLeft: DIR.LEFT, ArrowRight: DIR.RIGHT,
  w: DIR.UP, s: DIR.DOWN, a: DIR.LEFT, d: DIR.RIGHT,
  W: DIR.UP, S: DIR.DOWN, A: DIR.LEFT, D: DIR.RIGHT,
};

function handleKey(e) {
  const dir = KEY_MAP[e.key];
  if (!dir) return;
  e.preventDefault();

  if (gameState === 'start') {
    gameState = 'playing';
    hideMessage();
    return;
  }
  if (gameState === 'dead') return;
  if (gameState === 'win' || gameState === 'gameover') {
    resetGame();
    return;
  }

  pacman.nextDir = dir;
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update() {
  if (gameState !== 'playing') {
    if (gameState === 'dead') {
      deathTimer--;
      if (deathTimer <= 0) {
        if (lives <= 0) {
          gameState = 'gameover';
          showMessage('GAME OVER', 'Press any key to restart');
        } else {
          gameState = 'playing';
          spawnEntities();
          frightenedTimer = 0;
        }
      }
    }
    return;
  }

  updatePacman();
  updateGhosts();
  checkCollisions();
}

function updatePacman() {
  const p = pacman;

  // Animate mouth
  p.mouthAngle += 0.05 * p.mouthDir;
  if (p.mouthAngle >= 0.25) { p.mouthAngle = 0.25; p.mouthDir = -1; }
  if (p.mouthAngle <= 0)    { p.mouthAngle = 0;    p.mouthDir =  1; }

  // Try to turn to nextDir if aligned enough to tile center
  const t = pixelToTile(p.x, p.y);
  const cx = t.col * CELL + CELL / 2;
  const cy = t.row * CELL + CELL / 2;
  const aligned = Math.abs(p.x - cx) < p.speed + 1 && Math.abs(p.y - cy) < p.speed + 1;

  if (aligned && canMoveDir(cx, cy, p.nextDir, p.radius)) {
    p.dir = { ...p.nextDir };
    p.x = cx; p.y = cy; // snap to center when turning
  }

  // Move in current direction
  const nx = p.x + p.dir.x * p.speed;
  const ny = p.y + p.dir.y * p.speed;

  // Tunnel: wrap horizontally on row 10
  const wrapRow = 10;
  if (p.y > (wrapRow - 1) * CELL && p.y < (wrapRow + 1) * CELL) {
    if (nx < 0)           { p.x = COLS * CELL; return; }
    if (nx > COLS * CELL) { p.x = 0;           return; }
  }

  if (canMoveDir(p.x, p.y, p.dir, p.radius)) {
    p.x = nx;
    p.y = ny;
  } else {
    // snap to tile center to avoid getting stuck in wall
    p.x = cx; p.y = cy;
  }

  // Eat dots / pellets
  const tile = pixelToTile(p.x, p.y);
  const cell = map[tile.row]?.[tile.col];
  if (cell === DOT) {
    map[tile.row][tile.col] = EMPTY;
    score += 10;
    totalDots--;
    updateHUD();
    if (totalDots <= 0) { gameState = 'win'; showMessage('YOU WIN!', 'Press any key to restart'); }
  } else if (cell === PELLET) {
    map[tile.row][tile.col] = EMPTY;
    score += 50;
    totalDots--;
    updateHUD();
    frightenedTimer = 300;
    ghosts.forEach(g => { if (g.state !== EATEN) g.state = FRIGHTENED; });
    if (totalDots <= 0) { gameState = 'win'; showMessage('YOU WIN!', 'Press any key to restart'); }
  }

  if (frightenedTimer > 0) {
    frightenedTimer--;
    if (frightenedTimer === 0) {
      ghosts.forEach(g => { if (g.state === FRIGHTENED) g.state = CHASE; });
    }
  }
}

// ─── Ghost AI ─────────────────────────────────────────────────────────────────
const ALL_DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

function opposite(dir) {
  return { x: -dir.x, y: -dir.y };
}

function dist2(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function ghostTarget(ghost) {
  switch (ghost.state) {
    case FRIGHTENED: {
      // random tile
      return { col: Math.floor(Math.random() * COLS), row: Math.floor(Math.random() * ROWS) };
    }
    case EATEN: {
      return { col: 10, row: 9 }; // return home
    }
    default: { // CHASE
      const t = pixelToTile(pacman.x, pacman.y);
      // slight variation per ghost
      if (ghost.index === 0) return t;
      if (ghost.index === 1) return { col: t.col + ghost.dir.x * 2, row: t.row + ghost.dir.y * 2 };
      if (ghost.index === 2) return { col: COLS - 1 - t.col, row: ROWS - 1 - t.row };
      return { col: t.col, row: t.row + 2 };
    }
  }
}

function updateGhost(ghost) {
  // release from ghost house
  if (ghost.releaseTimer > 0) { ghost.releaseTimer--; return; }

  const speed = ghost.state === FRIGHTENED ? 1 : ghost.state === EATEN ? 3 : ghost.speed;
  const t = pixelToTile(ghost.x, ghost.y);
  const cx = t.col * CELL + CELL / 2;
  const cy = t.row * CELL + CELL / 2;
  const aligned = Math.abs(ghost.x - cx) < speed + 1 && Math.abs(ghost.y - cy) < speed + 1;

  if (aligned) {
    ghost.x = cx; ghost.y = cy;
    const target = ghostTarget(ghost);
    const opp = opposite(ghost.dir);
    const candidates = ALL_DIRS.filter(d => {
      if (d.x === opp.x && d.y === opp.y) return false; // no 180
      const nc = t.col + d.x;
      const nr = t.row + d.y;
      if (isWall(nc, nr)) return false;
      return true;
    });

    if (candidates.length > 0) {
      // pick closest to target
      let best = candidates[0];
      let bestDist = Infinity;
      for (const d of candidates) {
        const nc = t.col + d.x;
        const nr = t.row + d.y;
        const dd = dist2(nc, nr, target.col, target.row);
        if (dd < bestDist) { bestDist = dd; best = d; }
      }
      ghost.dir = best;
    }

    // Check if eaten ghost reached home
    if (ghost.state === EATEN && t.col === 10 && t.row === 9) {
      ghost.state = frightenedTimer > 0 ? FRIGHTENED : CHASE;
    }
  }

  // Move
  const nx = ghost.x + ghost.dir.x * speed;
  const ny = ghost.y + ghost.dir.y * speed;

  // Tunnel
  const wrapRow = 10;
  if (ghost.y > (wrapRow - 1) * CELL && ghost.y < (wrapRow + 1) * CELL) {
    if (nx < 0)           { ghost.x = COLS * CELL; return; }
    if (nx > COLS * CELL) { ghost.x = 0;           return; }
  }

  if (!isWallAt(nx + ghost.dir.x * 4, ny + ghost.dir.y * 4)) {
    ghost.x = nx;
    ghost.y = ny;
  } else {
    // try to navigate around
    ghost.dir = opposite(ghost.dir);
  }
}

function updateGhosts() {
  ghosts.forEach(updateGhost);
}

// ─── Collision ────────────────────────────────────────────────────────────────
function checkCollisions() {
  for (const g of ghosts) {
    if (g.releaseTimer > 0) continue;
    const dx = pacman.x - g.x;
    const dy = pacman.y - g.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < pacman.radius + 8) {
      if (g.state === FRIGHTENED) {
        g.state = EATEN;
        score += 200;
        updateHUD();
      } else if (g.state === CHASE) {
        // pacman dies
        lives--;
        updateHUD();
        gameState = 'dead';
        deathTimer = 90;
        showMessage('', '');
        setTimeout(() => hideMessage(), 100);
        return;
      }
    }
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawMap();
  drawGhosts();
  drawPacman();
}

function drawMap() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = map[row][col];
      const x = col * CELL;
      const y = row * CELL;

      if (cell === WALL) {
        ctx.fillStyle = '#1a1aff';
        ctx.fillRect(x, y, CELL, CELL);
        // inner highlight
        ctx.fillStyle = '#3333ff';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (cell === DOT) {
        ctx.fillStyle = '#ffddaa';
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell === PELLET) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        ctx.fillStyle = `rgba(255, 255, 100, ${0.6 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 5 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman() {
  const p = pacman;
  const angle = Math.atan2(p.dir.y, p.dir.x);
  const mouth = p.mouthAngle * Math.PI;

  if (gameState === 'dead' && deathTimer < 60) {
    // death animation: shrink
    const scale = deathTimer / 60;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, p.radius, angle + mouth, angle + Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();

  // eye
  const eyeAngle = angle - Math.PI / 4;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(eyeAngle) * p.radius * 0.5, p.y + Math.sin(eyeAngle) * p.radius * 0.5, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGhosts() {
  for (const g of ghosts) {
    if (g.releaseTimer > 0) {
      // still in ghost house, draw faded
      drawGhostShape(g, g.color, 0.3);
      continue;
    }

    if (g.state === FRIGHTENED) {
      const flash = frightenedTimer < 80 && Math.floor(Date.now() / 200) % 2 === 0;
      drawGhostShape(g, flash ? '#fff' : '#2121de', 1);
    } else if (g.state === EATEN) {
      // just draw eyes
      drawGhostEyes(g);
    } else {
      drawGhostShape(g, g.color, 1);
    }
  }
}

function drawGhostShape(g, color, alpha) {
  const r = CELL / 2 - 1;
  const x = g.x;
  const y = g.y;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
  // wavy bottom
  ctx.lineTo(x + r, y + r);
  const waves = 3;
  const ww = (r * 2) / waves;
  for (let i = 0; i < waves; i++) {
    const wx = x + r - i * ww;
    ctx.quadraticCurveTo(wx - ww * 0.25, y + r + r * 0.35, wx - ww * 0.5, y + r);
    ctx.quadraticCurveTo(wx - ww * 0.75, y + r - r * 0.35, wx - ww, y + r);
  }
  ctx.closePath();
  ctx.fill();

  // eyes
  ctx.globalAlpha = 1;
  drawGhostEyes(g);
  ctx.globalAlpha = 1;
}

function drawGhostEyes(g) {
  const r = CELL / 2 - 1;
  const eyeOffX = r * 0.35;
  const eyeOffY = -r * 0.25;

  // whites
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(g.x - eyeOffX, g.y + eyeOffY, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x + eyeOffX, g.y + eyeOffY, r * 0.28, 0, Math.PI * 2); ctx.fill();

  // pupils (look toward direction)
  const px = g.dir.x * r * 0.12;
  const py = g.dir.y * r * 0.12;
  ctx.fillStyle = '#00f';
  ctx.beginPath(); ctx.arc(g.x - eyeOffX + px, g.y + eyeOffY + py, r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x + eyeOffX + px, g.y + eyeOffY + py, r * 0.14, 0, Math.PI * 2); ctx.fill();
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
function loop() {
  update();
  draw();
  animFrame = requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', init);
