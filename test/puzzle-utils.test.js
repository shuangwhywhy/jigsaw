import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePieceSize,
  neighborsFor,
  buildOriginalNeighbors,
  hasOriginalAdjacency,
  shufflePieces,
} from '../script.js';

const originalRandom = Math.random;

function withRandomSequence(sequence, fn) {
  let idx = 0;
  Math.random = () => {
    const value = sequence[idx % sequence.length];
    idx += 1;
    return value;
  };
  try {
    fn();
  } finally {
    Math.random = originalRandom;
  }
}

test('computePieceSize respects bounds and minimums', () => {
  withRandomSequence([0], () => {
    const { rows, cols, pieceWidth, pieceHeight } = computePieceSize(1000, 900);
    assert.equal(rows, 10);
    assert.equal(cols, 10);
    assert.equal(pieceWidth, 100);
    assert.equal(pieceHeight, 90);
  });
});

test('neighborsFor returns correct neighbor ids for interior and edge cells', () => {
  const interior = neighborsFor(1, 1, 3, 3);
  assert.deepEqual(interior, { up: 1, down: 7, left: 3, right: 5 });

  const edge = neighborsFor(0, 0, 3, 3);
  assert.deepEqual(edge, { up: null, down: 3, left: null, right: 1 });
});

test('buildOriginalNeighbors maps every cell in row-major order', () => {
  const neighbors = buildOriginalNeighbors(3, 3);
  assert.equal(neighbors.length, 9);
  assert.deepEqual(neighbors[4], { up: 1, down: 7, left: 3, right: 5 });
});

test('hasOriginalAdjacency detects identity layout', () => {
  const rows = 3;
  const cols = 3;
  const neighbors = buildOriginalNeighbors(rows, cols);
  const perm = Array.from({ length: rows * cols }, (_, i) => i);
  assert.equal(hasOriginalAdjacency(perm, neighbors, rows, cols), true);
});

test('shufflePieces produces adjacency-free permutation', () => {
  const rows = 3;
  const cols = 3;
  const ids = Array.from({ length: rows * cols }, (_, i) => i);
  const neighbors = buildOriginalNeighbors(rows, cols);

  withRandomSequence([0.42, 0.23, 0.77, 0.11, 0.58], () => {
    const perm = shufflePieces(ids, neighbors, rows, cols);
    assert.equal(new Set(perm).size, ids.length);
    assert.equal(perm.length, ids.length);
    assert.equal(hasOriginalAdjacency(perm, neighbors, rows, cols), false);
  });
});
