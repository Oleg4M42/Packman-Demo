// ─── Constants ───────────────────────────────────────────────────────────────
const CELL = 20;
const COLS = 21;
const ROWS = 23;

const EMPTY  = 0;
const WALL   = 1;
const DOT    = 2;
const PELLET = 3;

const CHASE      = 'chase';
const FRIGHTENED = 'frightened';
const EATEN      = 'eaten';

const UP    = { x:  0, y: -1 };
const DOWN  = { x:  0, y:  1 };
const LEFT  = { x: -1, y:  0 };
const RIGHT = { x:  1, y:  0 };
const ALL_DIRS = [UP, DOWN, LEFT, RIGHT];

// ─── Map ─────────────────────────────────────────────────────────────────────
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

// ─── Globals ─────────────────────────────────────────────────────────────────
let canvas, ctx, map;
let score, lives, totalDots;
let pacman, ghosts;
let frightenedTimer = 0;
let gameState = 'start'; // start | playing | dead | win | gameover
let deathTimer = 0;
let lastTime = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function deepCopyMap(t) { return t.map(r => [...r]); }
function tileCenter(col, row) { return { x: col * CELL + CELL/2, y: row * CELL + CELL/2 }; }
function isWall(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
  return map[row][col] === WALL;
}
function oppDir(d) { return { x: -d.x, y: -d.y }; }
function sameDir(a, b) { return a.x === b.x && a.y === b.y; }
function dist2(ac, ar, bc, br) { return (ac-bc)**2 + (ar-br)**2; }

// ─── Tile-based mover ────────────────────────────────────────────────────────
// Each entity stores: col, row (current tile), dir (current direction),
// progress (0..1 = how far between current tile and next tile).
// When progress reaches 1 it snaps to next tile and picks new direction.

function makeMover(col, row, dir, speed) {
  return { col, row, dir, nextDir: dir, progress: 0, speed,
           x: col * CELL + CELL/2, y: row * CELL + CELL/2 };
}

// Advance a mover by dt seconds. Returns true if it crossed into a new tile.
function stepMover(m, dt, chooseDirFn) {
  m.progress += m.speed * dt;

  while (m.progress >= 1) {
    m.progress -= 1;

    // Arrive at next tile
    m.col += m.dir.x;
    m.row += m.dir.y;

    // Tunnel wrap on row 10
    if (m.row === 10) {
      if (m.col < 0)    m.col = COLS - 1;
      if (m.col >= COLS) m.col = 0;
    }

    // Choose direction for the NEXT step
    chooseDirFn(m);
  }

  // Interpolate pixel position
  const nc = m.col + m.dir.x;
  const nr = m.row + m.dir.y;
  // If next tile would be out of bounds after wrap, just stay put visually
  const vc = (m.row === 10 && (nc < 0 || nc >= COLS)) ? m.col : nc;
  const vr = nr;
  m.x = (m.col * (1 - m.progress) + vc * m.progress) * CELL + CELL/2;
  m.y = (m.row * (1 - m.progress) + vr * m.progress) * CELL + CELL/2;
}

// ─── Pac-Man ─────────────────────────────────────────────────────────────────
function makePacman() {
  const p = makeMover(10, 16, LEFT, 7); // 7 tiles/sec
  p.mouthAngle = 0.25;
  p.mouthDir = 1;
  p.radius = CELL/2 - 2;
  p.nextDir = LEFT;
  return p;
}

function choosePacDir(p) {
  // Try buffered nextDir first
  const nd = p.nextDir;
  if (!isWall(p.col + nd.x, p.row + nd.y)) {
    p.dir = nd;
  } else if (isWall(p.col + p.dir.x, p.row + p.dir.y)) {
    // Can't continue current dir either — stop (set speed to 0 effectively by not moving)
    p.progress = 0;
    p.speed = 0; // will be restored when a valid dir is pressed
  }
}

// ─── Ghosts ──────────────────────────────────────────────────────────────────
const GHOST_COLORS = ['#FF0000', '#FFB8FF', '#FFB852', '#00FFFF'];
const GHOST_NAMES  = ['Blinky', 'Pinky', 'Inky', 'Clyde'];
const GHOST_HOME   = [
  { col: 10, row: 11 },
  { col:  9, row: 11 },
  { col: 11, row: 11 },
  { col: 10, row: 12 },
];
// Exit tile ghosts navigate to when released
const GHOST_EXIT = { col: 10, row: 8 };

function makeGhost(i) {
  const home = GHOST_HOME[i];
  const g = makeMover(home.col, home.row, UP, 6);
  g.state = CHASE;
  g.color = GHOST_COLORS[i];
  g.index = i;
  g.releaseTimer = i * 180; // frames to wait before being released
  g.inHouse = true;
  return g;
}

function chooseGhostDir(g) {
  const col = g.col, row = g.row;

  // Ghosts in house bounce vertically until released
  if (g.inHouse) {
    if (row <= 9)  { g.dir = DOWN; g.inHouse = false; return; } // exited house
    if (!isWall(col, row + g.dir.y)) return; // continue current dir
    g.dir = oppDir(g.dir); // bounce
    return;
  }

  let target;
  if (g.state === EATEN) {
    target = { col: 10, row: 11 }; // return home
    // Check if reached home area
    if (col === 10 && row >= 9 && row <= 12) {
      g.state = frightenedTimer > 0 ? FRIGHTENED : CHASE;
      g.inHouse = true;
      g.dir = UP;
      return;
    }
  } else if (g.state === FRIGHTENED) {
    // pick a random open direction
    const opp = oppDir(g.dir);
    const opts = ALL_DIRS.filter(d => !sameDir(d, opp) && !isWall(col + d.x, row + d.y));
    g.dir = opts.length ? opts[Math.floor(Math.random() * opts.length)] : opp;
    return;
  } else {
    // CHASE
    const pt = { col: pacman.col, row: pacman.row };
    switch (g.index) {
      case 0: target = pt; break;
      case 1: target = { col: pt.col + pacman.dir.x*2, row: pt.row + pacman.dir.y*2 }; break;
      case 2: target = { col: COLS-1-pt.col, row: ROWS-1-pt.row }; break;
      default: target = { col: pt.col, row: pt.row+3 }; break;
    }
  }

  // Pick direction that minimises distance to target, no 180-turns
  const opp = oppDir(g.dir);
  const opts = ALL_DIRS.filter(d => !sameDir(d, opp) && !isWall(col + d.x, row + d.y));
  if (!opts.length) { g.dir = opp; return; }
  g.dir = opts.reduce((best, d) => {
    return dist2(col+d.x, row+d.y, target.col, target.row) <
           dist2(col+best.x, row+best.y, target.col, target.row) ? d : best;
  });
}

// ─── Init / Reset ────────────────────────────────────────────────────────────
function init() {
  canvas = document.getElementById('gameCanvas');
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
  ctx = canvas.getContext('2d');
  document.addEventListener('keydown', handleKey);
  resetGame();
  requestAnimationFrame(loop);
}

function resetGame() {
  map = deepCopyMap(MAP_TEMPLATE);
  score = 0;
  lives = 3;
  totalDots = countDots();
  frightenedTimer = 0;
  updateHUD();
  spawnEntities();
  gameState = 'start';
  showMessage('PAC-MAN', 'Press any arrow key to start');
}

function spawnEntities() {
  pacman = makePacman();
  ghosts = [0,1,2,3].map(makeGhost);
}

function countDots() {
  let n = 0;
  for (const row of MAP_TEMPLATE) for (const c of row) if (c === DOT || c === PELLET) n++;
  return n;
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score').textContent = score;
  document.getElementById('lives').textContent = lives;
}
function showMessage(t, s='') {
  document.getElementById('message-text').textContent = t;
  document.getElementById('message-sub').textContent = s;
  document.getElementById('message').classList.remove('hidden');
}
function hideMessage() {
  document.getElementById('message').classList.add('hidden');
}

// ─── Input ───────────────────────────────────────────────────────────────────
const KEY_MAP = {
  ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT,
  w: UP, s: DOWN, a: LEFT, d: RIGHT,
  W: UP, S: DOWN, A: LEFT, D: RIGHT,
};

function handleKey(e) {
  const dir = KEY_MAP[e.key];
  if (!dir) return;
  e.preventDefault();

  if (gameState === 'start') {
    pacman.nextDir = dir;
    pacman.dir = dir;
    pacman.speed = 7;
    gameState = 'playing';
    hideMessage();
    return;
  }
  if (gameState === 'dead' || gameState === 'gameover' || gameState === 'win') {
    resetGame();
    return;
  }
  // Buffer next direction
  pacman.nextDir = dir;
  if (pacman.speed === 0) {
    // Try to start moving again
    if (!isWall(pacman.col + dir.x, pacman.row + dir.y)) {
      pacman.dir = dir;
      pacman.speed = 7;
    }
  }
}

// ─── Update ──────────────────────────────────────────────────────────────────
function update(dt) {
  if (gameState === 'dead') {
    deathTimer -= dt;
    if (deathTimer <= 0) {
      if (lives <= 0) {
        gameState = 'gameover';
        showMessage('GAME OVER', 'Press any key to restart');
      } else {
        spawnEntities();
        frightenedTimer = 0;
        gameState = 'playing';
      }
    }
    return;
  }
  if (gameState !== 'playing') return;

  updatePacman(dt);
  updateGhosts(dt);
  checkCollisions();
}

function updatePacman(dt) {
  const p = pacman;

  // Mouth animation
  p.mouthAngle += 3 * dt * p.mouthDir;
  if (p.mouthAngle >= 0.25) { p.mouthAngle = 0.25; p.mouthDir = -1; }
  if (p.mouthAngle <= 0)    { p.mouthAngle = 0;    p.mouthDir =  1; }

  if (p.speed === 0) return;

  stepMover(p, dt, choosePacDir);

  // Eat dots/pellets at current tile
  const cell = map[p.row]?.[p.col];
  if (cell === DOT) {
    map[p.row][p.col] = EMPTY;
    score += 10; totalDots--;
    updateHUD();
    if (totalDots <= 0) { gameState = 'win'; showMessage('YOU WIN!', 'Press any key to restart'); }
  } else if (cell === PELLET) {
    map[p.row][p.col] = EMPTY;
    score += 50; totalDots--;
    frightenedTimer = 7; // seconds
    ghosts.forEach(g => { if (g.state !== EATEN) g.state = FRIGHTENED; });
    updateHUD();
    if (totalDots <= 0) { gameState = 'win'; showMessage('YOU WIN!', 'Press any key to restart'); }
  }

  if (frightenedTimer > 0) {
    frightenedTimer -= dt;
    if (frightenedTimer <= 0) {
      frightenedTimer = 0;
      ghosts.forEach(g => { if (g.state === FRIGHTENED) g.state = CHASE; });
    }
  }
}

function updateGhosts(dt) {
  for (const g of ghosts) {
    if (g.releaseTimer > 0) { g.releaseTimer -= 60 * dt; continue; } // count down in frames equiv
    const speed = g.state === FRIGHTENED ? 4 : g.state === EATEN ? 10 : 6;
    g.speed = speed;
    stepMover(g, dt, chooseGhostDir);
  }
}

// ─── Collisions ──────────────────────────────────────────────────────────────
function checkCollisions() {
  for (const g of ghosts) {
    if (g.releaseTimer > 0 || g.inHouse) continue;
    const dx = pacman.x - g.x, dy = pacman.y - g.y;
    if (Math.sqrt(dx*dx + dy*dy) < CELL * 0.75) {
      if (g.state === FRIGHTENED) {
        g.state = EATEN;
        score += 200;
        updateHUD();
      } else if (g.state === CHASE) {
        lives--;
        updateHUD();
        gameState = 'dead';
        deathTimer = 1.5;
        hideMessage();
        return;
      }
    }
  }
}

// ─── Draw ────────────────────────────────────────────────────────────────────
function draw(t) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawMap(t);
  drawGhosts();
  drawPacman();
}

function drawMap(t) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = map[row][col];
      const x = col * CELL, y = row * CELL;
      if (cell === WALL) {
        ctx.fillStyle = '#1a1aff';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.fillStyle = '#3333ff';
        ctx.fillRect(x+2, y+2, CELL-4, CELL-4);
      } else if (cell === DOT) {
        ctx.fillStyle = '#ffddaa';
        ctx.beginPath();
        ctx.arc(x+CELL/2, y+CELL/2, 2, 0, Math.PI*2);
        ctx.fill();
      } else if (cell === PELLET) {
        const pulse = 0.5 + 0.5*Math.sin(t * 5);
        ctx.fillStyle = `rgba(255,255,80,${0.7+0.3*pulse})`;
        ctx.beginPath();
        ctx.arc(x+CELL/2, y+CELL/2, 4+pulse*2, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
}

function drawPacman() {
  const p = pacman;
  // Death shrink animation
  if (gameState === 'dead') {
    const scale = Math.max(0, deathTimer / 1.5);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const angle = Math.atan2(p.dir.y, p.dir.x);
  const mouth = p.mouthAngle * Math.PI;
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, p.radius, angle + mouth, angle + Math.PI*2 - mouth);
  ctx.closePath();
  ctx.fill();

  // Eye
  const ea = angle - Math.PI/4;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(ea)*p.radius*0.5, p.y + Math.sin(ea)*p.radius*0.5, 2, 0, Math.PI*2);
  ctx.fill();
}

function drawGhosts() {
  for (const g of ghosts) {
    if (g.state === EATEN) {
      drawGhostEyes(g);
    } else if (g.state === FRIGHTENED) {
      const flash = frightenedTimer < 2 && Math.floor(Date.now()/200)%2 === 0;
      drawGhostBody(g, flash ? '#ffffff' : '#2121de');
    } else {
      drawGhostBody(g, g.color);
    }
  }
}

function drawGhostBody(g, color) {
  const r = CELL/2 - 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(g.x, g.y - r*0.1, r, Math.PI, 0);
  ctx.lineTo(g.x + r, g.y + r);
  const waves = 3, ww = (r*2)/waves;
  for (let i = 0; i < waves; i++) {
    const wx = g.x + r - i*ww;
    ctx.quadraticCurveTo(wx - ww*0.25, g.y + r + r*0.35, wx - ww*0.5, g.y + r);
    ctx.quadraticCurveTo(wx - ww*0.75, g.y + r - r*0.35, wx - ww,     g.y + r);
  }
  ctx.closePath();
  ctx.fill();
  drawGhostEyes(g);
}

function drawGhostEyes(g) {
  const r = CELL/2 - 1;
  const ox = r*0.35, oy = -r*0.25;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(g.x-ox, g.y+oy, r*0.28, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x+ox, g.y+oy, r*0.28, 0, Math.PI*2); ctx.fill();
  const px = g.dir.x * r*0.12, py = g.dir.y * r*0.12;
  ctx.fillStyle = '#00f';
  ctx.beginPath(); ctx.arc(g.x-ox+px, g.y+oy+py, r*0.14, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x+ox+px, g.y+oy+py, r*0.14, 0, Math.PI*2); ctx.fill();
}

// ─── Loop ────────────────────────────────────────────────────────────────────
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;
  update(dt);
  draw(timestamp / 1000);
  requestAnimationFrame(loop);
}

window.addEventListener('load', () => {
  init();
  // seed lastTime so first frame dt isn't huge
  requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
});
