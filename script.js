const hasDocument = typeof document !== 'undefined';
const hasWindow = typeof window !== 'undefined';
const boardEl = hasDocument ? document.getElementById('board') : null;
const metaEl = hasDocument ? document.getElementById('meta') : null;
const statusEl = hasDocument ? document.getElementById('status') : null;
const regenerateBtn = hasDocument ? document.getElementById('regenerate') : null;

const state = {
  rows: 0,
  cols: 0,
  pieceWidth: 0,
  pieceHeight: 0,
  board: [], // row-major piece ids
  positions: new Map(), // id -> {row,col}
  originalPositions: new Map(),
  originalNeighbors: [], // id -> {up,down,left,right}
  imageUrl: '',
  dragging: null,
  groupMembers: new Map(), // root -> Set
  parent: [],
  solved: false,
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function drawLandscape(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Sky
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, '#0b1649');
  skyGradient.addColorStop(0.35, '#1b3a6b');
  skyGradient.addColorStop(1, '#0a1128');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  // Distant stars/flares
  ctx.save();
  for (let i = 0; i < 250; i++) {
    const x = rand(0, width);
    const y = rand(0, height * 0.35);
    const radius = rand(0.5, 1.4);
    ctx.fillStyle = `rgba(255,255,255,${rand(0.08, 0.4)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Aurora/nebula strokes for depth
  for (let i = 0; i < 3; i++) {
    const grad = ctx.createRadialGradient(
      rand(width * 0.2, width * 0.8),
      rand(height * 0.05, height * 0.35),
      rand(50, 120),
      width / 2,
      height / 3,
      rand(width * 0.8, width * 1.1)
    );
    grad.addColorStop(0, `rgba(${rand(80, 200)}, ${rand(120, 220)}, ${rand(180, 255)}, 0.35)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height * 0.6);
  }

  // Sun / moon glow
  const sunX = rand(width * 0.2, width * 0.8);
  const sunY = rand(height * 0.15, height * 0.35);
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 200);
  sunGrad.addColorStop(0, 'rgba(255, 241, 188, 0.95)');
  sunGrad.addColorStop(0.35, 'rgba(255, 209, 138, 0.55)');
  sunGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, width, height);

  // Mountain layers
  function drawMountainLayer(baseY, color, roughness, heightRange, count) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);
    const segment = width / count;
    for (let i = 0; i <= count; i++) {
      const x = i * segment;
      const peak = baseY - rand(heightRange * 0.6, heightRange);
      const ctrlX = x + rand(-segment * 0.3, segment * 0.3);
      const ctrlY = peak - rand(roughness * 0.5, roughness);
      ctx.quadraticCurveTo(ctrlX, ctrlY, x + segment, baseY + rand(-roughness, roughness));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  drawMountainLayer(height * 0.65, 'rgba(34, 62, 110, 0.85)', 40, 120, 10);
  drawMountainLayer(height * 0.75, 'rgba(21, 47, 89, 0.9)', 60, 160, 12);
  drawMountainLayer(height * 0.82, 'rgba(18, 37, 68, 0.95)', 80, 200, 14);

  // Water / ground reflection
  const waterY = height * 0.75;
  const waterGrad = ctx.createLinearGradient(0, waterY, 0, height);
  waterGrad.addColorStop(0, 'rgba(34, 62, 110, 0.5)');
  waterGrad.addColorStop(1, 'rgba(10, 17, 40, 0.9)');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterY, width, height - waterY);

  // Mist layers
  for (let i = 0; i < 3; i++) {
    const mistY = waterY - i * 40 - rand(10, 30);
    const mistH = rand(50, 90);
    const mistGrad = ctx.createLinearGradient(0, mistY, 0, mistY + mistH);
    mistGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
    mistGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, mistY, width, mistH);
  }

  // Trees for foreground depth
  function drawTree(x, baseY, scale) {
    const height = 120 * scale;
    const crownLevels = 3 + Math.floor(rand(0, 2));
    ctx.fillStyle = `rgba(${Math.floor(rand(20, 60))}, ${Math.floor(rand(70, 120))}, ${Math.floor(rand(40, 90))}, 0.9)`;
    for (let i = 0; i < crownLevels; i++) {
      const levelWidth = (80 - i * 12) * scale;
      const levelHeight = height / (crownLevels + 1);
      ctx.beginPath();
      ctx.moveTo(x, baseY - i * levelHeight - height * 0.2);
      ctx.lineTo(x - levelWidth / 2, baseY - (i + 1) * levelHeight);
      ctx.lineTo(x + levelWidth / 2, baseY - (i + 1) * levelHeight);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(62, 39, 35, 0.9)';
    ctx.fillRect(x - 4 * scale, baseY - height * 0.05, 8 * scale, height * 0.2);
  }

  const treeBase = height * 0.85;
  for (let i = 0; i < 35; i++) {
    const x = rand(0, width);
    const scale = rand(0.3, 1.1);
    drawTree(x, treeBase + rand(-20, 20), scale);
  }

  // Foreground glows
  for (let i = 0; i < 8; i++) {
    const glowX = rand(0, width);
    const glowY = rand(height * 0.7, height * 0.9);
    const glowGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, rand(40, 120));
    glowGrad.addColorStop(0, `rgba(${rand(180, 255)}, ${rand(140, 220)}, ${rand(120, 220)}, 0.5)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(glowX - 120, glowY - 120, 240, 240);
  }

  return canvas.toDataURL('image/png');
}

function createImage() {
  const width = Math.floor(rand(900, 1200));
  const height = Math.floor(rand(800, 1100));
  return drawLandscape(width, height);
}

function computePieceSize(imgWidth, imgHeight) {
  const maxRows = Math.min(30, Math.floor(imgHeight / 20));
  const maxCols = Math.min(30, Math.floor(imgWidth / 20));
  const rows = Math.max(10, Math.floor(rand(10, maxRows + 0.99)));
  const cols = Math.max(10, Math.floor(rand(10, maxCols + 0.99)));
  const pieceWidth = Math.floor(imgWidth / cols);
  const pieceHeight = Math.floor(imgHeight / rows);
  return { rows, cols, pieceWidth, pieceHeight };
}

function neighborsFor(row, col, rows, cols) {
  return {
    up: row > 0 ? (row - 1) * cols + col : null,
    down: row < rows - 1 ? (row + 1) * cols + col : null,
    left: col > 0 ? row * cols + (col - 1) : null,
    right: col < cols - 1 ? row * cols + (col + 1) : null,
  };
}

function shufflePieces(ids, originalNeighbors, rows, cols) {
  const limit = 400;
  for (let attempt = 0; attempt < limit; attempt++) {
    const perm = ids.slice();
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    if (!hasOriginalAdjacency(perm, originalNeighbors, rows, cols)) {
      return perm;
    }
  }

  // deterministic repair: start from a simple rotation and iteratively fix conflicts
  let perm = ids.map((_, i) => ids[(i + Math.floor(ids.length / 2)) % ids.length]);
  let guard = 0;
  const maxRepair = ids.length * ids.length * 2;
  while (hasOriginalAdjacency(perm, originalNeighbors, rows, cols) && guard < maxRepair) {
    const conflictIndex = findConflictIndex(perm, originalNeighbors, rows, cols);
    let swapped = false;

    for (let candidate = 0; candidate < perm.length; candidate++) {
      if (candidate === conflictIndex) continue;

      [perm[conflictIndex], perm[candidate]] = [perm[candidate], perm[conflictIndex]];
      if (!hasOriginalAdjacency(perm, originalNeighbors, rows, cols)) {
        swapped = true;
        break;
      }
      [perm[conflictIndex], perm[candidate]] = [perm[candidate], perm[conflictIndex]];
    }

    if (!swapped) {
      const swapWith = (conflictIndex + guard + 1) % perm.length;
      [perm[conflictIndex], perm[swapWith]] = [perm[swapWith], perm[conflictIndex]];
    }

    guard += 1;
  }

  if (hasOriginalAdjacency(perm, originalNeighbors, rows, cols)) {
    throw new Error('Unable to generate adjacency-free shuffle');
  }

  return perm;
}

function findConflictIndex(perm, originalNeighbors, rows, cols) {
  for (let i = 0; i < perm.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const id = perm[i];
    const neigh = originalNeighbors[id];
    const around = [
      row > 0 ? perm[(row - 1) * cols + col] : null,
      row < rows - 1 ? perm[(row + 1) * cols + col] : null,
      col > 0 ? perm[row * cols + (col - 1)] : null,
      col < cols - 1 ? perm[row * cols + (col + 1)] : null,
    ];
    if (around.some((x) => x !== null && Object.values(neigh).includes(x))) {
      return i;
    }
  }
  return 0;
}

function hasOriginalAdjacency(perm, originalNeighbors, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const id = perm[idx];
      const neigh = originalNeighbors[id];
      const up = r > 0 ? perm[(r - 1) * cols + c] : null;
      const down = r < rows - 1 ? perm[(r + 1) * cols + c] : null;
      const left = c > 0 ? perm[r * cols + (c - 1)] : null;
      const right = c < cols - 1 ? perm[r * cols + (c + 1)] : null;
      if ([up, down, left, right].some((n) => n !== null && Object.values(neigh).includes(n))) {
        return true;
      }
    }
  }
  return false;
}

function buildOriginalNeighbors(rows, cols) {
  const neighbors = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      neighbors.push(neighborsFor(r, c, rows, cols));
    }
  }
  return neighbors;
}

function setupBoard(imageUrl) {
  const img = new Image();
  img.onload = () => {
    const { rows, cols, pieceWidth, pieceHeight } = computePieceSize(img.width, img.height);
    Object.assign(state, {
      rows,
      cols,
      pieceWidth,
      pieceHeight,
      board: [],
      positions: new Map(),
      originalPositions: new Map(),
      originalNeighbors: buildOriginalNeighbors(rows, cols),
      imageUrl,
      dragging: null,
      parent: Array(rows * cols)
        .fill(0)
        .map((_, i) => i),
      solved: false,
    });

    boardEl.style.width = `${pieceWidth * cols}px`;
    boardEl.style.height = `${pieceHeight * rows}px`;
    boardEl.innerHTML = '';

    const ids = Array.from({ length: rows * cols }, (_, i) => i);
    ids.forEach((id) => {
      const row = Math.floor(id / cols);
      const col = id % cols;
      state.originalPositions.set(id, { row, col });
    });

    const shuffled = shufflePieces(ids, state.originalNeighbors, rows, cols);
    state.board = Array.from({ length: rows }, () => Array(cols).fill(null));
    shuffled.forEach((id, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      state.board[row][col] = id;
      state.positions.set(id, { row, col });
    });

    createPieces(imageUrl);
    evaluateGroups();
    renderPositions();
    metaEl.textContent = `${rows} 行 × ${cols} 列 | 每块 ${pieceWidth}×${pieceHeight}px`;
    statusEl.textContent = '拖动任意块开始拼图。';
  };
  img.src = imageUrl;
}

function createPieces(imageUrl) {
  const frag = document.createDocumentFragment();
  for (let id = 0; id < state.rows * state.cols; id++) {
    const piece = document.createElement('div');
    piece.className = 'piece';
    piece.dataset.id = String(id);
    const { row, col } = state.originalPositions.get(id);
    piece.style.width = `${state.pieceWidth}px`;
    piece.style.height = `${state.pieceHeight}px`;
    piece.style.backgroundImage = `url(${imageUrl})`;
    piece.style.backgroundSize = `${state.cols * state.pieceWidth}px ${state.rows * state.pieceHeight}px`;
    piece.style.backgroundPosition = `-${col * state.pieceWidth}px -${row * state.pieceHeight}px`;
    piece.addEventListener('pointerdown', startDrag);
    frag.appendChild(piece);
  }
  boardEl.appendChild(frag);
}

function renderPositions() {
  const pieces = boardEl.children;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const id = Number(piece.dataset.id);
    const pos = state.positions.get(id);
    piece.style.left = `${pos.col * state.pieceWidth}px`;
    piece.style.top = `${pos.row * state.pieceHeight}px`;
    piece.style.transform = 'translate(0, 0)';
    const edges = computeEdges(id, pos.row, pos.col);
    piece.style.boxShadow = buildEdgeShadow(edges);
  }
}

function computeEdges(id, row, col) {
  const edges = { top: true, right: true, bottom: true, left: true };
  const neigh = state.originalNeighbors[id];
  const upId = row > 0 ? state.board[row - 1][col] : null;
  const downId = row < state.rows - 1 ? state.board[row + 1][col] : null;
  const leftId = col > 0 ? state.board[row][col - 1] : null;
  const rightId = col < state.cols - 1 ? state.board[row][col + 1] : null;

  if (upId !== null && upId === neigh.up) {
    edges.top = false;
  }
  if (downId !== null && downId === neigh.down) {
    edges.bottom = false;
  }
  if (leftId !== null && leftId === neigh.left) {
    edges.left = false;
  }
  if (rightId !== null && rightId === neigh.right) {
    edges.right = false;
  }
  return edges;
}

function buildEdgeShadow(edges) {
  const parts = [];
  if (edges.top) parts.push('inset 0 1px 0 0 rgba(0,0,0,0.55)');
  if (edges.right) parts.push('inset -1px 0 0 0 rgba(0,0,0,0.55)');
  if (edges.bottom) parts.push('inset 0 -1px 0 0 rgba(0,0,0,0.55)');
  if (edges.left) parts.push('inset 1px 0 0 0 rgba(0,0,0,0.55)');
  return parts.join(', ');
}

function startDrag(event) {
  if (state.solved) return;
  const piece = event.currentTarget;
  const id = Number(piece.dataset.id);
  const root = find(id);
  const members = Array.from(state.groupMembers.get(root) || [id]);
  const startPositions = new Map();
  members.forEach((pid) => {
    startPositions.set(pid, { ...state.positions.get(pid) });
  });

  state.dragging = {
    pointerId: event.pointerId,
    anchorId: id,
    members,
    startPositions,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    dy: 0,
  };

  members.forEach((pid) => {
    const el = document.querySelector(`.piece[data-id="${pid}"]`);
    el.classList.add('dragging');
  });
  piece.setPointerCapture(event.pointerId);
  piece.addEventListener('pointermove', onDragMove);
  piece.addEventListener('pointerup', endDrag);
  piece.addEventListener('pointercancel', endDrag);
}

function onDragMove(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  const { startX, startY, members } = state.dragging;
  const dx = event.clientX - startX;
  const dy = event.clientY - startY;
  state.dragging.dx = dx;
  state.dragging.dy = dy;
  members.forEach((pid) => {
    const el = document.querySelector(`.piece[data-id="${pid}"]`);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
}

function endDrag(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  const drag = state.dragging;
  const anchorStart = drag.startPositions.get(drag.anchorId);
  const anchorLeft = anchorStart.col * state.pieceWidth;
  const anchorTop = anchorStart.row * state.pieceHeight;
  const targetCol = Math.round((anchorLeft + drag.dx) / state.pieceWidth);
  const targetRow = Math.round((anchorTop + drag.dy) / state.pieceHeight);

  applyGroupMove(drag.members, drag.startPositions, targetRow, targetCol);

  drag.members.forEach((pid) => {
    const el = document.querySelector(`.piece[data-id="${pid}"]`);
    el.classList.remove('dragging');
    el.style.transform = 'translate(0, 0)';
  });

  const piece = event.currentTarget;
  piece.removeEventListener('pointermove', onDragMove);
  piece.removeEventListener('pointerup', endDrag);
  piece.removeEventListener('pointercancel', endDrag);
  state.dragging = null;
}

function applyGroupMove(members, startPositions, targetRow, targetCol) {
  const wrap = (val, max) => ((val % max) + max) % max;
  const anchorPos = startPositions.get(state.dragging.anchorId || members[0]);
  const vacatedCells = members.map((pid) => startPositions.get(pid));
  const destinationMap = new Map();
  const destinationCells = new Set();

  members.forEach((pid) => {
    const pos = startPositions.get(pid);
    const dr = pos.row - anchorPos.row;
    const dc = pos.col - anchorPos.col;
    const newRow = wrap(targetRow + dr, state.rows);
    const newCol = wrap(targetCol + dc, state.cols);
    destinationMap.set(pid, { row: newRow, col: newCol });
    destinationCells.add(`${newRow},${newCol}`);
  });

  const movingSet = new Set(members);
  const displaced = [];
  destinationMap.forEach(({ row, col }) => {
    const occupant = state.board[row][col];
    if (!movingSet.has(occupant)) {
      displaced.push(occupant);
    }
  });

  // Clear vacated cells first to avoid duplicate occupancy
  vacatedCells.forEach(({ row, col }) => {
    state.board[row][col] = null;
  });

  // Apply moving pieces to new positions
  destinationMap.forEach(({ row, col }, pid) => {
    state.board[row][col] = pid;
    state.positions.set(pid, { row, col });
  });

  // Fill vacated cells with displaced pieces in order
  const availableVacated = vacatedCells
    .map(({ row, col }) => ({ row, col }))
    .filter(({ row, col }) => !destinationCells.has(`${row},${col}`));

  const targetSlots = availableVacated.length ? availableVacated : vacatedCells;

  displaced.forEach((pid, index) => {
    const target = targetSlots[index % targetSlots.length];
    state.board[target.row][target.col] = pid;
    state.positions.set(pid, { row: target.row, col: target.col });
  });

  evaluateGroups();
  renderPositions();
  checkSolved();
}

function find(x) {
  if (state.parent[x] === x) return x;
  state.parent[x] = find(state.parent[x]);
  return state.parent[x];
}

function union(a, b) {
  const rootA = find(a);
  const rootB = find(b);
  if (rootA !== rootB) {
    state.parent[rootB] = rootA;
  }
}

function evaluateGroups() {
  // reset DSU
  state.parent = state.parent.map((_, i) => i);

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const id = state.board[r][c];
      const neigh = state.originalNeighbors[id];
      if (r > 0) {
        const upId = state.board[r - 1][c];
        if (upId === neigh.up) {
          union(id, upId);
        }
      }
      if (c > 0) {
        const leftId = state.board[r][c - 1];
        if (leftId === neigh.left) {
          union(id, leftId);
        }
      }
    }
  }

  state.groupMembers = new Map();
  for (let id = 0; id < state.rows * state.cols; id++) {
    const root = find(id);
    if (!state.groupMembers.has(root)) state.groupMembers.set(root, new Set());
    state.groupMembers.get(root).add(id);
  }
}

function checkSolved() {
  for (let [id, pos] of state.positions.entries()) {
    const orig = state.originalPositions.get(id);
    if (orig.row !== pos.row || orig.col !== pos.col) {
      state.solved = false;
      return;
    }
  }
  state.solved = true;
  statusEl.textContent = '拼图完成！边界融合完成，本局结束。';
  showToast('拼好了！黑边已消失。');
  Array.from(document.querySelectorAll('.piece')).forEach((piece) => {
    piece.style.boxShadow = 'none';
  });
}

function showToast(text) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.querySelector('.board-wrapper').appendChild(toast);
  }
  toast.textContent = text;
  requestAnimationFrame(() => {
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  });
}

function bootstrap() {
  const imageUrl = createImage();
  setupBoard(imageUrl);
}

if (regenerateBtn && hasWindow) {
  regenerateBtn.addEventListener('click', bootstrap);
  window.addEventListener('load', bootstrap);
}

export {
  rand,
  computePieceSize,
  neighborsFor,
  shufflePieces,
  hasOriginalAdjacency,
  buildOriginalNeighbors,
  findConflictIndex,
};
